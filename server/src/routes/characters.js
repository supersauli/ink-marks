import { Router } from 'express'
import { db } from '../db.js'
import { mapCharacter, mapCharacterStage } from '../mappers.js'
import { newId, now, str, int, trimTitle } from '../util.js'
import { maybeAutoSnapshot, touchProject } from '../store.js'
import {
  characterDetail,
  ensureCurrentStage,
  listCharacterDetails,
  setCurrentStage
} from '../characters.js'

const router = Router()

const BASIC_FIELDS = {
  name: 'name',
  alias: 'alias',
  role: 'role',
  gender: 'gender',
  age: 'age',
  debut: 'debut',
  appearance: 'appearance',
  background: 'background',
  relations: 'relations',
  goal: 'goal',
  notes: 'notes'
}

const STAGE_FIELDS = {
  name: 'name',
  period: 'period',
  traits: 'traits',
  inner: 'inner',
  behavior: 'behavior',
  speech: 'speech',
  event: 'event'
}

async function getCharacter(characterId) {
  return await db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
}

async function getStage(stageId) {
  return await db.prepare('SELECT * FROM character_stages WHERE id = ?').get(stageId)
}

async function validChapterId(chapterId, projectId) {
  if (!chapterId) return null
  const row = await db.prepare('SELECT id FROM chapters WHERE id = ? AND project_id = ?').get(chapterId, projectId)
  return row ? row.id : null
}

async function touchCharacter(characterId) {
  const character = await getCharacter(characterId)
  if (!character) return
  await db.prepare('UPDATE characters SET updated_at = ? WHERE id = ?').run(now(), characterId)
  await touchProject(character.project_id)
}

async function nextStageOrder(characterId) {
  const row = await db.prepare('SELECT MAX(sort_order) AS m FROM character_stages WHERE character_id = ?').get(characterId)
  return (row?.m ?? -10) + 10
}

router.get('/characters', async (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  res.json(await listCharacterDetails(projectId))
})

router.post('/characters', async (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = await db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })

  const maxRow = await db.prepare('SELECT MAX(sort_order) AS m FROM characters WHERE project_id = ?').get(projectId)
  const id = newId()
  const t = now()
  await db.prepare(
    'INSERT INTO characters (id, project_id, name, alias, role, gender, age, debut, debut_chapter_id, appearance, background, relations, goal, notes, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    projectId,
    trimTitle(body.name, '新角色'),
    str(body.alias),
    str(body.role),
    str(body.gender),
    str(body.age),
    str(body.debut),
    await validChapterId(str(body.debutChapterId), projectId),
    str(body.appearance),
    str(body.background),
    str(body.relations),
    str(body.goal),
    str(body.notes),
    (maxRow?.m ?? -10) + 10,
    t,
    t
  )

  // 新角色默认带一个「初始阶段」，保证「当前性格」始终有落点
  const stageId = newId()
  await db.prepare(
    'INSERT INTO character_stages (id, character_id, name, period, chapter_id, traits, inner, behavior, speech, event, is_current, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    stageId,
    id,
    trimTitle(body.stageName, '初始阶段'),
    str(body.period),
    await validChapterId(str(body.chapterId), projectId),
    str(body.traits),
    str(body.inner),
    str(body.behavior),
    str(body.speech),
    str(body.event),
    1,
    0,
    t,
    t
  )

  await touchProject(projectId)
  res.status(201).json(await characterDetail(id))
})

router.get('/characters/:id', async (req, res) => {
  const detail = await characterDetail(req.params.id)
  if (!detail) return res.status(404).json({ error: '角色不存在' })
  res.json(detail)
})

router.patch('/characters/:id', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  for (const [key, column] of Object.entries(BASIC_FIELDS)) {
    if (body[key] === undefined) continue
    updates.push(`${column} = ?`)
    values.push(key === 'name' ? trimTitle(body[key], character.name || '未命名角色') : str(body[key]))
  }
  if (body.debutChapterId !== undefined) {
    updates.push('debut_chapter_id = ?')
    values.push(await validChapterId(str(body.debutChapterId), character.project_id))
  }
  if (!updates.length) return res.json(mapCharacter(character))

  await maybeAutoSnapshot('character', character.id, character.project_id)
  updates.push('updated_at = ?')
  values.push(now(), character.id)
  await db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  await touchProject(character.project_id)
  res.json(mapCharacter(await getCharacter(character.id)))
})

