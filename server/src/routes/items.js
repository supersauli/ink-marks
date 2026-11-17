import { Router } from 'express'
import { db } from '../db.js'
import { mapItem, mapItemEvent } from '../mappers.js'
import { newId, now, str, trimTitle } from '../util.js'
import { touchProject } from '../store.js'

const router = Router()

const ITEM_FIELDS = {
  name: 'name',
  category: 'category',
  rarity: 'rarity',
  origin: 'origin',
  reason: 'reason',
  debut: 'debut',
  background: 'background',
  notes: 'notes',
  status: 'status',
  currentHolder: 'current_holder',
  destroyedBy: 'destroyed_by',
  destroyedAt: 'destroyed_at'
}

async function getItem(itemId) {
  return await db.prepare('SELECT * FROM items WHERE id = ?').get(itemId)
}

async function validChapterId(chapterId, projectId) {
  if (!chapterId) return null
  const row = await db.prepare('SELECT id FROM chapters WHERE id = ? AND project_id = ?').get(chapterId, projectId)
  return row ? row.id : null
}

async function listEvents(itemId) {
  return (await db
    .prepare('SELECT * FROM item_events WHERE item_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(itemId))
    .map(mapItemEvent)
}

async function itemDetail(itemId) {
  const row = await getItem(itemId)
  if (!row) return null
  const events = await listEvents(itemId)
  const holders = []
  for (const event of events) {
    if (event.holder && !holders.includes(event.holder)) holders.push(event.holder)
  }
  if (row.current_holder && !holders.includes(row.current_holder)) holders.push(row.current_holder)
  return { ...mapItem(row), events, holders }
}

async function applyEventToItem(itemId, event) {
  const item = await getItem(itemId)
  if (!item) return
  const status = str(event.status, item.status) || 'intact'
  const destroyed = status === 'destroyed'
  const t = now()
  await db.prepare(
    'UPDATE items SET status = ?, current_holder = ?, is_destroyed = ?, destroyed_by = ?, destroyed_at = ?, updated_at = ? WHERE id = ?'
  ).run(
    status,
    str(event.holder, item.current_holder),
    destroyed ? 1 : 0,
    destroyed ? str(event.destroyedBy, item.destroyed_by) : '',
    destroyed ? str(event.period, item.destroyed_at) : '',
    t,
    itemId
  )
}

router.get('/items', async (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  const rows = await db
    .prepare('SELECT * FROM items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)
  res.json(rows.map(mapItem))
})

router.post('/items', async (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })
  const maxRow = await db.prepare('SELECT MAX(sort_order) AS m FROM items WHERE project_id = ?').get(projectId)
  const id = newId()
  const t = now()
  await db.prepare(
    'INSERT INTO items (id, project_id, name, category, rarity, origin, reason, debut, background, notes, status, current_holder, is_destroyed, destroyed_by, destroyed_at, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    projectId,
    trimTitle(body.name, '新物品'),
    trimTitle(body.category, '物品'),
    str(body.rarity),
    str(body.origin),
    str(body.reason),
    str(body.debut),
    str(body.background),
    str(body.notes),
    'intact',
    str(body.currentHolder),
    0,
    '',
    '',
    (maxRow?.m ?? -10) + 10,
    t,
    t
  )
  await touchProject(projectId)
  res.status(201).json(await itemDetail(id))
})

router.get('/items/:id', async (req, res) => {
  const detail = await itemDetail(req.params.id)
  if (!detail) return res.status(404).json({ error: '物品不存在' })
  res.json(detail)
})

router.patch('/items/:id', async (req, res) => {
  const item = await getItem(req.params.id)
  if (!item) return res.status(404).json({ error: '物品不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  for (const [key, column] of Object.entries(ITEM_FIELDS)) {
    if (body[key] === undefined) continue
    updates.push(`${column} = ?`)
    values.push(key === 'name' ? trimTitle(body[key], item.name || '未命名物品') : str(body[key]))
  }
  if (body.status !== undefined) {
    updates.push('is_destroyed = ?')
    values.push(str(body.status) === 'destroyed' ? 1 : 0)
  }
  if (!updates.length) return res.json(mapItem(item))
  updates.push('updated_at = ?')
  values.push(now(), item.id)
  await db.prepare(`UPDATE items SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  await touchProject(item.project_id)
  res.json(mapItem(await getItem(item.id)))
})

router.delete('/items/:id', async (req, res) => {
  const item = await getItem(req.params.id)
  if (!item) return res.status(404).json({ error: '物品不存在' })
  await db.prepare('DELETE FROM attribute_values WHERE entity_type = ? AND entity_id = ?').run('item', item.id)
  await db.prepare('DELETE FROM attribute_logs WHERE entity_type = ? AND entity_id = ?').run('item', item.id)
  await db.prepare('DELETE FROM item_events WHERE item_id = ?').run(item.id)
  await db.prepare('DELETE FROM items WHERE id = ?').run(item.id)
  await touchProject(item.project_id)
  res.json({ ok: true })
})

router.post('/items/:id/events', async (req, res) => {
  const item = await getItem(req.params.id)
  if (!item) return res.status(404).json({ error: '物品不存在' })
  const body = req.body ?? {}
  const t = now()
  const id = newId()
  const chapterId = await validChapterId(str(body.chapterId), item.project_id)
  await db.prepare(
    'INSERT INTO item_events (id, item_id, period, chapter_id, holder, status, destroyed_by, note, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    item.id,
    str(body.period),
    chapterId,
    str(body.holder),
    str(body.status, 'intact') || 'intact',
    str(body.destroyedBy),
    str(body.note),
    t,
    t
  )
  if (body.applyCurrent !== false) {
    await applyEventToItem(item.id, body)
  } else {
    await db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(t, item.id)
  }
  await touchProject(item.project_id)
  res.status(201).json(await itemDetail(item.id))
})

router.patch('/item-events/:id', async (req, res) => {
  const event = await db.prepare('SELECT * FROM item_events WHERE id = ?').get(req.params.id)
  if (!event) return res.status(404).json({ error: '状态记录不存在' })
  const item = await getItem(event.item_id)
  if (!item) return res.status(404).json({ error: '物品不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  for (const [key, column] of Object.entries({
    period: 'period',
    holder: 'holder',
    status: 'status',
    destroyedBy: 'destroyed_by',
    note: 'note'
  })) {
    if (body[key] === undefined) continue
    updates.push(`${column} = ?`)
    values.push(str(body[key]))
  }
  if (body.chapterId !== undefined) {
    updates.push('chapter_id = ?')
    values.push(await validChapterId(str(body.chapterId), item.project_id))
  }
  if (updates.length) {
    updates.push('updated_at = ?')
    values.push(now(), event.id)
    await db.prepare(`UPDATE item_events SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }
  if (body.applyCurrent !== false) await applyEventToItem(item.id, { ...event, ...body })
  await touchProject(item.project_id)
  res.json(await itemDetail(item.id))
})

router.delete('/item-events/:id', async (req, res) => {
  const event = await db.prepare('SELECT * FROM item_events WHERE id = ?').get(req.params.id)
  if (!event) return res.status(404).json({ error: '状态记录不存在' })
  const item = await getItem(event.item_id)
  if (!item) return res.status(404).json({ error: '物品不存在' })
  await db.prepare('DELETE FROM item_events WHERE id = ?').run(event.id)
  await db.prepare('UPDATE items SET updated_at = ? WHERE id = ?').run(now(), item.id)
  await touchProject(item.project_id)
  res.json(await itemDetail(item.id))
})

export default router
