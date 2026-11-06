import { db } from './db.js'
import {
  mapCharacter,
  mapCharacterRelation,
  mapCharacterSkill,
  mapCharacterStage,
  mapCharacterStatusLog
} from './mappers.js'
import { createChapterResolver } from './chapterOrder.js'

export function listStages(characterId) {
  return db
    .prepare('SELECT * FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)
    .map(mapCharacterStage)
}

export function listSkills(characterId) {
  return db
    .prepare('SELECT * FROM character_skills WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)
    .map(mapCharacterSkill)
}

export function listStatusLogs(characterId) {
  return db
    .prepare('SELECT * FROM character_status_logs WHERE character_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(characterId)
    .map(mapCharacterStatusLog)
}

function chapterResolver(projectId) {
  const chapters = db
    .prepare('SELECT id FROM chapters WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)
  return createChapterResolver(chapters)
}

function latestStatus(logs, resolve) {
  let best = null
  for (const log of logs) {
    const index = resolve(log.chapterId, log.period)
    if (!best || index > best.index || (index === best.index && log.createdAt >= best.log.createdAt)) {
      best = { index, log }
    }
  }
  return best?.log.status ?? 'alive'
}

/**
 * 一个角色与其他所有角色的「当前关系」。
 * 关系记录按章节时间线累积，取该角色视角下、每对角色最新的那一条。
 */
export function listRelations(characterId) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  if (!character) return []
  const rows = db
    .prepare(
      `SELECT r.*,
        CASE WHEN r.from_character_id = ? THEN r.to_character_id ELSE r.from_character_id END AS other_id
       FROM character_relations r
       WHERE r.from_character_id = ? OR r.to_character_id = ?
       ORDER BY r.created_at ASC, r.rowid ASC`
    )
    .all(characterId, characterId, characterId)
  if (!rows.length) return []

  const resolve = chapterResolver(character.project_id)
  const names = new Map(
    db
      .prepare('SELECT id, name FROM characters WHERE project_id = ?')
      .all(character.project_id)
      .map((row) => [row.id, row.name])
  )

  const latest = new Map()
  for (const row of rows) {
    const otherId = row.other_id
    const index = resolve(row.chapter_id, row.period)
    const previous = latest.get(otherId)
    if (!previous || index > previous.index || (index === previous.index && row.created_at >= previous.created_at)) {
      latest.set(otherId, { row, index, created_at: row.created_at })
    }
  }

  return [...latest.values()].map(({ row }) =>
    mapCharacterRelation({ ...row, other_name: names.get(row.other_id) ?? '未命名角色' })
  )
}

export function characterDetail(characterId) {
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  if (!row) return null
  const statusLogs = listStatusLogs(characterId)
  return {
    ...mapCharacter(row),
    stages: listStages(characterId),
    skills: listSkills(characterId),
    statusLogs,
    currentStatus: latestStatus(statusLogs, chapterResolver(row.project_id)),
    relationships: listRelations(characterId)
  }
}

export function listCharacterDetails(projectId) {
  const rows = db
    .prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)
  return rows.map((row) => characterDetail(row.id))
}

export function ensureCurrentStage(characterId) {
  const stages = db
    .prepare('SELECT id, is_current FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)
  if (!stages.length) return
  if (stages.some((stage) => stage.is_current === 1)) return
  db.prepare('UPDATE character_stages SET is_current = 1 WHERE id = ?').run(stages[0].id)
}

export function setCurrentStage(characterId, stageId) {
  db.prepare('UPDATE character_stages SET is_current = 0 WHERE character_id = ?').run(characterId)
  db.prepare('UPDATE character_stages SET is_current = 1 WHERE id = ? AND character_id = ?').run(stageId, characterId)
}
