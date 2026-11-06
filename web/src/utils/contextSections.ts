import type { WritingContext } from './prompts'

export interface ContextSection {
  key: string
  label: string
  text: string
  hint?: string
}

/**
 * 把即将发送的上下文拆成可切换的页签。
 * 顺序与生成提示词时的顺序一致，没有勾选 / 没有内容的段落不会出现。
 */
export function buildContextSections(context: WritingContext): ContextSection[] {
  const sections: ContextSection[] = []
  if (context.charactersText) {
    sections.push({ key: 'characters', label: '角色设定', text: context.charactersText })
  }
  if (context.outlineText) {
    sections.push({ key: 'outline', label: '全书大纲', text: context.outlineText })
  }
  if (context.chapterSummary) {
    sections.push({ key: 'summary', label: '章节大纲', text: context.chapterSummary })
  }
  if (context.bodyText) {
    sections.push({ key: 'body', label: '本章正文', text: context.bodyText })
  }
  if (context.selectionText) {
    sections.push({ key: 'selection', label: '选中文字', text: context.selectionText })
  }
  if (context.beforeText) {
    sections.push({ key: 'before', label: '前文', text: context.beforeText })
  }
  if (context.afterText) {
    sections.push({ key: 'after', label: '后文', text: context.afterText })
  }
  return sections
}

export function sectionCharCount(text: string) {
  return text.replace(/\s+/g, '').length
}
