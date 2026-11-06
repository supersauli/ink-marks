<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { api } from '../api/client'

interface ExportBlock {
  text: string
  instruction: string
}
interface ExportChapter {
  title: string
  summary: string
  blocks: ExportBlock[]
}

const novel = useNovelStore()
const open = computed(() => novel.exportOpen)

const scope = ref<'book' | 'chapter'>('book')
const format = ref<'txt' | 'md'>('txt')
const withSummary = ref(false)
const withInstructions = ref(false)
const withDescription = ref(false)
const skipEmpty = ref(true)
const indent = ref(false)

const busy = ref(false)
const progress = ref('')
const error = ref('')
const notice = ref('')
const bookChapters = ref<ExportChapter[]>([])
let loadToken = 0
let noticeTimer: number | null = null

const hasCurrentChapter = computed(() => Boolean(novel.chapter))
const currentChapter = computed<ExportChapter | null>(() => {
  const value = novel.chapter
  if (!value) return null
  return {
    title: value.title || '未命名章节',
    summary: value.summary || '',
    blocks: value.blocks.map((block) => ({ text: block.text, instruction: block.instruction }))
  }
})

function flash(text: string) {
  notice.value = text
  if (noticeTimer) window.clearTimeout(noticeTimer)
  noticeTimer = window.setTimeout(() => {
    notice.value = ''
  }, 3200)
}

function toChapter(detail: { title: string; summary: string; blocks: ExportBlock[] }): ExportChapter {
  return {
    title: detail.title || '未命名章节',
    summary: detail.summary || '',
    blocks: detail.blocks.map((block) => ({ text: block.text, instruction: block.instruction }))
  }
}

// 先把防抖中的编辑冲刷到服务端，再按章节顺序读取全文；每批 4 章，避免一次打满请求
async function loadBook() {
  const token = ++loadToken
  busy.value = true
  error.value = ''
  progress.value = '正在保存未写入的修改…'
  bookChapters.value = []
  try {
    await novel.flushAll()
    const metas = [...novel.chapters]
    const result: ExportChapter[] = []
    for (let index = 0; index < metas.length; index += 4) {
      if (token !== loadToken) return
      const batch = metas.slice(index, index + 4)
      const details = await Promise.all(batch.map((item) => api.getChapter(item.id)))
      for (const detail of details) result.push(toChapter(detail))
      progress.value = `已读取 ${Math.min(index + 4, metas.length)} / ${metas.length} 章`
    }
    if (token !== loadToken) return
    bookChapters.value = result
    progress.value = ''
  } catch (err) {
    if (token === loadToken) {
      error.value = `读取章节失败：${(err as Error).message}`
      progress.value = ''
    }
  } finally {
    if (token === loadToken) busy.value = false
  }
}

watch(open, (value) => {
  if (!value) return
  // 每次打开都重新拉一次，保证导出的是最新正文
  bookChapters.value = []
  error.value = ''
  notice.value = ''
  if (scope.value === 'book') void loadBook()
  else if (!hasCurrentChapter.value) scope.value = 'book'
})

watch(scope, (value) => {
  if (!open.value) return
  if (value === 'book' && !bookChapters.value.length && !busy.value) void loadBook()
})

function chapterTitle(title: string, index: number) {
  return title.trim() || `第 ${index + 1} 章`
}

function formatChapter(chapter: ExportChapter, index: number): string {
  const title = chapterTitle(chapter.title, index)
  const blocks = chapter.blocks.filter((block) => block.text.trim())
  const lines: string[] = []
  const isMd = format.value === 'md'

  lines.push(isMd ? `## ${title}` : title)
  if (withSummary.value && chapter.summary.trim()) {
    const summary = chapter.summary.trim().replace(/\n+/g, ' ')
    lines.push('', isMd ? `> **章节大纲**：${summary}` : `【章节大纲】${summary}`)
  }
  lines.push('')

  if (!blocks.length) lines.push('（本章暂无正文）')
  for (const block of blocks) {
    lines.push((indent.value ? '　　' : '') + block.text.trim())
    if (withInstructions.value && block.instruction.trim()) {
      const note = block.instruction.trim().replace(/\n+/g, ' ')
      lines.push(isMd ? `<!-- 修改要求：${note} -->` : `［修改要求：${note}］`)
    }
    lines.push('')
  }
  return lines.join('\n').trimEnd()
}

