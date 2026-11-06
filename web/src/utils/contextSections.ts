import type { WritingContext } from './prompts'

export interface ContextSection {
  key: string
  label: string
  text: string
  /** 不传视为启用；false = 灰色页签，位置保留但不会发送给模型 */
  enabled?: boolean
  /** 未启用的原因，显示在预览区顶部 */
  reason?: string
  hint?: string
}

const SECTION_DEFS: { key: string; label: string; field: keyof WritingContext }[] = [
  { key: 'characters', label: '角色设定', field: 'charactersText' },
  { key: 'outline', label: '全书大纲', field: 'outlineText' },
  { key: 'summary', label: '章节大纲', field: 'chapterSummary' },
  { key: 'body', label: '本章正文', field: 'bodyText' },
  { key: 'selection', label: '选中文字', field: 'selectionText' },
  { key: 'before', label: '前文', field: 'beforeText' },
  { key: 'after', label: '后文', field: 'afterText' }
]

/**
 * 只拆出真正会发送的段（顺序与提示词一致）。对话栏用这个：勾了什么就有什么。
 */
export function buildContextSections(context: WritingContext): ContextSection[] {
  return SECTION_DEFS
    .filter((def) => Boolean(context[def.field]))
    .map((def) => ({ key: def.key, label: def.label, text: context[def.field] ?? '' }))
}

/**
 * 精修 / 续写弹窗用：按场景列出所有可能出现的页签，位置和顺序固定。
 * 取消勾选或没内容时只把页签置灰（enabled=false），不删除，
 * 这样用户当前选中的页签不会突然消失、也不会被自动跳回第一个。
 * full 是「所有开关都打开」时的上下文，用来预览「勾上会发什么」。
 */
export function buildStableContextSections(options: {
  keys: string[]
  /** 当前真正会发送的上下文：启用页签展示它的原文 */
  actual: WritingContext
  /** 所有开关都打开时的上下文：灰色页签用来预览「勾上会发什么」 */
  full: WritingContext
  enabledKeys: string[]
  instruction?: { text: string; hint?: string }
  reasons?: Record<string, string>
}): ContextSection[] {
  const enabled = new Set(options.enabledKeys)
  const sections: ContextSection[] = []

  for (const key of options.keys) {
    if (key === 'instruction') {
      const text = options.instruction?.text ?? ''
      const checked = enabled.has(key)
      sections.push({
        key,
        label: '修改要求',
        text,
        enabled: checked && Boolean(text.trim()),
        reason: checked
          ? (text.trim() ? undefined : '还没有填写修改要求')
          : (options.reasons?.[key] ?? '未勾选，应用后不会留痕'),
        hint: options.instruction?.hint
      })
      continue
    }

    const def = SECTION_DEFS.find((item) => item.key === key)
    if (!def) continue
    const checked = enabled.has(key)
    // 亮着的页签显示真正会发的原文；灰页签显示「勾上之后会发什么」
    const text = (checked ? options.actual[def.field] : options.full[def.field]) ?? ''
    const hasText = Boolean(text.trim())
    sections.push({
      key,
      label: def.label,
      text,
      enabled: checked && hasText,
      reason: checked
        ? (hasText ? undefined : '暂无内容，这一项不会发送')
        : (options.reasons?.[key] ?? '未勾选，不会发送给模型')
    })
  }

  return sections
}

export function sectionCharCount(text: string) {
  return text.replace(/\s+/g, '').length
}
