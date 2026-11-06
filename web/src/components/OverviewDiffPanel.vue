<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { Character, OverviewCell, OverviewChapter, OverviewCharacter, OverviewField } from '../api/types'
import { itemStatusLabels } from '../utils/format'

const props = defineProps<{
  character: OverviewCharacter | null
  fromCell: OverviewCell | null
  toCell: OverviewCell | null
  fromChapter: OverviewChapter | null
  toChapter: OverviewChapter | null
  fromIndex: number
  toIndex: number
  fields: OverviewField[]
  profile: Character | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'open-card'): void
  (event: 'open-character', id: string): void
}>()

const CHARACTER_STATUS_LABELS: Record<string, string> = {
  alive: '存活',
  dead: '死亡',
  missing: '失踪',
  unknown: '未知'
}

const open = computed(() => Boolean(props.character && props.toChapter))

function statusText(cell: OverviewCell | null) {
  if (!cell || !cell.debuted) return '未登场'
  const status = cell.status ?? ''
  return CHARACTER_STATUS_LABELS[status] || status || '未知'
}

const stageFrom = computed(() => (props.fromCell?.debuted ? props.fromCell?.stage?.name ?? '（未关联阶段）' : '未登场'))
const stageTo = computed(() => (props.toCell?.debuted ? props.toCell?.stage?.name ?? '（未关联阶段）' : '未登场'))
const stageChanged = computed(() => stageFrom.value !== stageTo.value)
const isDebut = computed(() => !props.fromCell?.debuted && Boolean(props.toCell?.debuted))

const stageDetailTo = computed(() => {
  const id = props.toCell?.stage?.id
  if (!id || !props.profile) return null
  return props.profile.stages.find((stage) => stage.id === id) ?? null
})

const statusChanged = computed(() => statusText(props.fromCell) !== statusText(props.toCell))

const attributeDiffs = computed(() =>
  props.fields.map((field) => {
    const before = props.fromCell?.attributes.find((attr) => attr.fieldId === field.id)?.value ?? null
    const after = props.toCell?.attributes.find((attr) => attr.fieldId === field.id)?.value ?? null
    const normalize = (value: string | number | null) =>
      value === null || String(value).trim() === '' ? '—' : String(value)
    return {
      id: field.id,
      label: field.label,
      unit: field.unit,
      from: normalize(before),
      to: normalize(after),
      changed: normalize(before) !== normalize(after)
    }
  })
)

const changedAttributes = computed(() => attributeDiffs.value.filter((entry) => entry.changed))

function skillMap(cell: OverviewCell | null) {
  const map = new Map<string, { name: string; level: string }>()
  for (const skill of cell?.skills ?? []) map.set(skill.id, { name: skill.name, level: skill.level ?? '' })
  return map
}

const skillDiff = computed(() => {
  const before = skillMap(props.fromCell)
  const after = skillMap(props.toCell)
  const added = [...after.entries()].filter(([id]) => !before.has(id)).map(([, value]) => value)
  const removed = [...before.entries()].filter(([id]) => !after.has(id)).map(([, value]) => value)
  return { added, removed }
})

function itemMap(cell: OverviewCell | null) {
  const map = new Map<string, { name: string; status: string }>()
  for (const item of cell?.items ?? []) map.set(item.id, { name: item.name, status: item.status })
  return map
}

const itemDiff = computed(() => {
  const before = itemMap(props.fromCell)
  const after = itemMap(props.toCell)
  const added = [...after.entries()]
    .filter(([id]) => !before.has(id))
    .map(([, value]) => ({ ...value, note: '新增' }))
  const removed = [...before.entries()]
    .filter(([id]) => !after.has(id))
    .map(([, value]) => ({ ...value, note: '不再持有' }))
  const statusChanged = [...after.entries()]
    .filter(([id, value]) => before.has(id) && before.get(id)!.status !== value.status)
    .map(([id, value]) => ({
      ...value,
      note: `${itemStatusLabels[before.get(id)!.status] || before.get(id)!.status} → ${
        itemStatusLabels[value.status] || value.status
      }`
    }))
  return { added, removed, statusChanged }
})

