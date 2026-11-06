<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useChatStore } from '../stores/chat'
import { useSettingsStore } from '../stores/settings'
import ModelSelect from './ModelSelect.vue'

defineProps<{ theme: 'light' | 'dark' }>()
const emit = defineEmits<{ (event: 'toggle-theme'): void }>()

const novel = useNovelStore()
const chat = useChatStore()
const settings = useSettingsStore()

const saveLabel = computed(() => {
  if (novel.saveState === 'saving') return '保存中…'
  if (novel.saveState === 'error') return '保存失败'
  return '已保存'
})

async function onProjectChange(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  if (value === '__new') {
    await createProject()
    return
  }
  if (value && value !== novel.projectId) await novel.openProject(value)
}

async function createProject() {
  const name = window.prompt('新作品名称', '未命名作品')
  if (!name || !name.trim()) return
  await novel.createProject(name.trim())
}

function renameProject() {
  if (!novel.project) return
  const name = window.prompt('修改作品名称', novel.project.name)
  if (name && name.trim()) void novel.updateProject({ name: name.trim() })
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <span class="brand-mark">墨</span>
      <span class="brand-name">墨迹</span>
      <span class="brand-sub">小说创作工作台</span>
    </div>

    <div class="project-area">
      <select class="project-select" :value="novel.projectId" @change="onProjectChange">
        <option v-if="!novel.projects.length" value="">（还没有作品）</option>
        <option v-for="item in novel.projects" :key="item.id" :value="item.id">{{ item.name }}</option>
        <option value="__new">＋ 新建作品…</option>
      </select>
      <button v-if="novel.project" class="btn btn-icon btn-ghost" title="重命名作品" @click="renameProject">✎</button>
    </div>

    <div class="spacer" />

    <span class="save-state" :class="`is-${novel.saveState}`">
      <span class="dot" />
      {{ saveLabel }}
    </span>

    <div class="model-area">
      <ModelSelect />
      <button class="btn btn-icon btn-ghost" title="模型与服务商设置" @click="settings.openSettings()">⚙</button>
    </div>

    <button class="btn btn-sm" title="导出整本或当前章节为 TXT / Markdown" @click="novel.openExport()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      导出
    </button>

    <button
      class="btn btn-sm"
      :class="{ 'overview-on': novel.mode === 'overview' }"
      title="以章节为横轴、人物为纵轴查看所有人物状态"
      @click="novel.openOverview()"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </svg>
      总览
    </button>

    <button class="btn btn-sm" :class="{ 'chat-on': chat.open }" @click="chat.toggle()">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 12a8 8 0 1 1-3.2-6.4L21 4l-1 4.2A8 8 0 0 1 21 12Z" />
      </svg>
      对话
    </button>

    <button class="btn btn-icon btn-ghost" title="切换明暗主题" @click="emit('toggle-theme')">
      {{ theme === 'dark' ? '☀' : '☾' }}
    </button>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 54px;
  padding: 0 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex: 0 0 auto;
  z-index: 10;
}

.brand {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-right: 6px;
  user-select: none;
}
.brand-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: var(--ink);
  color: var(--surface);
  font-family: var(--font-serif);
  font-size: 15px;
  align-self: center;
}
.brand-name {
  font-family: var(--font-serif);
  font-size: 17px;
  letter-spacing: 0.14em;
}
.brand-sub {
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.08em;
}

.project-area {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 10px;
  border-left: 1px solid var(--border);
}
.project-select {
  max-width: 230px;
  height: 30px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  padding: 0 6px;
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
}
.project-select:hover {
  background: var(--surface-2);
}

.spacer {
  flex: 1;
}

.save-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  white-space: nowrap;
}
.save-state .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--success);
}
.save-state.is-saving .dot {
  background: var(--accent);
  animation: pulse 1.2s ease-in-out infinite;
}
.save-state.is-error .dot {
  background: var(--danger);
}
@keyframes pulse {
  50% {
    opacity: 0.35;
  }
}

.model-area {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 0 6px;
  border-left: 1px solid var(--border);
}

.chat-on {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}

.overview-on {
  border-color: var(--accent-2);
  color: var(--accent-2);
  background: var(--accent-2-soft);
}

@media (max-width: 1080px) {
  .brand-sub {
    display: none;
  }
  .save-state {
    display: none;
  }
}
</style>
