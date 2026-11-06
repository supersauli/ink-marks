<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useChatStore } from '../stores/chat'
import type { ItemEvent, ItemField } from '../api/types'
import { formatTime, itemStatusLabels, itemStatusOptions } from '../utils/format'
import AttributeCard from './AttributeCard.vue'

const novel = useNovelStore()
const chat = useChatStore()

const item = computed(() => novel.activeItem)
const tab = ref<'setting' | 'status'>('setting')

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value
}

function onItemInput(field: ItemField, event: Event) {
  novel.editItemField(field, inputValue(event))
}

async function removeItem() {
  const value = item.value
  if (!value) return
  if (!window.confirm(`删除物品「${value.name || '未命名'}」？它的属性、成长记录和状态记录都会一并删除，无法恢复。`))
    return
  await novel.deleteItem(value.id)
}

function discussItem() {
  const value = item.value
  if (!value) return
  const lines = [
    `我们在写小说《${novel.project?.name ?? ''}》，想讨论物品「${value.name || '未命名'}」${value.category ? `（${value.category}）` : ''}。`,
    value.origin ? `来源：${value.origin}` : '',
    value.reason ? `出现的原因：${value.reason}` : '',
    value.debut ? `登场时间：${value.debut}` : '',
    value.background ? `背景故事：${value.background}` : '',
    `当前状态：${itemStatusLabels[value.status] || value.status}${value.currentHolder ? `，持有人：${value.currentHolder}` : ''}`,
    '请帮我检查这件物品在故事里的作用是否清楚，并给出 2-3 个能推进剧情的用法或转折。'
  ]
  chat.draft = lines.filter(Boolean).join('\n')
  chat.open = true
}

// ---------------------------------------------------------------------------
// 状态记录
// ---------------------------------------------------------------------------
const showEventForm = ref(false)
const savingEvent = ref(false)
const eventDraft = reactive({
  period: '',
  chapterId: '',
  holder: '',
  status: 'intact',
  destroyedBy: '',
  note: '',
  applyCurrent: true
})

function statusLabel(status: string) {
  return itemStatusLabels[status] || status || '未知'
}

function openEventForm() {
  const value = item.value
  showEventForm.value = !showEventForm.value
  if (!showEventForm.value) return
  if (value) {
    eventDraft.holder = value.currentHolder
    eventDraft.status = value.status || 'intact'
    eventDraft.destroyedBy = value.destroyedBy
  }
  eventDraft.period = ''
  eventDraft.chapterId = ''
  eventDraft.note = ''
  eventDraft.applyCurrent = true
}

async function submitEvent() {
  if (!item.value) return
  savingEvent.value = true
  const created = await novel.addItemEvent({
    period: eventDraft.period,
    chapterId: eventDraft.chapterId || null,
    holder: eventDraft.holder,
    status: eventDraft.status,
    destroyedBy: eventDraft.destroyedBy,
    note: eventDraft.note,
    applyCurrent: eventDraft.applyCurrent
  })
  savingEvent.value = false
  if (!created) return
  showEventForm.value = false
  eventDraft.period = ''
  eventDraft.chapterId = ''
  eventDraft.note = ''
}

function removeEvent(event: ItemEvent) {
  if (!window.confirm('删除这条状态记录？物品的当前状态不会跟着回退。')) return
  void novel.deleteItemEvent(event.id)
}
</script>

