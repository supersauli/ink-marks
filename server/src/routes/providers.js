import { Router } from 'express'
import { db } from '../db.js'
import { mapModel, mapProvider } from '../mappers.js'
import { newId, now, str, int, boolInt, trimTitle } from '../util.js'
import { fetchRemoteModels } from '../llm.js'

const router = Router()

function listModels(providerId) {
  return db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY sort_order ASC, name ASC').all(providerId).map(mapModel)
}

function providerWithModels(row) {
  return { ...mapProvider(row), models: listModels(row.id) }
}

function clearDefaultModels(exceptId = '') {
  db.prepare('UPDATE models SET is_default = 0 WHERE id != ?').run(exceptId)
}

router.get('/providers', (req, res) => {
  const rows = db.prepare('SELECT * FROM providers ORDER BY created_at ASC').all()
  res.json(rows.map(providerWithModels))
})

router.post('/providers', (req, res) => {
  const body = req.body ?? {}
  const t = now()
  const id = newId()
  db.prepare(
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
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id)
  res.status(201).json(providerWithModels(row))
})

router.patch('/providers/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '服务商不存在' })
  const body = req.body ?? {}
  db.prepare('UPDATE providers SET name = ?, base_url = ?, api_key = ?, api_type = ?, extra_headers = ?, updated_at = ? WHERE id = ?').run(
    body.name === undefined ? row.name : trimTitle(body.name, row.name),
    body.baseUrl === undefined ? row.base_url : str(body.baseUrl, row.base_url).trim(),
    body.apiKey === undefined ? row.api_key : str(body.apiKey, row.api_key),
    body.apiType === undefined ? row.api_type : str(body.apiType, row.api_type),
    body.extraHeaders === undefined ? row.extra_headers : str(body.extraHeaders, row.extra_headers),
    now(),
    row.id
  )
  const updated = db.prepare('SELECT * FROM providers WHERE id = ?').get(row.id)
  res.json(providerWithModels(updated))
})

router.delete('/providers/:id', (req, res) => {
  const result = db.prepare('DELETE FROM providers WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '服务商不存在' })
  res.json({ ok: true })
})

router.post('/providers/:id/remote-models', async (req, res, next) => {
  try {
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '服务商不存在' })
    const apiKey = req.body?.apiKey
    const models = await fetchRemoteModels(row, typeof apiKey === 'string' && apiKey ? apiKey : undefined)
    res.json({ models })
  } catch (error) {
    res.status(400).json({ error: error.message || '拉取模型列表失败' })
  }
})

router.post('/providers/:id/test', async (req, res) => {
  try {
    const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(req.params.id)
    if (!row) return res.status(404).json({ error: '服务商不存在' })
    const apiKey = req.body?.apiKey
    const models = await fetchRemoteModels(row, typeof apiKey === 'string' && apiKey ? apiKey : undefined)
    res.json({ ok: true, count: models.length, models })
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message || '连接失败' })
  }
})

router.post('/models', (req, res) => {
  const body = req.body ?? {}
  const providerId = str(body.providerId)
  const provider = db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId)
  if (!provider) return res.status(400).json({ error: '服务商不存在' })
  const name = str(body.name).trim()
  if (!name) return res.status(400).json({ error: '模型名不能为空' })
  const row = db.prepare('SELECT MAX(sort_order) AS m FROM models WHERE provider_id = ?').get(providerId)
  const id = newId()
  const isDefault = boolInt(body.isDefault)
  db.prepare(
    'INSERT INTO models (id, provider_id, name, display_name, temperature, max_tokens, is_default, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    providerId,
    name,
    trimTitle(body.displayName, name),
    Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7,
    int(body.maxTokens, 4096),
    isDefault,
    (row?.m ?? -10) + 10
  )
  if (isDefault) clearDefaultModels(id)
  res.status(201).json(mapModel(db.prepare('SELECT * FROM models WHERE id = ?').get(id)))
})

router.patch('/models/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM models WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '模型不存在' })
  const body = req.body ?? {}
  const nextDefault = body.isDefault === undefined ? row.is_default : boolInt(body.isDefault)
  db.prepare(
    'UPDATE models SET name = ?, display_name = ?, temperature = ?, max_tokens = ?, is_default = ? WHERE id = ?'
  ).run(
    body.name === undefined ? row.name : trimTitle(body.name, row.name),
    body.displayName === undefined ? row.display_name : trimTitle(body.displayName, row.display_name),
    body.temperature === undefined ? row.temperature : Number(body.temperature),
    body.maxTokens === undefined ? row.max_tokens : int(body.maxTokens, row.max_tokens),
    nextDefault,
    row.id
  )
  if (nextDefault) clearDefaultModels(row.id)
  res.json(mapModel(db.prepare('SELECT * FROM models WHERE id = ?').get(row.id)))
})

router.delete('/models/:id', (req, res) => {
  const result = db.prepare('DELETE FROM models WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '模型不存在' })
  res.json({ ok: true })
})

export default router
