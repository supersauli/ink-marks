import { parseObj } from './util.js'

export function resolveEndpoint(baseUrl, endpoint) {
  let base = String(baseUrl ?? '')
    .trim()
    .replace(/\/+$/, '')
  if (!base) throw new Error('服务商 Base URL 为空')
  if (base.endsWith('/chat/completions')) {
    base = base.slice(0, -'/chat/completions'.length)
  } else if (base.endsWith('/models')) {
    base = base.slice(0, -'/models'.length)
  }
  return `${base}/${endpoint}`
}

export function buildHeaders(provider, apiKey) {
  const headers = { 'Content-Type': 'application/json' }
  const key = apiKey ?? provider?.api_key
  if (key) headers.Authorization = `Bearer ${key}`
  const extra = parseObj(provider?.extra_headers)
  for (const [name, value] of Object.entries(extra)) {
    if (typeof value === 'string' && name.trim()) headers[name.trim()] = value
  }
  return headers
}

export async function fetchRemoteModels(provider, apiKey) {
  const url = resolveEndpoint(provider.base_url, 'models')
  const response = await fetch(url, {
    method: 'GET',
    headers: buildHeaders(provider, apiKey),
    signal: AbortSignal.timeout(25000)
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`服务端返回 ${response.status}：${text.slice(0, 300)}`)
  }
  let data
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('返回内容不是有效的 JSON')
  }
  const raw = Array.isArray(data?.data) ? data.data : Array.isArray(data?.models) ? data.models : []
  const ids = raw
    .map((item) => (typeof item === 'string' ? item : item?.id || item?.name))
    .filter(Boolean)
    .map((id) => String(id))
  return ids
}