router.delete('/characters/:id', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  await db.prepare('DELETE FROM attribute_values WHERE entity_type = ? AND entity_id = ?').run('character', character.id)
  await db.prepare('DELETE FROM attribute_logs WHERE entity_type = ? AND entity_id = ?').run('character', character.id)
  await db.prepare('DELETE FROM characters WHERE id = ?').run(character.id)
  await touchProject(character.project_id)
  res.json({ ok: true })
})

const STATUSES = ['alive', 'dead', 'missing', 'unknown']

async function nextSkillOrder(characterId) {
  const row = await db.prepare('SELECT MAX(sort_order) AS m FROM character_skills WHERE character_id = ?').get(characterId)
  return (row?.m ?? -10) + 10
}

// 角色关系按「一对角色」存储：无论从谁的角度创建，都落到同一对 id 上
function orderedPair(a, b) {
  return a < b ? [a, b] : [b, a]
}

router.post('/characters/:id/skills', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  await maybeAutoSnapshot('character', character.id, character.project_id)
  const t = now()
  const id = newId()
  await db.prepare(
    'INSERT INTO character_skills (id, character_id, name, level, description, chapter_id, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    character.id,
    trimTitle(body.name, '新技能'),
    str(body.level),
    str(body.description),
    await validChapterId(str(body.chapterId), character.project_id),
    await nextSkillOrder(character.id),
    t,
    t
  )
  await touchCharacter(character.id)
  res.status(201).json(await characterDetail(character.id))
})