const nothingChanged = computed(
  () =>
    !stageChanged.value &&
    !statusChanged.value &&
    !changedAttributes.value.length &&
    !skillDiff.value.added.length &&
    !skillDiff.value.removed.length &&
    !itemDiff.value.added.length &&
    !itemDiff.value.removed.length &&
    !itemDiff.value.statusChanged.length
)

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Transition name="diff-panel">
    <aside v-if="open && character && toChapter" class="diff-panel">
      <header class="panel-head">
        <div class="head-text">
          <div class="panel-kicker">状态变化 · 第 {{ fromIndex + 1 }} 章 → 第 {{ toIndex + 1 }} 章</div>
          <h2 class="panel-name">{{ character.name || '未命名角色' }}</h2>
          <div class="panel-meta">
            <span class="meta-item">{{ fromChapter?.title || '上一章' }}</span>
            <span class="meta-arrow">→</span>
            <span class="meta-item">{{ toChapter.title || '这一章' }}</span>
          </div>
        </div>
        <button class="panel-close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </header>

      <div class="panel-body scroll-y">
        <p v-if="nothingChanged" class="block-empty">这两章之间的角色卡没有变化。</p>

        <template v-else>
          <section v-if="isDebut" class="diff-block">
            <div class="block-title">首次登场</div>
            <div class="debut-line">
              <span class="stage-to">{{ stageTo }}</span>
              <span class="debut-note">第 {{ toIndex + 1 }} 章 · {{ statusText(toCell) }}</span>
            </div>
            <p class="stage-note">这一章之前，{{ character.name }}不在场。</p>
            <p v-if="stageDetailTo?.traits" class="debut-traits">{{ stageDetailTo.traits }}</p>
          </section>

          <section v-if="!isDebut && stageChanged" class="diff-block">
            <div class="block-title">性格阶段</div>
            <div class="stage-swap">
              <span class="stage-from">{{ stageFrom }}</span>
              <span class="swap-arrow">→</span>
              <span class="stage-to">{{ stageTo }}</span>
            </div>
            <p v-if="stageDetailTo" class="stage-note">{{ stageDetailTo.period || '新阶段' }}</p>
          </section>

          <section v-if="!isDebut && statusChanged" class="diff-block">
            <div class="block-title">章节状态</div>
            <div class="stage-swap">
              <span class="stage-from">{{ statusText(fromCell) }}</span>
              <span class="swap-arrow">→</span>
              <span class="stage-to">{{ statusText(toCell) }}</span>
            </div>
          </section>

          <section v-if="changedAttributes.length" class="diff-block">
            <div class="block-title">
              属性
              <span class="block-note">{{ changedAttributes.length }} 项变化</span>
            </div>
            <ul class="diff-list">
              <li v-for="entry in changedAttributes" :key="entry.id" class="diff-row row-changed">
                <span class="row-label">{{ entry.label }}</span>
                <span class="row-before">{{ entry.from }}<span v-if="entry.unit && entry.from !== '—'" class="row-unit">{{ entry.unit }}</span></span>
                <span class="row-arrow">→</span>
                <span class="row-after">{{ entry.to }}<span v-if="entry.unit && entry.to !== '—'" class="row-unit">{{ entry.unit }}</span></span>
              </li>
            </ul>
          </section>

          <section v-if="skillDiff.added.length || skillDiff.removed.length" class="diff-block">
            <div class="block-title">技能</div>
            <div class="chip-row">
              <span v-for="skill in skillDiff.added" :key="'add-' + skill.name" class="skill-chip added">
                ＋ {{ skill.name }}
              </span>
              <span v-for="skill in skillDiff.removed" :key="'del-' + skill.name" class="skill-chip removed">
                － {{ skill.name }}
              </span>
            </div>
          </section>

          <section
            v-if="itemDiff.added.length || itemDiff.removed.length || itemDiff.statusChanged.length"
            class="diff-block"
          >
            <div class="block-title">随身物品</div>
            <ul class="diff-list">
              <li v-for="item in itemDiff.added" :key="'item-add-' + item.name" class="diff-row row-changed">
                <span class="row-label">{{ item.name }}</span>
                <span class="row-after">＋ {{ item.note }}</span>
              </li>
              <li v-for="item in itemDiff.removed" :key="'item-del-' + item.name" class="diff-row row-changed">
                <span class="row-label">{{ item.name }}</span>
                <span class="row-after row-danger">－ {{ item.note }}</span>
              </li>
              <li v-for="item in itemDiff.statusChanged" :key="'item-st-' + item.name" class="diff-row row-changed">
                <span class="row-label">{{ item.name }}</span>
                <span class="row-after">{{ item.note }}</span>
              </li>
            </ul>
          </section>
        </template>
      </div>

      <footer class="panel-foot">
        <button class="btn btn-sm" @click="emit('open-card')">查看该章角卡</button>
        <button class="link-btn" @click="emit('open-character', character.id)">打开角色页</button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.diff-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 61;
  width: min(430px, 94vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.diff-panel-enter-active,
.diff-panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.diff-panel-enter-from,
.diff-panel-leave-to {
  transform: translateX(18px);
  opacity: 0;
}

.panel-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 16px 18px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.head-text {
  flex: 1;
  min-width: 0;
}
.panel-kicker {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  color: var(--muted);
}
.panel-name {
  margin: 4px 0 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  color: var(--ink);
}
.panel-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  font-size: 11px;
  color: var(--muted);
  overflow: hidden;
}
.meta-item {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.meta-arrow {
  color: var(--border-strong);
}
.panel-close {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 13px;
  line-height: 1;
}
.panel-close:hover {
  border-color: var(--border);
  color: var(--ink);
}

.panel-body {
  flex: 1;
  min-height: 0;
  padding: 6px 18px 24px;
}
.block-empty {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}

.diff-block {
  padding: 13px 0;
  border-bottom: 1px dashed var(--border);
}
.diff-block:last-child {
  border-bottom: none;
}
.block-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--muted);
}
.block-note {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
  color: var(--muted);
}