<template>
  <div v-if="item" class="item-editor">
    <header class="item-head">
      <div class="crumbs">
        <span>{{ novel.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">物品设定</span>
      </div>

      <div class="title-row">
        <input
          class="title-input"
          :value="item.name"
          placeholder="物品名称"
          @input="onItemInput('name', $event)"
        />
        <span class="status-badge" :data-status="item.status">{{ statusLabel(item.status) }}</span>
        <div class="head-actions">
          <button class="btn btn-sm" title="让 AI 一起讨论这件物品" @click="discussItem">✦ AI 讨论</button>
          <button class="btn btn-sm btn-danger" @click="removeItem">删除</button>
        </div>
      </div>

      <div class="meta-row">
        <label class="meta-field">
          <span>类别</span>
          <input :value="item.category" placeholder="武器 / 信物 / 道具…" @input="onItemInput('category', $event)" />
        </label>
        <label class="meta-field">
          <span>稀有度</span>
          <input :value="item.rarity" placeholder="普通 / 稀有 / 传说…" @input="onItemInput('rarity', $event)" />
        </label>
        <span v-if="item.currentHolder" class="meta-holder">当前持有人：{{ item.currentHolder }}</span>
        <span v-if="item.updatedAt" class="meta-time">更新于 {{ formatTime(item.updatedAt) }}</span>
      </div>

      <nav class="tab-bar">
        <button class="tab" :class="{ active: tab === 'setting' }" @click="tab = 'setting'">设定卡</button>
        <button class="tab" :class="{ active: tab === 'status' }" @click="tab = 'status'">
          状态记录
          <span class="tab-count">{{ item.events.length }}</span>
        </button>
      </nav>
    </header>

    <div class="item-body scroll-y">
      <div class="article">
        <!-- 设定卡 -->
        <template v-if="tab === 'setting'">
          <section class="basic-section">
            <div class="section-bar">
              <span class="section-title">基本设定</span>
              <span class="section-hint">物品是什么、从哪里来、为什么出现</span>
            </div>
            <div class="basic-grid">
              <label class="field">
                <span class="field-label">来源</span>
                <input
                  class="field-input field-single"
                  :value="item.origin"
                  placeholder="谁打造 / 从哪里得到 / 属于谁"
                  @input="onItemInput('origin', $event)"
                />
              </label>
              <label class="field">
                <span class="field-label">登场时间</span>
                <input
                  class="field-input field-single"
                  :value="item.debut"
                  placeholder="第几章 / 哪个时期首次出现"
                  @input="onItemInput('debut', $event)"
                />
              </label>
              <label class="field field-wide">
                <span class="field-label">出现的原因</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="item.reason"
                  placeholder="为什么这件物品会出现在故事里？它解决了什么、又制造了什么麻烦？"
                  @input="onItemInput('reason', $event)"
                />
              </label>
              <label class="field field-wide">
                <span class="field-label">背景故事</span>
                <textarea
                  class="field-input"
                  rows="5"
                  :value="item.background"
                  placeholder="它的来历、经历过的关键事件、和哪些人有关……"
                  @input="onItemInput('background', $event)"
                />
              </label>
              <label class="field field-wide">
                <span class="field-label">补充备注</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="item.notes"
                  placeholder="使用限制、伏笔、待回收的线索……"
                  @input="onItemInput('notes', $event)"
                />
              </label>
            </div>
          </section>

          <AttributeCard kind="item" :template="novel.itemTemplate" />
        </template>

        <!-- 状态记录 -->
        <template v-else>
          <section class="status-section">
            <div class="section-bar">
              <span class="section-title">当前状态</span>
              <span class="section-hint">可以直接修正，也可以用下方状态记录逐步推进</span>
              <button class="btn btn-sm btn-primary-ghost" @click="openEventForm">
                {{ showEventForm ? '收起表单' : '＋ 新增状态记录' }}
              </button>
            </div>

            <div class="status-grid">
              <label class="status-field">
                <span class="field-label">状态</span>
                <select class="field-input field-single" :value="item.status" @change="onItemInput('status', $event)">
                  <option v-for="option in itemStatusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="status-field">
                <span class="field-label">当前持有人</span>
                <input
                  class="field-input field-single"
                  :value="item.currentHolder"
                  placeholder="现在在谁手上"
                  @input="onItemInput('currentHolder', $event)"
                />
              </label>
              <label class="status-field">
                <span class="field-label">是否被摧毁</span>
                <span class="status-static" :data-destroyed="item.isDestroyed">
                  {{ item.isDestroyed ? '已损毁' : '完好' }}
                </span>
              </label>
              <label class="status-field">
                <span class="field-label">摧毁者</span>
                <input
                  class="field-input field-single"
                  :value="item.destroyedBy"
                  placeholder="被何人摧毁"
                  @input="onItemInput('destroyedBy', $event)"
                />
              </label>
              <label class="status-field">
                <span class="field-label">摧毁时间 / 章节</span>
                <input
                  class="field-input field-single"
                  :value="item.destroyedAt"
                  placeholder="何时被摧毁"
                  @input="onItemInput('destroyedAt', $event)"
                />
              </label>
            </div>

            <div class="holder-history">
              <span class="holder-title">历史持有人</span>
              <div v-if="!item.holders.length" class="holder-empty">还没有持有人记录。</div>
              <div v-else class="holder-chips">
                <span v-for="(holder, index) in item.holders" :key="holder" class="holder-chip">
                  {{ holder }}
                  <span v-if="index === 0" class="holder-first">最早</span>
                  <span v-if="holder === item.currentHolder" class="holder-current">当前</span>
                </span>
              </div>
            </div>

            <p class="status-tip">
              每条状态记录都可以选择「同步更新物品当前状态」：记录持有人变动、遗失、封存、损毁时，当前状态会一起改变；历史持有人来自所有状态记录。
            </p>
          </section>

          <form v-if="showEventForm" class="event-form" @submit.prevent="submitEvent">
            <div class="event-form-grid">
              <label class="event-field">
                <span>时间 / 章节</span>
                <input v-model="eventDraft.period" class="field-input field-single" placeholder="例如 第 7 章 / 十年前" />
              </label>
              <label class="event-field">
                <span>关联章节（用于总览）</span>
                <select v-model="eventDraft.chapterId" class="field-input field-single">
                  <option value="">不关联（按上面的文字匹配）</option>
                  <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                    {{ chapter.title }}
                  </option>
                </select>
              </label>
              <label class="event-field">
                <span>持有人</span>
                <input v-model="eventDraft.holder" class="field-input field-single" placeholder="这时在谁手上" />
              </label>
              <label class="event-field">
                <span>状态</span>
                <select v-model="eventDraft.status" class="field-input field-single">
                  <option v-for="option in itemStatusOptions" :key="option.value" :value="option.value">
                    {{ option.label }}
                  </option>
                </select>
              </label>
              <label class="event-field">
                <span>摧毁者</span>
                <input
                  v-model="eventDraft.destroyedBy"
                  class="field-input field-single"
                  placeholder="状态为「已损毁」时填写"
                />
              </label>
              <label class="event-field event-wide">
                <span>说明</span>
                <input
                  v-model="eventDraft.note"
                  class="field-input field-single"
                  placeholder="发生了什么？为什么易手或损毁？"
                />
              </label>
            </div>
            <div class="event-form-foot">
              <label class="check">
                <input v-model="eventDraft.applyCurrent" type="checkbox" />
                同步更新物品当前状态
              </label>
              <button class="btn btn-sm btn-primary" type="submit" :disabled="savingEvent">
                {{ savingEvent ? '保存中…' : '保存这条记录' }}
              </button>
            </div>
          </form>

          <section class="timeline-section">
            <div class="section-bar">
              <span class="section-title">状态时间线</span>
              <span class="section-hint">按记录时间排列，越早的越靠上</span>
              <span class="event-count">{{ item.events.length }} 条</span>
            </div>

            <div v-if="!item.events.length" class="event-empty">
              还没有状态记录。记录「何时登场、在谁手上、何时遗失或损毁」，物品的流转就不会丢。
            </div>

            <ol v-else class="event-list">
              <li
                v-for="event in item.events"
                :key="event.id"
                class="event-item"
                :data-event-id="event.id"
                :data-status="event.status"
              >
                <span class="event-dot" />
                <div class="event-main">
                  <div class="event-top">
                    <span class="event-status">{{ statusLabel(event.status) }}</span>
                    <span v-if="event.holder" class="event-holder">持有人：{{ event.holder }}</span>
                    <span v-if="event.period" class="event-period">{{ event.period }}</span>
                    <span v-if="event.destroyedBy" class="event-destroyed">摧毁者：{{ event.destroyedBy }}</span>
                  </div>
                  <p v-if="event.note" class="event-note">{{ event.note }}</p>
                  <div class="event-foot">
                    <span class="event-time">{{ formatTime(event.createdAt) }}</span>
                    <button class="mini-action danger" title="删除这条记录" @click="removeEvent(event)">✕</button>
                  </div>
                </div>
              </li>
            </ol>
          </section>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.item-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--surface);
}

