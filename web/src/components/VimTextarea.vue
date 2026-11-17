<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Compartment, EditorState } from '@codemirror/state'
import {
  EditorView,
  keymap,
  drawSelection,
  placeholder as cmPlaceholder,
  type ViewUpdate
} from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { vim, getCM, type CodeMirror } from '@replit/codemirror-vim'

interface SelectionPayload {
  start: number
  end: number
  text: string
  clientX?: number
  clientY?: number
  source: 'mouse' | 'keyboard' | 'vim'
}

const props = withDefaults(
  defineProps<{
    modelValue: string
    placeholder?: string
    vimEnabled?: boolean
    multiline?: boolean
    ariaLabel?: string
    autofocus?: boolean
    showToggle?: boolean
    selectionHandler?: (payload: SelectionPayload) => void
    blurHandler?: () => void
  }>(),
  {
    placeholder: '',
    vimEnabled: false,
    multiline: true,
    ariaLabel: '',
    autofocus: false,
    showToggle: true
  }
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
  'update:vimEnabled': [value: boolean]
}>()

const host = ref<HTMLDivElement | null>(null)
const currentMode = ref('')
let view: EditorView | null = null
let boundCm: CodeMirror | null = null

const vimCompartment = new Compartment()
const placeholderCompartment = new Compartment()

const toggleClass = computed(() => ({
  'vim-on': props.vimEnabled,
  'mode-insert': props.vimEnabled && currentMode.value === 'INSERT',
  'mode-visual': props.vimEnabled && currentMode.value.startsWith('V')
}))
const toggleLabel = computed(() => (props.vimEnabled ? currentMode.value || 'NORMAL' : 'OFF'))

function buildTheme(multiline: boolean) {
  return EditorView.theme(
    {
      '&': {
        height: 'auto',
        backgroundColor: 'transparent',
        color: 'var(--editor-color, var(--ink))',
        fontSize: 'var(--editor-font-size, 17px)'
      },
      '&.cm-focused': { outline: 'none' },
      '.cm-scroller': {
        fontFamily: 'var(--editor-font-family, var(--font-serif))',
        lineHeight: 'var(--editor-line-height, 1.95)',
        letterSpacing: 'var(--editor-letter-spacing, normal)',
        overflow: multiline ? 'visible' : 'hidden'
      },
      '.cm-content': {
        caretColor: 'var(--accent)',
        padding: 'var(--editor-padding, 3px 62px 3px 6px)',
        minHeight: 'var(--editor-min-height, 30px)',
        fontWeight: 'var(--editor-font-weight, normal)'
      },
      '.cm-line': { padding: '0' },
      '& .cm-line:first-child': { paddingLeft: 'var(--editor-indent, 0)' },
      '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--accent)' },
      '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': {
        backgroundColor: 'var(--accent-soft)'
      },
      '.cm-placeholder': { color: 'var(--muted)', opacity: '0.65' },
      '.cm-gutters': { display: 'none' }
    },
    { dark: false }
  )
}

// 单行模式：任何引入换行的编辑都拒绝（Enter、vim 的 o/O 等）
const noNewline = EditorState.transactionFilter.of((tr) => {
  if (props.multiline || !tr.docChanged) return tr
  // 返回空事务数组即可取消这次变更；单行标题里禁止任何换行输入
  return tr.newDoc.toString().includes('\n') ? [] : tr
})

function readMode() {
  if (!props.vimEnabled) {
    currentMode.value = ''
    return
  }
  const cm = view ? getCM(view) : null
  const st = cm?.state.vim
  if (!st) {
    currentMode.value = 'NORMAL'
    return
  }
  if (st.insertMode) currentMode.value = 'INSERT'
  else if (st.visualMode)
    currentMode.value = st.visualBlock ? 'V-BLOCK' : st.visualLine ? 'V-LINE' : 'VISUAL'
  else currentMode.value = 'NORMAL'
}

function onVimEvent() {
  readMode()
}

function bindVim() {
  if (!view) return
  const cm = getCM(view)
  if (!cm || cm === boundCm) return
  boundCm = cm
  cm.on('vim-mode-change', onVimEvent)
  cm.on('vim-command-done', onVimEvent)
  readMode()
}

function currentSelection(): { start: number; end: number; text: string } | null {
  if (!view) return null
  const { from, to } = view.state.selection.main
  if (from === to) return null
  return { start: from, end: to, text: view.state.sliceDoc(from, to) }
}

function emitSelection(source: SelectionPayload['source'], viewRef: EditorView) {
  const { from, to } = viewRef.state.selection.main
  // 空选区不主动清除：清除交给父级的 document mousedown/scroll 处理，
  // 否则光标移动产生的空选区事件会把刚刚弹出的气泡立刻关掉。
  if (from === to) return
  const text = viewRef.state.sliceDoc(from, to)
  const coords = viewRef.coordsAtPos(to)
  const clientX = coords ? (coords.left + coords.right) / 2 : undefined
  const clientY = coords?.top
  props.selectionHandler?.({ start: from, end: to, text, clientX, clientY, source })
}

