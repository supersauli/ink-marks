<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useChatStore } from '../stores/chat'
import type { Block } from '../api/types'

const novel = useNovelStore()
const chat = useChatStore()

const chapter = computed(() => novel.chapter)
const blocks = computed(() => chapter.value?.blocks ?? [])
const selectedIds = ref<string[]>([])
const showInstructions = computed(() => novel.showInstructions)
// 正文往下滚时，工具栏吸顶并收起左侧说明，四个按钮始终可见
const stuck = ref(false)

interface BubbleState {
  x: number
  y: number
  blockId: string
  start: number
  end: number
  text: string
}

const bubble = ref<BubbleState | null>(null)
let anchorId: string | null = null
const textareas = new Map<string, HTMLTextAreaElement>()

// 从左侧搜索结果进入正文时，定位并高亮命中的段落
const flashBlockId = ref<string | null>(null)
let flashTimer: number | null = null

function focusSearchBlock() {
  const target = novel.focusBlockId
  if (!target) return
  nextTick(() => {
    const element = document.querySelector(`[data-block-id="${target}"]`)
    if (!(element instanceof HTMLElement)) return
    element.scrollIntoView({ block: 'center', behavior: 'smooth' })
    flashBlockId.value = target
    if (flashTimer) window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      flashBlockId.value = null
      flashTimer = null
    }, 2000)
  })
}

function autoResize(element: HTMLTextAreaElement) {
  element.style.height = 'auto'
  element.style.height = `${Math.max(element.scrollHeight, 30)}px`
}

function resizeAll() {
  for (const element of textareas.values()) autoResize(element)
}

function bindTextarea(blockId: string, element: unknown) {
  if (element instanceof HTMLTextAreaElement) {
    textareas.set(blockId, element)
    autoResize(element)
  } else {
    textareas.delete(blockId)
  }
}

function onBlockInput(block: Block, event: Event) {
  const textarea = event.target as HTMLTextAreaElement
  novel.editBlockText(block.id, textarea.value)
  autoResize(textarea)
}

function placeBubble(x: number, y: number, block: Block, start: number, end: number, text: string) {
  const clampedX = Math.min(Math.max(x, 140), window.innerWidth - 140)
  const clampedY = y - 46 < 72 ? y + 26 : y - 46
  bubble.value = { x: clampedX, y: clampedY, blockId: block.id, start, end, text }
  if (chapter.value) {
    novel.setSelection({ chapterId: chapter.value.id, blockId: block.id, start, end, text })
  }
}

function onBlockMouseUp(block: Block, event: MouseEvent) {
  const textarea = event.currentTarget as HTMLTextAreaElement
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const text = textarea.value.slice(start, end)
  if (!text.trim() || start === end) {
    bubble.value = null
    return
  }
  placeBubble(event.clientX, event.clientY, block, start, end, text)
}

function onBlockKeyUp(block: Block, event: KeyboardEvent) {
  if (!event.shiftKey) return
  const textarea = event.currentTarget as HTMLTextAreaElement
  const start = textarea.selectionStart ?? 0
  const end = textarea.selectionEnd ?? 0
  const text = textarea.value.slice(start, end)
  if (!text.trim() || start === end) return
  const rect = textarea.getBoundingClientRect()
  placeBubble(rect.left + Math.min(rect.width / 2, 260), Math.max(rect.top, 80), block, start, end, text)
}

function hideBubble() {
  bubble.value = null
}

function refineSelection() {
  if (!bubble.value || !chapter.value) return
  const current = bubble.value
  novel.requestRefine({
    kind: 'snippet',
    chapterId: chapter.value.id,
    blockId: current.blockId,
    start: current.start,
    end: current.end,
    text: current.text
  })
  bubble.value = null
}

function discussSelection() {
  if (!bubble.value) return
  const text = bubble.value.text
  chat.open = true
  chat.draft = `请帮我看看这段文字，分析它的节奏和表达，并给出修改建议：\n\n「${text}」\n\n`
  bubble.value = null
}

