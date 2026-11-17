// 公网部署安全工具：API Key 脱敏 + 访问令牌认证。
// 设计原则：本地不配置任何环境变量时，行为与改造前完全一致。

// 前端编辑服务商时，未改动 Key 会原样回传这个掩码值，服务端据此保留原 Key。
export const KEY_MASK = '••••••••'

export function maskKey(apiKey) {
  if (!apiKey) return ''
  return KEY_MASK
}

// 判断前端回传的 key 是否为「未修改」的掩码占位符
export function isKeyMask(value) {
  return typeof value === 'string' && value.trim() === KEY_MASK
}

// 访问令牌：从环境变量读取。未设置时不启用认证（本地使用零影响）。
function configuredToken() {
  const token = process.env.NOVEL_ACCESS_TOKEN
  return typeof token === 'string' && token.length > 0 ? token : null
}

export function authEnabled() {
  return configuredToken() !== null
}

// 从请求中提取令牌：优先 Authorization: Bearer xxx，其次 ?token= 与 Cookie: novel_token=
function extractToken(req) {
  const auth = req.headers?.authorization
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, '').trim()
  const query = req.query?.token
  if (typeof query === 'string' && query) return query
  const cookie = req.headers?.cookie || ''
  const m = cookie.match(/(?:^|;\s*)novel_token=([^;]+)/)
  if (m) return decodeURIComponent(m[1])
  return null
}

// 生成 Express 中间件。返回 true 表示通过，false 表示拒绝（由调用方发 401）。
export function checkAuth(req) {
  const expected = configuredToken()
  if (!expected) return true
  const got = extractToken(req)
  if (!got) return false
  // 简单定时安全比较，避免时序侧信道
  if (got.length !== expected.length) return false
  let diff = 0
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0
}
