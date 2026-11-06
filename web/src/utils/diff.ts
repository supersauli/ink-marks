export interface DiffPart {
  type: 'same' | 'add' | 'del'
  text: string
}

const MAX_CELLS = 1_200_000

function tokenize(text: string): string[] {
  return text.match(/\s+|[\u3400-\u9fff\uf900-\ufaff]|[A-Za-z0-9]+|[\s\S]/g) ?? []
}

function lineTokens(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+/g) ?? []
}

function merge(parts: DiffPart[]): DiffPart[] {
  const result: DiffPart[] = []
  for (const part of parts) {
    if (!part.text) continue
    const last = result[result.length - 1]
    if (last && last.type === part.type) last.text += part.text
    else result.push({ ...part })
  }
  return result
}

/**
 * 轻量文本差异：短文本按字/词级别，长文本按行级别；过大时退化为整段替换。
 */
export function diffText(before: string, after: string): DiffPart[] {
  if (before === after) return before ? [{ type: 'same', text: before }] : []

  const useLines = before.length + after.length > 2400
  const a = useLines ? lineTokens(before) : tokenize(before)
  const b = useLines ? lineTokens(after) : tokenize(after)
  if (a.length * b.length > MAX_CELLS) {
    return [
      { type: 'del', text: before },
      { type: 'add', text: after }
    ]
  }

  const n = a.length
  const m = b.length
  const dp: Uint32Array[] = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i -= 1) {
    const row = dp[i]
    const next = dp[i + 1]
    for (let j = m - 1; j >= 0; j -= 1) {
      row[j] = a[i] === b[j] ? next[j + 1] + 1 : next[j] >= row[j + 1] ? next[j] : row[j + 1]
    }
  }

  const parts: DiffPart[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      parts.push({ type: 'same', text: a[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      parts.push({ type: 'del', text: a[i] })
      i += 1
    } else {
      parts.push({ type: 'add', text: b[j] })
      j += 1
    }
  }
  while (i < n) {
    parts.push({ type: 'del', text: a[i] })
    i += 1
  }
  while (j < m) {
    parts.push({ type: 'add', text: b[j] })
    j += 1
  }
  return merge(parts)
}
