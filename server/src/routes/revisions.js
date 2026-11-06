import { Router } from 'express'
import { db } from '../db.js'
import { mapBlock, mapChapter, mapOutline, mapRevision } from '../mappers.js'
import { newId, now, str } from '../util.js'
import { maybeAutoSnapshot, touchProject } from '../store.js'

const router = Router()

function insertRevision({
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
  db.prepare(
    `INSERT INTO revisions (id, project_id, chapter_id, block_id, target_id, scope, instruction, original_text, revised_text, model_name, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, projectId, chapterId, blockId, targetId, scope, instruction, originalText, revisedText, modelName, createdAt)
  return db.prepare('SELECT * FROM revisions WHERE id = ?').get(id)
}

function chapterRow(chapterId) {
  return db
    .prepare(
      'SELECT c.*, (SELECT COALESCE(SUM(LENGTH(b.text)), 0) FROM blocks b WHERE b.chapter_id = c.id) AS word_count FROM chapters c WHERE c.id = ?'
    )
    .get(chapterId)
}

router.get('/chapters/:chapterId/revisions', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM revisions WHERE chapter_id = ? ORDER BY created_at DESC LIMIT 300')
    .all(req.params.chapterId)
  res.json(rows.map(mapRevision))
})

router.post('/revisions/apply', (req, res) => {
  const body = req.body ?? {}
  const target = str(body.target, 'block')
  const instruction = str(body.instruction)
  const revisedText = str(body.revisedText)
  const modelName = body.modelName ? str(body.modelName) : null

  if (target === 'block') {
    const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(str(body.blockId))
    if (!block) return res.status(404).json({ error: '段落不存在' })
    const chapter = chapterRow(block.chapter_id)
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)
    const original = block.text
    db.prepare('UPDATE blocks SET text = ?, instruction = ?, updated_at = ? WHERE id = ?').run(
      revisedText,
      str(body.instruction, block.instruction),
      now(),
      block.id
    )
    db.prepare('UPDATE chapters SET updated_at = ? WHERE id = ?').run(now(), chapter.id)
    touchProject(chapter.project_id)
    const revision = insertRevision({
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
      block: mapBlock(db.prepare('SELECT * FROM blocks WHERE id = ?').get(block.id)),
      chapter: mapChapter(chapterRow(chapter.id))
    })
  }

  if (target === 'chapter-summary') {
    const chapter = chapterRow(str(body.chapterId))
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)
    const original = chapter.summary
    db.prepare('UPDATE chapters SET summary = ?, updated_at = ? WHERE id = ?').run(revisedText, now(), chapter.id)
    touchProject(chapter.project_id)
    const revision = insertRevision({
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
      chapter: mapChapter(chapterRow(chapter.id))
    })
  }

  if (target === 'outline') {
    const outline = db.prepare('SELECT * FROM outline_items WHERE id = ?').get(str(body.outlineId))
    if (!outline) return res.status(404).json({ error: '大纲不存在' })
    maybeAutoSnapshot('outline', outline.id, outline.project_id)
    const original = outline.content
    db.prepare('UPDATE outline_items SET content = ?, updated_at = ? WHERE id = ?').run(revisedText, now(), outline.id)
    touchProject(outline.project_id)
    const revision = insertRevision({
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
      outline: mapOutline(db.prepare('SELECT * FROM outline_items WHERE id = ?').get(outline.id))
    })
  }

  if (target === 'append') {
    const chapter = chapterRow(str(body.chapterId))
    if (!chapter) return res.status(404).json({ error: '章节不存在' })
    const texts = Array.isArray(body.texts) ? body.texts.map((t) => str(t)).filter((t) => t.trim()) : []
    if (!texts.length) return res.status(400).json({ error: '没有可追加的正文' })
    maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)

    const row = db.prepare('SELECT MAX(sort_order) AS m FROM blocks WHERE chapter_id = ?').get(chapter.id)
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
    db.prepare('UPDATE chapters SET updated_at = ? WHERE id = ?').run(now(), chapter.id)
    touchProject(chapter.project_id)
    const revision = insertRevision({
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
      blocks: created.map((id) => mapBlock(db.prepare('SELECT * FROM blocks WHERE id = ?').get(id))),
      chapter: mapChapter(chapterRow(chapter.id))
    })
  }

  res.status(400).json({ error: `未知的修改目标：${target}` })
})

router.delete('/revisions/:id', (req, res) => {
  const result = db.prepare('DELETE FROM revisions WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '记录不存在' })
  res.json({ ok: true })
})

export default router
