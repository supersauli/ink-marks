<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from 'vue'
import type { Character, OverviewCell, OverviewChapter, OverviewCharacter, OverviewField } from '../api/types'
import { itemStatusLabels } from '../utils/format'

const props = defineProps<{
  character: OverviewCharacter | null
  cell: OverviewCell | null
  chapter: OverviewChapter | null
  chapterSummary: string
  chapterIndex: number
  chapters: OverviewChapter[]
  fields: OverviewField[]
  profile: Character | null
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'open-character', id: string): void
  (event: 'open-item', id: string): void
}>()

const CHARACTER_STATUS_LABELS: Record<string, string> = {
  alive: '存活',
  dead: '死亡',
  missing: '失踪',
  unknown: '未知'
}

const open = computed(() => Boolean(props.character && props.chapter))

const statusLabel = computed(() => {
  const status = props.cell?.status ?? ''
  return CHARACTER_STATUS_LABELS[status] || status || '未知'
})

const debuted = computed(() => props.cell?.debuted !== false)

const debutChapter = computed(() => {
  if (!props.character) return null
  const index = props.character.debutIndex
  const chapter = props.chapters[index]
  return chapter ? { index, title: chapter.title } : null
})

/** 该章生效的阶段文本：cells 里只有摘要，正文要从角色详情里按 id 取 */
const stageDetail = computed(() => {
  const stageId = props.cell?.stage?.id
  if (!stageId || !props.profile) return null
  return props.profile.stages.find((stage) => stage.id === stageId) ?? null
})

const stageSections = computed(() => {
  const stage = stageDetail.value
  if (!stage) return []
  return [
    { label: '性格特点', text: stage.traits },
    { label: '内心动机', text: stage.inner },
    { label: '行为表现', text: stage.behavior },
    { label: '语言习惯', text: stage.speech },
    { label: '关键事件 / 转折点', text: stage.event }
  ].filter((section) => section.text && section.text.trim())
})

const attributes = computed(() => props.cell?.attributes ?? [])

const filledAttributeCount = computed(
  () => attributes.value.filter((attr) => attr.value !== null && String(attr.value).trim() !== '').length
)

const items = computed(() => props.cell?.items ?? [])
const skills = computed(() => props.cell?.skills ?? [])

const profileSections = computed(() => {
  const profile = props.profile
  if (!profile) return []
  return [
    { label: '年龄', text: profile.age },
    { label: '外貌', text: profile.appearance },
    { label: '背景', text: profile.background },
    { label: '关键关系', text: profile.relations },
    { label: '目标', text: profile.goal },
    { label: '备注', text: profile.notes }
  ].filter((section) => section.text && section.text.trim())
})

function itemStatus(status: string) {
  return itemStatusLabels[status] || status || '未知'
}

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
  <Transition name="card-panel">
    <aside v-if="open && character && chapter" class="char-panel">
      <header class="panel-head">
        <div class="head-text">
          <div class="panel-kicker">{{ chapter.title || '未命名章节' }}</div>
          <h2 class="panel-name">{{ character.name || '未命名角色' }}</h2>
          <div class="panel-meta">
            <span v-if="character.role" class="meta-item">{{ character.role }}</span>
            <span v-if="character.gender" class="meta-item">{{ character.gender }}</span>
            <span v-if="debuted" class="meta-status" :data-status="cell?.status">{{ statusLabel }}</span>
            <span v-else class="meta-status" data-status="unknown">未登场</span>
          </div>
        </div>
        <button class="panel-close" title="关闭（Esc）" @click="emit('close')">✕</button>
      </header>

      <div class="panel-body scroll-y">
        <div v-if="!debuted" class="not-debut-banner">
          <div class="not-debut-title">本章尚未登场</div>
          <div class="not-debut-text">
            <template v-if="debutChapter">
              {{ character.name }} 首次登场于第 {{ debutChapter.index + 1 }} 章「{{ debutChapter.title }}」，此前不参与本章情节。
            </template>
            <template v-else>
              还没有设置首次登场章节。到角色页填写「登场」后，这里就会按章显示在场状态。
            </template>
          </div>
        </div>

        <section v-else class="panel-block">
          <div class="block-title">该章性格阶段</div>
          <template v-if="cell?.stage">
            <div class="stage-head">
              <span class="stage-name">{{ cell.stage.name }}</span>
              <span v-if="cell.stage.period" class="stage-period">{{ cell.stage.period }}</span>
            </div>
            <dl v-if="stageSections.length" class="fact-list">
              <template v-for="section in stageSections" :key="section.label">
                <dt>{{ section.label }}</dt>
                <dd>{{ section.text }}</dd>
              </template>
            </dl>
            <p v-else class="block-empty">这个阶段还没有填写性格细节。</p>
          </template>
          <p v-else class="block-empty">该章之前没有生效的性格阶段，可按章节关联一个阶段。</p>
        </section>

        <section v-if="debuted" class="panel-block">
          <div class="block-title">
            该章属性
            <span v-if="fields.length" class="block-note">{{ filledAttributeCount }} / {{ fields.length }} 项已填</span>
          </div>
          <div v-if="fields.length" class="attr-grid">
            <div v-for="attr in attributes" :key="attr.fieldId" class="attr-cell" :data-empty="attr.value === null || String(attr.value).trim() === ''">
              <span class="attr-name">{{ attr.label }}</span>
              <span class="attr-num">
                <template v-if="attr.value !== null && String(attr.value).trim() !== ''">
                  {{ attr.value }}<span v-if="attr.unit" class="attr-unit">{{ attr.unit }}</span>
                </template>
                <template v-else>—</template>
              </span>
            </div>
          </div>
          <p v-else class="block-empty">还没有设计人物属性卡。</p>
        </section>

        <section v-if="debuted && skills.length" class="panel-block">
          <div class="block-title">该章可用技能</div>
          <div class="chip-row">
            <span v-for="skill in skills" :key="skill.id" class="skill-chip">
              ✧ {{ skill.name }}<span v-if="skill.level" class="skill-level">{{ skill.level }}</span>
            </span>
          </div>
        </section>

        <section v-if="debuted" class="panel-block">
          <div class="block-title">该章随身物品</div>
          <div v-if="items.length" class="chip-row">
            <button
              v-for="item in items"
              :key="item.id"
              class="item-chip"
              :data-status="item.status"
              :title="`${item.category || '物品'} · ${itemStatus(item.status)}，打开物品页`"
              @click="emit('open-item', item.id)"
            >
              <span class="item-dot" />{{ item.name }}
            </button>
          </div>
          <p v-else class="block-empty">这一章身上没有记录在案的物品。</p>
        </section>

        <section v-if="chapterSummary" class="panel-block">
          <div class="block-title">本章大纲</div>
          <p class="chapter-summary">{{ chapterSummary }}</p>
        </section>

        <details v-if="profileSections.length" class="panel-block profile-block" :open="!debuted">
          <summary class="block-title profile-toggle">角色档案<span class="block-note">当前设定，不是本章快照</span></summary>
          <dl class="fact-list">
            <template v-for="section in profileSections" :key="section.label">
              <dt>{{ section.label }}</dt>
              <dd>{{ section.text }}</dd>
            </template>
          </dl>
        </details>
      </div>

      <footer class="panel-foot">
        <button class="btn btn-sm" @click="emit('open-character', character.id)">打开角色页</button>
        <span class="foot-hint">点其他格子可直接切换到那一章</span>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.char-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 60;
  width: min(430px, 94vw);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border-left: 1px solid var(--border);
  box-shadow: var(--shadow);
}

