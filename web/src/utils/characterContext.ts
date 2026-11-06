import type { ChapterMeta, Character, CharacterStage, OverviewData } from '../api/types'

const CN_DIGITS: Record<string, number> = {
  零: 0,
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9
}

function chineseNumber(text: string): number | null {
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
export function parseChapterOrdinal(text: string | null | undefined): number | null {
  const value = String(text ?? '')
  const arabic = value.match(/第\s*([0-9]+)(?:\s*[-~至到]\s*[0-9]+)?\s*[章回节]/)
  if (arabic) return Number(arabic[1])
  const numeric = value.match(/([0-9]+)\s*[-~至到]\s*[0-9]+\s*[章回节]/)
  if (numeric) return Number(numeric[1])
  const chinese = value.match(/第\s*([零一二三四五六七八九十百]+)(?:\s*[-~至到]\s*[零一二三四五六七八九十百]+)?\s*[章回节]/)
  if (chinese) return chineseNumber(chinese[1])
  return null
}

export type StageSource = 'chapter' | 'current' | 'none'

export interface StageResolution {
  stage: CharacterStage | null
  source: StageSource
  /** 为什么取这个阶段，用一句话说明 */
  note: string
}

export interface ContextField {
  label: string
  value: string
}

export interface CharacterContextEntry {
  id: string
  name: string
  role: string
  /** 本章是否已登场 */
  debuted: boolean
  stageName: string
  stageNote: string
  /** 角色卡上单独标记的「当前阶段」，用于对比 */
  currentStageName: string
  /** 这个人实际会发给模型的字段（含该章属性与随身物品） */
  fields: ContextField[]
  /** 上面字段拼成的文本，就是提示词里的那一段 */
  text: string
}

export interface CharacterContextResult {
  /** 直接塞进提示词的角色设定文本 */
  text: string
  included: CharacterContextEntry[]
  excluded: CharacterContextEntry[]
  warnings: string[]
  /** 例如「第 12 章 被封锁的工厂」，没有章节时为空 */
  chapterLabel: string
  chapterIndex: number
}

interface Options {
  /** 背景最多保留多少字 */
  backgroundLimit?: number
  /** 外貌最多保留多少字 */
  appearanceLimit?: number
  /** 备注最多保留多少字 */
  notesLimit?: number
  /** 生成文本的最大长度，超出会截断并提示 */
  maxLength?: number
  /** 人物总览数据：有的话会带上「该章属性 / 随身物品」 */
  overview?: OverviewData | null
}

function chapterPositions(chapters: ChapterMeta[]) {
  return new Map(chapters.map((chapter, index) => [chapter.id, index]))
}

function stagePosition(stage: CharacterStage, positions: Map<string, number>) {
  if (stage.chapterId && positions.has(stage.chapterId)) return positions.get(stage.chapterId) as number
  const ordinal = parseChapterOrdinal(stage.period)
  return ordinal ? Math.max(0, ordinal - 1) : 0
}

export function resolveDebutIndex(chapters: ChapterMeta[], character: Character) {
  const positions = chapterPositions(chapters)
  if (character.debutChapterId && positions.has(character.debutChapterId)) {
    return positions.get(character.debutChapterId) as number
  }
  const ordinal = parseChapterOrdinal(character.debut)
  return ordinal ? Math.max(0, ordinal - 1) : 0
}

/**
 * 取某角色「在第 chapterIndex 章时」生效的性格阶段。
 * chapterIndex < 0 表示当前没有打开章节，退回角色卡上的「当前阶段」。
 */
export function resolveStageAt(
  chapters: ChapterMeta[],
  character: Character,
  chapterIndex: number
): StageResolution {
  if (!character.stages.length) {
    return { stage: null, source: 'none', note: '还没有性格阶段' }
  }

  if (chapterIndex < 0) {
    const current = character.stages.find((stage) => stage.isCurrent) ?? character.stages[0]
    return { stage: current, source: 'current', note: '没有打开章节，使用角色卡的当前阶段' }
  }

  const positions = chapterPositions(chapters)
  const ordered = character.stages
    .map((stage) => ({ stage, index: stagePosition(stage, positions), order: stage.sortOrder }))
    .sort((a, b) => a.index - b.index || a.order - b.order)

  const available = ordered.filter((entry) => entry.index <= chapterIndex)
  const picked = available[available.length - 1]
  if (picked) {
    const anchored = Boolean(picked.stage.chapterId) || parseChapterOrdinal(picked.stage.period) !== null
    if (!anchored) {
      return {
        stage: picked.stage,
        source: 'chapter',
        note: ordered.length > 1 ? '早于下一个阶段，沿用这一阶段' : '没有按章节拆分阶段，全书通用'
      }
    }
    return { stage: picked.stage, source: 'chapter', note: `从第 ${picked.index + 1} 章起生效` }
  }

  const next = ordered[0]
  return {
    stage: null,
    source: 'none',
    note: next ? `最早阶段「${next.stage.name}」从第 ${next.index + 1} 章起才生效` : '没有可用阶段'
  }
}

function clip(value: string, limit: number) {
  const text = String(value ?? '').trim()
  if (!text) return ''
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

function overviewCell(overview: OverviewData | null | undefined, characterId: string, chapterId: string | null) {
  if (!overview || !chapterId) return null
  const index = overview.chapters.findIndex((chapter) => chapter.id === chapterId)
  if (index < 0) return null
  const entry = overview.characters.find((character) => character.id === characterId)
  return entry?.cells[index] ?? null
}

function buildFields(
  character: Character,
  stage: CharacterStage | null,
  options: {
    backgroundLimit: number
    appearanceLimit: number
    notesLimit: number
    overview?: OverviewData | null
    chapterId: string | null
  }
): ContextField[] {
  const fields: ContextField[] = []
  const push = (label: string, value: string) => {
    const text = String(value ?? '').trim()
    if (text) fields.push({ label, value: text })
  }

  push('年龄', character.age)
  push('外貌', clip(character.appearance, options.appearanceLimit))
  push('背景', clip(character.background, options.backgroundLimit))
  push('关键关系', character.relations)
  push('目标', character.goal)

  if (stage) {
    push('该章阶段', `${stage.name}${stage.period ? `（${stage.period}）` : ''}`)
    push('性格', stage.traits)
    push('内心动机', stage.inner)
    push('行为表现', stage.behavior)
    push('语言习惯', stage.speech)
    push('关键事件', stage.event)
  }

  const cell = overviewCell(options.overview, character.id, options.chapterId)
  if (cell?.debuted) {
    const attributes = cell.attributes
      .filter((attr) => attr.value !== null && String(attr.value).trim() !== '')
      .map((attr) => `${attr.label} ${attr.value}${attr.unit ?? ''}`)
    if (attributes.length) push('该章属性', attributes.join('、'))
    const items = cell.items.map((item) => `${item.name}（${item.status}）`)
    if (items.length) push('随身物品', items.join('、'))
    const skills = cell.skills.map((skill) => `${skill.name}${skill.level ? ` ${skill.level}` : ''}`)
    if (skills.length) push('该章可用技能', skills.join('、'))
  }

  push('备注', clip(character.notes, options.notesLimit))
  return fields
}

/**
 * 按「当前章节」解析角色设定：只保留该章已登场的角色，每人取该章生效的阶段，
 * 并尽量带上该章的属性、技能与随身物品。
 */
export function buildCharacterContext(
  characters: Character[],
  chapters: ChapterMeta[],
  chapterId: string | null,
  options: Options = {}
): CharacterContextResult {
  const appearanceLimit = options.appearanceLimit ?? 260
  const backgroundLimit = options.backgroundLimit ?? 420
  const notesLimit = options.notesLimit ?? 200
  const maxLength = options.maxLength ?? 6000
  const positions = chapterPositions(chapters)
  const chapterIndex = chapterId && positions.has(chapterId) ? (positions.get(chapterId) as number) : -1
  const chapter = chapterIndex >= 0 ? chapters[chapterIndex] : null
  const chapterTitle = chapter?.title?.trim() ?? ''
  const chapterLabel = chapter
    ? chapterTitle.startsWith('第')
      ? chapterTitle
      : `第 ${chapterIndex + 1} 章 ${chapterTitle}`.trim()
    : ''

  const included: CharacterContextEntry[] = []
  const excluded: CharacterContextEntry[] = []
  const warnings: string[] = []
  const blocks: string[] = []

  for (const character of characters) {
    const currentStage = character.stages.find((stage) => stage.isCurrent) ?? character.stages[0] ?? null
    const debutIndex = resolveDebutIndex(chapters, character)
    const resolution = resolveStageAt(chapters, character, chapterIndex)

    const entry: CharacterContextEntry = {
      id: character.id,
      name: character.name || '未命名角色',
      role: character.role,
      debuted: chapterIndex < 0 || chapterIndex >= debutIndex,
      stageName: resolution.stage?.name ?? '（无可用阶段）',
      stageNote: resolution.note,
      currentStageName: currentStage?.name ?? '',
      fields: [],
      text: ''
    }

    if (!entry.debuted) {
      excluded.push(entry)
      continue
    }

    if (!resolution.stage) {
      warnings.push(`${entry.name}：这一章没有可用的性格阶段（${resolution.note}）`)
    } else if (resolution.source === 'chapter' && chapterIndex >= 0 && currentStage && currentStage.id !== resolution.stage.id) {
      entry.stageNote = `${resolution.note}；角色卡当前标的是「${currentStage.name}」`
    }

    const fields = buildFields(character, resolution.stage, {
      appearanceLimit,
      backgroundLimit,
      notesLimit,
      overview: options.overview,
      chapterId
    })
    const head = `【${entry.name}】${entry.role ? `（${entry.role}）` : ''}${character.alias ? ` 别名：${character.alias}` : ''}`
    entry.fields = fields
    entry.text = [head, ...fields.map((field) => `${field.label}：${field.value}`)].join('\n')

    included.push(entry)
    blocks.push(entry.text)
  }

  let text = blocks.join('\n\n')
  if (chapterLabel) {
    const header = `（以下角色设定按${chapterLabel}解析：性格只取该章生效的阶段，已带上该章的属性、技能与随身物品；本章尚未登场的角色已略去）`
    text = text ? `${header}\n\n${text}` : ''
  }
  if (text.length > maxLength) {
    text = `${text.slice(0, maxLength)}\n\n……（角色设定过长，已截断）`
    warnings.push(`角色设定超过 ${maxLength} 字，已截断；被截断的角色不会完整出现在上下文里`)
  }

  return { text, included, excluded, warnings, chapterLabel, chapterIndex }
}