const sourceChapters = computed<ExportChapter[]>(() =>
  scope.value === 'chapter'
    ? currentChapter.value
      ? [currentChapter.value]
      : []
    : bookChapters.value
)

const visibleChapters = computed(() =>
  skipEmpty.value
    ? sourceChapters.value.filter((chapter) => chapter.blocks.some((block) => block.text.trim()))
    : sourceChapters.value
)

const content = computed(() => {
  const name = novel.project?.name?.trim() || '未命名作品'
  const description = novel.project?.description?.trim() || ''
  const isMd = format.value === 'md'
  const parts: string[] = isMd ? [`# ${name}`, ''] : [`《${name}》`, '']
  if (withDescription.value && description) {
    parts.push(isMd ? `> ${description.replace(/\n+/g, ' ')}` : `简介：${description}`, '')
  }
  for (const [index, chapter] of visibleChapters.value.entries()) {
    parts.push(formatChapter(chapter, index), '')
  }
  return `${parts.join('\n').replace(/\n{4,}/g, '\n\n\n').trimEnd()}\n`
})

const stats = computed(() => ({
  chapters: visibleChapters.value.length,
  paragraphs: visibleChapters.value.reduce(
    (sum, chapter) => sum + chapter.blocks.filter((block) => block.text.trim()).length,
    0
  ),
  chars: content.value.replace(/\s/g, '').length
}))

const preview = computed(() => content.value.slice(0, 900))
const previewText = computed(() =>
  content.value.length > 900 ? `${preview.value}\n\n……（预览只显示开头 900 字，下载时是全文）` : content.value
)

