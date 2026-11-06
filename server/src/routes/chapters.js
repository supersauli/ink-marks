import { Router } from 'express'
import { db } from '../db.js'
import { mapBlock, mapChapter } from '../mappers.js'
import { newId, now, str, int, trimTitle } from '../util.js'
import { maybeAutoSnapshot, touchProject } from '../store.js'

const router = Router()

const WORD_COUNT_SQL = '(SELECT COALESCE(SUM(LENGTH(b.text)), 0) FROM blocks b WHERE b.chapter_id = c.id) AS word_count'

function listChapters(projectId) {
  return db
    .prepare(`SELECT c.*, ${WORD_COUNT_SQL} FROM chapters c WHERE c.project_id = ? ORDER BY c.sort_order ASC, c.created_at ASC`)
    .all(projectId)
}

function getChapterRow(chapterId) {
  return db
    .prepare(`SELECT c.*, ${WORD_COUNT_SQL} FROM chapters c WHERE c.id = ?`)
    .get(chapterId)
}

function listBlocks(chapterId) {
  return db.prepare('SELECT * FROM blocks WHERE chapter_id = ? ORDER BY sort_order ASC, created_at ASC').all(chapterId)
}

function touchChapter(chapterId) {
  const chapter = db.prepare('SELECT project_id FROM chapters WHERE id = ?').get(chapterId)
  db.prepare('UPDATE chapters SET updated_at = ? WHERE id = ?').run(now(), chapterId)
  touchProject(chapter?.project_id)
}

function nextChapterOrder(projectId) {
  const row = db.prepare('SELECT MAX(sort_order) AS m FROM chapters WHERE project_id = ?').get(projectId)
  return (row?.m ?? -10) + 10
}

router.get('/chapters', (req, res) => {
  const projectId = str(req.query.projectId)
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  res.json(listChapters(projectId).map(mapChapter))
})

router.post('/chapters', (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const project = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectId)
  if (!project) return res.status(400).json({ error: '作品不存在' })

  let sortOrder = nextChapterOrder(projectId)
  const afterId = body.afterChapterId ? str(body.afterChapterId) : ''
  if (afterId) {
    const after = db.prepare('SELECT sort_order FROM chapters WHERE id = ? AND project_id = ?').get(afterId, projectId)
    if (after) {
      sortOrder = after.sort_order + 10
      db.prepare('UPDATE chapters SET sort_order = sort_order + 10 WHERE project_id = ? AND sort_order >= ?').run(
        projectId,
        sortOrder
      )
    }
  }

  const id = newId()
  const t = now()
  db.prepare(
    'INSERT INTO chapters (id, project_id, title, summary, status, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, projectId, trimTitle(body.title, '新章节'), str(body.summary), 'outline', sortOrder, t, t)
  touchProject(projectId)
  res.status(201).json(mapChapter(getChapterRow(id)))
})

function snippetOf(text, needle, before = 16, after = 44) {
  const flat = text.replace(/\s+/g, ' ').trim()
  const lower = flat.toLowerCase()
  const index = lower.indexOf(needle)
  if (index < 0) return flat.length > before + after ? `${flat.slice(0, before + after)}…` : flat
  const start = Math.max(0, index - before)
  const end = Math.min(flat.length, index + needle.length + after)
  return `${start > 0 ? '…' : ''}${flat.slice(start, end)}${end < flat.length ? '…' : ''}`
}

// 章节搜索：标题、章节大纲、正文段落
router.get('/chapters/search', (req, res) => {
  const projectId = str(req.query.projectId)
  const query = str(req.query.q).trim()
  if (!projectId) return res.status(400).json({ error: '缺少 projectId' })
  if (!query) return res.json({ query: '', results: [] })

  const needle = query.toLowerCase()
  const chapterRows = listChapters(projectId)
  const blockRows = db
    .prepare(
      `SELECT b.id, b.chapter_id, b.text FROM blocks b
       JOIN chapters c ON c.id = b.chapter_id
       WHERE c.project_id = ?
       ORDER BY b.sort_order ASC, b.created_at ASC`
    )
    .all(projectId)

  const blocksByChapter = new Map()
  for (const block of blockRows) {
    const list = blocksByChapter.get(block.chapter_id) ?? []
    list.push(block)
    blocksByChapter.set(block.chapter_id, list)
  }

  const results = []
  for (const row of chapterRows) {
    const title = row.title ?? ''
    const summary = row.summary ?? ''
    const matchFields = []
    let blockId = null
    let snippet = ''

    if (title.toLowerCase().includes(needle)) matchFields.push('title')
    if (summary.toLowerCase().includes(needle)) matchFields.push('summary')

    for (const block of blocksByChapter.get(row.id) ?? []) {
      if (block.text.toLowerCase().includes(needle)) {
        matchFields.push('body')
        blockId = block.id
        snippet = snippetOf(block.text, needle)
        break
      }
    }

    if (!matchFields.length) continue
    if (!snippet) {
      const source = summary || title
      snippet = snippetOf(source, needle, 0, 60)
    }

    results.push({
      ...mapChapter(row),
      matchFields,
      blockId,
      snippet
    })
  }

  res.json({ query, results })
})

router.post('/chapters/reorder', (req, res) => {
  const { projectId, ids } = req.body ?? {}
  if (!projectId || !Array.isArray(ids)) return res.status(400).json({ error: '参数不完整' })
  const update = db.prepare('UPDATE chapters SET sort_order = ? WHERE id = ? AND project_id = ?')
  ids.forEach((id, index) => update.run(index * 10, str(id), projectId))
  touchProject(projectId)
  res.json(listChapters(projectId).map(mapChapter))
})

