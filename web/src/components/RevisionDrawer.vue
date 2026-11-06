<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNovelStore } from '../stores/novel'
import { formatTime, scopeLabels } from '../utils/format'

const novel = useNovelStore()
const filter = ref<'all' | 'block' | 'chapter-summary' | 'append'>('all')
const expanded = ref<Set<string>>(new Set())

const chapterTitle = computed(() => novel.chapter?.title ?? '')
const revisions = computed(() => {
  if (filter.value === 'all') return novel.revisions
  return novel.revisions.filter((item) => item.scope === filter.value)
})

function toggle(id: string) {
  const next = new Set(expanded.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expanded.value = next
}

function close() {
  novel.closeRevisions()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="novel.revisionsOpen" class="drawer-overlay" @click.self="close">
      <aside class="drawer">
        <header class="drawer-head">
          <div class="head-text">
            <div class="drawer-title">修改记录</div>
            <div class="drawer-sub">《{{ chapterTitle }}》· 共 {{ novel.revisions.length }} 条要求</div>
          </div>
          <button class="btn btn-icon btn-ghost" title="关闭" @click="close">✕</button>
        </header>

        <div class="filters">
          <button class="tag" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
          <button class="tag" :class="{ active: filter === 'block' }" @click="filter = 'block'">段落改写</button>
          <button class="tag" :class="{ active: filter === 'chapter-summary' }" @click="filter = 'chapter-summary'">
            章节大纲
          </button>
          <button class="tag" :class="{ active: filter === 'append' }" @click="filter = 'append'">AI 续写</button>
        </div>

        <div class="revision-list scroll-y">
          <div v-if="!revisions.length" class="empty-state">
            还没有修改记录。在正文中选中文字让 AI 改写，或在章节大纲里生成内容后，要求会汇总到这里。
          </div>

          <article v-for="item in revisions" :key="item.id" class="revision-item">
            <div class="revision-top">
              <span class="scope-badge">{{ scopeLabels[item.scope] || item.scope }}</span>
              <span class="revision-time">{{ formatTime(item.createdAt) }}</span>
              <span v-if="item.modelName" class="revision-model">{{ item.modelName }}</span>
            </div>
            <div class="revision-instruction">{{ item.instruction || '（没有填写修改要求）' }}</div>
            <div class="revision-foot">
              <button class="mini-link" @click="toggle(item.id)">
                {{ expanded.has(item.id) ? '收起原文对比' : '查看修改前后' }}
              </button>
              <span v-if="item.blockId" class="mini-note">要求已保存到对应段落</span>
            </div>

            <div v-if="expanded.has(item.id)" class="revision-detail">
              <div class="detail-block">
                <div class="detail-label">修改前</div>
                <div class="detail-text">{{ item.originalText || '（空）' }}</div>
              </div>
              <div class="detail-block">
                <div class="detail-label">修改后</div>
                <div class="detail-text">{{ item.revisedText || '（空）' }}</div>
              </div>
            </div>
          </article>
        </div>

        <footer class="drawer-foot">
          <span class="hint">修改要求同时保留在对应段落下方。</span>
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.drawer-title {
  font-size: 15px;
  font-weight: 600;
}
.drawer-sub {
  font-size: 11.5px;
  color: var(--muted);
}
.filters {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.revision-list {
  flex: 1;
  min-height: 0;
  padding: 12px 16px 22px;
}
.revision-item {
  padding: 12px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
  background: var(--surface);
}
.revision-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.scope-badge {
  font-size: 10.5px;
  color: var(--accent);
  background: var(--accent-soft);
  padding: 2px 7px;
  border-radius: 5px;
}
.revision-time {
  font-size: 11px;
  color: var(--muted);
}
.revision-model {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--muted);
  background: var(--surface-2);
  padding: 2px 6px;
  border-radius: 5px;
}
.revision-instruction {
  margin-top: 8px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--ink-soft);
  white-space: pre-wrap;
}
.revision-foot {
  display: flex;
  gap: 12px;
  margin-top: 7px;
}
.mini-link {
  border: none;
  background: transparent;
  padding: 0;
  font-size: 11px;
  color: var(--muted);
}
.mini-link:hover {
  color: var(--accent);
}
.mini-note {
  font-size: 11px;
  color: var(--muted);
}
.revision-detail {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
}
.detail-label {
  font-size: 10.5px;
  color: var(--muted);
  margin-bottom: 3px;
}
.detail-text {
  white-space: pre-wrap;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--ink-soft);
  background: var(--surface-2);
  border-radius: 7px;
  padding: 8px 10px;
  max-height: 220px;
  overflow-y: auto;
}
.drawer-foot {
  padding: 10px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
</style>
