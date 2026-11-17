import { db } from './db.js'
import {
  mapCharacter,
  mapCharacterRelation,
  mapCharacterSkill,
  mapCharacterStage,
  mapCharacterStatusLog
} from './mappers.js'
import { createChapterResolver } from './chapterOrder.js'

export async  function listStages(characterId) {
  return (await db
    .prepare('SELECT * FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)).map(mapCharacterStage)
}

export async  function listSkills(characterId) {
  return (await db
    .prepare('SELECT * FROM character_skills WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)).map(mapCharacterSkill)
}

export async  function listStatusLogs(characterId) {
  return (await db
    .prepare('SELECT * FROM character_status_logs WHERE character_id = ? ORDER BY created_at ASC, rowid ASC')
    .all(characterId)).map(mapCharacterStatusLog)
}

async function chapterResolver(projectId) {
  const chapters = await db
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
export async  function listRelations(characterId) {
  const character = await db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  if (!character) return []
  const rows = await db
    .prepare(
      `SELECT r.*,
        CASE WHEN r.from_character_id = ? THEN r.to_character_id ELSE r.from_character_id END AS other_id
       FROM character_relations r
       WHERE r.from_character_id = ? OR r.to_character_id = ?
       ORDER BY r.created_at ASC, r.rowid ASC`
    )
    .all(characterId, characterId, characterId)
  if (!rows.length) return []

  const resolve = await chapterResolver(character.project_id)
  const names = new Map(
    (await db
      .prepare('SELECT id, name FROM characters WHERE project_id = ?')
      .all(character.project_id)).map((row) => [row.id, row.name])
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

export async  function characterDetail(characterId) {
  const row = await db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  if (!row) return null
  const statusLogs = await listStatusLogs(characterId)
  return {
    ...mapCharacter(row),
    stages: await listStages(characterId),
    skills: await listSkills(characterId),
    statusLogs,
    currentStatus: latestStatus(statusLogs, await chapterResolver(row.project_id)),
    relationships: await listRelations(characterId)
  }
}

export async  function listCharacterDetails(projectId) {
  const rows = await db
    .prepare('SELECT * FROM characters WHERE project_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(projectId)
  return await Promise.all(rows.map(async (row) => await characterDetail(row.id)))
}

export async  function ensureCurrentStage(characterId) {
  const stages = await db
    .prepare('SELECT id, is_current FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)
  if (!stages.length) return
  if (stages.some((stage) => stage.is_current === 1)) return
  await db.prepare('UPDATE character_stages SET is_current = 1 WHERE id = ?').run(stages[0].id)
}

export async  function setCurrentStage(characterId, stageId) {
  await db.prepare('UPDATE character_stages SET is_current = 0 WHERE character_id = ?').run(characterId)
  await db.prepare('UPDATE character_stages SET is_current = 1 WHERE id = ? AND character_id = ?').run(stageId, characterId)
}
