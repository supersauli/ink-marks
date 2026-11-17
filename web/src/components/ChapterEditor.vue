<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useVimStore, vimKey } from '../stores/vim'
import { countChars, formatTime, scopeLabels } from '../utils/format'
import ChapterBody from './ChapterBody.vue'
import VimTextarea from './VimTextarea.vue'

const novel = useNovelStore()
const vim = useVimStore()

const chapter = computed(() => novel.chapter)
const summaryChars = computed(() => countChars(chapter.value?.summary ?? ''))
const blockCount = computed(() => chapter.value?.blocks.length ?? 0)
const summaryRevisions = computed(() => novel.revisions.filter((item) => item.instruction).slice(0, 6))

function onTitleInput(value: string) {
  if (!chapter.value) return
  novel.editChapterMeta({ title: value })
}

function onSummaryInput(value: string) {
  if (!chapter.value) return
  novel.editChapterMeta({ summary: value })
}

function onStatusChange(event: Event) {
  novel.setChapterStatus((event.target as HTMLSelectElement).value)
}

function openVersions() {
  if (!chapter.value) return
  void novel.openVersions('chapter', chapter.value.id, chapter.value.title || '章节')
}

function refineSummary() {
  if (!chapter.value) return
  novel.requestRefine({ kind: 'chapter-summary', chapterId: chapter.value.id })
}

function refineBody() {
  if (!chapter.value) return
  novel.requestRefine({ kind: 'append', chapterId: chapter.value.id })
}

function openRevisions() {
  void novel.openRevisions()
}

async function removeChapter() {
  if (!chapter.value) return
  if (!window.confirm('删除这一章？正文、修改记录和版本历史都会一并删除，且无法恢复。')) return
  await novel.deleteChapter(chapter.value.id)
}
</script>

<template>
  <div v-if="chapter" class="chapter-editor">
    <header class="chapter-head">
      <div class="crumbs">
        <span>{{ novel.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">{{ chapter.title || '未命名章节' }}</span>
      </div>

      <div class="title-row">
        <VimTextarea
          class="title-input"
          :model-value="chapter.title"
          placeholder="章节标题"
          :multiline="false"
          :vim-enabled="vim.isEnabled(vimKey.chapterTitle)"
          aria-label="章节标题"
          @update:model-value="onTitleInput"
          @update:vim-enabled="vim.setEnabled(vimKey.chapterTitle, $event)"
        />
        <div class="head-actions">
          <button class="btn btn-sm" title="查看并恢复历史版本" @click="openVersions">历史版本</button>
          <button class="btn btn-sm" title="查看本章所有修改要求" @click="openRevisions">修改记录</button>
          <button class="btn btn-sm btn-danger" @click="removeChapter">删除</button>
        </div>
      </div>

      <div class="tab-row">
        <div class="tabs">
          <button
            class="tab"
            :class="{ active: novel.mode === 'chapterOutline' }"
            @click="novel.setMode('chapterOutline')"
          >
            章节大纲
            <span class="tab-count">{{ summaryChars }}</span>
          </button>
          <button class="tab" :class="{ active: novel.mode === 'chapter' }" @click="novel.setMode('chapter')">
            正文
            <span class="tab-count">{{ novel.chapterWordCount }}</span>
          </button>
        </div>

        <div class="tab-meta">
          <select class="status-select" :value="chapter.status" @change="onStatusChange">
            <option value="outline">仅大纲</option>
            <option value="writing">写作中</option>
            <option value="done">已完成</option>
          </select>
          <span class="meta-text">{{ blockCount }} 段</span>
          <span v-if="chapter.updatedAt" class="meta-text">· {{ formatTime(chapter.updatedAt) }}</span>
        </div>
      </div>
    </header>

    <div v-if="novel.mode === 'chapterOutline'" class="outline-pane">
      <div class="article">
        <div class="pane-toolbar">
          <span class="pane-title">本章要发生什么</span>
          <div class="pane-actions">
            <button class="btn btn-sm btn-primary-ghost" @click="refineSummary">✦ AI 生成 / 优化</button>
            <button class="btn btn-sm" @click="novel.setMode('chapter')">去写正文 →</button>
          </div>
        </div>
        <VimTextarea
          class="summary-text"
          :model-value="chapter.summary"
          placeholder="写清楚这一章的场景、人物行动、冲突与转折，以及结尾留给读者的钩子。&#10;&#10;例如：&#10;1. 雨夜，林岚在旧书店收到匿名信；&#10;2. 信中提到只有姐姐知道的暗号；&#10;3. 她决定回雾港，却在码头遇见不肯透露身份的老周。"
          :vim-enabled="vim.isEnabled(vimKey.chapterSummary)"
          aria-label="章节大纲"
          @update:model-value="onSummaryInput"
          @update:vim-enabled="vim.setEnabled(vimKey.chapterSummary, $event)"
        />

        <div class="outline-hints">
          <span>写章节大纲时，可以先问自己三个问题：</span>
          <ul>
            <li>这一章推进了什么主线信息？</li>
            <li>人物之间的关系发生了什么变化？</li>
            <li>结尾用什么钩子让读者继续往下读？</li>
          </ul>
        </div>

        <section v-if="summaryRevisions.length" class="req-summary">
          <div class="req-head">
            <span>本章修改要求汇总</span>
            <button class="btn btn-sm btn-ghost" @click="openRevisions">查看全部</button>
          </div>
          <div class="req-list">
            <div v-for="item in summaryRevisions" :key="item.id" class="req-row" @click="openRevisions">
              <span class="req-scope">{{ scopeLabels[item.scope] || item.scope }}</span>
              <span class="req-text">{{ item.instruction }}</span>
            </div>
          </div>
        </section>

        <div class="outline-foot">
          <button class="btn btn-sm btn-ghost" :disabled="!blockCount" @click="refineBody">✦ 根据大纲续写正文</button>
        </div>
      </div>
    </div>

    <ChapterBody v-else />
  </div>
</template>

<style scoped>
.chapter-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--surface);
}

