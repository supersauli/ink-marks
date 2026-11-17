import { int } from './util.js'

// 常见模型的上下文窗口预设。0 表示未知，此时前端不显示占用进度条。
const CONTEXT_PRESETS = [
  [/deepseek/i, 128000],
  [/gpt-4o|gpt-4\.1|gpt-5|o1|o3|o4/i, 128000],
  [/gpt-3\.5/i, 16385],
  [/moonshot|kimi/i, 128000],
  [/glm-4|glm-5/i, 128000],
  [/claude/i, 200000],
  [/qwen/i, 32000],
  [/llama\s*3\.1|llama3\.1|llama\s*3\.2|llama3\.2|llama\s*3\.3|llama3\.3/i, 128000],
  [/llama/i, 8192],
  [/mistral|mixtral/i, 32000],
  [/gemma/i, 8192]
]

export function guessContextLength(name) {
  const text = String(name ?? '').trim()
  if (!text) return 0
  // 模型名里直接写了 8k / 32k / 128k 时优先采用
  const explicit = text.match(/(\d+(?:\.\d+)?)\s*[kK]\b/)
  if (explicit) {
    const size = Math.round(Number(explicit[1]) * 1024)
    if (size >= 1024 && size <= 2000000) return size
  }
  for (const [pattern, size] of CONTEXT_PRESETS) {
    if (pattern.test(text)) return size
  }
  return 0
}

// 估算兜底：CJK 约 1 字 1 token，其余按 4 字符 1 token，再给每条消息加包装开销
export function approxTokens(text) {
  const value = String(text ?? '')
  if (!value) return 0
  const cjk = (value.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/g) ?? []).length
  return Math.max(1, Math.round(cjk + (value.length - cjk) / 4))
}

export function estimateUsage(messages = [], completionText = '') {
  let promptTokens = 0
  for (const message of messages) promptTokens += approxTokens(message?.content) + 4
  const completionTokens = completionText ? approxTokens(completionText) : 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    cacheHitTokens: null,
    cacheMissTokens: null,
    cacheHitRate: null,
    estimated: true
  }
}

function firstNumber(...values) {
  for (const value of values) {
    if (value === null || value === undefined || value === '') continue
    const number = Number(value)
    if (Number.isFinite(number) && number >= 0) return Math.round(number)
  }
  return null
}

// 把 DeepSeek / OpenAI / Anthropic 风格的 usage 统一成前端需要的结构
export function normalizeUsage(raw, { messages = [], completionText = '' } = {}) {
  if (!raw || typeof raw !== 'object') return estimateUsage(messages, completionText)
  const details = raw.prompt_tokens_details ?? raw.input_tokens_details ?? {}
  const promptTokens = firstNumber(raw.prompt_tokens, raw.input_tokens, raw.promptTokens)
  const completionTokens = firstNumber(raw.completion_tokens, raw.output_tokens, raw.completionTokens)
  const cacheHitTokens = firstNumber(
    raw.prompt_cache_hit_tokens,
    details.cached_tokens,
    raw.cache_read_input_tokens,
    raw.cached_tokens
  )
  const cacheMissTokens = firstNumber(raw.prompt_cache_miss_tokens, raw.cache_creation_input_tokens)
  if (promptTokens === null && completionTokens === null) return estimateUsage(messages, completionText)

  const prompt = promptTokens ?? (cacheHitTokens ?? 0) + (cacheMissTokens ?? 0)
  const completion = completionTokens ?? approxTokens(completionText)
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: firstNumber(raw.total_tokens, raw.totalTokens) ?? prompt + completion,
    cacheHitTokens,
    cacheMissTokens,
    cacheHitRate: cacheHitTokens !== null && prompt > 0 ? Math.min(1, cacheHitTokens / prompt) : null,
    estimated: false
  }
}

// 上下文占用：本次送进去的 prompt 就是窗口里被占掉的部分；剩余量再扣掉为输出预留的 max_tokens
export function attachContext(usage, contextLength, reservedTokens = 0) {
  const limit = Math.max(0, int(contextLength, 0))
  const used = usage.promptTokens
  const remaining = limit ? Math.max(0, limit - used - Math.max(0, int(reservedTokens, 0))) : null
  return {
    ...usage,
    contextLength: limit,
    contextUsed: used,
    contextRemaining: remaining,
    contextRate: limit ? Math.min(1, used / limit) : null
  }
}

export function calcTokensPerSecond(completionTokens, durationMs) {
  if (!durationMs || durationMs <= 0 || !completionTokens || completionTokens <= 0) return null
  return Math.round((completionTokens / (durationMs / 1000)) * 10) / 10
}

// 生成速率：输出 token ÷ 从请求发出到流结束的耗时（含首字等待）
export function attachTiming(usage, { durationMs = 0, firstTokenMs = null } = {}) {
  const duration = Math.max(0, Math.round(durationMs))
  return {
    ...usage,
    durationMs: duration,
    firstTokenMs: firstTokenMs === null ? null : Math.max(0, Math.round(firstTokenMs)),
    tokensPerSecond: calcTokensPerSecond(usage.completionTokens, duration)
  }
}

export function mapUsageLog(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    scene: row.scene,
    modelName: row.model_name,
    providerName: row.provider_name,
    promptTokens: row.prompt_tokens,
    completionTokens: row.completion_tokens,
    totalTokens: row.total_tokens,
    cacheHitTokens: row.cache_hit_tokens,
    cacheMissTokens: row.cache_miss_tokens,
    cacheHitRate: row.cache_hit_rate,
    contextLength: row.context_length,
    contextUsed: row.context_used,
    contextRate: row.context_rate,
    durationMs: row.duration_ms ?? 0,
    firstTokenMs: row.first_token_ms ?? null,
    tokensPerSecond: calcTokensPerSecond(row.completion_tokens, row.duration_ms),
    estimated: row.estimated === 1,
    createdAt: row.created_at
  }
}
