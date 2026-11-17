import { Router } from 'express'
import { db } from '../db.js'
import { mapModel, mapProvider } from '../mappers.js'
import { newId, now, str, int, boolInt, trimTitle } from '../util.js'
import { fetchRemoteModels } from '../llm.js'
import { isKeyMask } from '../security.js'
import { guessContextLength } from '../usage.js'

const router = Router()

async function listModels(providerId) {
  return (await db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY sort_order ASC, name ASC').all(providerId)).map(mapModel)
}

async function providerWithModels(row) {
  return { ...mapProvider(row), models: await listModels(row.id) }
}

async function clearDefaultModels(exceptId = '') {
  await db.prepare('UPDATE models SET is_default = 0 WHERE id != ?').run(exceptId)
}

// 模型级的额外请求参数（JSON 对象），用于 reasoning_effort / top_p 这类兼容差异
function normalizeExtraBody(value) {
  const text = str(value, '{}').trim() || '{}'
  try {
    const parsed = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}

router.get('/providers', async (req, res) => {
  const rows = await db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all()
  res.json(await Promise.all(rows.map(providerWithModels)))
})

router.post('/providers', async (req, res) => {
  const body = req.body ?? {}
  const t = now()
  const id = newId()
  await db.prepare(
    'INSERT INTO providers (id, name, base_url, api_key, api_type, extra_headers, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    trimTitle(body.name, '新服务商'),
    str(body.baseUrl, 'https://api.openai.com/v1').trim(),
    str(body.apiKey),
    str(body.apiType, 'openai'),
    str(body.extraHeaders, '{}'),
    t,
    t
  )
  const row = await db.prepare('SELECT * FROM providers WHERE id = ?').get(id)
  res.status(201).json(await providerWithModels(row))
})

router.patch('/providers/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '服务商不存在' })
  const body = req.body ?? {}
  await db.prepare('UPDATE providers SET name = ?, base_url = ?, api_key = ?, api_type = ?, extra_headers = ?, updated_at = ? WHERE id = ?').run(
    body.name === undefined ? row.name : trimTitle(body.name, row.name),
    body.baseUrl === undefined ? row.base_url : str(body.baseUrl, row.base_url).trim(),
    // 前端未改动 Key 时回传掩码占位符，此时保留原 Key，避免把掩码写进库
    body.apiKey === undefined || isKeyMask(body.apiKey) ? row.api_key : str(body.apiKey, row.api_key),
    body.apiType === undefined ? row.api_type : str(body.apiType, row.api_type),
    body.extraHeaders === undefined ? row.extra_headers : str(body.extraHeaders, row.extra_headers),
    now(),
    row.id
  )
  const updated = await db.prepare('SELECT * FROM providers WHERE id = ?').get(row.id)
  res.json(await providerWithModels(updated))
})

router.delete('/providers/:id', async (req, res) => {
  const result = await db.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '服务商不存在' })
  res.json({ ok: true })
})

router.post('/providers/:id/remote-models', async (req, res, next) => {
  try {
    const row = await db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '服务商不存在' })
    const apiKey = req.body?.apiKey
    // 掩码占位符表示「用已保存的 Key」，传 undefined 让服务端取库里的真实值
    const effectiveKey = isKeyMask(apiKey) ? undefined : (typeof apiKey === 'string' && apiKey ? apiKey : undefined)
    const models = await fetchRemoteModels(row, effectiveKey)
    res.json({ models })
  } catch (error) {
    res.status(400).json({ error: error.message || '拉取模型列表失败' })
  }
})

router.post('/providers/:id/test', async (req, res) => {
  try {
    const row = await db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '服务商不存在' })
    const apiKey = req.body?.apiKey
    // 掩码占位符表示「用已保存的 Key」，传 undefined 让服务端取库里的真实值
    const effectiveKey = isKeyMask(apiKey) ? undefined : (typeof apiKey === 'string' && apiKey ? apiKey : undefined)
    const models = await fetchRemoteModels(row, effectiveKey)
    res.json({ ok: true, count: models.length, models })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || '连接失败' })
  }
})

router.post('/models', async (req, res) => {
  const body = req.body ?? {}
  const providerId = str(body.providerId)
  const provider = await db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId)
  if (!provider) return res.status(400).json({ error: '服务商不存在' })
  const name = str(body.name).trim()
  if (!name) return res.status(400).json({ error: '模型名不能为空' })
  const extraBody = normalizeExtraBody(body.extraBody ?? '{}')
  if (extraBody === null) return res.status(400).json({ error: '额外请求参数必须是合法的 JSON 对象' })
  const row = await db.prepare('SELECT MAX(sort_order) AS m FROM models WHERE provider_id = ?').get(providerId)
  const id = newId()
  const isDefault = boolInt(body.isDefault)
  await db.prepare(
    'INSERT INTO models (id, provider_id, name, display_name, temperature, max_tokens, context_length, extra_body, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    providerId,
    name,
    trimTitle(body.displayName, name),
    Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
    int(body.maxTokens, 4096),
    Math.max(0, int(body.contextLength, guessContextLength(name))),
    extraBody,
    isDefault,
    (row?.m ?? -10) + 10
  )
  if (isDefault) await clearDefaultModels(id)
  res.status(201).json(mapModel(await db.prepare('SELECT * FROM models WHERE id = ?').get(id)))
})

router.patch('/models/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '模型不存在' })
  const body = req.body ?? {}
  const nextDefault = body.isDefault === undefined ? row.is_default : boolInt(body.isDefault)
  let extraBody = row.extra_body ?? '{}'
  if (body.extraBody !== undefined) {
    const normalized = normalizeExtraBody(body.extraBody)
    if (normalized === null) return res.status(400).json({ error: '额外请求参数必须是合法的 JSON 对象' })
    extraBody = normalized
  }
  await db.prepare(
    'UPDATE models SET name = ?, display_name = ?, temperature = ?, max_tokens = ?, context_length = ?, extra_body = ?, is_default = ? WHERE id = ?'
  ).run(
    body.name === undefined ? row.name : trimTitle(body.name, row.name),
    body.displayName === undefined ? row.display_name : trimTitle(body.displayName, row.display_name),
    body.temperature === undefined ? row.temperature : Number(body.temperature),
    body.maxTokens === undefined ? row.max_tokens : int(body.maxTokens, row.max_tokens),
    Math.max(0, int(body.contextLength, row.context_length ?? 0)),
    extraBody,
    nextDefault,
    row.id
  )
  if (nextDefault) await clearDefaultModels(row.id)
  res.json(mapModel(await db.prepare('SELECT * FROM models WHERE id = ?').get(row.id)))
})

router.delete('/models/:id', async (req, res) => {
  const result = await db.prepare('DELETE FROM models WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '模型不存在' })
  res.json({ ok: true })
})

export default router
