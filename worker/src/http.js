// 把 Workers 的 Request 适配成 Express 风格 req/res，执行路由 handler，产出 Response。
// 普通请求：等 handler 完成后一次性返回。
// /api/chat/stream（SSE）：建立 TransformStream，handler 在后台运行，write 直接推流。

import { matchRoute } from './express-shim.js'

function makeReq(request, params, url, body) {
  const headers = {}
  request.headers.forEach((v, k) => { headers[k.toLowerCase()] = v })
  return {
    method: request.method,
    path: url.pathname,
    params,
    query: Object.fromEntries(url.searchParams),
    headers,
    body,
    signal: request.signal
  }
}

function makeRes() {
  const state = {
    statusCode: 200,
    headers: {},
    chunks: [],
    ended: false,
    destroyed: false,
    closeHandlers: [],
    controller: null, // SSE 时用：{ enqueue, close }
    onFinish: null,
    streamStarted: null, // Promise：真正开始 SSE 流时 resolve；handler 提前结束则 resolve(false)
    resolveStream: null
  }
  state.streamStarted = new Promise((resolve) => { state.resolveStream = resolve })
  const res = {
    status(code) { state.statusCode = code; return res },
    setHeader(name, value) { state.headers[name.toLowerCase()] = String(value); return res },
    getHeader(name) { return state.headers[name.toLowerCase()] },
    json(data) {
      if (!state.headers['content-type']) state.headers['content-type'] = 'application/json; charset=utf-8'
      res.write(JSON.stringify(data)); res.end(); return res
    },
    send(data) { res.write(typeof data === 'string' ? data : JSON.stringify(data)); res.end(); return res },
    write(chunk) {
      if (state.ended || state.destroyed) return false
      if (state.controller) {
        state.controller.enqueue(String(chunk)); return true
      }
      state.chunks.push(String(chunk)); return true
    },
    end() {
      if (state.ended) return res
      state.ended = true
      state.resolveStream(false) // 未进入 SSE 就结束（如参数校验错误）
      state.controller?.close()
      state.onFinish?.()
      return res
    },
    flushHeaders() {
      // chat.js 在设置好 SSE 头后调用，标志真正开始流式输出
      const ct = String(state.headers['content-type'] || '')
      if (ct.includes('text/event-stream')) state.resolveStream(true)
      return res
    },
    on(event, fn) { if (event === 'close') state.closeHandlers.push(fn); return res },
    get writableEnded() { return state.ended },
    get destroyed() { return state.destroyed },
    __state: state
  }
  return res
}

function attachDisconnect(res, request) {
  request.signal.addEventListener('abort', () => {
    res.__state.destroyed = true
    for (const fn of res.__state.closeHandlers) {
      try { fn() } catch (e) { /* ignore */ }
    }
  })
}

async function runHandlers(entry, req, res) {
  for (const handler of entry.handlers) {
    await handler(req, res, () => {})
  }
}

function jsonResponse(status, headers, text) {
  return new Response(text, { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } })
}

export async function handleRequest(request, allRoutes) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/api/')) return null // 非 API 交给静态资源处理

  const matched = matchRoute(allRoutes, request.method, url.pathname)
  if (!matched) return jsonResponse(404, {}, JSON.stringify({ error: '接口不存在' }))

  let body = {}
  if (['POST', 'PUT', 'PATCH'].includes(request.method)) {
    try {
      const text = await request.text()
      body = text ? JSON.parse(text) : {}
    } catch (e) {
      return jsonResponse(400, {}, JSON.stringify({ error: '请求体不是合法 JSON' }))
    }
  }
  const req = makeReq(request, matched.params, url, body)
  const res = makeRes()
  attachDisconnect(res, request)

  const isSSE = url.pathname === '/api/chat/stream'

  if (isSSE) {
    // 后台启动 handler：它要么 flushHeaders 真正开始流，要么提前 res.json 报错结束。
    const handlerPromise = runHandlers(matched.entry, req, res).catch((e) => {
      console.error('[stream error]', e)
      if (!res.__state.ended) {
        res.__state.resolveStream(false)
        try { res.status(500).json({ error: e.message || '流式生成失败' }) } catch (_) {}
      }
    })
    const started = await res.__state.streamStarted
    if (!started) {
      // 参数校验等提前返回：按普通响应输出，状态码正确（400/404 等）
      await handlerPromise
      const headers = { ...res.__state.headers }
      if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8'
      return new Response(res.__state.chunks.join(''), { status: res.__state.statusCode, headers })
    }
    // 真正进入流式：建立管道，把后续 write 直接推给客户端
    const encoder = new TextEncoder()
    const { readable, writable } = new TransformStream()
    const writer = writable.getWriter()
    res.__state.controller = {
      enqueue: (text) => { if (!res.__state.destroyed) writer.write(encoder.encode(text)).catch(() => {}) },
      close: () => { writer.close().catch(() => {}) }
    }
    // 把 flushHeaders 之前已写入的内容（若）推入流，然后等 handler 完成自动 close
    const preChunks = res.__state.chunks.splice(0)
    ;(async () => {
      for (const c of preChunks) await writer.write(encoder.encode(c)).catch(() => {})
      await handlerPromise
      try { await writer.close() } catch (_) {}
    })()
    const headers = { ...res.__state.headers, 'cache-control': 'no-cache, no-transform' }
    if (!headers['content-type']) headers['content-type'] = 'text/event-stream; charset=utf-8'
    return new Response(readable, { status: res.__state.statusCode, headers })
  }

  // 普通请求：等 handler 完成
  try {
    await runHandlers(matched.entry, req, res)
  } catch (e) {
    console.error('[api error]', e)
    if (res.__state.ended) {
      // 已写出部分内容，无法再改状态码
      return new Response(res.__state.chunks.join(''), { status: res.__state.statusCode, headers: res.__state.headers })
    }
    return jsonResponse(500, {}, JSON.stringify({ error: e.message || '服务器内部错误' }))
  }
  const headers = { ...res.__state.headers }
  if (!headers['content-type']) headers['content-type'] = 'application/json; charset=utf-8'
  return new Response(res.__state.chunks.join(''), { status: res.__state.statusCode, headers })
}