.item-head {
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
  gap: 12px;
}
.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  padding: 2px 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink);
  border-bottom: 1px solid transparent;
}
.title-input:focus {
  border-bottom-color: var(--border);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--muted);
}
.status-badge[data-status='intact'] {
  background: var(--success-soft, var(--accent-2-soft));
  color: var(--success, var(--accent-2));
}
.status-badge[data-status='destroyed'] {
  background: var(--danger-soft, #fbe9e7);
  color: var(--danger);
}
.status-badge[data-status='lost'],
.status-badge[data-status='unknown'] {
  background: var(--accent-soft);
  color: var(--accent);
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  margin-top: 12px;
  padding-bottom: 10px;
}
.meta-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
.meta-field input {
  width: 140px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 12px;
  color: var(--ink-soft);
}
.meta-field input:focus {
  border-color: var(--accent);
}
.meta-holder {
  font-size: 11.5px;
  color: var(--ink-soft);
}
.meta-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}

.tab-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
}
.tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 12px;
  color: var(--muted);
}
.tab:hover {
  color: var(--accent);
}
.tab.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.tab-count {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--surface-3);
  font-size: 10px;
  color: var(--muted);
}

.item-body {
  flex: 1;
  min-height: 0;
}
.article {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px clamp(20px, 4vw, 48px) 60px;
}

