import { Router } from 'express'
import { db } from '../db.js'
import { mapBlock, mapChapter, mapOutline, mapRevision } from '../mappers.js'
import { newId, now, str } from '../util.js'
import { maybeAutoSnapshot, touchProject } from '../store.js'

const router = Router()

async function insertRevision({
  projectId,
  chapterId = null,
  blockId = null,
  targetId = null,
  scope,
  instruction = '',
  originalText = '',
  revisedText = '',
  modelName = null
}) {
  const id = newId()
  const createdAt = now()
  await db.prepare(
    `INSERT INTO revisions (id, project_id, chapter_id, block_id, target_id, scope, instruction, original_text, revised_text, model_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, chapterId, blockId, targetId, scope, instruction, originalText, revisedText, modelName, createdAt)
  return await db.prepare('SELECT * FROM revisions WHERE id = ?').get(id)
}

async function chapterRow(chapterId) {
  return await db
    .prepare(
      'SELECT c.*, (SELECT COALESCE(SUM(LENGTH(b.text)), 0) FROM blocks b WHERE b.chapter_id = c.id) AS word_count FROM chapters c WHERE c.id = ?'
    )
    .get(chapterId)
}

router.get('/chapters/:chapterId/revisions', async (req, res) => {
  const rows = await db
    .prepare('SELECT * FROM revisions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 300')
    .all(req.params.chapterId)
  res.json(rows.map(mapRevision))
})

router.post('/revisions/apply', async (req, res) => {
  const body = req.body ?? {}
  const target = str(body.target, 'block')
  const instruction = str(body.instruction)
  const revisedText = str(body.revisedText)
  const modelName = body.modelName ? str(body.modelName) : null

  if (target === 'block') {
    const block = await db.prepare('SELECT * FROM blocks WHERE id = ?').get(str(body.blockId))
    if (!block) return res.status(404).json({ error: '段落不存在' })
    const chapter = await chapterRow(block.chapter_id)
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    await maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)
    const original = block.text
    await db.prepare('UPDATE blocks SET text = ?, instruction = ?, updated_at = ? WHERE id = ?').run(
      revisedText,
      str(body.instruction, block.instruction),
      now(),
      block.id
    )
    await db.prepare('UPDATE chapters SET updated_at = ? WHERE id = ?').run(now(), chapter.id)
    await touchProject(chapter.project_id)
    const revision = await insertRevision({
      projectId: chapter.project_id,
      chapterId: chapter.id,
      blockId: block.id,
      targetId: block.id,
      scope: 'block',
      instruction,
      originalText: original,
      revisedText,
      modelName
    })
    return res.json({
      revision: mapRevision(revision),
      block: mapBlock(await db.prepare('SELECT * FROM blocks WHERE id = ?').get(block.id)),
      chapter: mapChapter(await chapterRow(chapter.id))
    })
  }

  if (target === 'chapter-summary') {
    const chapter = await chapterRow(str(body.chapterId))
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    await maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)
    const original = chapter.summary
    await db.prepare('UPDATE chapters SET summary = ?, updated_at = ? WHERE id = ?').run(revisedText, now(), chapter.id)
    await touchProject(chapter.project_id)
    const revision = await insertRevision({
      projectId: chapter.project_id,
      chapterId: chapter.id,
      targetId: chapter.id,
      scope: 'chapter-summary',
      instruction,
      originalText: original,
      revisedText,
      modelName
    })
    return res.json({
      revision: mapRevision(revision),
      chapter: mapChapter(await chapterRow(chapter.id))
    })
  }

  if (target === 'outline') {
    const outline = await db.prepare('SELECT * FROM outline_items WHERE id = ?').get(str(body.outlineId))
    if (!outline) return res.status(404).json({ error: '大纲不存在' })
    await maybeAutoSnapshot('outline', outline.id, outline.project_id)
    const original = outline.content
    await db.prepare('UPDATE outline_items SET content = ?, updated_at = ? WHERE id = ?').run(revisedText, now(), outline.id)
    await touchProject(outline.project_id)
    const revision = await insertRevision({
      projectId: outline.project_id,
      targetId: outline.id,
      scope: 'outline',
      instruction,
      originalText: original,
      revisedText,
      modelName
    })
    return res.json({
      revision: mapRevision(revision),
      outline: mapOutline(await db.prepare('SELECT * FROM outline_items WHERE id = ?').get(outline.id))
    })
  }

  if (target === 'append') {
    const chapter = await chapterRow(str(body.chapterId))
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    const texts = Array.isArray(body.texts) ? body.texts.map((t) => str(t)).filter((t) => t.trim()) : []
    if (!texts.length) return res.status(400).json({ error: '没有可追加的正文' })
    await maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)

    const row = await db.prepare('SELECT MAX(sort_order) AS m FROM blocks WHERE chapter_id = ?').get(chapter.id)
    let sortOrder = (row?.m ?? -10) + 10
    const insert = db.prepare(
      'INSERT INTO blocks (id, chapter_id, text, instruction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    const created = []
    texts.forEach((text) => {
      const id = newId()
      const t = now()
      insert.run(id, chapter.id, text, instruction, sortOrder, t, t)
      created.push(id)
      sortOrder += 10
    })
    await db.prepare('UPDATE chapters SET updated_at = ? WHERE id = ?').run(now(), chapter.id)
    await touchProject(chapter.project_id)
    const revision = await insertRevision({
      projectId: chapter.project_id,
      chapterId: chapter.id,
      scope: 'append',
      instruction,
      originalText: '',
      revisedText: texts.join('\n\n'),
      modelName
    })
    return res.json({
      revision: mapRevision(revision),
      blocks: (await Promise.all(created.map((id) => db.prepare('SELECT * FROM blocks WHERE id = ?').get(id)))).map(mapBlock),
      chapter: mapChapter(await chapterRow(chapter.id))
    })
  }

  res.status(400).json({ error: `未知的修改目标：${target}` })
})

router.delete('/revisions/:id', async (req, res) => {
  const result = await db.prepare('DELETE FROM revisions WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '记录不存在' })
  res.json({ ok: true })
})

export default router