.card-panel-enter-active,
.card-panel-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.card-panel-enter-from,
.card-panel-leave-to {
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
  letter-spacing: 0.08em;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-name {
  margin: 4px 0 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink);
}
.panel-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
}
.meta-item {
  font-size: 11px;
  color: var(--muted);
}
.meta-status {
  padding: 1px 7px;
  border: 1px solid var(--success);
  border-radius: 5px;
  background: var(--success-soft);
  color: var(--success);
  font-size: 10px;
  font-weight: 600;
}
.meta-status[data-status='dead'] {
  border-color: var(--danger);
  background: var(--danger-soft);
  color: var(--danger);
}
.meta-status[data-status='missing'] {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.meta-status[data-status='unknown'] {
  border-color: var(--border-strong);
  background: var(--surface);
  color: var(--muted);
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
  padding: 14px 18px 24px;
}

.not-debut-banner {
  padding: 12px 14px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--surface-2);
}
.not-debut-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--ink-soft);
}
.not-debut-text {
  margin-top: 5px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
}

.panel-block {
  padding: 12px 0;
  border-bottom: 1px dashed var(--border);
}
.panel-block:last-child {
  border-bottom: none;
}
.block-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
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
.block-empty {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}

.stage-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 8px;
  margin-top: 8px;
}
.stage-name {
  padding: 1px 8px;
  border: 1px solid var(--accent-2);
  border-radius: 5px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 11.5px;
  font-weight: 600;
}
.stage-period {
  font-size: 10.5px;
  color: var(--muted);
}

.fact-list {
  margin: 8px 0 0;
}
.fact-list dt {
  margin-top: 8px;
  font-size: 10.5px;
  color: var(--muted);
}
.fact-list dd {
  margin: 3px 0 0;
  font-size: 12px;
  line-height: 1.85;
  color: var(--ink-soft);
  white-space: pre-wrap;
}

.attr-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 8px;
}
.attr-cell {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
}
.attr-cell[data-empty='true'] {
  border-style: dashed;
  background: transparent;
}
.attr-name {
  font-size: 10.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.attr-num {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}
.attr-cell[data-empty='true'] .attr-num {
  font-weight: 400;
  color: var(--border-strong);
}
.attr-unit {
  margin-left: 1px;
  font-size: 9.5px;
  font-weight: 400;
  color: var(--muted);
}

.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 8px;
}
.skill-chip {
  display: inline-flex;
  align-items: baseline;
  gap: 3px;
  padding: 1px 7px;
  border: 1px dashed var(--accent-2);
  border-radius: 5px;
  background: var(--accent-2-soft);
  font-size: 10.5px;
  color: var(--accent-2);
}
.skill-level {
  font-size: 9.5px;
  opacity: 0.75;
}
.item-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  font-size: 11px;
  color: var(--ink-soft);
}
.item-chip:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.item-dot {
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

.chapter-summary {
  margin: 8px 0 0;
  font-size: 11.5px;
  line-height: 1.85;
  color: var(--ink-soft);
  white-space: pre-wrap;
}

.profile-block {
  padding-bottom: 4px;
}
.profile-toggle {
  cursor: pointer;
  list-style: none;
}
.profile-toggle::-webkit-details-marker {
  display: none;
}
.profile-toggle::before {
  content: '▸';
  margin-right: 2px;
  color: var(--border-strong);
}
.profile-block[open] .profile-toggle::before {
  content: '▾';
}

.panel-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
.foot-hint {
  font-size: 10.5px;
  color: var(--muted);
}
</style>
