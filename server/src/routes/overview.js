import { Router } from 'express'
import { db } from '../db.js'
import { mapItem } from '../mappers.js'
import { createChapterResolver } from '../chapterOrder.js'

const router = Router()

router.get('/overview', (req, res) => {
  const projectId = String(req.query.projectId ?? '')
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })

  const chapters = db
    .prepare('SELECT * FROM chapters WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)
  const characters = db
    .prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)

  const template = db
    .prepare("SELECT id FROM card_templates WHERE project_id = ? AND kind = 'character'")
    .get(projectId)
  const fields = template
    ? db.prepare('SELECT * FROM card_fields WHERE template_id = ? ORDER BY sort_order ASC').all(template.id)
    : []
  const fieldIds = new Set(fields.map((field) => field.id))
  const characterIds = new Set(characters.map((character) => character.id))

  const values = db
    .prepare("SELECT * FROM attribute_values WHERE entity_type = 'character'")
    .all()
    .filter((row) => characterIds.has(row.entity_id) && fieldIds.has(row.field_id))
  const logs = db
    .prepare("SELECT * FROM attribute_logs WHERE entity_type = 'character' ORDER BY created_at ASC, rowid ASC")
    .all()
    .filter((row) => characterIds.has(row.entity_id) && fieldIds.has(row.field_id))
  const stages = db
    .prepare('SELECT * FROM character_stages ORDER BY sort_order ASC, created_at ASC')
    .all()
    .filter((row) => characterIds.has(row.character_id))
  const skills = db
    .prepare('SELECT * FROM character_skills ORDER BY sort_order ASC, created_at ASC')
    .all()
    .filter((row) => characterIds.has(row.character_id))
  const statusLogs = db
    .prepare('SELECT * FROM character_status_logs ORDER BY created_at ASC, rowid ASC')
    .all()
    .filter((row) => characterIds.has(row.character_id))

  const items = db.prepare('SELECT * FROM items WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC').all(projectId)
  const events = db
    .prepare('SELECT * FROM item_events ORDER BY created_at ASC, rowid ASC')
    .all()
    .filter((row) => items.some((item) => item.id === row.item_id))

  const resolve = createChapterResolver(chapters)
  const chapterIds = chapters.map((chapter) => chapter.id)

  const valueMap = new Map()
  for (const row of values) valueMap.set(`${row.entity_id}:${row.field_id}`, row.value)

  const logsByKey = new Map()
  for (const row of logs) {
    const key = `${row.entity_id}:${row.field_id}`
    const list = logsByKey.get(key) ?? []
    list.push({ value: row.value, index: resolve(row.chapter_id, row.period), created: row.created_at })
    logsByKey.set(key, list)
  }
  // 成长记录可能补录（后录入的章节更早），回溯前必须按章节排序
  for (const list of logsByKey.values()) {
    list.sort((a, b) => a.index - b.index || (a.created < b.created ? -1 : 1))
  }

  const skillsByCharacter = new Map()
  for (const row of skills) {
    const list = skillsByCharacter.get(row.character_id) ?? []
    list.push({ row, index: resolve(row.chapter_id, row.period) })
    skillsByCharacter.set(row.character_id, list)
  }
  for (const list of skillsByCharacter.values()) {
    list.sort((a, b) => a.index - b.index || a.row.sort_order - b.row.sort_order)
  }

  const statusByCharacter = new Map()
  for (const row of statusLogs) {
    const list = statusByCharacter.get(row.character_id) ?? []
    list.push({ status: row.status, index: resolve(row.chapter_id, row.period), created: row.created_at })
    statusByCharacter.set(row.character_id, list)
  }
  for (const list of statusByCharacter.values()) {
    list.sort((a, b) => a.index - b.index || (a.created < b.created ? -1 : 1))
  }

  const stagesByCharacter = new Map()
  for (const row of stages) {
    const list = stagesByCharacter.get(row.character_id) ?? []
    list.push({
      row,
      index: resolve(row.chapter_id, row.period),
      order: row.sort_order
    })
    stagesByCharacter.set(row.character_id, list)
  }
  for (const list of stagesByCharacter.values()) {
    list.sort((a, b) => a.index - b.index || a.order - b.order)
  }

  // 每件物品在每一章的持有人与状态
  const itemStates = new Map()
  for (const itemRow of items) {
    const mapped = mapItem(itemRow)
    const itemEvents = events.filter((event) => event.item_id === itemRow.id)
    const timeline = itemEvents
      .map((event) => ({
        index: resolve(event.chapter_id, event.period),
        holder: event.holder,
        status: event.status,
        created: event.created_at
      }))
      .sort((a, b) => a.index - b.index || (a.created < b.created ? -1 : 1))
    if (!timeline.length) {
      const start = resolve(null, itemRow.debut)
      timeline.push({ index: start, holder: itemRow.current_holder, status: itemRow.status, created: '' })
    }
    const states = chapterIds.map((_, chapterIndex) => {
      let current = null
      for (const step of timeline) {
        if (step.index <= chapterIndex) current = step
      }
      return current
    })
    itemStates.set(itemRow.id, { item: mapped, states })
  }

  const data = characters.map((character) => {
    const characterStages = stagesByCharacter.get(character.id) ?? []
    const characterSkills = skillsByCharacter.get(character.id) ?? []
    const characterStatuses = statusByCharacter.get(character.id) ?? []
    // 登场章节：显式关联优先，其次从「第 3 章」等文字解析；没有填写则视为从第一章开始在场
    const debutIndex = resolve(character.debut_chapter_id ?? null, character.debut)
    const cells = chapterIds.map((chapterId, chapterIndex) => {
      const debuted = chapterIndex >= debutIndex
      if (!debuted) {
        return {
          chapterId,
          debuted: false,
          stage: null,
          status: 'unknown',
          attributes: fields.map((field) => ({
            fieldId: field.id,
            label: field.label,
            fieldType: field.field_type,
            unit: field.unit,
            value: null
          })),
          items: [],
          skills: []
        }
      }
      let stage = null
      for (const entry of characterStages) {
        if (entry.index <= chapterIndex) stage = entry.row
      }
      const attributes = fields.map((field) => {
        const key = `${character.id}:${field.id}`
        const history = logsByKey.get(key) ?? []
        let value = null
        if (!history.length) {
          value = valueMap.get(key) ?? null
        } else {
          for (const entry of history) {
            if (entry.index <= chapterIndex) value = entry.value
          }
        }
        return {
          fieldId: field.id,
          label: field.label,
          fieldType: field.field_type,
          unit: field.unit,
          value
        }
      })
      const heldItems = []
      for (const [itemId, state] of itemStates) {
        const current = state.states[chapterIndex]
        if (!current) continue
        if (current.holder !== character.name) continue
        if (current.status === 'destroyed') continue
        heldItems.push({
          id: itemId,
          name: state.item.name,
          category: state.item.category,
          status: current.status
        })
      }
      let status = 'alive'
      for (const entry of characterStatuses) {
        if (entry.index <= chapterIndex) status = entry.status
      }
      const availableSkills = characterSkills
        .filter((entry) => entry.index <= chapterIndex)
        .map((entry) => ({ id: entry.row.id, name: entry.row.name, level: entry.row.level }))
      return {
        chapterId,
        debuted: true,
        stage: stage
          ? {
              id: stage.id,
              name: stage.name,
              period: stage.period,
              chapterId: stage.chapter_id ?? null
            }
          : null,
        status,
        attributes,
        items: heldItems,
        skills: availableSkills
      }
    })
    return {
      id: character.id,
      name: character.name,
      role: character.role,
      gender: character.gender ?? '',
      debut: character.debut ?? '',
      debutChapterId: character.debut_chapter_id ?? null,
      debutIndex,
      cells
    }
  })

  res.json({
    chapters: chapters.map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      summary: chapter.summary,
      status: chapter.status,
      sortOrder: chapter.sort_order
    })),
    fields: fields.map((field) => ({
      id: field.id,
      label: field.label,
      fieldType: field.field_type,
      unit: field.unit
    })),
    characters: data
  })
})

export default router
