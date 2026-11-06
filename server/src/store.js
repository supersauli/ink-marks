import { db } from './db.js'
import { newId, now } from './util.js'

export function touchProject(projectId) {
  if (!projectId) return
  db.prepare('UPDATE projects SET updated_at = ? WHERE id = ?').run(now(), projectId)
}

export function chapterSnapshot(chapterId) {
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId)
  if (!chapter) return null
  const blocks = db.prepare('SELECT * FROM blocks WHERE chapter_id = ? ORDER BY sort_order ASC, created_at ASC').all(chapterId)
  return {
    kind: 'chapter',
    chapter: {
      id: chapter.id,
      projectId: chapter.project_id,
      title: chapter.title,
      summary: chapter.summary,
      status: chapter.status
    },
    blocks: blocks.map((block) => ({
      id: block.id,
      text: block.text,
      instruction: block.instruction,
      sortOrder: block.sort_order
    }))
  }
}

export function outlineSnapshot(outlineId) {
  const outline = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(outlineId)
  if (!outline) return null
  return {
    kind: 'outline',
    outline: {
      id: outline.id,
      projectId: outline.project_id,
      parentId: outline.parent_id,
      title: outline.title,
      content: outline.content,
      sortOrder: outline.sort_order
    }
  }
}

export function characterSnapshot(characterId) {
  const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  if (!character) return null
  const stages = db
    .prepare('SELECT * FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC, created_at ASC')
    .all(characterId)
  return {
    kind: 'character',
    character: {
      id: character.id,
      projectId: character.project_id,
      name: character.name,
      alias: character.alias,
      role: character.role,
      age: character.age,
      appearance: character.appearance,
      background: character.background,
      relations: character.relations,
      goal: character.goal,
      notes: character.notes,
      sortOrder: character.sort_order
    },
    stages: stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      period: stage.period,
      traits: stage.traits,
      inner: stage.inner,
      behavior: stage.behavior,
      speech: stage.speech,
      event: stage.event,
      isCurrent: stage.is_current === 1,
      sortOrder: stage.sort_order
    }))
  }
}

function snapshotOf(targetType, targetId) {
  if (targetType === 'chapter') return chapterSnapshot(targetId)
  if (targetType === 'character') return characterSnapshot(targetId)
  return outlineSnapshot(targetId)
}

function pruneVersions(targetType, targetId, keep = 100) {
  db.prepare(
    `DELETE FROM versions
     WHERE id IN (
       SELECT id FROM versions
       WHERE target_type = ? AND target_id = ?
       ORDER BY created_at DESC
       LIMIT -1 OFFSET ?
     )`
  ).run(targetType, targetId, keep)
}

export function createVersion({ projectId, targetType, targetId, label = '', source = 'manual', snapshot }) {
  const snap = snapshot ?? snapshotOf(targetType, targetId)
  if (!snap) return null
  const row = {
    id: newId(),
    projectId,
    targetType,
    targetId,
    label,
    source,
    snapshot: JSON.stringify(snap),
    createdAt: now()
  }
  db.prepare(
    'INSERT INTO versions (id, project_id, target_type, target_id, label, source, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(row.id, row.projectId, row.targetType, row.targetId, row.label, row.source, row.snapshot, row.createdAt)
  pruneVersions(targetType, targetId)
  return row
}

/**
 * 在内容发生修改前创建快照，并节流：若最近已有内容相同的快照、或距上次快照不足 intervalMs，则跳过。
 */
export function maybeAutoSnapshot(targetType, targetId, projectId, intervalMs = 120000) {
  const snap = snapshotOf(targetType, targetId)
  if (!snap) return null
  const json = JSON.stringify(snap)
  const latest = db
    .prepare('SELECT snapshot, created_at FROM versions WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(targetType, targetId)
  if (latest && latest.snapshot === json) return null
  if (latest) {
    const elapsed = Date.now() - Date.parse(latest.created_at)
    if (Number.isFinite(elapsed) && elapsed < intervalMs) return null
  }
  return createVersion({ projectId, targetType, targetId, label: '自动快照', source: 'auto', snapshot: snap })
}

export function restoreChapterSnapshot(chapterId, snap) {
  if (!snap?.chapter) throw new Error('章节快照数据无效')
  const chapter = snap.chapter
  const t = now()
  db.prepare('UPDATE chapters SET title = ?, summary = ?, status = ?, updated_at = ? WHERE id = ?').run(
    chapter.title ?? '',
    chapter.summary ?? '',
    chapter.status ?? 'outline',
    t,
    chapterId
  )
  db.prepare('DELETE FROM blocks WHERE chapter_id = ?').run(chapterId)
  const insert = db.prepare(
    'INSERT INTO blocks (id, chapter_id, text, instruction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  ;(snap.blocks ?? []).forEach((block, index) => {
    insert.run(newId(), chapterId, block.text ?? '', block.instruction ?? '', index * 10, t, t)
  })
  const row = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId)
  touchProject(row?.project_id)
  return row
}

export function restoreCharacterSnapshot(characterId, snap) {
  if (!snap?.character) throw new Error('角色快照数据无效')
  const character = snap.character
  const t = now()
  db.prepare(
    'UPDATE characters SET name = ?, alias = ?, role = ?, age = ?, appearance = ?, background = ?, relations = ?, goal = ?, notes = ?, updated_at = ? WHERE id = ?'
  ).run(
    character.name ?? '',
    character.alias ?? '',
    character.role ?? '',
    character.age ?? '',
    character.appearance ?? '',
    character.background ?? '',
    character.relations ?? '',
    character.goal ?? '',
    character.notes ?? '',
    t,
    characterId
  )
  db.prepare('DELETE FROM character_stages WHERE character_id = ?').run(characterId)
  const insert = db.prepare(
    'INSERT INTO character_stages (id, character_id, name, period, traits, inner, behavior, speech, event, is_current, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  )
  const stages = snap.stages ?? []
  let currentAssigned = false
  stages.forEach((stage, index) => {
    const isCurrent = Boolean(stage.isCurrent) && !currentAssigned
    if (isCurrent) currentAssigned = true
    insert.run(
      newId(),
      characterId,
      stage.name ?? '',
      stage.period ?? '',
      stage.traits ?? '',
      stage.inner ?? '',
      stage.behavior ?? '',
      stage.speech ?? '',
      stage.event ?? '',
      isCurrent ? 1 : 0,
      index * 10,
      t,
      t
    )
  })
  if (stages.length && !currentAssigned) {
    const first = db
      .prepare('SELECT id FROM character_stages WHERE character_id = ? ORDER BY sort_order ASC LIMIT 1')
      .get(characterId)
    if (first) db.prepare('UPDATE character_stages SET is_current = 1 WHERE id = ?').run(first.id)
  }
  const row = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
  touchProject(row?.project_id)
  return row
}

export function restoreOutlineSnapshot(outlineId, snap) {
  if (!snap?.outline) throw new Error('大纲快照数据无效')
  const outline = snap.outline
  db.prepare('UPDATE outline_items SET title = ?, content = ?, parent_id = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(
    outline.title ?? '',
    outline.content ?? '',
    outline.parentId ?? null,
    outline.sortOrder ?? 0,
    now(),
    outlineId
  )
  const row = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(outlineId)
  touchProject(row?.project_id)
  return row
}
