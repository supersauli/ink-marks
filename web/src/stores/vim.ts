import { defineStore } from 'pinia'
import { ref } from 'vue'

const VIM_EDITORS_KEY = 'moji:vim-editors'

function loadEditorStates(): Record<string, boolean> {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIM_EDITORS_KEY) ?? '{}')
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, boolean>
    }
  } catch {
    /* 忽略损坏的本地数据 */
  }
  return {}
}

/** 全局默认：新输入框是否默认开启 Vim。 */
const VIM_DEFAULT_KEY = 'moji:vim-default'
function loadDefault(): boolean {
  return localStorage.getItem(VIM_DEFAULT_KEY) === '1'
}

export const useVimStore = defineStore('vim', () => {
  const editors = ref<Record<string, boolean>>(loadEditorStates())
  const defaultEnabled = ref<boolean>(loadDefault())

  function persist() {
    localStorage.setItem(VIM_EDITORS_KEY, JSON.stringify(editors.value))
  }

  /** 读取某个输入框的 Vim 开关；未记录时回落到全局默认。 */
  function isEnabled(key: string): boolean {
    return editors.value[key] ?? defaultEnabled.value
  }

  function setEnabled(key: string, enabled: boolean) {
    editors.value = { ...editors.value, [key]: enabled }
    persist()
  }

  function setDefault(enabled: boolean) {
    defaultEnabled.value = enabled
    localStorage.setItem(VIM_DEFAULT_KEY, enabled ? '1' : '0')
  }

  return { editors, defaultEnabled, isEnabled, setEnabled, setDefault }
})

/** 编辑区 key 约定：标题 / 大纲 / 段落。 */
export const vimKey = {
  chapterTitle: 'chapter:title',
  chapterSummary: 'chapter:summary',
  outlineTitle: 'outline:title',
  outlineContent: 'outline:content',
  styleGuide: 'project:style-guide',
  block: (blockId: string) => `block:${blockId}`
}
