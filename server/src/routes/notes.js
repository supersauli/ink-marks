import { Router } from 'express'
import { db } from '../db.js'
import { mapNote } from '../mappers.js'
import { newId, now, str, trimTitle } from '../util.js'
import { touchProject } from '../store.js'

const router = Router()

function scopeOf(value) {
  return value === 'project' || value === 'global' ? value : null
}

async function projectExists(projectId) {
  if (!projectId) return false
  const row = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  return Boolean(row)
}

async function noteRow(id) {
  return await db.prepare('SELECT * FROM notes WHERE id = ?').get(id)
}

async function scopeWhere(scope, projectId) {
  if (scope === 'global') return { sql: 'project_id IS NULL', args: [] }
  return { sql: 'project_id = ?', args: [projectId] }
}

async function listNotes(scope, projectId) {
  const where = await scopeWhere(scope, projectId)
  const rows = await db
    .prepare(`SELECT * FROM notes WHERE ${where.sql} ORDER BY sort_order ASC, created_at ASC`)
    .all(...where.args)
  return rows.map(mapNote)
}

router.get('/notes', async (req, res) => {
  const scope = scopeOf(str(req.query.scope)) ?? 'global'
  const projectId = str(req.query.projectId)
  if (scope === 'project' && !(await projectExists(projectId))) {
    return res.status(400).json({ error: '作品不存在' })
  }
  res.json(await listNotes(scope, projectId))
})

router.post('/notes', async (req, res) => {
  const body = req.body ?? {}
  const scope = scopeOf(str(body.scope))
  if (!scope) return res.status(400).json({ error: '记事本范围无效' })
  const projectId = scope === 'project' ? str(body.projectId) : null
  if (scope === 'project' && !(await projectExists(projectId))) {
    return res.status(400).json({ error: '作品不存在' })
  }

  const where = await scopeWhere(scope, projectId)
  const maxRow = await db
    .prepare(`SELECT MAX(sort_order) AS m FROM notes WHERE ${where.sql}`)
    .get(...where.args)
  const id = newId()
  const t = now()
  await db.prepare(
    'INSERT INTO notes (id, project_id, title, content, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    projectId,
    // 标题留空，编辑区用 placeholder 引导命名；列表和页签会显示「未命名记事」。
    trimTitle(body.title, ''),
    str(body.content),
    (maxRow?.m ?? -10) + 10,
    t,
    t
  )
  if (projectId) await touchProject(projectId)
  res.status(201).json(mapNote(await noteRow(id)))
})

router.get('/notes/:id', async (req, res) => {
  const row = await noteRow(req.params.id)
  if (!row) return res.status(404).json({ error: '记事本不存在' })
  res.json(mapNote(row))
})

router.patch('/notes/:id', async (req, res) => {
  const note = await noteRow(req.params.id)
  if (!note) return res.status(404).json({ error: '记事本不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  if (body.title !== undefined) {
    updates.push('title = ?')
    values.push(trimTitle(body.title, note.title || '未命名记事'))
  }
  if (body.content !== undefined) {
    updates.push('content = ?')
    values.push(str(body.content))
  }
  if (body.sortOrder !== undefined) {
    updates.push('sort_order = ?')
    values.push(Number.isFinite(Number(body.sortOrder)) ? Math.trunc(Number(body.sortOrder)) : note.sort_order)
  }
  if (updates.length) {
    updates.push('updated_at = ?')
    values.push(now(), note.id)
    await db.prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  }
  if (note.project_id) await touchProject(note.project_id)
  res.json(mapNote(await noteRow(note.id)))
})

router.delete('/notes/:id', async (req, res) => {
  const note = await noteRow(req.params.id)
  if (!note) return res.status(404).json({ error: '记事本不存在' })
  await db.prepare('DELETE FROM notes WHERE id = ?').run(note.id)
  if (note.project_id) await touchProject(note.project_id)
  res.json({ ok: true })
})

export default router
