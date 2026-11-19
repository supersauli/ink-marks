<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { DocTab } from '../stores/novel'
import { itemStatusLabels, templateKindLabels } from '../utils/format'

const novel = useNovelStore()
const railRef = ref<HTMLDivElement | null>(null)

const icons: Record<DocTab['type'], string> = {
  welcome: '✦',
  overview: '◎',
  outline: '◆',
  character: '◈',
  item: '▣',
  template: '▤',
  note: '✎',
  chapter: '§'
}

function titleOf(tab: DocTab): string {
  switch (tab.type) {
    case 'welcome':
      return '开始'
    case 'overview':
      return '人物总览'
    case 'outline':
      return novel.outlines.find((entry) => entry.id === tab.targetId)?.title || '未命名大纲'
    case 'character':
      return novel.characters.find((entry) => entry.id === tab.targetId)?.name || '未命名角色'
    case 'item':
      return novel.items.find((entry) => entry.id === tab.targetId)?.name || '未命名物品'
    case 'template':
      return novel.templates.find((entry) => entry.kind === tab.targetId)?.name || templateKindLabels[tab.targetId] || '属性卡模板'
    case 'note':
      return (
        novel.projectNotes.find((entry) => entry.id === tab.targetId)?.title ||
        novel.globalNotes.find((entry) => entry.id === tab.targetId)?.title ||
        '未命名记事'
      )
    case 'chapter':
      return novel.chapters.find((entry) => entry.id === tab.targetId)?.title || '未命名章节'
  }
}

function subtitleOf(tab: DocTab): string {
  switch (tab.type) {
    case 'overview':
      return '总览'
    case 'outline':
      return '大纲'
    case 'character':
      return '角色'
    case 'item': {
      const entry = novel.items.find((item) => item.id === tab.targetId)
      return itemStatusLabels[entry?.status ?? ''] || '物品'
    }
    case 'template':
      return '模板'
    case 'note': {
      const entry =
        novel.projectNotes.find((item) => item.id === tab.targetId) ??
        novel.globalNotes.find((item) => item.id === tab.targetId)
      return entry?.scope === 'global' ? '全局' : '本书'
    }
    case 'chapter':
      return novel.chapters.find((entry) => entry.id === tab.targetId)?.status === 'done' ? '已完成' : '章节'
    default:
      return ''
  }
}

function isActive(tab: DocTab) {
  return novel.activeTabKey === tab.key
}

function open(tab: DocTab) {
  void novel.activateTab(tab.key)
}

function close(tab: DocTab, event: MouseEvent) {
  event.stopPropagation()
  void novel.closeTab(tab.key)
}

const activeIndex = computed(() => novel.openTabs.findIndex((tab) => tab.key === novel.activeTabKey))

watch(activeIndex, async () => {
  await nextTick()
  const rail = railRef.value
  const active = rail?.querySelector<HTMLElement>('.doc-tab.active')
  if (rail && active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
})
</script>

<template>
  <div ref="railRef" class="doc-tabs">
    <button
      v-for="tab in novel.openTabs"
      :key="tab.key"
      class="doc-tab"
      :class="{ active: isActive(tab), home: tab.type === 'welcome' }"
      :title="`${titleOf(tab)} · ${subtitleOf(tab)}`"
      @click="open(tab)"
      @auxclick="(event) => event.button === 1 && close(tab, event)"
    >
      <span class="doc-icon" :data-type="tab.type">{{ icons[tab.type] }}</span>
      <span class="doc-title">{{ titleOf(tab) }}</span>
      <span class="doc-subtitle">{{ subtitleOf(tab) }}</span>
      <span v-if="tab.type !== 'welcome'" class="doc-close" title="关闭页签" @click="close(tab, $event)">✕</span>
    </button>
    <span class="doc-tabs-fill" />
  </div>
</template>

<style scoped>
.doc-tabs {
  display: flex;
  align-items: stretch;
  gap: 2px;
  flex: 0 0 auto;
  min-height: 34px;
  padding: 4px 8px 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.doc-tabs::-webkit-scrollbar {
  height: 4px;
}

.doc-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 0 0 auto;
  max-width: 200px;
  height: 30px;
  padding: 0 8px 0 10px;
  border: 1px solid transparent;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.14s ease, color 0.14s ease;
}
.doc-tab:hover {
  background: var(--surface-3);
  color: var(--ink-soft);
}
.doc-tab.active {
  background: var(--surface);
  border-color: var(--border);
  color: var(--ink);
  position: relative;
}
.doc-tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 1px;
  background: var(--surface);
}
.doc-tab.home .doc-icon {
  color: var(--accent-2);
}

.doc-icon {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--muted);
}
.doc-tab.active .doc-icon {
  color: var(--accent);
}
.doc-title {
  max-width: 130px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.doc-tab.active .doc-title {
  font-weight: 600;
}
.doc-subtitle {
  flex: 0 0 auto;
  max-width: 60px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 9.5px;
  color: var(--muted);
}
.doc-tab.active .doc-subtitle {
  background: var(--accent-soft);
  color: var(--accent);
}

.doc-close {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 17px;
  height: 17px;
  border-radius: 4px;
  font-size: 10px;
  color: var(--muted);
  opacity: 0;
}
.doc-tab:hover .doc-close,
.doc-tab.active .doc-close {
  opacity: 1;
}
.doc-close:hover {
  background: var(--surface-3);
  color: var(--danger);
}

.doc-tabs-fill {
  flex: 0 0 8px;
}
</style>
