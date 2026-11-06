<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { ChapterMatchField, ChapterSearchResult, TemplateKind } from '../api/types'
import { formatRelative, itemStatusLabels, statusLabels, templateKindLabels } from '../utils/format'

const novel = useNovelStore()
const navTab = ref<'outline' | 'character' | 'item' | 'chapter' | 'template'>('chapter')

const outlineCount = computed(() => novel.outlines.length)
const characterCount = computed(() => novel.characters.length)
const itemCount = computed(() => novel.items.length)
const chapterCount = computed(() => novel.chapters.length)

// 章节分页：几百章时也能快速定位，默认每页 20 章
const PAGE_SIZES = [10, 20, 50, 100]
const storedPageSize = Number(localStorage.getItem('moji:chapter-page-size'))
const pageSize = ref(PAGE_SIZES.includes(storedPageSize) ? storedPageSize : 20)
const currentPage = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(chapterCount.value / pageSize.value)))
const pagedChapters = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value
  return novel.chapters.slice(start, start + pageSize.value)
})
const pageStart = computed(() => (chapterCount.value ? (currentPage.value - 1) * pageSize.value + 1 : 0))
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, chapterCount.value))

watch([chapterCount, pageSize], () => {
  if (currentPage.value > totalPages.value) currentPage.value = totalPages.value
})

// 切换作品时回到第一页
watch(
  () => novel.project?.id,
  () => {
    currentPage.value = 1
  }
)

// 选中章节时自动翻到它所在的页（搜索跳转也能定位）
watch(
  () => novel.activeChapterId,
  (id) => {
    if (!id) return
    const index = novel.chapters.findIndex((chapter) => chapter.id === id)
    if (index >= 0) currentPage.value = Math.floor(index / pageSize.value) + 1
  }
)

function goPage(page: number) {
  currentPage.value = Math.max(1, Math.min(totalPages.value, page))
}

function onPageSizeInput(event: Event) {
  const size = Number((event.target as HTMLSelectElement).value)
  if (!PAGE_SIZES.includes(size)) return
  pageSize.value = size
  currentPage.value = 1
  try {
    localStorage.setItem('moji:chapter-page-size', String(size))
  } catch {
    /* 忽略存储失败 */
  }
}

function onPageJump(event: Event) {
  goPage(Number((event.target as HTMLSelectElement).value))
}

const matchLabels: Record<ChapterMatchField, string> = {
  title: '标题',
  summary: '章节大纲',
  body: '正文'
}

interface HighlightPart {
  text: string
  hit: boolean
}

function highlightParts(text: string, keyword: string): HighlightPart[] {
  const query = keyword.trim()
  if (!query || !text) return [{ text, hit: false }]
  const lowerText = text.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const parts: HighlightPart[] = []
  let cursor = 0
  let index = lowerText.indexOf(lowerQuery)
  while (index >= 0) {
    if (index > cursor) parts.push({ text: text.slice(cursor, index), hit: false })
    parts.push({ text: text.slice(index, index + query.length), hit: true })
    cursor = index + query.length
    index = lowerText.indexOf(lowerQuery, cursor)
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false })
  return parts
}

function openSearchResult(item: ChapterSearchResult, target: 'chapterOutline' | 'chapter') {
  void novel.selectChapter(item.id, target, item.blockId)
}

// 开始搜索时自动切到章节列表，避免结果被隐藏
watch(
  () => novel.chapterSearchActive,
  (active) => {
    if (active) navTab.value = 'chapter'
  }
)

async function addOutline(parentId: string | null = null) {
  await novel.createOutline(parentId)
}

function removeOutline(id: string) {
  if (!window.confirm('删除这个大纲条目？其下的子条目也会一并删除。')) return
  void novel.deleteOutline(id)
}

function removeChapter(id: string) {
  if (!window.confirm('删除这一章？正文、修改记录和版本历史都会一并删除，且无法恢复。')) return
  void novel.deleteChapter(id)
}