function handleUpdate(update: ViewUpdate) {
  if (update.docChanged) {
    emit('update:modelValue', update.state.doc.toString())
  }
  if (update.focusChanged && !update.view.hasFocus) {
    props.blurHandler?.()
  }
  readMode()
  // CodeMirror 的选区在 selectionchange 后才同步到 state，selectionSet 才是可靠时机。
  // 鼠标拖拽、Shift+方向键、Vim 可视模式都会触发它，统一在这里驱动选区气泡。
  if (update.selectionSet) {
    const cm = props.vimEnabled ? getCM(update.view) : null
    const source: SelectionPayload['source'] = cm?.state.vim?.visualMode
      ? 'vim'
      : update.view.hasFocus
        ? 'keyboard'
        : 'mouse'
    emitSelection(source, update.view)
  }
}

function toggleVim() {
  emit('update:vimEnabled', !props.vimEnabled)
}

function focus() {
  view?.focus()
}

function setSelection(start: number, end: number) {
  if (!view) return
  view.dispatch({ selection: { anchor: start, head: end } })
  view.focus()
}

defineExpose({ focus, setSelection, currentSelection })

onMounted(() => {
  if (!host.value) return
  const extensions = [
    vimCompartment.of(props.vimEnabled ? vim() : []),
    EditorState.allowMultipleSelections.of(true),
    history(),
    drawSelection(),
    placeholderCompartment.of(cmPlaceholder(props.placeholder)),
    noNewline,
    ...(props.multiline ? [EditorView.lineWrapping] : []),
    keymap.of([...defaultKeymap, ...historyKeymap]),
    buildTheme(props.multiline),
    EditorView.updateListener.of(handleUpdate)
  ]
  view = new EditorView({
    state: EditorState.create({ doc: props.modelValue, extensions }),
    parent: host.value
  })
  if (props.vimEnabled) bindVim()
  if (props.autofocus) nextTick(() => view?.focus())
})

onBeforeUnmount(() => {
  view?.destroy()
  view = null
  boundCm = null
})

watch(
  () => props.modelValue,
  (value) => {
    if (!view || value === view.state.doc.toString()) return
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } })
  }
)

watch(
  () => props.placeholder,
  (value) => {
    view?.dispatch({ effects: placeholderCompartment.reconfigure(cmPlaceholder(value)) })
  }
)

watch(
  () => props.vimEnabled,
  (enabled) => {
    if (!view) return
    view.dispatch({ effects: vimCompartment.reconfigure(enabled ? vim() : []) })
    if (enabled) nextTick(bindVim)
    else {
      boundCm = null
      currentMode.value = ''
    }
  }
)
</script>

<template>
  <div class="vim-textarea" :class="{ 'is-vim': props.vimEnabled }">
    <div ref="host" class="vim-textarea-input" :aria-label="props.ariaLabel || undefined"></div>
    <button
      v-if="props.showToggle"
      type="button"
      class="vim-toggle"
      :class="toggleClass"
      :title="props.vimEnabled ? 'Vim 模式已开启，点击切回普通输入' : '点击开启 Vim 模式'"
      @mousedown.prevent
      @click="toggleVim"
    >
      <span class="vim-toggle-dot"></span>{{ toggleLabel }}
    </button>
  </div>
</template>

<style scoped>
.vim-textarea {
  position: relative;
  --editor-font-size: 17px;
  --editor-line-height: 1.95;
  --editor-font-family: var(--font-serif);
}
.vim-textarea-input {
  min-width: 0;
}
.vim-textarea-input :deep(.cm-editor) {
  background: transparent;
}
.vim-textarea-input :deep(.cm-focused) {
  outline: none;
}

.vim-toggle {
  position: absolute;
  top: 3px;
  right: 4px;
  z-index: 6;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--muted);
  font: 600 10px/1.4 var(--font-ui);
  letter-spacing: 0.03em;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.14s ease, color 0.14s ease, border-color 0.14s ease, background 0.14s ease;
  user-select: none;
}
.vim-textarea:hover .vim-toggle,
.vim-toggle:focus-visible,
.vim-toggle.vim-on {
  opacity: 1;
}
.vim-toggle:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.vim-toggle-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.6;
}
.vim-toggle.vim-on {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.vim-toggle.vim-on .vim-toggle-dot {
  opacity: 1;
}
.vim-toggle.mode-insert {
  color: var(--success);
  border-color: var(--success);
  background: var(--success-soft);
}
.vim-toggle.mode-visual {
  color: var(--accent-2);
  border-color: var(--accent-2);
  background: var(--accent-2-soft);
}
</style>
