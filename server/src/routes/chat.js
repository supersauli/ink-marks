import { Router } from 'express'
import { db } from '../db.js'
import { mapChatMessage } from '../mappers.js'
import { newId, now, str, int, parseObj } from '../util.js'
import { attachContext, attachTiming, estimateUsage, guessContextLength, normalizeUsage } from '../usage.js'
import { buildHeaders, resolveEndpoint } from '../llm.js'

const router = Router()
const SCENES = new Set(['chat', 'refine', 'append', 'summary', 'outline', 'other'])

router.get('/chat/messages', async (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  const rows = await db.prepare('SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
  res.json(rows.map(mapChatMessage))
})

router.post('/chat/messages', async (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })
  const role = ['user', 'assistant', 'system'].includes(body.role) ? body.role : 'user'
  const content = str(body.content)
  const usageJson = body.usage && typeof body.usage === 'object' ? JSON.stringify(body.usage) : ''
  const id = newId()
  const t = now()
  await db.prepare(
    'INSERT INTO chat_messages (id, project_id, role, content, model_name, usage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    projectId,
    role,
    content,
    body.modelName ? str(body.modelName) : null,
    usageJson,
    t
  )
  res.status(201).json(mapChatMessage(await db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id)))
})

router.delete('/chat/messages', async (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  await db.prepare('DELETE FROM chat_messages WHERE project_id = ?').run(projectId)
  res.json({ ok: true })
})