function removeCharacter(id: string) {
  if (!window.confirm('删除这个角色？其所有性格阶段会一并删除，且无法恢复。')) return
  void novel.deleteCharacter(id)
}

function removeItem(id: string) {
  if (!window.confirm('删除这件物品？它的属性、成长记录和状态记录都会一并删除，且无法恢复。')) return
  void novel.deleteItem(id)
}

function openTemplate(kind: TemplateKind) {
  void novel.openTemplate(kind)
}

function templateOf(kind: TemplateKind) {
  return novel.templates.find((entry) => entry.kind === kind) ?? null
}

function currentStageOf(character: { stages: Array<{ name: string; isCurrent: boolean }> }) {
  return character.stages.find((stage) => stage.isCurrent)?.name ?? (character.stages[0]?.name || '还没有阶段')
}
</script>

<template>
  <aside class="sidebar">
    <div class="side-brand">
      <span class="side-title">作品结构</span>
      <span class="side-count">
        {{ outlineCount }} 条大纲 · {{ characterCount }} 个角色 · {{ itemCount }} 件物品 · {{ chapterCount }} 章
      </span>
    </div>

    <div class="side-search">
      <span class="search-icon">⌕</span>
      <input
        class="search-input"
        type="text"
        placeholder="搜索章节标题 / 大纲 / 正文"
        :value="novel.chapterSearchQuery"
        @input="novel.setChapterSearch(($event.target as HTMLInputElement).value)"
        @keydown.esc="novel.clearChapterSearch()"
      />
      <span v-if="novel.chapterSearching" class="search-spinner" title="搜索中">…</span>
      <button
        v-else-if="novel.chapterSearchActive"
        class="search-clear"
        title="清空搜索"
        @click="novel.clearChapterSearch()"
      >
        ✕
      </button>
    </div>

    <nav class="side-nav">
      <button class="nav-btn" :class="{ active: navTab === 'outline' }" @click="navTab = 'outline'">
        <span class="nav-icon">◆</span>
        <span class="nav-label">大纲</span>
        <span class="nav-count">{{ outlineCount }}</span>
      </button>
      <button class="nav-btn" :class="{ active: navTab === 'character' }" @click="navTab = 'character'">
        <span class="nav-icon">◈</span>
        <span class="nav-label">角色</span>
        <span class="nav-count">{{ characterCount }}</span>
      </button>
      <button class="nav-btn" :class="{ active: navTab === 'item' }" @click="navTab = 'item'">
        <span class="nav-icon">▣</span>
        <span class="nav-label">物品</span>
        <span class="nav-count">{{ itemCount }}</span>
      </button>
      <button class="nav-btn" :class="{ active: navTab === 'chapter' }" @click="navTab = 'chapter'">
        <span class="nav-icon">§</span>
        <span class="nav-label">章节</span>
        <span class="nav-count">{{ chapterCount }}</span>
      </button>
      <button class="nav-btn" :class="{ active: navTab === 'template' }" @click="navTab = 'template'">
        <span class="nav-icon">▤</span>
        <span class="nav-label">模板</span>
        <span class="nav-count">{{ novel.templates.length }}</span>
      </button>
    </nav>

    <div class="side-scroll scroll-y">
      <!-- 大纲 -->
      <section v-if="navTab === 'outline'" class="side-section">
        <header class="panel-head">
          <span class="section-name">大纲</span>
          <button class="add-btn" title="新增大纲条目" @click="addOutline(null)">＋</button>
        </header>
        <div class="section-body">
          <div
            v-for="node in novel.outlineNodes"
            :key="node.item.id"
            class="outline-row"
            :class="{ active: novel.activeOutlineId === node.item.id }"
            :style="{ paddingLeft: `${10 + node.depth * 14}px` }"
            @click="novel.selectOutline(node.item.id)"
          >
            <span class="tree-mark">{{ node.depth === 0 ? '◆' : '·' }}</span>
            <span class="row-title">{{ node.item.title || '未命名大纲' }}</span>
            <div class="row-actions">
              <button class="mini" title="新增子条目" @click.stop="addOutline(node.item.id)">＋</button>
              <button class="mini" title="删除" @click.stop="removeOutline(node.item.id)">✕</button>
            </div>
          </div>
          <div v-if="!outlineCount" class="side-empty">
            还没有大纲。先写下故事主线、世界观和人物，再进入章节。
            <button class="link-btn" @click="addOutline(null)">新建第一条大纲</button>
          </div>
        </div>
      </section>

      <!-- 角色设定 -->
      <section v-if="navTab === 'character'" class="side-section">
        <header class="panel-head">
          <span class="section-name">角色</span>
          <button class="add-btn" title="新增角色" @click="novel.createCharacter()">＋</button>
        </header>
        <div class="section-body">
          <div
            v-for="item in novel.characters"
            :key="item.id"
            class="character-row"
            :class="{ active: novel.activeCharacterId === item.id }"
            @click="novel.selectCharacter(item.id)"
          >
            <span class="character-mark">◈</span>
            <div class="chapter-main">
              <div class="row-title">
                {{ item.name || '未命名角色' }}
                <span v-if="item.role" class="role-badge">{{ item.role }}</span>
              </div>
              <div class="row-preview">
                当前阶段：{{ currentStageOf(item) }}
                <span v-if="item.stages.length > 1"> · 共 {{ item.stages.length }} 个阶段</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="mini" title="删除角色" @click.stop="removeCharacter(item.id)">✕</button>
            </div>
          </div>
          <div v-if="!characterCount" class="side-empty">
            还没有角色。建一个角色，就能按「阶段」记录他是怎样一步步变化的。
            <button class="link-btn" @click="novel.createCharacter()">新建角色</button>
          </div>
        </div>
      </section>

      <!-- 物品 / 装备 -->
      <section v-if="navTab === 'item'" class="side-section">
        <header class="panel-head">
          <span class="section-name">物品</span>
          <button class="add-btn" title="新增物品" @click="novel.createItem()">＋</button>
        </header>
        <div class="section-body">
          <div
            v-for="entry in novel.items"
            :key="entry.id"
            class="item-row"
            :class="{ active: novel.activeItemId === entry.id && novel.mode === 'item' }"
            @click="novel.selectItem(entry.id)"
          >
            <span class="item-mark">▣</span>
            <div class="chapter-main">
              <div class="row-title">
                {{ entry.name || '未命名物品' }}
                <span class="item-status" :data-status="entry.status">
                  {{ itemStatusLabels[entry.status] || entry.status }}
                </span>
              </div>
              <div class="row-preview">
                {{ entry.category || '物品' }}
                <span v-if="entry.currentHolder"> · 持有人：{{ entry.currentHolder }}</span>
                <span v-else-if="entry.isDestroyed"> · 已损毁</span>
              </div>
            </div>
            <div class="row-actions">
              <button class="mini" title="删除物品" @click.stop="removeItem(entry.id)">✕</button>
            </div>
          </div>
          <div v-if="!itemCount" class="side-empty">
            还没有物品。武器、信物、关键道具都可以在这里记录来历与流转。
            <button class="link-btn" @click="novel.createItem()">新建物品</button>
          </div>
        </div>
      </section>

      <!-- 属性卡模板 -->
      <section v-if="navTab === 'template'" class="side-section">
        <header class="panel-head">
          <span class="section-name">属性卡模板</span>
        </header>
        <div class="section-body">
          <div
            v-for="kind in (['character', 'item'] as TemplateKind[])"
            :key="kind"
            class="template-row"
            :class="{ active: novel.mode === 'template' && novel.templateKind === kind }"
            @click="openTemplate(kind)"
          >
            <span class="template-mark">▤</span>
            <div class="chapter-main">
              <div class="row-title">{{ templateOf(kind)?.name || templateKindLabels[kind] }}</div>
              <div class="row-preview">
                {{ templateOf(kind)?.fields.length ?? 0 }} 个属性 · 点击设计模板
              </div>
            </div>
          </div>
          <div class="template-tip">
            模板决定属性卡上有哪些属性。人物和物品的当前值、成长记录都会跟着模板走。
          </div>
        </div>
      </section>

      <!-- 章节 -->
      <section v-if="navTab === 'chapter'" class="side-section">
        <header class="panel-head">
          <span class="section-name">章节</span>
          <button class="add-btn" title="新增章节" @click="novel.createChapter()">＋</button>
        </header>
        <div class="section-body">
          <template v-if="novel.chapterSearchActive">
            <div
              v-for="item in novel.chapterSearchResults"
              :key="`search-body-${item.id}`"
              class="chapter-row body-row search-row"
              :class="{ active: novel.activeChapterId === item.id && novel.mode === 'chapter' }"
              @click="openSearchResult(item, 'chapter')"
            >
              <div class="chapter-main">
                <div class="row-title">
                  <span
                    v-for="(part, index) in highlightParts(item.title || '未命名章节', novel.chapterSearchQuery)"
                    :key="index"
                    :class="{ 'hit-text': part.hit }"
                  >{{ part.text }}</span>
                </div>
                <div class="match-badges">
                  <span v-for="field in item.matchFields" :key="field" class="match-badge">
                    {{ matchLabels[field] }}
                  </span>
                  <span class="match-badge word-badge">{{ item.wordCount || 0 }} 字</span>
                </div>
                <div class="row-preview search-snippet">
                  <span
                    v-for="(part, index) in highlightParts(item.snippet, novel.chapterSearchQuery)"
                    :key="index"
                    :class="{ 'hit-text': part.hit }"
                  >{{ part.text }}</span>
                </div>
                <div class="row-meta">
                  <span v-if="item.updatedAt">{{ formatRelative(item.updatedAt) }}</span>
                </div>
              </div>
            </div>
            <div v-if="!novel.chapterSearchResults.length && !novel.chapterSearching" class="side-empty">
              没有找到包含「{{ novel.chapterSearchQuery.trim() }}」的章节。
            </div>
          </template>

          <template v-else>
            <div
              v-for="item in pagedChapters"
              :key="`body-${item.id}`"
              class="chapter-row"
              :class="{
                active:
                  novel.activeChapterId === item.id &&
                  (novel.mode === 'chapter' || novel.mode === 'chapterOutline')
              }"
              @click="novel.selectChapter(item.id, 'chapter')"
            >
              <span class="status-dot" :data-status="item.status" :title="statusLabels[item.status] || item.status" />
              <div class="chapter-main">
                <div class="row-title">{{ item.title || '未命名章节' }}</div>
                <div class="row-preview">{{ item.summary || '还没有章节大纲，点击开始规划' }}</div>
                <div class="row-meta">
                  <span>{{ item.wordCount || 0 }} 字</span>
                  <span v-if="item.updatedAt">· {{ formatRelative(item.updatedAt) }}</span>
                </div>
              </div>
              <div class="row-actions">
                <button class="mini" title="删除章节" @click.stop="removeChapter(item.id)">✕</button>
              </div>
            </div>
            <div v-if="!chapterCount" class="side-empty">
              还没有章节。先建一章，再写章节大纲。
              <button class="link-btn" @click="novel.createChapter()">新建章节</button>
            </div>
            <div v-if="chapterCount > 10" class="chapter-pager">
              <button class="pager-btn" :disabled="currentPage <= 1" title="上一页" @click="goPage(currentPage - 1)">
                ‹
              </button>
              <label class="pager-page">
                第
                <select :value="currentPage" @change="onPageJump">
                  <option v-for="page in totalPages" :key="page" :value="page">{{ page }}</option>
                </select>
                / {{ totalPages }} 页
              </label>
              <button
                class="pager-btn"
                :disabled="currentPage >= totalPages"
                title="下一页"
                @click="goPage(currentPage + 1)"
              >
                ›
              </button>
              <span class="pager-range">{{ pageStart }}–{{ pageEnd }} / {{ chapterCount }}</span>
              <label class="pager-size">
                每页
                <select :value="pageSize" @change="onPageSizeInput">
                  <option v-for="size in PAGE_SIZES" :key="size" :value="size">{{ size }}</option>
                </select>
              </label>
            </div>
          </template>
        </div>
      </section>
    </div>

    <footer class="side-foot">
      <span>共 {{ chapterCount }} 章</span>
      <span>{{ novel.totalWordCount.toLocaleString() }} 字</span>
    </footer>
  </aside>