function safeFileName(text: string) {
  return text.replace(/[\\/:*?"<>|\r\n]/g, '_').trim().slice(0, 40) || '未命名'
}

const fileName = computed(() => {
  const date = new Date()
  const stamp = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  const part = scope.value === 'chapter' ? safeFileName(currentChapter.value?.title ?? '章节') : '全本'
  return `${safeFileName(novel.project?.name ?? '作品')}_${part}_${stamp}.${format.value === 'md' ? 'md' : 'txt'}`
})

function download() {
  const blob = new Blob([content.value], {
    type: format.value === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8'
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName.value
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  flash(`已开始下载：${fileName.value}`)
}

async function copyAll() {
  try {
    await navigator.clipboard.writeText(content.value)
    flash('全文已复制到剪贴板')
  } catch {
    error.value = '复制失败，请改用「下载文件」。'
  }
}

function close() {
  novel.closeExport()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) close()
}

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  if (noticeTimer) window.clearTimeout(noticeTimer)
})
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="modal-overlay" @click.self="close">
      <div class="modal export-modal">
        <header class="modal-head">
          <div>
            <div class="modal-title">导出作品</div>
            <div class="export-sub">{{ novel.project?.name || '未命名作品' }} · 共 {{ novel.chapters.length }} 章</div>
          </div>
          <button class="btn btn-icon btn-ghost" title="关闭" @click="close">✕</button>
        </header>

        <div class="export-body">
          <div class="export-options">
            <div class="field">
              <span class="field-label">导出范围</span>
              <div class="seg">
                <button class="tag" :class="{ active: scope === 'book' }" @click="scope = 'book'">全本</button>
                <button
                  class="tag"
                  :class="{ active: scope === 'chapter' }"
                  :disabled="!hasCurrentChapter"
                  @click="scope = 'chapter'"
                >
                  当前章
                </button>
              </div>
              <span v-if="!hasCurrentChapter" class="field-note">打开一个章节后可选「当前章」</span>
            </div>

            <div class="field">
              <span class="field-label">文件格式</span>
              <div class="seg">
                <button class="tag" :class="{ active: format === 'txt' }" @click="format = 'txt'">TXT 纯文本</button>
                <button class="tag" :class="{ active: format === 'md' }" @click="format = 'md'">Markdown</button>
              </div>
            </div>

            <div class="field">
              <span class="field-label">可选内容</span>
              <label class="check"><input v-model="withDescription" type="checkbox" /> 附带作品简介（写在开头）</label>
              <label class="check"><input v-model="withSummary" type="checkbox" /> 附带章节大纲</label>
              <label class="check"><input v-model="withInstructions" type="checkbox" /> 附带每段修改要求（批注）</label>
              <label class="check"><input v-model="skipEmpty" type="checkbox" /> 跳过没有正文的章节</label>
              <label class="check"><input v-model="indent" type="checkbox" /> 段首缩进两个全角空格</label>
            </div>

            <p class="hint">
              默认只导出书名与正文，作品简介、章节大纲、修改要求都要勾了才写入。
              TXT 为 UTF-8 编码；Markdown 会把章节大纲写成引用、修改要求写成 HTML 注释（渲染时不显示）。
              导出前会先保存尚未写入的编辑。
            </p>
          </div>

          <div class="export-preview">
            <div class="preview-head">
              <span class="preview-title">导出预览</span>
              <span class="preview-meta">{{ stats.chapters }} 章 · {{ stats.paragraphs }} 段 · {{ stats.chars }} 字</span>
            </div>
            <div v-if="error" class="error-box">{{ error }}</div>
            <div v-else-if="busy" class="preview-loading">{{ progress || '正在读取章节…' }}</div>
            <pre v-else class="export-pre scroll-y">{{ previewText }}</pre>
            <div class="file-name">文件名：{{ fileName }}</div>
          </div>
        </div>

        <footer class="modal-foot">
          <span v-if="notice" class="export-notice">{{ notice }}</span>
          <button class="btn" :disabled="busy || !!error" @click="copyAll">复制全文</button>
          <button class="btn" @click="close">取消</button>
          <button class="btn btn-primary export-download" :disabled="busy || !!error || !content.trim()" @click="download">
            下载文件
          </button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.export-modal {
  width: min(940px, 94vw);
}
.export-sub {
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}
.export-body {
  display: grid;
  grid-template-columns: 300px minmax(0, 1fr);
  height: min(62vh, 560px);
  min-height: 320px;
}
.export-options {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 18px 20px;
  border-right: 1px solid var(--border);
  overflow-y: auto;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}
.field-note {
  font-size: 10.5px;
  color: var(--muted);
}
.seg {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.seg .tag[disabled] {
  opacity: 0.45;
  cursor: not-allowed;
}
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
}
.export-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-2);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex: 0 0 auto;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.preview-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.preview-meta {
  font-size: 10.5px;
  color: var(--muted);
}
.export-pre {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 14px 18px;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-serif);
  font-size: 13.5px;
  line-height: 1.9;
  color: var(--ink-soft);
}
.file-name {
  flex: 0 0 auto;
  padding: 7px 14px;
  border-top: 1px dashed var(--border);
  font-size: 10.5px;
  color: var(--muted);
}
.error-box,
.preview-loading {
  margin: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12px;
  line-height: 1.7;
}
.preview-loading {
  background: var(--surface-3);
  color: var(--muted);
}
.export-notice {
  margin-right: auto;
  font-size: 11.5px;
  color: var(--success);
}

@media (max-width: 780px) {
  .export-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
    height: min(70vh, 620px);
  }
  .export-options {
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 42vh;
  }
}
</style>
