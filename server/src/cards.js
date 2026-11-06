import { db } from './db.js'
import { DEFAULT_TEMPLATES, TEMPLATE_KINDS } from './templateDefaults.js'
import { mapCardField, mapCardTemplate } from './mappers.js'
import { newId, now } from './util.js'
import { touchProject } from './store.js'

export const FIELD_TYPES = ['text', 'number', 'longtext', 'select']

export function listTemplateFields(templateId) {
  return db
    .prepare('SELECT * FROM card_fields WHERE template_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(templateId)
    .map(mapCardField)
}

export function templateDetail(templateId) {
  const row = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(templateId)
  if (!row) return null
  return { ...mapCardTemplate(row), fields: listTemplateFields(templateId) }
}

export function ensureTemplate(projectId, kind) {
  const safeKind = TEMPLATE_KINDS.includes(kind) ? kind : 'character'
  let row = db
    .prepare('SELECT * FROM card_templates WHERE project_id = ? AND kind = ?')
    .get(projectId, safeKind)
  if (!row) {
    const preset = DEFAULT_TEMPLATES[safeKind]
    const t = now()
    const id = newId()
    db.prepare(
      'INSERT INTO card_templates (id, project_id, kind, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(id, projectId, safeKind, preset.name, preset.description, t, t)
    preset.fields.forEach((field, index) => {
      db.prepare(
        'INSERT INTO card_fields (id, template_id, label, field_type, unit, options, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(newId(), id, field.label, field.fieldType, field.unit ?? '', field.options ?? '', index * 10, t, t)
    })
    row = db.prepare('SELECT * FROM card_templates WHERE id = ?').get(id)
  }
  return templateDetail(row.id)
}

export function listTemplates(projectId) {
  return TEMPLATE_KINDS.map((kind) => ensureTemplate(projectId, kind))
}

export function entityProject(entityType, entityId) {
  if (entityType === 'character') {
    return db.prepare('SELECT project_id FROM characters WHERE id = ?').get(entityId)?.project_id ?? null
  }
  if (entityType === 'item') {
    return db.prepare('SELECT project_id FROM items WHERE id = ?').get(entityId)?.project_id ?? null
  }
  return null
}

export function touchEntityProject(entityType, entityId) {
  const projectId = entityProject(entityType, entityId)
  if (projectId) touchProject(projectId)
}

export function fieldWithTemplate(fieldId) {
  return db
    .prepare(
      'SELECT f.*, t.kind AS template_kind, t.project_id AS template_project_id FROM card_fields f JOIN card_templates t ON t.id = f.template_id WHERE f.id = ?'
    )
    .get(fieldId)
}