.chapter-head {
  padding: 16px clamp(20px, 4vw, 48px) 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex: 0 0 auto;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
.crumb-sep {
  font-size: 10px;
}
.crumb-muted {
  color: var(--muted);
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

.tab-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
}
.tabs {
  display: flex;
  gap: 2px;
}
.tab {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 9px 13px 10px;
  border: none;
  background: transparent;
  font-size: 12.5px;
  color: var(--muted);
  border-bottom: 2px solid transparent;
}
.tab:hover {
  color: var(--ink);
}
.tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  font-weight: 600;
}
.tab-count {
  font-size: 10.5px;
  color: var(--muted);
  background: var(--surface-3);
  border-radius: 10px;
  padding: 1px 6px;
}
.tab-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
  font-size: 11px;
  color: var(--muted);
}
.status-select {
  height: 26px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 11.5px;
  color: var(--ink-soft);
  cursor: pointer;
}

.outline-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.article {
  max-width: 860px;
  margin: 0 auto;
  padding: 26px clamp(20px, 4vw, 48px) 60px;
}
.pane-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.pane-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}
.pane-actions {
  display: flex;
  gap: 6px;
}
.btn-primary-ghost {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.btn-primary-ghost:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.summary-text {
  --editor-font-size: 15.5px;
  --editor-line-height: 1.95;
  --editor-font-family: var(--font-serif);
  --editor-padding: 16px 18px 16px 18px;
  --editor-min-height: 300px;
  width: 100%;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--ink-soft);
}
.summary-text:focus-within {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--surface);
}

.outline-hints {
  margin-top: 16px;
  padding: 14px 16px;
  border-left: 3px solid var(--accent-2);
  background: var(--accent-2-soft);
  border-radius: 0 8px 8px 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.outline-hints ul {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--ink-soft);
}
.outline-hints li {
  margin: 2px 0;
}

.req-summary {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.req-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.req-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.req-row {
  display: flex;
  gap: 8px;
  align-items: baseline;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--surface-2);
  cursor: pointer;
}
.req-row:hover {
  background: var(--surface-3);
}
.req-scope {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 6px;
  border-radius: 5px;
}
.req-text {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ink-soft);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.outline-foot {
  margin-top: 18px;
}
</style>