</template>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: column;
  width: 264px;
  flex: 0 0 264px;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  min-height: 0;
}

.side-brand {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 14px 16px 10px;
}
.side-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.08em;
}
.side-count {
  font-size: 11px;
  color: var(--muted);
}

.side-nav {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 2px;
  margin: 0 8px 6px;
  padding: 3px;
  border-radius: 9px;
  background: var(--surface-3);
}
.nav-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: 5px 2px 4px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  transition: background 0.14s ease, color 0.14s ease;
}
.nav-btn:hover {
  color: var(--ink-soft);
  background: var(--surface-2);
}
.nav-btn.active {
  background: var(--surface);
  color: var(--accent);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
}
.nav-icon {
  font-size: 11px;
  line-height: 1.2;
}
.nav-label {
  font-size: 10.5px;
  line-height: 1.3;
  letter-spacing: 0.02em;
}
.nav-count {
  font-size: 9px;
  line-height: 1.2;
  color: var(--muted);
}
.nav-btn.active .nav-count {
  color: var(--accent);
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 10px 0 12px;
}
.panel-head .section-name {
  flex: 1;
}

.side-search {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  margin: 0 12px 8px;
  padding: 0 6px 0 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  transition: border-color 0.15s ease;
}
.side-search:focus-within {
  border-color: var(--accent);
}
.search-icon {
  flex: 0 0 auto;
  font-size: 14px;
  line-height: 1;
  color: var(--muted);
}
.search-input {
  flex: 1;
  min-width: 0;
  height: 26px;
  padding: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 11.5px;
  color: var(--ink);
}
.search-input::placeholder {
  color: var(--muted);
}
.search-clear,
.search-spinner {
  flex: 0 0 auto;
  padding: 2px 3px;
  border: none;
  background: transparent;
  font-size: 11px;
  line-height: 1;
  color: var(--muted);
}
.search-clear:hover {
  color: var(--danger);
}
.search-spinner {
  animation: search-pulse 1s ease-in-out infinite;
}
@keyframes search-pulse {
  0%,
  100% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
}

