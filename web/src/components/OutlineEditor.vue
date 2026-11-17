<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useVimStore, vimKey } from '../stores/vim'
import { countChars, formatTime } from '../utils/format'
import VimTextarea from './VimTextarea.vue'

const novel = useNovelStore()
const vim = useVimStore()

const outline = computed(() => novel.activeOutline)
const outlineId = computed(() => outline.value?.id ?? '')
const charCount = computed(() => countChars(outline.value?.content ?? ''))

const breadcrumb = computed(() => {
  const chain: string[] = []
  let current = outline.value
  const guard = new Set<string>()
  while (current?.parentId) {
    if (guard.has(current.parentId)) break
    guard.add(current.parentId)
    const parent = novel.outlines.find((item) => item.id === current?.parentId)
    if (!parent) break
    chain.unshift(parent.title || '未命名大纲')
    current = parent
  }
  return chain
})

const children = computed(() => (outline.value ? novel.outlines.filter((item) => item.parentId === outline.value?.id) : []))

function onTitleInput(value: string) {
  if (!outline.value) return
  novel.editOutlineTitle(outline.value.id, value)
}

function onContentInput(value: string) {
  if (!outline.value) return
  novel.editOutlineContent(outline.value.id, value)
}

function openVersions() {
  if (!outline.value) return
  void novel.openVersions('outline', outline.value.id, outline.value.title || '大纲')
}

function refine() {
  if (!outline.value) return
  novel.requestRefine({ kind: 'outline', outlineId: outline.value.id })
}

async function remove() {
  if (!outline.value) return
  if (!window.confirm('删除这条大纲？其下的子条目也会一并删除。')) return
  await novel.deleteOutline(outline.value.id)
}
</script>

<template>
  <div v-if="outline" class="editor">
    <header class="editor-head">
      <div class="crumbs">
        <span v-if="breadcrumb.length" class="crumb">{{ breadcrumb.join(' / ') }} /</span>
        <span class="crumb muted">{{ outline.title || '未命名大纲' }}</span>
      </div>

      <div class="title-row">
        <VimTextarea
          class="title-input"
          :model-value="outline.title"
          placeholder="大纲条目标题"
          :multiline="false"
          :vim-enabled="vim.isEnabled(vimKey.outlineTitle)"
          aria-label="大纲条目标题"
          @update:model-value="onTitleInput"
          @update:vim-enabled="vim.setEnabled(vimKey.outlineTitle, $event)"
        />
        <div class="head-actions">
          <button class="btn btn-sm" title="查看并恢复历史版本" @click="openVersions">历史版本</button>
          <button class="btn btn-sm" title="让 AI 修改这条大纲" @click="refine">✦ AI 修改</button>
          <button class="btn btn-sm btn-danger" @click="remove">删除</button>
        </div>
      </div>

      <div class="meta-row">
        <span>{{ charCount }} 字</span>
        <span v-if="outline.updatedAt">· 更新于 {{ formatTime(outline.updatedAt) }}</span>
        <span class="meta-hint">自动保存</span>
      </div>
    </header>

    <div class="editor-body">
      <VimTextarea
        class="outline-text"
        :model-value="outline.content"
        placeholder="写下故事主线、世界观、人物关系……&#10;&#10;可以先写一个粗略的想法，之后再让 AI 帮你扩写，或直接手动修改。"
        :vim-enabled="vim.isEnabled(vimKey.outlineContent)"
        aria-label="大纲内容"
        @update:model-value="onContentInput"
        @update:vim-enabled="vim.setEnabled(vimKey.outlineContent, $event)"
      />

      <section class="child-section">
        <div class="child-head">
          <span>下级条目</span>
          <button class="btn btn-sm btn-ghost" @click="novel.createOutline(outline.id)">＋ 新增子条目</button>
        </div>
        <div v-if="children.length" class="child-list">
          <button
            v-for="child in children"
            :key="child.id"
            class="child-chip"
            @click="novel.selectOutline(child.id)"
          >
            {{ child.title || '未命名大纲' }}
          </button>
        </div>
        <p v-else class="hint">把大纲拆成更小的条目，比如「世界观设定」「人物小传」「第一卷主线」。</p>
      </section>
    </div>
  </div>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--surface);
}

.editor-head {
  padding: 18px clamp(20px, 4vw, 48px) 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 18px;
  margin-bottom: 8px;
  font-size: 11.5px;
  color: var(--muted);
}
.crumb {
  border: none;
  background: none;
  padding: 0;
  color: var(--muted);
  font-size: 11.5px;
}
.crumb:hover {
  color: var(--accent);
}
.crumb-sep {
  font-size: 10px;
}

.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.title-input {
  --editor-font-size: 24px;
  --editor-line-height: 1.4;
  --editor-font-family: var(--font-serif);
  --editor-font-weight: 600;
  --editor-letter-spacing: 0.02em;
  --editor-padding: 2px 68px 2px 0;
  flex: 1;
  min-width: 0;
  border-bottom: 1px solid transparent;
}
.title-input:focus-within {
  border-bottom-color: var(--border);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  font-size: 11.5px;
  color: var(--muted);
}
.meta-hint {
  margin-left: auto;
  color: var(--accent-2);
}

.editor-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 22px clamp(20px, 4vw, 48px) 48px;
}

.outline-text {
  --editor-font-size: 16px;
  --editor-line-height: 2;
  --editor-font-family: var(--font-serif);
  --editor-letter-spacing: 0.01em;
  --editor-min-height: 52vh;
  width: 100%;
  color: var(--ink-soft);
}

.child-section {
  margin-top: 30px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.child-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.child-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}
.child-chip {
  padding: 6px 11px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-2);
  font-size: 12px;
  color: var(--ink-soft);
}
.child-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