async function copySelection() {
  if (!bubble.value) return
  try {
    await navigator.clipboard.writeText(bubble.value.text)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
  bubble.value = null
}

function onHandleClick(blockId: string, event: MouseEvent) {
  const ids = blocks.value.map((block) => block.id)
  if (event.shiftKey && anchorId) {
    const anchorIndex = ids.indexOf(anchorId)
    const index = ids.indexOf(blockId)
    if (anchorIndex >= 0 && index >= 0) {
      selectedIds.value = ids.slice(Math.min(anchorIndex, index), Math.max(anchorIndex, index) + 1)
      return
    }
  }
  anchorId = blockId
  selectedIds.value = [blockId]
}

function clearSelection() {
  selectedIds.value = []
  anchorId = null
}

function refineSelected() {
  if (!chapter.value || !selectedIds.value.length) return
  novel.requestRefine({ kind: 'blocks', chapterId: chapter.value.id, blockIds: [...selectedIds.value] })
}

function refineBlock(block: Block) {
  if (!chapter.value) return
  novel.requestRefine({ kind: 'blocks', chapterId: chapter.value.id, blockIds: [block.id] })
}

function clearInstruction(block: Block) {
  void novel.setBlockInstruction(block.id, '')
}

function removeBlock(block: Block) {
  if (block.text.trim() && !window.confirm('删除这一段？此操作会记录到版本历史，可从历史版本恢复。')) return
  void novel.deleteBlock(block.id)
}

async function addBlock() {
  const created = await novel.addBlock()
  await nextTick()
  if (created) {
    const textarea = textareas.get(created.id)
    if (textarea) {
      textarea.focus()
      autoResize(textarea)
    }
  }
}

function refineContinuation() {
  if (!chapter.value) return
  novel.requestRefine({ kind: 'append', chapterId: chapter.value.id })
}

function toggleInstructions() {
  novel.showInstructions = !novel.showInstructions
}

function openVersions() {
  if (!chapter.value) return
  void novel.openVersions('chapter', chapter.value.id, chapter.value.title || '章节')
}

function openRevisions() {
  void novel.openRevisions()
}

function onDocumentMouseDown(event: MouseEvent) {
  const target = event.target as HTMLElement | null
  if (target?.closest('.sel-bubble')) return
  bubble.value = null
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    void novel.flushAll()
  }
}

function onScroll(event: Event) {
  const element = event.currentTarget as HTMLElement | null
  stuck.value = (element?.scrollTop ?? 0) > 8
  bubble.value = null
}

watch(
  () => blocks.value.length,
  async () => {
    await nextTick()
    resizeAll()
  }
)

watch(
  () => novel.revisions.length,
  async () => {
    await nextTick()
    resizeAll()
  }
)

watch(
  () => novel.refineTarget,
  (target) => {
    if (!target) {
      clearSelection()
      bubble.value = null
    }
  }
)

watch(
  () => novel.focusBlockId,
  (id) => {
    if (id) focusSearchBlock()
  }
)

onMounted(() => {
  document.addEventListener('mousedown', onDocumentMouseDown)
  window.addEventListener('keydown', onKeydown)
  nextTick(resizeAll)
  focusSearchBlock()
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocumentMouseDown)
  window.removeEventListener('keydown', onKeydown)
  if (flashTimer) window.clearTimeout(flashTimer)
})
</script>