.match-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.match-badge {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
}
.word-badge {
  border: 1px dashed var(--border);
  background: transparent;
}
.search-snippet {
  margin-top: 5px;
}
.hit-text {
  border-radius: 2px;
  background: var(--accent-soft);
  color: var(--accent);
  padding: 0 1px;
}

.side-scroll {
  flex: 1;
  padding-bottom: 14px;
}

.side-section {
  border-top: 1px solid var(--border);
}
.section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 38px;
  padding: 0 10px 0 12px;
  cursor: pointer;
  user-select: none;
}
.section-head:hover {
  background: var(--surface-3);
}
.chevron {
  display: inline-block;
  font-size: 10px;
  color: var(--muted);
  transition: transform 0.16s ease;
}
.chevron.open {
  transform: rotate(90deg);
}
.section-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
  letter-spacing: 0.04em;
}
.section-count {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}
.add-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
}
.add-btn:hover {
  background: var(--surface);
  color: var(--accent);
}

.section-body {
  padding: 2px 6px 8px;
}

.outline-row,
.chapter-row,
.character-row,
.item-row,
.template-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 8px;
  border-radius: 7px;
  cursor: pointer;
  position: relative;
  transition: background 0.14s ease;
}
.outline-row:hover,
.chapter-row:hover,
.character-row:hover,
.item-row:hover,
.template-row:hover {
  background: var(--surface-3);
}
.outline-row.active,
.chapter-row.active,
.character-row.active,
.item-row.active,
.template-row.active {
  background: var(--accent-soft);
}
.outline-row.active .row-title,
.chapter-row.active .row-title,
.character-row.active .row-title,
.item-row.active .row-title,
.template-row.active .row-title {
  color: var(--accent);
}

