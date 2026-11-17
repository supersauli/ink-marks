// 极简 Express Router 兼容层：让 server/src/routes/*.js 在 Workers 里原样运行。
// 只实现项目实际用到的 API：Router 的 get/post/patch/delete/put，
// req 的 params/body/query/headers/method/path，res 的 status/json/send/setHeader/end/write。

export function Router() {
  const routes = []
  const router = (req, res, next) => {
    // 支持作为中间件嵌套（当前项目路由都挂在 /api 根，用不到，保留占位）
    return next?.()
  }
  const add = (method) => (path, ...handlers) => {
    routes.push({ method: method.toUpperCase(), path, handlers })
    return router
  }
  router.get = add('get')
  router.post = add('post')
  router.patch = add('patch')
  router.put = add('put')
  router.delete = add('delete')
  router.use = () => router
  router.__routes = routes
  return router
}

// 把 '/chapters/:id' 编译成正则，返回参数名数组
function compilePath(path) {
  const names = []
  // 去掉首尾斜杠后再分段，避免生成 // 导致匹配失败
  const clean = path.replace(/^\/+|\/+$/g, '')
  const pattern = clean
    ? clean.split('/').map((seg) => {
        if (seg.startsWith(':')) {
          names.push(seg.slice(1))
          return '([^/]+)'
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      }).join('/')
    : ''
  return { re: new RegExp('^/' + pattern + '/?$'), names }
}

const compiledCache = new WeakMap()
function getCompiled(entry) {
  let c = compiledCache.get(entry)
  if (!c) {
    // 用带前缀的完整路径编译，而非路由文件里的相对路径
    c = compilePath(entry.path)
    compiledCache.set(entry, c)
  }
  return c
}

// 收集所有 router 的路由（递归展开 use 挂载前缀）
export function collectRoutes(routers) {
  const all = []
  for (const { prefix, router } of routers) {
    for (const route of router.__routes || []) {
      const full = (prefix + route.path).replace(/\/+/g, '/') || '/'
      all.push({ method: route.method, path: full, handlers: route.handlers, route })
    }
  }
  return all
}

// 在路由表中匹配请求，返回 { route, params } 或 null
export function matchRoute(all, method, pathname) {
  for (const entry of all) {
    if (entry.method !== method) continue
    const c = getCompiled(entry)
    const m = c.re.exec(pathname)
    if (m) {
      const params = {}
      c.names.forEach((name, i) => { params[name] = decodeURIComponent(m[i + 1]) })
      return { entry, params }
    }
  }
  return null
}