<template>
  <div v-if="chapter" class="body-pane" :class="{ 'has-multi': selectedIds.length }" @scroll="onScroll">
    <div v-if="selectedIds.length" class="multi-bar">
      <span>已选 {{ selectedIds.length }} 段</span>
      <div class="multi-actions">
        <button class="btn btn-sm btn-primary" @click="refineSelected">✦ AI 修改选中段落</button>
        <button class="btn btn-sm" @click="clearSelection">取消选择</button>
      </div>
    </div>

    <div class="article">
      <div class="body-toolbar" :class="{ 'is-stuck': stuck }">
        <span class="hint">选中文字可让 AI 改写 · Shift + 点击段号可多选</span>
        <div class="toolbar-actions">
          <button
            class="tag"
            :class="{ active: showInstructions }"
            title="显示/隐藏每段保留的修改要求"
            @click="toggleInstructions"
          >
            修改要求
          </button>
          <button class="btn btn-sm" @click="refineContinuation">✦ AI 续写</button>
          <button class="btn btn-sm" @click="openVersions">历史版本</button>
          <button class="btn btn-sm" @click="openRevisions">修改记录</button>
        </div>
      </div>

      <div v-if="!blocks.length" class="empty-body">
        <div class="empty-mark">✎</div>
        <p class="empty-title">这一章还没有正文</p>
        <p class="empty-hint">可以先生成一段草稿，再逐段修改；也可以直接写下第一段。</p>
        <div class="empty-actions">
          <button class="btn btn-primary" @click="refineContinuation">✦ 根据章节大纲续写</button>
          <button class="btn" @click="addBlock">手动添加第一段</button>
        </div>
      </div>

      <div v-else class="blocks">
        <div
          v-for="(block, index) in blocks"
          :key="block.id"
          class="block-row"
          :data-block-id="block.id"
          :class="{ 'is-selected': selectedIds.includes(block.id), 'is-flash': flashBlockId === block.id }"
        >
          <button
            class="handle"
            :class="{ picked: selectedIds.includes(block.id) }"
            :title="`第 ${index + 1} 段｜Shift + 点击可多选`"
            @click="onHandleClick(block.id, $event)"
          >
            {{ index + 1 }}
          </button>

          <div class="block-main">
            <textarea
              :ref="(element) => bindTextarea(block.id, element)"
              class="block-text"
              :value="block.text"
              placeholder="写下这一段……"
              spellcheck="false"
              @input="onBlockInput(block, $event)"
              @mouseup="onBlockMouseUp(block, $event)"
              @keyup="onBlockKeyUp(block, $event)"
            />

            <div v-if="showInstructions && block.instruction" class="block-note">
              <span class="note-label">修改要求</span>
              <span class="note-text" @click="refineBlock(block)">{{ block.instruction }}</span>
              <button class="note-clear" title="清除这段的修改要求" @click="clearInstruction(block)">×</button>
            </div>
          </div>

          <div class="block-actions">
            <button class="mini" title="AI 修改整段" @click="refineBlock(block)">✦</button>
            <button class="mini" title="上移" @click="novel.moveBlock(block.id, -1)">↑</button>
            <button class="mini" title="下移" @click="novel.moveBlock(block.id, 1)">↓</button>
            <button class="mini danger" title="删除段落" @click="removeBlock(block)">✕</button>
          </div>
        </div>

        <div class="add-row">
          <button class="add-block" @click="addBlock">＋ 添加段落</button>
          <span class="add-hint">Enter 可在段内换行</span>
        </div>
      </div>
    </div>

    <Teleport to="body">
      <div
        v-if="bubble"
        class="sel-bubble"
        :style="{ left: `${bubble.x}px`, top: `${bubble.y}px` }"
        @mousedown.prevent.stop
      >
        <button class="bubble-btn primary" @click="refineSelection">✦ AI 修改</button>
        <button class="bubble-btn" @click="discussSelection">在对话中问</button>
        <button class="bubble-btn" @click="copySelection">复制</button>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.body-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  background: var(--surface);
  position: relative;
}

.multi-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px clamp(20px, 4vw, 48px);
  background: var(--accent-soft);
  border-bottom: 1px solid var(--accent);
  backdrop-filter: blur(6px);
  font-size: 12px;
  color: var(--accent);
}
.multi-actions {
  display: flex;
  gap: 6px;
}

.article {
  max-width: 820px;
  margin: 0 auto;
  padding: 20px clamp(20px, 4vw, 48px) 80px;
}

.body-toolbar {
  position: sticky;
  top: 0;
  z-index: 15;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0 12px;
  margin-bottom: 10px;
  background: var(--surface);
  border-bottom: 1px dashed var(--border);
  transition: padding 0.16s ease, box-shadow 0.16s ease, border-color 0.16s ease;
}
/* 多选条也吸顶，给它让出一行高度，避免两条重叠 */
.body-pane.has-multi .body-toolbar {
  top: 43px;
}
.body-toolbar.is-stuck {
  padding: 7px 0 9px;
  border-bottom-style: solid;
  border-bottom-color: var(--border-strong);
  box-shadow: var(--shadow-soft);
}
/* 隐藏说明文字但保留占位，四个按钮的水平位置不会在吸顶时左右跳 */
.body-toolbar.is-stuck .hint {
  visibility: hidden;
}
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.empty-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 11vh 20px 40px;
  text-align: center;
}
.empty-mark {
  font-family: var(--font-serif);
  font-size: 40px;
  color: var(--border-strong);
  line-height: 1;
}
.empty-title {
  margin: 8px 0 0;
  font-family: var(--font-serif);
  font-size: 19px;
  color: var(--ink);
}
.empty-hint {
  margin: 0;
  max-width: 380px;
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--muted);
}
.empty-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}