.stage-swap {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}
.stage-from,
.stage-to {
  padding: 1px 8px;
  border-radius: 5px;
  font-size: 11.5px;
}
.stage-from {
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--muted);
}
.stage-to {
  border: 1px solid var(--accent-2);
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-weight: 600;
}
.swap-arrow {
  font-size: 11px;
  color: var(--border-strong);
}
.stage-note {
  margin: 6px 0 0;
  font-size: 10.5px;
  color: var(--muted);
}
.debut-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.debut-note {
  font-size: 11px;
  color: var(--muted);
}
.debut-traits {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--surface-2);
  font-size: 11.5px;
  line-height: 1.85;
  color: var(--ink-soft);
  white-space: pre-wrap;
}

.diff-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.diff-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 6px;
  font-size: 11.5px;
}
.diff-row + .diff-row {
  margin-top: 2px;
}
.row-changed {
  background: var(--accent-soft);
}
.row-muted {
  color: var(--muted);
}
.row-label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-soft);
}
.row-muted .row-label {
  color: var(--muted);
}
.row-before {
  flex: 0 0 auto;
  color: var(--muted);
  text-decoration: line-through;
  text-decoration-color: var(--border-strong);
}
.row-arrow {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--border-strong);
}
.row-after {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--ink);
}
.row-danger {
  color: var(--danger);
}
.row-unit {
  margin-left: 1px;
  font-size: 9.5px;
  font-weight: 400;
  color: var(--muted);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.skill-chip {
  display: inline-flex;
  align-items: baseline;
  padding: 1px 7px;
  border-radius: 5px;
  font-size: 10.5px;
}
.skill-chip.added {
  border: 1px solid var(--success);
  background: var(--success-soft);
  color: var(--success);
}
.skill-chip.removed {
  border: 1px solid var(--border-strong);
  background: var(--surface-2);
  color: var(--muted);
  text-decoration: line-through;
}

.panel-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
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
</style>
