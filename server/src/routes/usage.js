import { Router } from 'express'
import { db } from '../db.js'
import { int, str } from '../util.js'
import { mapUsageLog } from '../usage.js'

const router = Router()

function summarize(rows) {
  const result = {
    requests: rows.length,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    cacheHitTokens: 0,
    cacheMissTokens: 0,
    cacheHitRate: null,
    cacheReported: 0,
    estimatedCount: 0,
    maxContextRate: null,
    durationMs: 0,
    timedRequests: 0,
    avgTokensPerSecond: null
  }
  let reportedPrompt = 0
  let timedCompletion = 0
  for (const row of rows) {
    result.promptTokens += row.prompt_tokens ?? 0
    result.completionTokens += row.completion_tokens ?? 0
    result.totalTokens += row.total_tokens ?? 0
    // 旧记录没有耗时，既不进分子也不进分母，避免把平均速率算虚高
    const duration = row.duration_ms ?? 0
    if (duration > 0) {
      result.durationMs += duration
      result.timedRequests += 1
      timedCompletion += row.completion_tokens ?? 0
    }
    if (row.cache_hit_tokens !== null && row.cache_hit_tokens !== undefined) {
      result.cacheReported += 1
      reportedPrompt += row.prompt_tokens ?? 0
      result.cacheHitTokens += row.cache_hit_tokens
      result.cacheMissTokens += row.cache_miss_tokens ?? 0
    }
    if (row.estimated === 1) result.estimatedCount += 1
    if (row.context_rate !== null && row.context_rate !== undefined) {
      result.maxContextRate = Math.max(result.maxContextRate ?? 0, row.context_rate)
    }
  }
  if (reportedPrompt > 0) result.cacheHitRate = Math.min(1, result.cacheHitTokens / reportedPrompt)
  if (result.durationMs > 0) {
    result.avgTokensPerSecond = Math.round((timedCompletion / (result.durationMs / 1000)) * 10) / 10
  }
  return result
}

function groupBy(rows, keyOf) {
  const groups = new Map()
  for (const row of rows) {
    const key = keyOf(row) || '未知'
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }
  return [...groups.entries()]
    .map(([name, items]) => ({ name, ...summarize(items) }))
    .sort((a, b) => b.totalTokens - a.totalTokens)
}

function queryRows(projectId, since) {
  if (projectId) {
    return db
      .prepare('SELECT * FROM llm_usage_logs WHERE project_id = ? AND created_at >= ? ORDER BY created_at ASC')
      .all(projectId, since)
  }
  return db.prepare('SELECT * FROM llm_usage_logs WHERE created_at >= ? ORDER BY created_at ASC').all(since)
}

router.get('/usage/stats', (req, res) => {
  const projectId = str(req.query.projectId)
  const days = Math.min(365, Math.max(1, int(req.query.days, 30)))
  const since = new Date(Date.now() - days * 86400000).toISOString()
  const rows = queryRows(projectId, since)
  const byDay = groupBy(rows, (row) => String(row.created_at).slice(0, 10))
    .sort((a, b) => a.name.localeCompare(b.name))
  res.json({
    range: { days, since, projectId },
    totals: summarize(rows),
    byModel: groupBy(rows, (row) => row.model_name),
    byScene: groupBy(rows, (row) => row.scene),
    byDay,
    recent: rows.slice(-12).reverse().map(mapUsageLog)
  })
})

router.get('/usage/logs', (req, res) => {
  const projectId = str(req.query.projectId)
  const limit = Math.min(200, Math.max(1, int(req.query.limit, 50)))
  const rows = projectId
    ? db
        .prepare('SELECT * FROM llm_usage_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(projectId, limit)
    : db.prepare('SELECT * FROM llm_usage_logs ORDER BY created_at DESC LIMIT ?').all(limit)
  res.json(rows.map(mapUsageLog))
})

router.delete('/usage/logs', (req, res) => {
  const projectId = str(req.query.projectId)
  const result = projectId
    ? db.prepare('DELETE FROM llm_usage_logs WHERE project_id = ?').run(projectId)
    : db.prepare('DELETE FROM llm_usage_logs').run()
  res.json({ ok: true, deleted: result.changes })
})

export default router