.blocks {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 6px;
}

.block-row {
  position: relative;
  display: flex;
  gap: 6px;
  padding: 4px 6px 4px 0;
  border-radius: 8px;
  border-left: 2px solid transparent;
  transition: background 0.14s ease, border-color 0.14s ease;
}
.block-row:hover {
  background: var(--surface-2);
}
.block-row.is-selected {
  background: var(--accent-soft);
  border-left-color: var(--accent);
}
.block-row.is-selected .handle {
  color: var(--accent);
}
.block-row.is-flash {
  background: var(--accent-soft);
  border-left-color: var(--accent);
  box-shadow: 0 0 0 1px var(--accent-soft) inset;
}
.block-row.is-flash .handle {
  color: var(--accent);
  opacity: 1;
}

.handle {
  flex: 0 0 26px;
  align-self: flex-start;
  margin-top: 4px;
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 10.5px;
  font-variant-numeric: tabular-nums;
  padding: 2px 0;
  border-radius: 5px;
  opacity: 0.55;
  user-select: none;
}
.block-row:hover .handle {
  opacity: 1;
}
.handle:hover,
.handle.picked {
  background: var(--accent-soft);
  color: var(--accent);
  opacity: 1;
}

.block-main {
  flex: 1;
  min-width: 0;
}

.block-text {
  display: block;
  width: 100%;
  min-height: 30px;
  padding: 3px 6px;
  border: none;
  border-radius: 6px;
  background: transparent;
  outline: none;
  resize: none;
  overflow: hidden;
  field-sizing: content;
  font-family: var(--font-serif);
  font-size: 17px;
  line-height: 1.95;
  letter-spacing: 0.01em;
  color: var(--ink);
  text-indent: 2em;
  caret-color: var(--accent);
}
.block-text::placeholder {
  color: var(--muted);
  opacity: 0.65;
  font-size: 14px;
}
.block-text:focus {
  background: var(--surface);
  box-shadow: inset 0 0 0 1px var(--border);
}

.block-note {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin: 3px 6px 8px 10px;
  padding: 5px 8px;
  border-left: 2px solid var(--accent);
  border-radius: 0 6px 6px 0;
  background: var(--accent-soft);
  font-size: 11px;
  line-height: 1.6;
}
.note-label {
  flex: 0 0 auto;
  color: var(--accent);
  font-weight: 600;
}
.note-text {
  flex: 1;
  color: var(--ink-soft);
  cursor: pointer;
}
.note-text:hover {
  text-decoration: underline;
}
.note-clear {
  border: none;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  padding: 0 2px;
}
.note-clear:hover {
  color: var(--danger);
}

.block-actions {
  display: flex;
  flex-direction: column;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.14s ease;
  align-self: flex-start;
  margin-top: 2px;
}
.block-row:hover .block-actions {
  opacity: 1;
}
.mini {
  width: 22px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
  line-height: 1;
  padding: 0;
}
.mini:hover {
  background: var(--surface-3);
  color: var(--ink);
}
.mini.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

.add-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  padding-left: 32px;
}
.add-block {
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background: transparent;
  padding: 7px 14px;
  color: var(--muted);
  font-size: 12px;
}
.add-block:hover {
  color: var(--accent);
  border-color: var(--accent);
  background: var(--accent-soft);
}
.add-hint {
  font-size: 11px;
  color: var(--border-strong);
}

.sel-bubble {
  position: fixed;
  z-index: 120;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: var(--ink);
  box-shadow: 0 10px 26px rgba(0, 0, 0, 0.24);
  animation: pop-in 0.14s ease;
}
.bubble-btn {
  border: none;
  background: transparent;
  color: var(--surface);
  font-size: 12px;
  padding: 6px 9px;
  border-radius: 6px;
  white-space: nowrap;
  opacity: 0.9;
}
.bubble-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  opacity: 1;
}
.bubble-btn.primary {
  color: #fff;
  background: var(--accent);
}

@media (max-width: 900px) {
  .body-toolbar .hint {
    display: none;
  }
}
</style>
