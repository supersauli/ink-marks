import { Router } from 'express'
import { db } from '../db.js'
import {
  mapAttributeLog,
  mapAttributeValue,
  mapCardField,
  mapCardTemplate
} from '../mappers.js'
import { newId, now, int, str, trimTitle } from '../util.js'
import { touchProject } from '../store.js'
import {
  FIELD_TYPES,
  entityProject,
  fieldWithTemplate,
  listTemplates,
  templateDetail,
  touchEntityProject
} from '../cards.js'

const router = Router()

const ENTITY_TYPES = ['character', 'item']

async function templateProject(templateId) {
  return await db.prepare('SELECT project_id FROM card_templates WHERE id = ?').get(templateId)?.project_id ?? null
}

async function getField(fieldId) {
  return await db.prepare('SELECT * FROM card_fields WHERE id = ?').get(fieldId)
}

async function entityExists(entityType, entityId) {
  const table = entityType === 'character' ? 'characters' : 'items'
  return Boolean(await db.prepare(`SELECT id FROM ${table} WHERE id = ?`).get(entityId))
}

async function validChapterId(chapterId, projectId) {
  if (!chapterId) return null
  const row = await db.prepare('SELECT id FROM chapters WHERE id = ? AND project_id = ?').get(chapterId, projectId)
  return row ? row.id : null
}

