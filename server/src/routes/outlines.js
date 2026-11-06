import { Router } from 'express'
import { db } from '../db.js'
import { mapOutline } from '../mappers.js'
import { newId, now, str, int, trimTitle } from '../util.js'
import { maybeAutoSnapshot, touchProject } from '../store.js'

const router = Router()

const listByProject = (projectId) =>
  db
    .prepare('SELECT * FROM outline_items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)

function nextOrder(projectId, parentId) {
  const row = parentId
    ? db
        .prepare('SELECT MAX(sort_order) AS m FROM outline_items WHERE project_id = ? AND parent_id = ?')
        .get(projectId, parentId)
    : db.prepare('SELECT MAX(sort_order) AS m FROM outline_items WHERE project_id = ? AND parent_id IS NULL').get(projectId)
  return (row?.m ?? -10) + 10
}

router.get('/', (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  res.json(listByProject(projectId).map(mapOutline))
})

router.post('/', (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })

  let parentId = body.parentId ? str(body.parentId) : null
  if (parentId) {
    const parent = db.prepare('SELECT id, project_id FROM outline_items WHERE id = ?').get(parentId)
    if (!parent || parent.project_id !== projectId) parentId = null
  }

  const item = {
    id: newId(),
    projectId,
    parentId,
    title: trimTitle(body.title, '新大纲'),
    content: str(body.content),
    sortOrder: nextOrder(projectId, parentId),
    createdAt: now(),
    updatedAt: now()
  }
  db.prepare(
    'INSERT INTO outline_items (id, project_id, parent_id, title, content, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(item.id, item.projectId, item.parentId, item.title, item.content, item.sortOrder, item.createdAt, item.updatedAt)
  touchProject(projectId)
  const row = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(item.id)
  res.status(201).json(mapOutline(row))
})

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '大纲不存在' })
  const body = req.body ?? {}
  const title = body.title === undefined ? row.title : trimTitle(body.title, row.title)
  const content = body.content === undefined ? row.content : str(body.content, row.content)
  const sortOrder = body.sortOrder === undefined ? row.sort_order : int(body.sortOrder, row.sort_order)
  let parentId = body.parentId === undefined ? row.parent_id : body.parentId ? str(body.parentId) : null
  if (parentId === row.id) parentId = row.parent_id

  if (title !== row.title || content !== row.content) {
    maybeAutoSnapshot('outline', row.id, row.project_id)
  }
  db.prepare('UPDATE outline_items SET title = ?, content = ?, parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    title,
    content,
    parentId,
    sortOrder,
    now(),
    row.id
  )
  touchProject(row.project_id)
  const updated = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(row.id)
  res.json(mapOutline(updated))
})

router.delete('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '大纲不存在' })
  db.prepare('DELETE FROM outline_items WHERE id = ?').run(row.id)
  db.prepare("DELETE FROM versions WHERE target_type = 'outline' AND target_id = ?").run(row.id)
  db.prepare("DELETE FROM revisions WHERE scope = 'outline' AND target_id = ?").run(row.id)
  touchProject(row.project_id)
  res.json({ ok: true })
})

router.post('/reorder', (req, res) => {
  const { projectId, ids } = req.body ?? {}
  if (!projectId || !Array.isArray(ids)) return res.status(400).json({ error: '参数不完整' })
  const update = db.prepare('UPDATE outline_items SET sort_order = ? WHERE id = ? AND project_id = ?')
  ids.forEach((id, index) => update.run(index * 10, str(id), projectId))
  touchProject(projectId)
  res.json(listByProject(projectId).map(mapOutline))
})

export default router
