<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useVimStore, vimKey } from '../stores/vim'
import { countChars, formatTime } from '../utils/format'
import VimTextarea from './VimTextarea.vue'

const novel = useNovelStore()
const vim = useVimStore()

const note = computed(() => novel.activeNote)
const charCount = computed(() => countChars(note.value?.content ?? ''))
const scopeLabel = computed(() => (note.value?.scope === 'project' ? '本书记事' : '全局随手记'))

async function remove() {
  const value = note.value
  if (!value) return
  const target = value.scope === 'project' ? '这部小说' : '全局'
  if (!window.confirm(`删除${target}的记事「${value.title || '未命名记事'}」？此操作无法恢复。`)) return
  await novel.deleteNote(value.id)
}
</script>

<template>
  <div v-if="note" class="note-editor">
    <header class="editor-head">
      <div class="crumbs">
        <span>记事本</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">{{ scopeLabel }}</span>
      </div>

      <div class="title-row">
        <VimTextarea
          class="title-input"
          :model-value="note.title"
          placeholder="给这条记事起个名字"
          :multiline="false"
          :vim-enabled="vim.isEnabled(`${vimKey.noteTitle}:${note.id}`)"
          aria-label="记事标题"
          @update:model-value="novel.editNoteField(note.id, 'title', $event)"
          @update:vim-enabled="vim.setEnabled(`${vimKey.noteTitle}:${note.id}`, $event)"
        />
        <span class="scope-badge" :data-scope="note.scope">{{ scopeLabel }}</span>
        <div class="head-actions">
          <button class="btn btn-sm btn-danger" title="删除这条记事" @click="remove">删除</button>
        </div>
      </div>

      <div class="meta-row">
        <span>{{ charCount }} 字</span>
        <span v-if="note.updatedAt">· 更新于 {{ formatTime(note.updatedAt) }}</span>
        <span class="meta-hint">自动保存</span>
      </div>
    </header>

    <div class="editor-body scroll-y">
      <article class="article">
        <VimTextarea
          class="note-text"
          :model-value="note.content"
          placeholder="随手记下想法、伏笔、片段、待办……&#10;&#10;本书记事只跟随当前小说，全局随手记在所有小说里都能看到。"
          :vim-enabled="vim.isEnabled(`${vimKey.noteContent}:${note.id}`)"
          aria-label="记事内容"
          @update:model-value="novel.editNoteField(note.id, 'content', $event)"
          @update:vim-enabled="vim.setEnabled(`${vimKey.noteContent}:${note.id}`, $event)"
        />
        <p v-if="!note.content" class="hint">
          这里不是正文，也不会进入导出文件。想到什么先扔进来，之后再整理成大纲或章节。
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.note-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
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
.crumb-sep {
  font-size: 10px;
}
.crumb-muted {
  color: var(--accent);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.title-input {
  --editor-font-size: 24px;
  --editor-line-height: 1.4;
  --editor-font-family: var(--font-serif);
  --editor-font-weight: 600;
  --editor-padding: 2px 68px 2px 0;
  flex: 1;
  min-width: 0;
  border-bottom: 1px solid transparent;
}
.title-input:focus-within {
  border-bottom-color: var(--border);
}

.scope-badge {
  flex: 0 0 auto;
  padding: 3px 9px;
  border-radius: 999px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 11px;
}
.scope-badge[data-scope='global'] {
  background: var(--surface-3);
  color: var(--muted);
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
.article {
  max-width: 860px;
  margin: 0 auto;
}
.note-text {
  --editor-font-size: 16px;
  --editor-line-height: 2;
  --editor-font-family: var(--font-serif);
  --editor-letter-spacing: 0.01em;
  --editor-min-height: 54vh;
  width: 100%;
  color: var(--ink-soft);
}
.hint {
  margin: 22px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
</style>
