import { db } from './db.js'
import { DEFAULT_TEMPLATES, TEMPLATE_KINDS } from './templateDefaults.js'
import { mapCardField, mapCardTemplate } from './mappers.js'
import { newId, now } from './util.js'
import { touchProject } from './store.js'

export const FIELD_TYPES = ['text', 'number', 'longtext', 'select']

export async  function listTemplateFields(templateId) {
  return (await db
    .prepare('SELECT * FROM card_fields WHERE template_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(templateId)).map(mapCardField)
}

export async  function templateDetail(templateId) {
  const row = await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(templateId)
  if (!row) return null
  return { ...mapCardTemplate(row), fields: await listTemplateFields(templateId) }
}

export async  function ensureTemplate(projectId, kind) {
  const safeKind = TEMPLATE_KINDS.includes(kind) ? kind : 'character'
  let row = await db
    .prepare('SELECT * FROM card_templates WHERE project_id = ? AND kind = ?')
    .get(projectId, safeKind)
  if (!row) {
    const preset = DEFAULT_TEMPLATES[safeKind]
    const t = now()
    const id = newId()
    await db.prepare(
      'INSERT INTO card_templates (id, project_id, kind, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, safeKind, preset.name, preset.description, t, t)
    await Promise.all(preset.fields.map(async (field, index) => {
      await db.prepare(
        'INSERT INTO card_fields (id, template_id, label, field_type, unit, options, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), id, field.label, field.fieldType, field.unit ?? '', field.options ?? '', index * 10, t, t)
    }))
    row = await db.prepare('SELECT * FROM card_templates WHERE id = ?').get(id)
  }
  return await templateDetail(row.id)
}

export async function listTemplates(projectId) {
  return await Promise.all(TEMPLATE_KINDS.map(async (kind) => await ensureTemplate(projectId, kind)))
}

export async  function entityProject(entityType, entityId) {
  if (entityType === 'character') {
    return await db.prepare('SELECT project_id FROM characters WHERE id = ?').get(entityId)?.project_id ?? null
  }
  if (entityType === 'item') {
    return await db.prepare('SELECT project_id FROM items WHERE id = ?').get(entityId)?.project_id ?? null
  }
  return null
}

export async  function touchEntityProject(entityType, entityId) {
  const projectId = await entityProject(entityType, entityId)
  if (projectId) await touchProject(projectId)
}

export async  function fieldWithTemplate(fieldId) {
  return await db
    .prepare(
      'SELECT f.*, t.kind AS template_kind, t.project_id AS template_project_id FROM card_fields f JOIN card_templates t ON t.id = f.template_id WHERE f.id = ?'
    )
    .get(fieldId)
}