async function upsertValue(entityType, entityId, fieldId, value) {
  const existing = await db
    .prepare('SELECT id FROM attribute_values WHERE entity_type = ? AND entity_id = ? AND field_id = ?')
    .get(entityType, entityId, fieldId)
  const t = now()
  if (existing) {
    await db.prepare('UPDATE attribute_values SET value = ?, updated_at = ? WHERE id = ?').run(value, t, existing.id)
    return await db.prepare('SELECT * FROM attribute_values WHERE id = ?').get(existing.id)
  }
  const id = newId()
  await db.prepare(
    'INSERT INTO attribute_values (id, entity_type, entity_id, field_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, entityType, entityId, fieldId, value, t, t)
  return await db.prepare('SELECT * FROM attribute_values WHERE id = ?').get(id)
}

async function validFieldForEntity(fieldId, entityType, entityId) {
  const field = await fieldWithTemplate(fieldId)
  if (!field || field.template_kind !== entityType) return null
  const projectId = await entityProject(entityType, entityId)
  if (!projectId || projectId !== field.template_project_id) return null
  return field
}

router.get('/card-templates', async (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(404).json({ error: '作品不存在' })
  res.json(listTemplates(projectId))
})

router.get('/card-templates/:id', async (req, res) => {
  const detail = await templateDetail(req.params.id)
  if (!detail) return res.status(404).json({ error: '模板不存在' })
  res.json(detail)
})

router.patch('/card-templates/:id', async (req, res) => {
  const row = await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '模板不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  if (body.name !== undefined) {
    updates.push('name = ?')
    values.push(trimTitle(body.name, row.name || '属性卡'))
  }
  if (body.description !== undefined) {
    updates.push('description = ?')
    values.push(str(body.description))
  }
  if (!updates.length) return res.json(mapCardTemplate(row))
  updates.push('updated_at = ?')
  values.push(now(), row.id)
  await db.prepare(`UPDATE card_templates SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  await touchProject(row.project_id)
  res.json(mapCardTemplate(await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(row.id)))
})

router.post('/card-templates/:id/fields', async (req, res) => {
  const template = await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(req.params.id)
  if (!template) return res.status(404).json({ error: '模板不存在' })
  const body = req.body ?? {}
  const fieldType = FIELD_TYPES.includes(str(body.fieldType)) ? str(body.fieldType) : 'text'
  const maxRow = await db.prepare('SELECT MAX(sort_order) AS m FROM card_fields WHERE template_id = ?').get(template.id)
  const t = now()
  const id = newId()
  await db.prepare(
    'INSERT INTO card_fields (id, template_id, label, field_type, unit, options, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    template.id,
    trimTitle(body.label, '新属性'),
    fieldType,
    str(body.unit),
    str(body.options),
    (maxRow?.m ?? -10) + 10,
    t,
    t
  )
  await touchProject(template.project_id)
  res.status(201).json(mapCardField(await getField(id)))
})

router.patch('/card-fields/:id', async (req, res) => {
  const field = await getField(req.params.id)
  if (!field) return res.status(404).json({ error: '属性不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  if (body.label !== undefined) {
    updates.push('label = ?')
    values.push(trimTitle(body.label, field.label || '属性'))
  }
  if (body.fieldType !== undefined) {
    updates.push('field_type = ?')
    values.push(FIELD_TYPES.includes(str(body.fieldType)) ? str(body.fieldType) : field.field_type)
  }
  if (body.unit !== undefined) {
    updates.push('unit = ?')
    values.push(str(body.unit))
  }
  if (body.options !== undefined) {
    updates.push('options = ?')
    values.push(str(body.options))
  }
  if (body.sortOrder !== undefined) {
    updates.push('sort_order = ?')
    values.push(int(body.sortOrder, field.sort_order))
  }
  if (!updates.length) return res.json(mapCardField(field))
  updates.push('updated_at = ?')
  values.push(now(), field.id)
  await db.prepare(`UPDATE card_fields SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  const projectId = await templateProject(field.template_id)
  if (projectId) await touchProject(projectId)
  res.json(mapCardField(await getField(field.id)))
})

router.delete('/card-fields/:id', async (req, res) => {
  const field = await getField(req.params.id)
  if (!field) return res.status(404).json({ error: '属性不存在' })
  await db.prepare('DELETE FROM card_fields WHERE id = ?').run(field.id)
  const projectId = await templateProject(field.template_id)
  if (projectId) await touchProject(projectId)
  res.json({ ok: true })
})

router.post('/card-templates/:id/fields/reorder', async (req, res) => {
  const template = await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(req.params.id)
  if (!template) return res.status(404).json({ error: '模板不存在' })
  const ids = Array.isArray(req.body?.ids) ? req.body.ids.map((id) => str(id)).filter(Boolean) : []
  const fields = await db.prepare('SELECT id FROM card_fields WHERE template_id = ?').all(template.id)
  const allowed = new Set(fields.map((field) => field.id))
  if (ids.length !== fields.length || !ids.every((id) => allowed.has(id))) {
    return res.status(400).json({ error: '排序列表不完整' })
  }
  await Promise.all(ids.map(async (id, index) => {
    await db.prepare('UPDATE card_fields SET sort_order = ?, updated_at = ? WHERE id = ?').run(index * 10, now(), id)
  }))
  await touchProject(template.project_id)
  res.json(await templateDetail(template.id))
})

router.get('/attributes', async (req, res) => {
  const entityType = str(req.query.entityType)
  const entityId = str(req.query.entityId)
  if (!ENTITY_TYPES.includes(entityType) || !entityId) return res.status(400).json({ error: '参数不完整' })
  if (!await entityExists(entityType, entityId)) return res.status(404).json({ error: '对象不存在' })
  const values = (await db
    .prepare('SELECT * FROM attribute_values WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC')
    .all(entityType, entityId))
    .map(mapAttributeValue)
  const logs = (await db
    .prepare(
      'SELECT * FROM attribute_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC LIMIT 300'
    )
    .all(entityType, entityId)).map(mapAttributeLog)
  res.json({ values, logs })
})

router.put('/attributes', async (req, res) => {
  const body = req.body ?? {}
  const entityType = str(body.entityType)
  const entityId = str(body.entityId)
  const fieldId = str(body.fieldId)
  if (!ENTITY_TYPES.includes(entityType) || !entityId || !fieldId) {
    return res.status(400).json({ error: '参数不完整' })
  }
  if (!await validFieldForEntity(fieldId, entityType, entityId)) {
    return res.status(400).json({ error: '属性与对象不匹配' })
  }
  const row = await upsertValue(entityType, entityId, fieldId, str(body.value))
  await touchEntityProject(entityType, entityId)
  res.json(mapAttributeValue(row))
})

router.post('/attribute-logs', async (req, res) => {
  const body = req.body ?? {}
  const entityType = str(body.entityType)
  const entityId = str(body.entityId)
  const fieldId = str(body.fieldId)
  if (!ENTITY_TYPES.includes(entityType) || !entityId || !fieldId) {
    return res.status(400).json({ error: '参数不完整' })
  }
  if (!await validFieldForEntity(fieldId, entityType, entityId)) {
    return res.status(400).json({ error: '属性与对象不匹配' })
  }
  const t = now()
  const id = newId()
  const projectId = await entityProject(entityType, entityId)
  const chapterId = await validChapterId(str(body.chapterId), projectId)
  await db.prepare(
    'INSERT INTO attribute_logs (id, entity_type, entity_id, field_id, value, period, chapter_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, entityType, entityId, fieldId, str(body.value), str(body.period), chapterId, str(body.note), t)

  let valueRow = null
  if (body.applyCurrent !== false) {
    valueRow = await upsertValue(entityType, entityId, fieldId, str(body.value))
  }
  await touchEntityProject(entityType, entityId)
  res.status(201).json({
    log: mapAttributeLog(await db.prepare('SELECT * FROM attribute_logs WHERE id = ?').get(id)),
    value: valueRow ? mapAttributeValue(valueRow) : null
  })
})

router.patch('/attribute-logs/:id', async (req, res) => {
  const log = await db.prepare('SELECT * FROM attribute_logs WHERE id = ?').get(req.params.id)
  if (!log) return res.status(404).json({ error: '成长记录不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  if (body.value !== undefined) {
    updates.push('value = ?')
    values.push(str(body.value))
  }
  if (body.period !== undefined) {
    updates.push('period = ?')
    values.push(str(body.period))
  }
  if (body.note !== undefined) {
    updates.push('note = ?')
    values.push(str(body.note))
  }
  if (body.chapterId !== undefined) {
    updates.push('chapter_id = ?')
    values.push(await validChapterId(str(body.chapterId), await entityProject(log.entity_type, log.entity_id)))
  }
  if (updates.length) {
    values.push(log.id)
    await db.prepare(`UPDATE attribute_logs SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    await touchEntityProject(log.entity_type, log.entity_id)
  }
  res.json(mapAttributeLog(await db.prepare('SELECT * FROM attribute_logs WHERE id = ?').get(log.id)))
})

router.delete('/attribute-logs/:id', async (req, res) => {
  const log = await db.prepare('SELECT * FROM attribute_logs WHERE id = ?').get(req.params.id)
  if (!log) return res.status(404).json({ error: '成长记录不存在' })
  await db.prepare('DELETE FROM attribute_logs WHERE id = ?').run(log.id)
  await touchEntityProject(log.entity_type, log.entity_id)
  res.json({ ok: true })
})

export default router
