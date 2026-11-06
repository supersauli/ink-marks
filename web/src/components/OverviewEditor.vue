<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { OverviewCell, OverviewCharacter } from '../api/types'
import { itemStatusLabels } from '../utils/format'
import OverviewCharacterPanel from './OverviewCharacterPanel.vue'
import OverviewDiffPanel from './OverviewDiffPanel.vue'

const novel = useNovelStore()

const FILTER_KEY = 'moji:overview-filter'

interface FilterCache {
  hidden?: string[]
  from?: number | null
  to?: number | null
}

function readCache(): FilterCache {
  try {
    const parsed = JSON.parse(localStorage.getItem(FILTER_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

const cached = readCache()
const hiddenIds = ref<string[]>(Array.isArray(cached.hidden) ? cached.hidden : [])
const rangeFrom = ref<number | null>(typeof cached.from === 'number' ? cached.from : null)
const rangeTo = ref<number | null>(typeof cached.to === 'number' ? cached.to : null)

watch(
  [hiddenIds, rangeFrom, rangeTo],
  () => {
    try {
      localStorage.setItem(
        FILTER_KEY,
        JSON.stringify({ hidden: hiddenIds.value, from: rangeFrom.value, to: rangeTo.value })
      )
    } catch {
      /* 忽略存储失败 */
    }
  },
  { deep: true }
)

const loading = computed(() => novel.overviewLoading && !novel.overview)
const chapters = computed(() => novel.overview?.chapters ?? [])
const characters = computed(() => novel.overview?.characters ?? [])
const fields = computed(() => novel.overview?.fields ?? [])

const range = computed(() => {
  const total = chapters.value.length
  if (!total) return { start: 0, end: -1 }
  const clamp = (value: number) => Math.max(0, Math.min(total - 1, value))
  const a = clamp(rangeFrom.value ?? 0)
  const b = clamp(rangeTo.value ?? total - 1)
  return a <= b ? { start: a, end: b } : { start: b, end: a }
})

const visibleChapters = computed(() => {
  const list = chapters.value
  if (range.value.end < range.value.start) return []
  return list.slice(range.value.start, range.value.end + 1)
})

const visibleCharacters = computed(() => characters.value.filter((entry) => !hiddenIds.value.includes(entry.id)))

function isVisible(id: string) {
  return !hiddenIds.value.includes(id)
}

function toggleCharacter(id: string) {
  if (isVisible(id)) hiddenIds.value = [...hiddenIds.value, id]
  else hiddenIds.value = hiddenIds.value.filter((entry) => entry !== id)
}

function selectAllCharacters() {
  hiddenIds.value = []
}

function hideAllCharacters() {
  hiddenIds.value = characters.value.map((entry) => entry.id)
}

function onRangeInput(kind: 'from' | 'to', event: Event) {
  const index = Number((event.target as HTMLSelectElement).value)
  if (Number.isNaN(index)) return
  if (kind === 'from') rangeFrom.value = index
  else rangeTo.value = index
}

function resetRange() {
  rangeFrom.value = null
  rangeTo.value = null
}

function filledAttributes(cell: OverviewCell | null) {
  if (!cell) return []
  return cell.attributes.filter((attr) => attr.value !== null && String(attr.value).trim() !== '')
}

function itemsOf(cell: OverviewCell | null) {
  return cell?.items ?? []
}

function skillsOf(cell: OverviewCell | null) {
  return cell?.skills ?? []
}

const CHARACTER_STATUS_LABELS: Record<string, string> = {
  alive: '存活',
  dead: '死亡',
  missing: '失踪',
  unknown: '未知'
}

function characterStatusLabel(status: string) {
  return CHARACTER_STATUS_LABELS[status] || status || '未知'
}

function openCharacter(character: OverviewCharacter) {
  void novel.selectCharacter(character.id)
}

function openItem(itemId: string) {
  void novel.selectItem(itemId)
}

// ---------------------------------------------------------------------------
// 该章角色卡：点格子打开右侧面板，再点别的格子直接切换
// ---------------------------------------------------------------------------
const cardTarget = ref<{ characterId: string; index: number } | null>(null)

const cardCharacter = computed(() => {
  const target = cardTarget.value
  if (!target) return null
  return characters.value.find((entry) => entry.id === target.characterId) ?? null
})

const cardCell = computed(() => {
  const target = cardTarget.value
  if (!target || !cardCharacter.value) return null
  return cardCharacter.value.cells[target.index] ?? null
})

const cardChapter = computed(() => {
  const target = cardTarget.value
  if (!target) return null
  return chapters.value[target.index] ?? null
})

const cardProfile = computed(() => {
  const target = cardTarget.value
  if (!target) return null
  return novel.characters.find((entry) => entry.id === target.characterId) ?? null
})

const cardChapterIndex = computed(() => cardTarget.value?.index ?? 0)

const cardChapterSummary = computed(() => {
  const id = cardChapter.value?.id
  if (!id) return ''
  return novel.chapters.find((entry) => entry.id === id)?.summary ?? cardChapter.value?.summary ?? ''
})

function openCard(character: OverviewCharacter, index: number) {
  diffTarget.value = null
  cardTarget.value = { characterId: character.id, index }
}

function closeCard() {
  cardTarget.value = null
}

function isCardActive(characterId: string, index: number) {
  return cardTarget.value?.characterId === characterId && cardTarget.value?.index === index
}

function openCardCharacter(id: string) {
  cardTarget.value = null
  void novel.selectCharacter(id)
}

function openCardItem(id: string) {
  cardTarget.value = null
  void novel.selectItem(id)
}

// ---------------------------------------------------------------------------
// 连续章节里状态没变就并成一格；状态变了才在边界给一个「对比」
// ---------------------------------------------------------------------------
interface RowGroup {
  start: number
  end: number
  cell: OverviewCell
  changed: boolean
}

function cellSignature(cell: OverviewCell | null): string {
  if (!cell) return 'none'
  if (!cell.debuted) return 'absent'
  return [
    cell.stage?.id ?? '',
    cell.status,
    cell.attributes.map((attr) => `${attr.fieldId}=${attr.value ?? ''}`).join('|'),
    cell.skills.map((skill) => `${skill.id}:${skill.level}`).join('|'),
    cell.items.map((item) => `${item.id}:${item.status}`).join('|')
  ].join('~')
}

const rows = computed(() =>
  visibleCharacters.value.map((character) => {
    const groups: RowGroup[] = []
    for (let index = range.value.start; index <= range.value.end; index += 1) {
      const cell = character.cells[index]
      if (!cell) continue
      const signature = cellSignature(cell)
      const last = groups[groups.length - 1]
      if (last && cellSignature(last.cell) === signature) {
        last.end = index
        continue
      }
      const previous = index > 0 ? character.cells[index - 1] ?? null : null
      groups.push({
        start: index,
        end: index,
        cell,
        changed: Boolean(previous) && cellSignature(previous) !== signature
      })
    }
    return { character, groups }
  })
)

function groupRange(group: RowGroup) {
  return group.end > group.start ? `第 ${group.start + 1}-${group.end + 1} 章` : ''
}

const groupsByCharacter = computed(() => {
  const map = new Map<string, RowGroup[]>()
  for (const row of rows.value) map.set(row.character.id, row.groups)
  return map
})

function groupsOf(character: OverviewCharacter) {
  return groupsByCharacter.value.get(character.id) ?? []
}

// 对比：上一次变化前 vs 变化后
const diffTarget = ref<{ characterId: string; from: number; to: number } | null>(null)

const diffCharacter = computed(() => {
  const target = diffTarget.value
  if (!target) return null
  return characters.value.find((entry) => entry.id === target.characterId) ?? null
})

const diffFromCell = computed(() => {
  const target = diffTarget.value
  if (!target || !diffCharacter.value) return null
  return diffCharacter.value.cells[target.from] ?? null
})

const diffToCell = computed(() => {
  const target = diffTarget.value
  if (!target || !diffCharacter.value) return null
  return diffCharacter.value.cells[target.to] ?? null
})

const diffFromChapter = computed(() => {
  const target = diffTarget.value
  return target ? chapters.value[target.from] ?? null : null
})

const diffToChapter = computed(() => {
  const target = diffTarget.value
  return target ? chapters.value[target.to] ?? null : null
})

const diffProfile = computed(() => {
  const target = diffTarget.value
  if (!target) return null
  return novel.characters.find((entry) => entry.id === target.characterId) ?? null
})

function openDiff(character: OverviewCharacter, from: number, to: number) {
  cardTarget.value = null
  diffTarget.value = { characterId: character.id, from, to }
}

function closeDiff() {
  diffTarget.value = null
}

function openDiffCharacter(id: string) {
  diffTarget.value = null
  void novel.selectCharacter(id)
}

function openCardFromDiff() {
  const target = diffTarget.value
  if (!target) return
  cardTarget.value = { characterId: target.characterId, index: target.to }
  diffTarget.value = null
}

function refresh() {
  void novel.loadOverview()
}

function statusLabel(status: string) {
  return itemStatusLabels[status] || status || '未知'
}
</script>

<template>
  <div class="overview-editor">
    <header class="overview-head">
      <div class="crumbs">
        <span>{{ novel.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">人物总览</span>
      </div>

      <div class="title-row">
        <div class="title-main">
          <h1 class="title">人物总览</h1>
          <p class="title-hint">
            横轴是章节，纵轴是人物。同一个角色的状态没变时，中间不会重复显示，只留一格并标出章数范围。<br />
            状态变了的边界上会出现「⇄ 对比」，点开看这一章前后的差异；点任意一格，右侧打开该章的角色卡。
          </p>
        </div>
        <button class="btn btn-sm" :disabled="novel.overviewLoading" @click="refresh">
          {{ novel.overviewLoading ? '刷新中…' : '刷新数据' }}
        </button>
      </div>

      <div class="filter-bar">
        <div class="filter-block">
          <span class="filter-label">人物</span>
          <div class="chip-list">
            <button
              v-for="entry in characters"
              :key="entry.id"
              class="filter-chip"
              :class="{ muted: !isVisible(entry.id) }"
              :title="entry.role || '未填写定位'"
              @click="toggleCharacter(entry.id)"
            >
              <span class="chip-dot" />
              {{ entry.name || '未命名角色' }}
            </button>
            <span v-if="!characters.length" class="filter-empty">还没有角色</span>
          </div>
          <div class="filter-actions">
            <button class="link-btn" @click="selectAllCharacters">全选</button>
            <button class="link-btn" @click="hideAllCharacters">全不选</button>
          </div>
        </div>

        <div class="filter-block range-block">
          <span class="filter-label">章节范围</span>
          <label class="range-field">
            <select :value="range.start" @change="onRangeInput('from', $event)">
              <option v-for="(chapter, index) in chapters" :key="chapter.id" :value="index">
                {{ index + 1 }}. {{ chapter.title || '未命名章节' }}
              </option>
            </select>
          </label>
          <span class="range-sep">→</span>
          <label class="range-field">
            <select :value="range.end" @change="onRangeInput('to', $event)">
              <option v-for="(chapter, index) in chapters" :key="chapter.id" :value="index">
                {{ index + 1 }}. {{ chapter.title || '未命名章节' }}
              </option>
            </select>
          </label>
          <button class="link-btn" @click="resetRange">全部章节</button>
        </div>

        <div class="filter-summary">
          <span>{{ visibleCharacters.length }} / {{ characters.length }} 人</span>
          <span class="summary-sep">·</span>
          <span>{{ visibleChapters.length }} / {{ chapters.length }} 章</span>
        </div>
      </div>
    </header>

    <div class="overview-body scroll-y">
      <div v-if="loading" class="state-tip">正在汇总人物状态…</div>
      <div v-else-if="!chapters.length" class="state-tip">
        这部作品还没有章节。先建立章节和章节大纲，总览才能按章节展开。
      </div>
      <div v-else-if="!characters.length" class="state-tip">
        还没有角色。先到「角色」页创建人物，并记录属性成长与性格阶段。
      </div>
      <div v-else-if="!visibleCharacters.length" class="state-tip">人物都被筛掉了，点击上方人名重新显示。</div>
      <div v-else class="matrix-wrap">
        <table class="matrix">
          <thead>
            <tr>
              <th class="name-col corner">
                <span class="corner-top">人物</span>
                <span class="corner-bottom">章节</span>
              </th>
              <th v-for="(chapter, index) in visibleChapters" :key="chapter.id" class="chapter-col" :title="chapter.title">
                <span class="chapter-order">{{ range.start + index + 1 }}</span>
                <span class="chapter-title">{{ chapter.title || '未命名章节' }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="character in visibleCharacters" :key="character.id">
              <th class="name-col">
                <button class="name-btn" :title="'打开角色：' + (character.name || '未命名角色')" @click="openCharacter(character)">
                  {{ character.name || '未命名角色' }}
                </button>
                <span v-if="character.role || character.gender" class="name-role">
                  {{ character.role }}<span v-if="character.role && character.gender"> · </span>{{ character.gender }}
                </span>
              </th>
              <td
                v-for="group in groupsOf(character)"
                :key="group.start"
                class="cell"
                :class="{
                  'cell-clickable': true,
                  'cell-changed': group.changed,
                  'cell-active': isCardActive(character.id, group.start)
                }"
                :colspan="group.end - group.start + 1"
                title="点击查看该章角色卡"
                @click="openCard(character, group.start)"
              >
                <div v-if="group.changed" class="cell-head">
                  <button
                    class="diff-chip"
                    title="对比这一章前后的状态变化"
                    @click.stop="openDiff(character, group.start - 1, group.start)"
                  >
                    ⇄ 对比
                  </button>
                </div>
                <div v-if="!group.cell.debuted" class="cell-not-debuted">
                  未登场
                  <span v-if="groupRange(group)" class="group-range">{{ groupRange(group) }}</span>
                </div>
                <template v-else>
                  <div class="cell-badges">
                    <span
                      v-if="group.cell?.status && group.cell?.status !== 'alive'"
                      class="cell-status"
                      :data-status="group.cell?.status"
                      :title="'这一章的人物状态：' + characterStatusLabel(group.cell?.status ?? '')"
                    >
                      {{ characterStatusLabel(group.cell?.status ?? '') }}
                    </span>
                    <button
                      v-if="group.cell?.stage"
                      class="stage-tag"
                      :title="group.cell?.stage?.period || '这个阶段从该章节开始生效'"
                      @click.stop="openCard(character, group.start)"
                    >
                      {{ group.cell?.stage?.name }}
                    </button>
                    <span v-if="groupRange(group)" class="group-range">{{ groupRange(group) }}</span>
                  </div>
                  <div v-if="filledAttributes(group.cell).length" class="attr-line">
                    <span
                      v-for="attr in filledAttributes(group.cell)"
                      :key="attr.fieldId"
                      class="attr-chip"
                    >
                      <span class="attr-label">{{ attr.label }}</span>
                      <span class="attr-value">{{ attr.value }}</span>
                      <span v-if="attr.unit" class="attr-unit">{{ attr.unit }}</span>
                    </span>
                  </div>
                  <div v-if="skillsOf(group.cell).length" class="skill-line">
                    <button
                      v-for="entry in skillsOf(group.cell)"
                      :key="entry.id"
                      class="skill-chip"
                      :title="`技能：${entry.name}${entry.level ? ' · ' + entry.level : ''}，点击打开角色页`"
                      @click.stop="openCharacter(character)"
                    >
                      ✧ {{ entry.name }}
                      <span v-if="entry.level" class="skill-level">{{ entry.level }}</span>
                    </button>
                  </div>
                  <div v-if="itemsOf(group.cell).length" class="item-line">
                    <button
                      v-for="entry in itemsOf(group.cell)"
                      :key="entry.id"
                      class="item-chip"
                      :data-status="entry.status"
                      :title="`${entry.category || '物品'} · ${statusLabel(entry.status)}，点击打开物品页`"
                      @click.stop="openItem(entry.id)"
                    >
                      <span class="item-dot" />
                      {{ entry.name }}
                    </button>
                  </div>
                  <span
                    v-if="
                      !group.cell?.stage &&
                      !filledAttributes(group.cell).length &&
                      !skillsOf(group.cell).length &&
                      !itemsOf(group.cell).length
                    "
                    class="cell-empty"
                  >
                    —
                  </span>
                </template>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="fields.length && !loading" class="legend">
        <span class="legend-title">显示的属性：</span>
        <span v-for="field in fields" :key="field.id" class="legend-item">
          {{ field.label }}<span v-if="field.unit" class="legend-unit">（{{ field.unit }}）</span>
        </span>
      </div>
    </div>

    <OverviewCharacterPanel
      :character="cardCharacter"
      :cell="cardCell"
      :chapter="cardChapter"
      :chapter-summary="cardChapterSummary"
      :chapter-index="cardChapterIndex"
      :chapters="chapters"
      :fields="fields"
      :profile="cardProfile"
      @close="closeCard"
      @open-character="openCardCharacter"
      @open-item="openCardItem"
    />

    <OverviewDiffPanel
      :character="diffCharacter"
      :from-cell="diffFromCell"
      :to-cell="diffToCell"
      :from-chapter="diffFromChapter"
      :to-chapter="diffToChapter"
      :from-index="diffTarget?.from ?? 0"
      :to-index="diffTarget?.to ?? 0"
      :fields="fields"
      :profile="diffProfile"
      @close="closeDiff"
      @open-card="openCardFromDiff"
      @open-character="openDiffCharacter"
    />
  </div>
</template>

<style scoped>
.overview-editor {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: var(--surface);
}

.overview-head {
  flex: 0 0 auto;
  padding: 16px clamp(18px, 3vw, 36px) 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
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

.title-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
}
.title-main {
  flex: 1;
  min-width: 0;
}
.title {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink);
}
.title-hint {
  margin: 4px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 10px 22px;
  margin-top: 14px;
}
.filter-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}
.filter-label {
  flex: 0 0 auto;
  font-size: 11.5px;
  color: var(--muted);
}
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.filter-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface-2);
  font-size: 11.5px;
  color: var(--ink-soft);
  transition: border-color 0.14s ease, background 0.14s ease, color 0.14s ease;
}
.filter-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.filter-chip.muted {
  border-style: dashed;
  background: transparent;
  color: var(--muted);
  text-decoration: line-through;
}
.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-2);
}
.filter-chip.muted .chip-dot {
  background: var(--border-strong);
}
.filter-empty {
  font-size: 11.5px;
  color: var(--muted);
}
.filter-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.range-block {
  gap: 6px;
}
.range-field select {
  height: 26px;
  max-width: 190px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  outline: none;
  font-size: 11.5px;
  color: var(--ink-soft);
  cursor: pointer;
}
.range-field select:focus {
  border-color: var(--accent);
}
.range-sep {
  font-size: 11px;
  color: var(--muted);
}

