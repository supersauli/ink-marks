import { Router } from 'express'
import { db } from '../db.js'
import { mapVersion, mapChapter, mapBlock, mapOutline } from '../mappers.js'
import { str } from '../util.js'
import { createVersion, restoreChapterSnapshot, restoreCharacterSnapshot, restoreOutlineSnapshot } from '../store.js'
import { characterDetail } from '../characters.js'

const router = Router()

router.get('/versions', (req, res) => {
  const targetType = str(req.query.targetType)
  const targetId = str(req.query.targetId)
  if (!targetType || !targetId) return res.status(400).json({ error: '缺少 targetType / targetId' })
  const rows = db
    .prepare('SELECT * FROM versions WHERE target_type = ? AND target_id = ? ORDER BY created_at DESC LIMIT 200')
    .all(targetType, targetId)
  res.json(rows.map((row) => mapVersion(row)))
})

router.post('/versions', (req, res) => {
  const body = req.body ?? {}
  const projectId = str(body.projectId)
  const targetType = str(body.targetType)
  const targetId = str(body.targetId)
  if (!projectId || !targetType || !targetId) return res.status(400).json({ error: '参数不完整' })
  const version = createVersion({
    projectId,
    targetType,
    targetId,
    label: str(body.label) || '手动保存',
    source: str(body.source, 'manual')
  })
  if (!version) return res.status(404).json({ error: '目标不存在' })
  res.status(201).json(mapVersion({ ...version, snapshot: JSON.stringify(version.snapshot) }))
})

router.get('/versions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM versions WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '版本不存在' })
  res.json(mapVersion(row, true))
})

router.post('/versions/:id/restore', (req, res) => {
  const row = db.prepare('SELECT * FROM versions WHERE id = ?').get(req.params.id)
  if (!row) return res.status(404).json({ error: '版本不存在' })
  const snapshot = JSON.parse(row.snapshot)

  // 恢复前先保存当前状态，误操作也能再回来
  createVersion({
    projectId: row.project_id,
    targetType: row.target_type,
    targetId: row.target_id,
    label: '恢复前备份',
    source: 'restore'
  })

  if (row.target_type === 'chapter') {
    const chapterRow = restoreChapterSnapshot(row.target_id, snapshot)
    if (!chapterRow) return res.status(404).json({ error: '章节不存在' })
    const blocks = db.prepare('SELECT * FROM blocks WHERE chapter_id = ? ORDER BY sort_order ASC, created_at ASC').all(row.target_id)
    return res.json({
      targetType: 'chapter',
      chapter: {
        ...mapChapter({
          ...chapterRow,
          word_count: blocks.reduce((sum, block) => sum + block.text.length, 0)
        }),
        blocks: blocks.map(mapBlock)
      }
    })
  }

  if (row.target_type === 'character') {
    const characterRow = restoreCharacterSnapshot(row.target_id, snapshot)
    if (!characterRow) return res.status(404).json({ error: '角色不存在' })
    return res.json({ targetType: 'character', character: characterDetail(row.target_id) })
  }

  if (row.target_type === 'outline') {
    const outlineRow = restoreOutlineSnapshot(row.target_id, snapshot)
    if (!outlineRow) return res.status(404).json({ error: '大纲不存在' })
    return res.json({ targetType: 'outline', outline: mapOutline(outlineRow) })
  }

  res.status(400).json({ error: '未知的版本类型' })
})

router.delete('/versions/:id', (req, res) => {
  const result = db.prepare('DELETE FROM versions WHERE id = ?').run(req.params.id)
  if (!result.changes) return res.status(404).json({ error: '版本不存在' })
  res.json({ ok: true })
})

export default router