router.post('/chat/stream', async (req, res) => {
  const body = req.body ?? {}
  const modelId = str(body.modelId)
  if (!modelId) return res.status(400).json({ error: '缺少 modelId' })
  const row = await db
    .prepare(
      `SELECT m.*, p.base_url, p.api_key, p.extra_headers, p.api_type, p.name AS provider_name
       FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`
    )
    .get(modelId)
  if (!row) return res.status(400).json({ error: '模型不存在，请先在设置中配置服务商与模型' })

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) return res.status(400).json({ error: '消息为空' })
  const projectId = str(body.projectId)
  const scene = SCENES.has(body.scene) ? body.scene : 'chat'
  const contextLength = int(row.context_length, 0) || guessContextLength(row.name)
  const maxTokens = typeof body.maxTokens === 'number' ? body.maxTokens : row.max_tokens

  let url
  try {
    url = resolveEndpoint(row.base_url, 'chat/completions')
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const provider = { api_key: row.api_key, extra_headers: row.extra_headers }
  const headers = buildHeaders(provider)
  const basePayload = {
    model: row.name,
    messages: messages.map((message) => ({
      role: ['system', 'assistant', 'user'].includes(message.role) ? message.role : 'user',
      content: str(message.content)
    })),
    stream: true,
    temperature: typeof body.temperature === 'number' ? body.temperature : row.temperature,
    max_tokens: maxTokens
  }
  // 模型级额外参数：可用来关掉默认深度思考（如 {"reasoning_effort":"none"}）或调 top_p。
  // 核心字段最后写回，避免配置误伤 model / messages / stream。
  const extraBody = parseObj(row.extra_body)
  const mergedPayload = {
    ...basePayload,
    ...extraBody,
    model: row.name,
    messages: basePayload.messages,
    stream: true
  }
  // OpenAI / 多数兼容服务只有显式要求才会在流式响应里给 usage（DeepSeek 会直接给）
  const payload = {
    ...mergedPayload,
    stream_options: { include_usage: true, ...(extraBody.stream_options ?? {}) }
  }

  // 生成速率用的计时：从请求发出算起，第一个内容片段到达时单独记一笔
  const startedAt = Date.now()
  let firstTokenAt = null

  const controller = new AbortController()
  // 注意：req 的 close 在请求体读取完成后就会触发，不能用来判断客户端断开
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })
  const requestInit = (value) => ({
    method: 'POST',
    headers,
    body: JSON.stringify(value),
    signal: controller.signal
  })
  const connectionError = (error) => {
    if (error.name === 'AbortError') return res.end()
    return res.status(502).json({ error: `连接模型服务失败：${error.message}` })
  }
  const upstreamError = async (response, cachedText = '') => {
    let text = cachedText
    if (!text) {
      try {
        text = await response.text()
      } catch {
        text = ''
      }
    }
    let message = text || response.statusText
    try {
      const parsed = JSON.parse(text)
      message = parsed?.error?.message || parsed?.message || message
    } catch {
      /* 非 JSON 错误体，直接使用原文 */
    }
    return res.status(response.status).json({ error: `模型服务返回 ${response.status}：${String(message).slice(0, 500)}` })
  }

  let upstream
  try {
    upstream = await fetch(url, requestInit(payload))
  } catch (error) {
    return connectionError(error)
  }

  if (!upstream.ok) {
    if (upstream.status === 400) {
      let text = ''
      try {
        text = await upstream.text()
      } catch {
        /* 忽略读取失败 */
      }
      // 少数本地服务 / 代理不认识 stream_options，去掉这个参数重试一次
      if (/stream_options|include_usage/i.test(text)) {
        try {
          upstream = await fetch(url, requestInit(mergedPayload))
        } catch (error) {
          return connectionError(error)
        }
        if (!upstream.ok) return upstreamError(upstream)
      } else {
        return upstreamError(upstream, text)
      }
    } else {
      return upstreamError(upstream)
    }
  }

  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  if (typeof res.flushHeaders === 'function') res.flushHeaders()

  const send = (payload) => {
    if (!res.writableEnded && !res.destroyed) res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  let finished = false
  let lastUsage = null
  let completionText = ''
  const markFirstToken = () => {
    if (firstTokenAt === null) firstTokenAt = Date.now()
  }

  // 流结束（或被中断）时统一算一次用量：优先用上游上报，没有就按字符估算
  const finishUsage = async () => {
    try {
      const base = lastUsage
        ? normalizeUsage(lastUsage, { messages, completionText })
        : estimateUsage(messages, completionText)
      const usage = attachTiming(attachContext(base, contextLength, maxTokens), {
        durationMs: Date.now() - startedAt,
        firstTokenMs: firstTokenAt === null ? null : firstTokenAt - startedAt
      })
      await db.prepare(
        `INSERT INTO llm_usage_logs
         (id, project_id, scene, model_name, provider_name, prompt_tokens, completion_tokens, total_tokens,
          cache_hit_tokens, cache_miss_tokens, cache_hit_rate, context_length, context_used, context_rate,
          duration_ms, first_token_ms, estimated, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        newId(),
        projectId || null,
        scene,
        row.name,
        row.provider_name ?? '',
        usage.promptTokens,
        usage.completionTokens,
        usage.totalTokens,
        usage.cacheHitTokens,
        usage.cacheMissTokens,
        usage.cacheHitRate,
        usage.contextLength,
        usage.contextUsed,
        usage.contextRate,
        usage.durationMs,
        usage.firstTokenMs,
        usage.estimated ? 1 : 0,
        now()
      )
      send({ usage })
    } catch (error) {
      console.error('[usage] 记录本次调用用量失败：', error.message)
    }
  }

  const contentType = upstream.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    try {
      const data = await upstream.json()
      const content = data?.choices?.[0]?.message?.content ?? ''
      if (typeof content === 'string' && content) {
        completionText += content
        send({ delta: content })
      }
      lastUsage = data?.usage ?? null
    } catch (error) {
      send({ error: `解析模型响应失败：${error.message}` })
    }
    await finishUsage()
    send({ done: true, ok: true })
    res.end()
    return
  }

  const reader = upstream.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  const handleEvent = (eventText) => {
    const dataLines = eventText
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
    if (!dataLines.length) return
    const raw = dataLines.join('\n')
    if (!raw || raw === '[DONE]') return
    let json
    try {
      json = JSON.parse(raw)
    } catch {
      return
    }
    if (json.error) {
      const message = json.error.message || JSON.stringify(json.error)
      send({ error: `模型服务报错：${String(message).slice(0, 300)}` })
      return
    }
    const choice = json.choices?.[0]
    const delta = choice?.delta?.content
    const reasoning = choice?.delta?.reasoning ?? choice?.delta?.reasoning_content
    if (typeof reasoning === 'string' && reasoning) {
      markFirstToken()
      completionText += reasoning
      send({ reasoning })
    }
    if (typeof delta === 'string' && delta) {
      markFirstToken()
      completionText += delta
      send({ delta })
    }
    if (!delta && typeof choice?.text === 'string' && choice.text) {
      markFirstToken()
      completionText += choice.text
      send({ delta: choice.text })
    }
    if (json.usage && typeof json.usage === 'object') lastUsage = json.usage
  }

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) handleEvent(event)
    }
    buffer += decoder.decode()
    if (buffer.trim()) handleEvent(buffer)
    finished = true
  } catch (error) {
    if (!controller.signal.aborted) {
      send({ error: `读取模型流失败：${error.message}` })
    }
  } finally {
    await finishUsage()
    send({ done: true, ok: finished })
    if (!res.writableEnded && !res.destroyed) res.end()
  }
})

export default router