.filter-summary {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.summary-sep {
  color: var(--border-strong);
}

.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11.5px;
}
.link-btn:hover {
  text-decoration: underline;
}

.overview-body {
  flex: 1;
  min-height: 0;
  padding: 14px clamp(18px, 3vw, 36px) 40px;
  background: var(--bg);
}

.state-tip {
  margin-top: 20px;
  padding: 20px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  background: var(--surface);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--muted);
  text-align: center;
}

.matrix-wrap {
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: var(--shadow-soft);
  overflow: auto;
  max-height: 100%;
}

.matrix {
  border-collapse: separate;
  border-spacing: 0;
  width: max-content;
  min-width: 100%;
}

.matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface-2);
}

.name-col {
  position: sticky;
  left: 0;
  z-index: 3;
  width: 132px;
  min-width: 132px;
  max-width: 132px;
  padding: 8px 12px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  text-align: left;
  font-weight: 400;
}

.corner {
  z-index: 4;
  background: var(--surface-2);
}
.corner-top,
.corner-bottom {
  display: block;
  font-size: 10.5px;
  color: var(--muted);
  letter-spacing: 0.08em;
}
.corner-bottom {
  text-align: right;
  padding-top: 2px;
}
.corner-top::after {
  content: ' ↓';
  color: var(--border-strong);
}

