const CN_DIGITS = { 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function chineseNumber(text) {
  if (!text) return null
  if (text === '十') return 10
  if (text.includes('百')) {
    const [hundreds, rest] = text.split('百')
    const h = hundreds ? CN_DIGITS[hundreds] ?? 0 : 1
    return h * 100 + (rest ? chineseNumber(rest) ?? 0 : 0)
  }
  if (text.includes('十')) {
    const [tens, ones] = text.split('十')
    const t = tens ? CN_DIGITS[tens] ?? 0 : 1
    const o = ones ? CN_DIGITS[ones] ?? 0 : 0
    return t * 10 + o
  }
  return CN_DIGITS[text] ?? null
}

/** 从「第 3 章」「第三章」「1-5 章」里解析出 1 开始的章节序号 */
export function parseChapterOrdinal(period) {
  const text = String(period ?? '')
  const arabic = text.match(/第\s*([0-9]+)(?:\s*[-~至到]\s*[0-9]+)?\s*[章回节]/)
  if (arabic) return Number(arabic[1])
  const numeric = text.match(/([0-9]+)\s*[-~至到]\s*[0-9]+\s*[章回节]/)
  if (numeric) return Number(numeric[1])
  const chinese = text.match(/第\s*([零一二三四五六七八九十百]+)(?:\s*[-~至到]\s*[零一二三四五六七八九十百]+)?\s*[章回节]/)
  if (chinese) return chineseNumber(chinese[1])
  return null
}

/**
 * 生成「章节 id / 时间文字」到章节列索引的解析器。
 * chapter_id 优先；没有关联章节时按文字里的序号匹配；超出当前章节数时不落到最后一列。
 */
export function createChapterResolver(chapters) {
  const positionById = new Map(chapters.map((chapter, index) => [chapter.id, index]))
  return (chapterId, period) => {
    if (chapterId && positionById.has(chapterId)) return positionById.get(chapterId)
    const ordinal = parseChapterOrdinal(period)
    if (ordinal) return Math.max(0, ordinal - 1)
    return 0
  }
}
