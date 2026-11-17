import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 本地运行时：注入 node:sqlite 驱动并完成建表/seed（须在任何路由 import 之前）
import './db-local.js'

import projectsRouter from './routes/projects.js'
import outlinesRouter from './routes/outlines.js'
import chaptersRouter from './routes/chapters.js'
import charactersRouter from './routes/characters.js'
import cardsRouter from './routes/cards.js'
import itemsRouter from './routes/items.js'
import overviewRouter from './routes/overview.js'
import revisionsRouter from './routes/revisions.js'
import versionsRouter from './routes/versions.js'
import providersRouter from './routes/providers.js'
import chatRouter from './routes/chat.js'
import usageRouter from './routes/usage.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const app = express()

app.use(express.json({ limit: '8mb' }))

app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() })
})

app.use('/api/projects', projectsRouter)
app.use('/api/outlines', outlinesRouter)
app.use('/api', chaptersRouter)
app.use('/api', charactersRouter)
app.use('/api', cardsRouter)
app.use('/api', itemsRouter)
app.use('/api', overviewRouter)
app.use('/api', revisionsRouter)
app.use('/api', versionsRouter)
app.use('/api', providersRouter)
app.use('/api', chatRouter)
app.use('/api', usageRouter)

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

const webDist = path.resolve(here, '../../web/dist')
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist))
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next()
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error)
  const status = error?.status && Number.isInteger(error.status) ? error.status : 500
  console.error('[api error]', error)
  res.status(status).json({ error: error?.message || '服务器内部错误' })
})

const port = Number(process.env.PORT) || 8787
app.listen(port, '127.0.0.1', () => {
  console.log(`[novel-studio] api listening on http://127.0.0.1:${port}`)
  if (fs.existsSync(webDist)) console.log(`[novel-studio] serving web build from ${webDist}`)
})