.name-btn {
  display: block;
  max-width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.name-btn:hover {
  color: var(--accent);
}
.name-role {
  display: block;
  margin-top: 2px;
  font-size: 10px;
  color: var(--muted);
}

.chapter-col {
  min-width: 84px;
  width: 84px;
  padding: 8px 8px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}
.chapter-order {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 17px;
  height: 17px;
  margin-right: 5px;
  padding: 0 4px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10px;
  color: var(--muted);
}
.chapter-title {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--ink-soft);
  line-height: 1.45;
}

.cell {
  min-width: 84px;
  padding: 9px 10px;
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.cell-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.diff-chip {
  flex: 0 0 auto;
  padding: 1px 7px;
  border: 1px solid var(--accent);
  border-radius: 20px;
  background: var(--surface);
  color: var(--accent);
  font-size: 10px;
  line-height: 1.6;
  white-space: nowrap;
}
.diff-chip:hover {
  background: var(--accent);
  color: #fff;
}
.group-range {
  font-size: 9.5px;
  color: var(--muted);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
.cell[data-empty='true'] {
  background: var(--surface-2);
}
.cell-clickable {
  cursor: pointer;
  transition: background 0.14s ease, box-shadow 0.14s ease;
}
.cell-clickable:hover {
  background: var(--accent-soft) !important;
  box-shadow: inset 0 0 0 1px var(--accent);
}
.cell-changed {
  box-shadow: inset 2px 0 0 var(--accent);
}
.cell-active {
  background: var(--accent-soft) !important;
  box-shadow: inset 0 0 0 2px var(--accent);
}
tbody tr:hover .cell {
  background: rgba(0, 0, 0, 0.015);
}
[data-theme='dark'] tbody tr:hover .cell {
  background: rgba(255, 255, 255, 0.03);
}

.stage-tag {
  display: inline-block;
  max-width: 100%;
  padding: 1px 7px;
  border: 1px solid var(--accent-2);
  border-radius: 5px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.stage-tag:hover {
  background: var(--accent-2);
  color: #fff;
}

.cell-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.cell-status {
  display: inline-block;
  padding: 1px 7px;
  border: 1px solid var(--accent);
  border-radius: 5px;
  background: var(--accent-soft);
  color: var(--accent);
  font-size: 10px;
  font-weight: 600;
}
.cell-status[data-status='dead'] {
  border-color: var(--danger);
  background: var(--danger-soft);
  color: var(--danger);
}
.cell-status[data-status='unknown'] {
  border-color: var(--border-strong);
  background: var(--surface-2);
  color: var(--muted);
}
.cell-not-debuted {
  font-size: 10.5px;
  color: var(--border-strong);
  letter-spacing: 0.04em;
}
.not-debut-note {
  font-size: 9.5px;
  color: var(--muted);
  letter-spacing: 0;
}

.skill-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.skill-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  max-width: 100%;
  padding: 1px 6px;
  border: 1px dashed var(--accent-2);
  border-radius: 5px;
  background: var(--accent-2-soft);
  font-size: 10.5px;
  color: var(--accent-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-chip:hover {
  background: var(--accent-2);
  color: #fff;
}
.skill-level {
  font-size: 9.5px;
  opacity: 0.75;
}

.attr-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.attr-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 5px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 10.5px;
  color: var(--muted);
  white-space: nowrap;
}
.attr-label {
  color: var(--muted);
}
.attr-value {
  font-weight: 600;
  color: var(--ink-soft);
}
.attr-unit {
  font-size: 9.5px;
  color: var(--muted);
}

.item-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.item-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 100%;
  padding: 1px 7px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  font-size: 10.5px;
  color: var(--ink-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.item-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.item-dot {
  flex: 0 0 auto;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--success);
}
.item-chip[data-status='lost'] .item-dot,
.item-chip[data-status='unknown'] .item-dot {
  background: var(--accent);
}
.item-chip[data-status='sealed'] .item-dot {
  background: var(--accent-2);
}
.item-chip[data-status='destroyed'] .item-dot {
  background: var(--danger);
}

.cell-empty {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: var(--border-strong);
}

.legend {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px 12px;
  margin-top: 12px;
  font-size: 10.5px;
  color: var(--muted);
}
.legend-title {
  color: var(--muted);
}
.legend-item {
  color: var(--ink-soft);
}
.legend-unit {
  color: var(--muted);
}

@media (max-width: 900px) {
  .filter-summary {
    margin-left: 0;
  }
}
</style>