router.get('/chapters/:id', (req, res) => {
  const chapter = getChapterRow(req.params.id)
  if (!chapter) return res.status(404).json({ error: '章节不存在' })
  res.json({
    ...mapChapter(chapter),
    blocks: listBlocks(chapter.id).map(mapBlock)
  })
})

router.patch('/chapters/:id', (req, res) => {
  const chapter = getChapterRow(req.params.id)
  if (!chapter) return res.status(404).json({ error: '章节不存在' })
  const body = req.body ?? {}
  const title = body.title === undefined ? chapter.title : trimTitle(body.title, chapter.title)
  const summary = body.summary === undefined ? chapter.summary : str(body.summary, chapter.summary)
  const status = body.status === undefined ? chapter.status : str(body.status, chapter.status)

  if (summary !== chapter.summary) {
    maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)
  }
  db.prepare('UPDATE chapters SET title = ?, summary = ?, status = ?, updated_at = ? WHERE id = ?').run(
    title,
    summary,
    status,
    now(),
    chapter.id
  )
  touchProject(chapter.project_id)
  res.json(mapChapter(getChapterRow(chapter.id)))
})

router.delete('/chapters/:id', (req, res) => {
  const chapter = getChapterRow(req.params.id)
  if (!chapter) return res.status(404).json({ error: '章节不存在' })
  db.prepare('DELETE FROM chapters WHERE id = ?').run(chapter.id)
  db.prepare("DELETE FROM versions WHERE target_type = 'chapter' AND target_id = ?").run(chapter.id)
  db.prepare('DELETE FROM revisions WHERE chapter_id = ?').run(chapter.id)
  touchProject(chapter.project_id)
  res.json({ ok: true })
})

router.post('/chapters/:id/blocks', (req, res) => {
  const chapter = getChapterRow(req.params.id)
  if (!chapter) return res.status(404).json({ error: '章节不存在' })

  const body = req.body ?? {}
  const texts = Array.isArray(body.texts) ? body.texts.map((t) => str(t)) : [str(body.text)]
  const instruction = str(body.instruction)
  const afterId = body.afterBlockId ? str(body.afterBlockId) : ''

  maybeAutoSnapshot('chapter', chapter.id, chapter.project_id)

  let sortOrder = 0
  if (afterId) {
    const after = db.prepare('SELECT sort_order FROM blocks WHERE id = ? AND chapter_id = ?').get(afterId, chapter.id)
    sortOrder = after ? after.sort_order + 10 : 0
    if (after) {
      db.prepare('UPDATE blocks SET sort_order = sort_order + 10 WHERE chapter_id = ? AND sort_order >= ?').run(chapter.id, sortOrder)
    }
  } else {
    const row = db.prepare('SELECT MAX(sort_order) AS m FROM blocks WHERE chapter_id = ?').get(chapter.id)
    sortOrder = (row?.m ?? -10) + 10
  }

  const insert = db.prepare(
    'INSERT INTO blocks (id, chapter_id, text, instruction, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  )
  const createdIds = []
  texts.forEach((text, index) => {
    const id = newId()
    const t = now()
    insert.run(id, chapter.id, text, instruction, sortOrder + index * 10, t, t)
    createdIds.push(id)
  })
  touchChapter(chapter.id)

  const blocks = createdIds
    .map((id) => db.prepare('SELECT * FROM blocks WHERE id = ?').get(id))
    .map(mapBlock)
  res.status(201).json({ blocks, chapter: mapChapter(getChapterRow(chapter.id)) })
})

router.put('/chapters/:id/blocks/order', (req, res) => {
  const chapter = getChapterRow(req.params.id)
  if (!chapter) return res.status(404).json({ error: '章节不存在' })
  const { ids } = req.body ?? {}
  if (!Array.isArray(ids)) return res.status(400).json({ error: '缺少 ids' })
  const update = db.prepare('UPDATE blocks SET sort_order = ? WHERE id = ? AND chapter_id = ?')
  ids.forEach((id, index) => update.run(index * 10, str(id), chapter.id))
  touchChapter(chapter.id)
  res.json({ blocks: listBlocks(chapter.id).map(mapBlock) })
})

router.patch('/blocks/:id', (req, res) => {
  const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(req.params.id)
  if (!block) return res.status(404).json({ error: '段落不存在' })
  const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(block.chapter_id)
  const body = req.body ?? {}
  const text = body.text === undefined ? block.text : str(body.text, block.text)
  const instruction = body.instruction === undefined ? block.instruction : str(body.instruction, block.instruction)

  if (text !== block.text) {
    maybeAutoSnapshot('chapter', block.chapter_id, chapter?.project_id)
  }
  db.prepare('UPDATE blocks SET text = ?, instruction = ?, updated_at = ? WHERE id = ?').run(text, instruction, now(), block.id)
  touchChapter(block.chapter_id)
  const updated = db.prepare('SELECT * FROM blocks WHERE id = ?').get(block.id)
  res.json(mapBlock(updated))
})

router.delete('/blocks/:id', (req, res) => {
  const block = db.prepare('SELECT * FROM blocks WHERE id = ?').get(req.params.id)
  if (!block) return res.status(404).json({ error: '段落不存在' })
  maybeAutoSnapshot('chapter', block.chapter_id, db.prepare('SELECT project_id FROM chapters WHERE id = ?').get(block.chapter_id)?.project_id)
  db.prepare('DELETE FROM blocks WHERE id = ?').run(block.id)
  touchChapter(block.chapter_id)
  res.json({ ok: true })
})

export default router