.section-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}
.section-hint {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
}
.event-count {
  font-size: 10.5px;
  color: var(--muted);
}

.basic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.field-wide {
  grid-column: 1 / -1;
}
.field-label {
  font-size: 11.5px;
  color: var(--muted);
}
.field-input {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  outline: none;
  resize: vertical;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-soft);
}
.field-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.field-single {
  height: 32px;
  padding: 0 11px;
  resize: none;
  line-height: 32px;
}
select.field-single {
  cursor: pointer;
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

.status-section {
  padding-top: 4px;
}
.status-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.status-field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.status-static {
  display: inline-flex;
  align-items: center;
  height: 32px;
  padding: 0 11px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: var(--muted);
}
.status-static[data-destroyed='true'] {
  border-color: var(--danger);
  color: var(--danger);
}

.holder-history {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-top: 16px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
.holder-title {
  font-size: 11.5px;
  color: var(--muted);
}
.holder-empty {
  font-size: 11.5px;
  color: var(--muted);
}
.holder-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.holder-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  background: var(--surface);
  border: 1px solid var(--border);
  font-size: 11.5px;
  color: var(--ink-soft);
}
.holder-first,
.holder-current {
  padding: 0 4px;
  border-radius: 4px;
  font-size: 9.5px;
}
.holder-first {
  background: var(--surface-3);
  color: var(--muted);
}
.holder-current {
  background: var(--accent);
  color: #fff;
}

.status-tip {
  margin: 14px 0 0;
  padding: 10px 13px;
  border-left: 3px solid var(--accent-2);
  border-radius: 0 8px 8px 0;
  background: var(--accent-2-soft);
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
}

.event-form {
  margin-top: 18px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--surface-2);
}
.event-form-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.event-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}
.event-wide {
  grid-column: 1 / -1;
}
.event-field .field-input {
  height: 30px;
  padding: 0 8px;
  border-radius: 7px;
  background: var(--surface);
  line-height: 30px;
  font-size: 12px;
}
.event-form-foot {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
}
.check {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted);
}
.event-form-foot .btn {
  margin-left: auto;
}

.timeline-section {
  margin-top: 26px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}
.event-empty {
  padding: 16px;
  border: 1px dashed var(--border);
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
  text-align: center;
}
.event-list {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 12px 0 0;
  padding: 0 0 0 18px;
  list-style: none;
}
.event-list::before {
  content: '';
  position: absolute;
  top: 6px;
  bottom: 6px;
  left: 5px;
  width: 1px;
  background: var(--border);
}
.event-item {
  position: relative;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
.event-dot {
  position: absolute;
  top: 16px;
  left: -16px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border-strong);
}
.event-item[data-status='intact'] .event-dot {
  background: var(--success, var(--accent-2));
}
.event-item[data-status='destroyed'] .event-dot {
  background: var(--danger);
}
.event-top {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}
.event-status {
  font-weight: 600;
  color: var(--ink-soft);
}
.event-item[data-status='destroyed'] .event-status {
  color: var(--danger);
}
.event-holder {
  color: var(--ink-soft);
}
.event-period,
.event-destroyed {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--muted);
}
.event-note {
  margin: 6px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.event-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 6px;
}
.event-time {
  font-size: 10px;
  color: var(--muted);
}
.mini-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
}
.mini-action:hover {
  background: var(--surface);
}
.mini-action.danger:hover {
  color: var(--danger);
}

@media (max-width: 900px) {
  .status-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .event-form-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 760px) {
  .basic-grid,
  .status-grid,
  .event-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .meta-time {
    display: none;
  }
}
</style>
