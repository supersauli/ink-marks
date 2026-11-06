import { Router } from 'express'
import { db } from '../db.js'
import { mapProject } from '../mappers.js'
import { newId, now, str, trimTitle } from '../util.js'
import { touchProject } from '../store.js'

const router = Router()

router.get('/', (req, res) => {
  const rows = db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all()
  res.json(rows.map(mapProject))
})

router.post('/', (req, res) => {
  const body = req.body ?? {}
  const t = now()
  const project = {
    id: newId(),
    name: trimTitle(body.name, '未命名作品'),
    description: str(body.description),
    createdAt: t,
    updatedAt: t
  }
  db.prepare('INSERT INTO projects (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run(
    project.id,
    project.name,
    project.description,
    t,
    t
  )
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(project.id)
  res.status(201).json(mapProject(row))
})

router.patch('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM projects WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '作品不存在' })
  const body = req.body ?? {}
  const name = body.name === undefined ? row.name : trimTitle(body.name, row.name)
  const description = body.description === undefined ? row.description : str(body.description, row.description)
  const t = now()
  db.prepare('UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(name, description, t, row.id)
  const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(row.id)
  res.json(mapProject(updated))
})

router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '作品不存在' })
  res.json({ ok: true })
})

export default router