router.patch('/character-skills/:id', async (req, res) => {
  const skill = await db.prepare('SELECT * FROM character_skills WHERE id = ?').get(req.params.id)
  if (!skill) return res.status(404).json({ error: '技能不存在' })
  const character = await getCharacter(skill.character_id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  const updates = []
  const values = []
  for (const [key, column] of Object.entries({ name: 'name', level: 'level', description: 'description' })) {
    if (body[key] === undefined) continue
    updates.push(`${column} = ?`)
    values.push(key === 'name' ? trimTitle(body[key], skill.name || '未命名技能') : str(body[key]))
  }
  if (body.chapterId !== undefined) {
    updates.push('chapter_id = ?')
    values.push(await validChapterId(str(body.chapterId), character.project_id))
  }
  if (body.sortOrder !== undefined) {
    updates.push('sort_order = ?')
    values.push(int(body.sortOrder, skill.sort_order))
  }
  if (updates.length) {
    await maybeAutoSnapshot('character', character.id, character.project_id)
    updates.push('updated_at = ?')
    values.push(now(), skill.id)
    await db.prepare(`UPDATE character_skills SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    await touchCharacter(character.id)
  }
  res.json(await characterDetail(character.id))
})

router.delete('/character-skills/:id', async (req, res) => {
  const skill = await db.prepare('SELECT * FROM character_skills WHERE id = ?').get(req.params.id)
  if (!skill) return res.status(404).json({ error: '技能不存在' })
  const character = await getCharacter(skill.character_id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  await maybeAutoSnapshot('character', character.id, character.project_id)
  await db.prepare('DELETE FROM character_skills WHERE id = ?').run(skill.id)
  await touchCharacter(character.id)
  res.json(await characterDetail(character.id))
})

router.post('/characters/:id/status-logs', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  const status = STATUSES.includes(str(body.status)) ? str(body.status) : 'alive'
  await maybeAutoSnapshot('character', character.id, character.project_id)
  await db.prepare(
    'INSERT INTO character_status_logs (id, character_id, status, period, chapter_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    newId(),
    character.id,
    status,
    str(body.period),
    await validChapterId(str(body.chapterId), character.project_id),
    str(body.note),
    now()
  )
  await touchCharacter(character.id)
  res.status(201).json(await characterDetail(character.id))
})

router.delete('/character-status-logs/:id', async (req, res) => {
  const log = await db.prepare('SELECT * FROM character_status_logs WHERE id = ?').get(req.params.id)
  if (!log) return res.status(404).json({ error: '状态记录不存在' })
  const character = await getCharacter(log.character_id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  await maybeAutoSnapshot('character', character.id, character.project_id)
  await db.prepare('DELETE FROM character_status_logs WHERE id = ?').run(log.id)
  await touchCharacter(character.id)
  res.json(await characterDetail(character.id))
})

router.post('/characters/:id/relations', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  const otherId = str(body.otherId)
  const other = otherId
    ? await db.prepare('SELECT * FROM characters WHERE id = ? AND project_id = ?').get(otherId, character.project_id)
    : null
  if (!other || other.id === character.id) return res.status(400).json({ error: '对方角色不存在' })

  const [fromId, toId] = orderedPair(character.id, other.id)
  const relation = str(body.relation, '陌生') || '陌生'
  await maybeAutoSnapshot('character', character.id, character.project_id)
  await db.prepare(
    'INSERT INTO character_relations (id, project_id, from_character_id, to_character_id, relation, period, chapter_id, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    newId(),
    character.project_id,
    fromId,
    toId,
    relation,
    str(body.period),
    await validChapterId(str(body.chapterId), character.project_id),
    str(body.note),
    now()
  )
  await touchCharacter(character.id)
  res.status(201).json(await characterDetail(character.id))
})

router.delete('/character-relations/:id', async (req, res) => {
  const relation = await db.prepare('SELECT * FROM character_relations WHERE id = ?').get(req.params.id)
  if (!relation) return res.status(404).json({ error: '关系记录不存在' })
  await db.prepare('DELETE FROM character_relations WHERE id = ?').run(relation.id)
  res.json({ ok: true })
})

router.post('/characters/:id/stages', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}
  const count = await db.prepare('SELECT COUNT(*) AS c FROM character_stages WHERE character_id = ?').get(character.id).c

  await maybeAutoSnapshot('character', character.id, character.project_id)
  const makeCurrent = body.isCurrent === true || count === 0
  if (makeCurrent) {
    await db.prepare('UPDATE character_stages SET is_current = 0 WHERE character_id = ?').run(character.id)
  }

  const id = newId()
  const t = now()
  await db.prepare(
    'INSERT INTO character_stages (id, character_id, name, period, chapter_id, traits, inner, behavior, speech, event, is_current, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    character.id,
    trimTitle(body.name, '新阶段'),
    str(body.period),
    await validChapterId(str(body.chapterId), character.project_id),
    str(body.traits),
    str(body.inner),
    str(body.behavior),
    str(body.speech),
    str(body.event),
    makeCurrent ? 1 : 0,
    await nextStageOrder(character.id),
    t,
    t
  )
  await touchCharacter(character.id)
  res.status(201).json(await characterDetail(character.id))
})

router.patch('/character-stages/:id', async (req, res) => {
  const stage = await getStage(req.params.id)
  if (!stage) return res.status(404).json({ error: '阶段不存在' })
  const character = await getCharacter(stage.character_id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const body = req.body ?? {}

  await maybeAutoSnapshot('character', character.id, character.project_id)

  const updates = []
  const values = []
  for (const [key, column] of Object.entries(STAGE_FIELDS)) {
    if (body[key] === undefined) continue
    updates.push(`${column} = ?`)
    values.push(key === 'name' ? trimTitle(body[key], stage.name || '未命名阶段') : str(body[key]))
  }
  if (body.chapterId !== undefined) {
    updates.push('chapter_id = ?')
    values.push(await validChapterId(str(body.chapterId), character.project_id))
  }
  if (body.isCurrent === true) {
    await db.prepare('UPDATE character_stages SET is_current = 0 WHERE character_id = ?').run(character.id)
    updates.push('is_current = ?')
    values.push(1)
  } else if (body.isCurrent === false) {
    updates.push('is_current = ?')
    values.push(0)
  }
  if (body.sortOrder !== undefined) {
    updates.push('sort_order = ?')
    values.push(int(body.sortOrder, stage.sort_order))
  }

  if (updates.length) {
    updates.push('updated_at = ?')
    values.push(now(), stage.id)
    await db.prepare(`UPDATE character_stages SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    await ensureCurrentStage(character.id)
    await touchCharacter(character.id)
  }
  res.json(mapCharacterStage(await getStage(stage.id)))
})

router.delete('/character-stages/:id', async (req, res) => {
  const stage = await getStage(req.params.id)
  if (!stage) return res.status(404).json({ error: '阶段不存在' })
  const character = await getCharacter(stage.character_id)
  if (!character) return res.status(404).json({ error: '角色不存在' })

  await maybeAutoSnapshot('character', character.id, character.project_id)
  await db.prepare('DELETE FROM character_stages WHERE id = ?').run(stage.id)
  await ensureCurrentStage(character.id)
  await touchCharacter(character.id)
  res.json(await characterDetail(character.id))
})

router.post('/characters/:id/current-stage', async (req, res) => {
  const character = await getCharacter(req.params.id)
  if (!character) return res.status(404).json({ error: '角色不存在' })
  const stageId = str(req.body?.stageId)
  const stage = stageId ? await getStage(stageId) : null
  if (!stage || stage.character_id !== character.id) return res.status(400).json({ error: '阶段不属于该角色' })

  await maybeAutoSnapshot('character', character.id, character.project_id)
  await setCurrentStage(character.id, stage.id)
  await touchCharacter(character.id)
  res.json(await characterDetail(character.id))
})

export default router