.character-mark,
.item-mark,
.template-mark {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--accent-2);
}
.character-row,
.item-row,
.template-row {
  align-items: flex-start;
  padding: 8px;
}
.item-status {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--surface-3);
  color: var(--muted);
  font-size: 10px;
  font-weight: 400;
  vertical-align: 1px;
}
.item-status[data-status='intact'] {
  background: var(--success-soft, var(--accent-2-soft));
  color: var(--success, var(--accent-2));
}
.item-status[data-status='destroyed'] {
  background: var(--danger-soft, #fbe9e7);
  color: var(--danger);
}
.item-status[data-status='lost'],
.item-status[data-status='unknown'] {
  background: var(--accent-soft);
  color: var(--accent);
}
.template-tip {
  padding: 8px 10px 4px;
  font-size: 10.5px;
  line-height: 1.7;
  color: var(--muted);
}
.role-badge {
  margin-left: 5px;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 10px;
  font-weight: 400;
  vertical-align: 1px;
}

.tree-mark {
  font-size: 10px;
  color: var(--border-strong);
  flex: 0 0 auto;
}
.outline-row.active .tree-mark {
  color: var(--accent);
}

.row-title {
  min-width: 0;
  flex: 1;
  font-size: 12.5px;
  line-height: 1.4;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.row-actions {
  display: none;
  align-items: center;
  gap: 2px;
}
.outline-row:hover .row-actions,
.chapter-row:hover .row-actions,
.character-row:hover .row-actions,
.item-row:hover .row-actions {
  display: flex;
}
.mini {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
  line-height: 1;
}
.mini:hover {
  background: var(--surface);
  color: var(--accent);
}
.mini[title='删除']:hover,
.mini[title='删除章节']:hover,
.mini[title='删除物品']:hover {
  color: var(--danger);
}

.chapter-row {
  align-items: flex-start;
  padding: 8px;
}
.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 6px;
  background: var(--border-strong);
  flex: 0 0 auto;
}
.status-dot[data-status='writing'] {
  background: var(--accent);
}
.status-dot[data-status='done'] {
  background: var(--success);
}
.chapter-main {
  min-width: 0;
  flex: 1;
}
.row-preview {
  margin-top: 3px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--muted);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.body-row {
  align-items: center;
}
.row-meta {
  display: flex;
  gap: 5px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
}

.side-empty {
  padding: 10px 10px 12px;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}
.link-btn {
  display: block;
  margin-top: 6px;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11.5px;
  text-align: left;
}
.link-btn:hover {
  text-decoration: underline;
}

.chapter-pager {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--border);
  font-size: 10.5px;
  color: var(--muted);
}
.pager-btn {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 13px;
}
.pager-btn:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent);
}
.pager-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.pager-page,
.pager-size {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.pager-page select,
.pager-size select {
  height: 24px;
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 10.5px;
  color: var(--ink-soft);
  outline: none;
  cursor: pointer;
}
.pager-page select:focus,
.pager-size select:focus {
  border-color: var(--accent);
}
.pager-range {
  margin-left: auto;
  color: var(--muted);
}

.side-foot {
  display: flex;
  justify-content: space-between;
  padding: 10px 14px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-2);
}

@media (max-width: 900px) {
  .sidebar {
    width: 220px;
    flex-basis: 220px;
  }
}
</style>
