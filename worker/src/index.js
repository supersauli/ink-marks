// Cloudflare Workers / Pages Functions 入口。
// 复用 server/src 的全部业务路由，只替换运行时：D1 驱动 + Workers HTTP 适配。

import { setDriver } from '../../server/src/db-adapter.js'
import { createD1Driver } from './d1-driver.js'
import { Router, collectRoutes } from './express-shim.js'
import { handleRequest } from './http.js'
import { SCHEMA_STATEMENTS, MIGRATION_STATEMENTS } from './schema.js'

// 首次请求自动建表：用 settings 表作哨兵。Promise 缓存保证同一 isolate 内只探测一次；
// 多 isolate 并发时靠建表语句的 IF NOT EXISTS 保证幂等。
let schemaReady = null
async function ensureSchema(DB) {
  if (!schemaReady) {
    schemaReady = (async () => {
      const probe = await DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").first()
      // 老库也要执行增量建表，因此 MIGRATION_STATEMENTS 每次都会跑（都带 IF NOT EXISTS）。
      const statements = probe ? MIGRATION_STATEMENTS : [...SCHEMA_STATEMENTS, ...MIGRATION_STATEMENTS]
      for (let i = 0; i < statements.length; i++) {
        try {
          await DB.prepare(statements[i]).run()
        } catch (e) {
          throw new Error(`第 ${i + 1}/${statements.length} 条建表语句失败: ${e.message}`)
        }
      }
    })().catch((e) => {
      schemaReady = null // 失败则下次请求重试
      throw e
    })
  }
  return schemaReady
}

// 导入全部业务路由（它们 import 的是 db-adapter 统一入口，不触碰 node:sqlite）
import projectsRouter from '../../server/src/routes/projects.js'
import outlinesRouter from '../../server/src/routes/outlines.js'
import chaptersRouter from '../../server/src/routes/chapters.js'
import charactersRouter from '../../server/src/routes/characters.js'
import cardsRouter from '../../server/src/routes/cards.js'
import itemsRouter from '../../server/src/routes/items.js'
import notesRouter from '../../server/src/routes/notes.js'
import overviewRouter from '../../server/src/routes/overview.js'
import revisionsRouter from '../../server/src/routes/revisions.js'
import versionsRouter from '../../server/src/routes/versions.js'
import providersRouter from '../../server/src/routes/providers.js'
import chatRouter from '../../server/src/routes/chat.js'
import usageRouter from '../../server/src/routes/usage.js'

const allRoutes = collectRoutes([
  { prefix: '/api/projects', router: projectsRouter },
  { prefix: '/api/outlines', router: outlinesRouter },
  { prefix: '/api', router: chaptersRouter },
  { prefix: '/api', router: charactersRouter },
  { prefix: '/api', router: cardsRouter },
  { prefix: '/api', router: itemsRouter },
  { prefix: '/api', router: notesRouter },
  { prefix: '/api', router: overviewRouter },
  { prefix: '/api', router: revisionsRouter },
  { prefix: '/api', router: versionsRouter },
  { prefix: '/api', router: providersRouter },
  { prefix: '/api', router: chatRouter },
  { prefix: '/api', router: usageRouter }
])

export default {
  async fetch(request, env, ctx) {
    // D1 驱动按请求绑定（D1 binding 通过 env 提供）
    setDriver(createD1Driver(env.DB))

    const url = new URL(request.url)

    if (url.pathname === '/api/health') {
      // 自检：确认 D1 绑定可用、表已建好。无认证，便于部署后快速诊断。
      let dbInfo
      try {
        const probe = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='settings'").first()
        const tables = await env.DB.prepare("SELECT COUNT(*) AS c FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").first()
        dbInfo = { ok: true, schemaReady: Boolean(probe), tables: tables?.c ?? 0 }
      } catch (e) {
        dbInfo = { ok: false, error: e.message }
      }
      return new Response(JSON.stringify({ ok: true, time: new Date().toISOString(), db: dbInfo }), {
        headers: { 'content-type': 'application/json; charset=utf-8' }
      })
    }

    // 访问认证（与本地同一套逻辑；令牌通过 env.NOVEL_ACCESS_TOKEN 配置）
    if (url.pathname.startsWith('/api/') && env.NOVEL_ACCESS_TOKEN) {
      const auth = request.headers.get('authorization') || ''
      const queryToken = url.searchParams.get('token') || ''
      const cookie = request.headers.get('cookie') || ''
      const m = cookie.match(/(?:^|;\s*)novel_token=([^;]+)/)
      const cookieToken = m ? decodeURIComponent(m[1]) : ''
      const got = auth.replace(/^Bearer\s+/i, '').trim() || queryToken || cookieToken
      const expected = env.NOVEL_ACCESS_TOKEN
      let pass = got.length === expected.length
      if (pass) {
        let diff = 0
        for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
        pass = diff === 0
      }
      if (!pass) {
        return new Response(JSON.stringify({ error: '需要访问令牌' }), {
          status: 401,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        })
      }
    }

    if (url.pathname.startsWith('/api/')) {
      // 认证通过后才建表，且只做一次；失败直接暴露，便于排查
      try {
        await ensureSchema(env.DB)
      } catch (e) {
        console.error('[schema] 自动建表失败', e)
        return new Response(JSON.stringify({ error: '数据库初始化失败：' + e.message }), {
          status: 500,
          headers: { 'content-type': 'application/json; charset=utf-8' }
        })
      }
      return handleRequest(request, allRoutes)
    }

    // 非 API：交给 Cloudflare Pages 静态资源；未命中时由 Pages 的 SPA fallback 处理
    return env.ASSETS ? env.ASSETS.fetch(request) : new Response('Not found', { status: 404 })
  }
}
