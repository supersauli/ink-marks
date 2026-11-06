import { Router } from 'express'
import { db } from '../db.js'
import { mapChatMessage } from '../mappers.js'
import { newId, now, str } from '../util.js'
import { buildHeaders, resolveEndpoint } from '../llm.js'

const router = Router()

router.get('/chat/messages', (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  const rows = db.prepare('SELECT * FROM chat_messages WHERE project_id = ? ORDER BY created_at ASC').all(projectId)
  res.json(rows.map(mapChatMessage))
})

router.post('/chat/messages', (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })
  const role = ['user', 'assistant', 'system'].includes(body.role) ? body.role : 'user'
  const content = str(body.content)
  const id = newId()
  const t = now()
  db.prepare('INSERT INTO chat_messages (id, project_id, role, content, model_name, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    id,
    projectId,
    role,
    content,
    body.modelName ? str(body.modelName) : null,
    t
  )
  res.status(201).json(mapChatMessage(db.prepare('SELECT * FROM chat_messages WHERE id = ?').get(id)))
})

router.delete('/chat/messages', (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  db.prepare('DELETE FROM chat_messages WHERE project_id = ?').run(projectId)
  res.json({ ok: true })
})

router.post('/chat/stream', async (req, res) => {
  const body = req.body ?? {}
  const modelId = str(body.modelId)
  if (!modelId) return res.status(400).json({ error: '缺少 modelId' })
  const row = db
    .prepare(
      `SELECT m.*, p.base_url, p.api_key, p.extra_headers, p.api_type, p.name AS provider_name
       FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`
    )
    .get(modelId)
  if (!row) return res.status(400).json({ error: '模型不存在，请先在设置中配置服务商与模型' })

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length) return res.status(400).json({ error: '消息为空' })

  let url
  try {
    url = resolveEndpoint(row.base_url, 'chat/completions')
  } catch (error) {
    return res.status(400).json({ error: error.message })
  }

  const provider = { api_key: row.api_key, extra_headers: row.extra_headers }
  const headers = buildHeaders(provider)
  const payload = {
    model: row.name,
    messages: messages.map((message) => ({
      role: ['system', 'assistant', 'user'].includes(message.role) ? message.role : 'user',
      content: str(message.content)
    })),
    stream: true,
    temperature: typeof body.temperature === 'number' ? body.temperature : row.temperature,
    max_tokens: typeof body.maxTokens === 'number' ? body.maxTokens : row.max_tokens
  }

  const controller = new AbortController()
  // 注意：req 的 close 在请求体读取完成后就会触发，不能用来判断客户端断开
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

  let upstream
  try {
    upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal
    })
  } catch (error) {
    if (error.name === 'AbortError') return res.end()
    return res.status(502).json({ error: `连接模型服务失败：${error.message}` })
  }

  if (!upstream.ok) {
    const text = await upstream.text()
    let message = text || upstream.statusText
    try {
      const parsed = JSON.parse(text)
      message = parsed?.error?.message || parsed?.message || message
    } catch {
      /* 非 JSON 错误体，直接使用原文 */
    }
    return res.status(upstream.status).json({ error: `模型服务返回 ${upstream.status}：${String(message).slice(0, 500)}` })
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

  const contentType = upstream.headers.get('content-type') || ''
  if (!contentType.includes('text/event-stream')) {
    try {
      const data = await upstream.json()
      const content = data?.choices?.[0]?.message?.content ?? ''
      if (typeof content === 'string' && content) send({ delta: content })
      send({ done: true, usage: data?.usage ?? null })
    } catch (error) {
      send({ error: `解析模型响应失败：${error.message}` })
      send({ done: true })
    }
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
    if (typeof reasoning === 'string' && reasoning) send({ reasoning })
    if (typeof delta === 'string' && delta) send({ delta })
    if (!delta && typeof choice?.text === 'string' && choice.text) send({ delta: choice.text })
    if (json.usage) send({ usage: json.usage })
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
    send({ done: true, ok: finished })
    if (!res.writableEnded && !res.destroyed) res.end()
  }
})

export default router
