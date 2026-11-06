export function countChars(text: string): number {
  return text.replace(/\s+/g, '').length
}

export function formatTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  const sameYear = date.getFullYear() === now.getFullYear()
  const options: Intl.DateTimeFormatOptions = sameYear
    ? { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
    : { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }
  return date.toLocaleString('zh-CN', options)
}

export function formatRelative(iso: string | null | undefined): string {
  if (!iso) return ''
  const time = new Date(iso).getTime()
  if (Number.isNaN(time)) return ''
  const diff = Date.now() - time
  const minute = 60 * 1000
  if (diff < minute) return '刚刚'
  if (diff < 60 * minute) return `${Math.floor(diff / minute)} 分钟前`
  if (diff < 24 * 60 * minute) return `${Math.floor(diff / (60 * minute))} 小时前`
  return formatTime(iso)
}

export const statusLabels: Record<string, string> = {
  outline: '仅大纲',
  writing: '写作中',
  done: '已完成'
}

export const scopeLabels: Record<string, string> = {
  block: '段落改写',
  'chapter-summary': '章节大纲修改',
  outline: '大纲修改',
  append: 'AI 续写'
}

export const sourceLabels: Record<string, string> = {
  auto: '自动快照',
  manual: '手动保存',
  ai: 'AI 修改前',
  restore: '恢复前备份'
}

export const itemStatusLabels: Record<string, string> = {
  intact: '完好',
  lost: '遗失',
  sealed: '封存',
  destroyed: '已损毁',
  unknown: '下落不明'
}

export const itemStatusOptions = [
  { value: 'intact', label: '完好' },
  { value: 'lost', label: '遗失' },
  { value: 'sealed', label: '封存' },
  { value: 'destroyed', label: '已损毁' },
  { value: 'unknown', label: '下落不明' }
]

export const templateKindLabels: Record<string, string> = {
  character: '人物属性卡',
  item: '物品属性卡'
}

export const fieldTypeLabels: Record<string, string> = {
  text: '文本',
  number: '数值',
  longtext: '长文本',
  select: '选项'
}

