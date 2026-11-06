<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { CardField, CardTemplate, TemplateKind } from '../api/types'
import { formatTime } from '../utils/format'

const props = defineProps<{
  kind: TemplateKind
  template: CardTemplate | null
}>()

const novel = useNovelStore()

const fields = computed(() => props.template?.fields ?? [])
const kindLabel = computed(() => (props.kind === 'character' ? '人物' : '物品'))

function valueOf(fieldId: string) {
  return novel.attributeValues.find((entry) => entry.fieldId === fieldId)?.value ?? ''
}

function optionsOf(field: CardField) {
  return field.options
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
}

function onValueInput(field: CardField, event: Event) {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
  novel.setAttributeValue(field.id, target.value)
}

function fieldLabel(fieldId: string) {
  return fields.value.find((field) => field.id === fieldId)?.label ?? '已删除属性'
}

const showLogForm = ref(false)
const saving = ref(false)
const logDraft = reactive({
  fieldId: '',
  value: '',
  period: '',
  chapterId: '',
  note: '',
  applyCurrent: true
})

watch(
  () => logDraft.fieldId,
  (fieldId) => {
    if (!fieldId) return
    const field = fields.value.find((entry) => entry.id === fieldId)
    if (field) logDraft.value = valueOf(field.id)
    if (field && field.unit) logDraft.note = logDraft.note || ''
  }
)

watch(fields, (list) => {
  if (!logDraft.fieldId && list.length) logDraft.fieldId = list[0].id
})

function openLogForm() {
  showLogForm.value = !showLogForm.value
  if (showLogForm.value && !logDraft.fieldId && fields.value.length) {
    logDraft.fieldId = fields.value[0].id
    logDraft.value = valueOf(logDraft.fieldId)
  }
}

async function submitLog() {
  if (!logDraft.fieldId) return
  saving.value = true
  const created = await novel.addAttributeLog({
    fieldId: logDraft.fieldId,
    value: logDraft.value,
    period: logDraft.period,
    chapterId: logDraft.chapterId || null,
    note: logDraft.note,
    applyCurrent: logDraft.applyCurrent
  })
  saving.value = false
  if (!created) return
  logDraft.period = ''
  logDraft.chapterId = ''
  logDraft.note = ''
  showLogForm.value = false
}

function removeLog(logId: string) {
  if (!window.confirm('删除这条成长记录？当前属性值不会跟着回退。')) return
  void novel.deleteAttributeLog(logId)
}

function editTemplate() {
  void novel.openTemplate(props.kind)
}
</script>

<template>
  <section class="attr-card">
    <header class="attr-head">
      <div class="attr-title">
        <span class="attr-icon">▤</span>
        <span class="attr-name">{{ template?.name || `${kindLabel}属性卡` }}</span>
        <span class="attr-badge">当前属性 · 自动保存</span>
      </div>
      <div class="attr-actions">
        <button class="btn btn-sm btn-ghost" @click="editTemplate">编辑模板</button>
        <button class="btn btn-sm" :disabled="!fields.length" @click="openLogForm">
          {{ showLogForm ? '收起记录' : '＋ 记录成长' }}
        </button>
      </div>
    </header>

    <p v-if="template?.description" class="attr-desc">{{ template.description }}</p>

    <div v-if="!template" class="attr-empty">属性卡模板还没有加载。</div>
    <div v-else-if="!fields.length" class="attr-empty">
      属性卡还是空的。
      <button class="link-btn" @click="editTemplate">去添加第一个属性</button>
    </div>

    <div v-else class="attr-grid">
      <label v-for="field in fields" :key="field.id" class="attr-item">
        <span class="attr-label">{{ field.label }}</span>
        <span class="attr-control">
          <select
            v-if="field.fieldType === 'select'"
            class="attr-input"
            :value="valueOf(field.id)"
            @change="onValueInput(field, $event)"
          >
            <option value="">未设置</option>
            <option v-for="option in optionsOf(field)" :key="option" :value="option">{{ option }}</option>
          </select>
          <input
            v-else
            class="attr-input"
            :type="field.fieldType === 'number' ? 'number' : 'text'"
            :value="valueOf(field.id)"
            placeholder="未设置"
            @input="onValueInput(field, $event)"
          />
          <span v-if="field.unit" class="attr-unit">{{ field.unit }}</span>
        </span>
      </label>
    </div>

    <form v-if="showLogForm" class="log-form" @submit.prevent="submitLog">
      <div class="log-form-grid">
        <label class="log-field">
          <span>属性</span>
          <select v-model="logDraft.fieldId" class="attr-input">
            <option v-for="field in fields" :key="field.id" :value="field.id">{{ field.label }}</option>
          </select>
        </label>
        <label class="log-field">
          <span>变化后的值</span>
          <input v-model="logDraft.value" class="attr-input" placeholder="例如 4" />
        </label>
        <label class="log-field">
          <span>时间 / 章节</span>
          <input v-model="logDraft.period" class="attr-input" placeholder="例如 第 4 章" />
        </label>
        <label class="log-field">
          <span>关联章节（用于总览）</span>
          <select v-model="logDraft.chapterId" class="attr-input">
            <option value="">不关联（按上面的文字匹配）</option>
            <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
              {{ chapter.title }}
            </option>
          </select>
        </label>
        <label class="log-field log-wide">
          <span>原因 / 说明</span>
          <input v-model="logDraft.note" class="attr-input" placeholder="为什么会成长？发生了什么？" />
        </label>
      </div>
      <div class="log-form-foot">
        <label class="check">
          <input v-model="logDraft.applyCurrent" type="checkbox" />
          同时更新当前属性值
        </label>
        <button class="btn btn-sm btn-primary" type="submit" :disabled="saving">
          {{ saving ? '保存中…' : '保存这条记录' }}
        </button>
      </div>
    </form>

    <div class="log-section">
      <div class="log-head">
        <span class="log-title">成长记录</span>
        <span class="log-count">{{ novel.attributeLogs.length }} 条</span>
        <span class="log-hint">记录属性随剧情如何变化，当前值不会自动回退</span>
      </div>
      <div v-if="!novel.attributeLogs.length" class="log-empty">还没有成长记录。</div>
      <ul v-else class="log-list">
        <li v-for="log in novel.attributeLogs" :key="log.id" class="log-item">
          <div class="log-item-main">
            <span class="log-field-name">{{ fieldLabel(log.fieldId) }}</span>
            <span class="log-value">→ {{ log.value || '（空）' }}</span>
            <span v-if="log.period" class="log-period">{{ log.period }}</span>
          </div>
          <p v-if="log.note" class="log-note">{{ log.note }}</p>
          <div class="log-item-foot">
            <span class="log-time">{{ formatTime(log.createdAt) }}</span>
            <button class="mini-action danger" title="删除这条记录" @click="removeLog(log.id)">✕</button>
          </div>
        </li>
      </ul>
    </div>
  </section>
</template>

<style scoped>
.attr-card {
  margin-top: 22px;
  padding: 16px 18px 18px;
  border: 1px solid var(--border);
  border-radius: 14px;
  background: var(--surface-2);
}
.attr-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.attr-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.attr-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 6px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 12px;
}
.attr-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.attr-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10px;
  color: var(--muted);
}
.attr-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.attr-desc {
  margin: 8px 0 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
}
.attr-empty {
  padding: 14px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.attr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.attr-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}
.attr-label {
  font-size: 11px;
  color: var(--muted);
}
.attr-control {
  display: flex;
  align-items: center;
  gap: 5px;
}
.attr-input {
  width: 100%;
  min-width: 0;
  height: 28px;
  padding: 0 7px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  outline: none;
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
}
.attr-input:hover {
  border-color: var(--border);
}
.attr-input:focus {
  border-color: var(--accent);
  background: var(--surface-2);
}
select.attr-input {
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.attr-unit {
  flex: 0 0 auto;
  font-size: 11px;
  color: var(--muted);
}

.log-form {
  margin-top: 14px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 10px;
  background: var(--surface);
}
.log-form-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 8px;
}
.log-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);
}
.log-wide {
  grid-column: 1 / -1;
}
.log-field .attr-input {
  height: 30px;
  border-color: var(--border);
  background: var(--surface-2);
  font-size: 12px;
  font-weight: 400;
}
.log-form-foot {
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
.log-form-foot .btn {
  margin-left: auto;
}

.log-section {
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px dashed var(--border);
}
.log-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.log-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-soft);
}
.log-count {
  font-size: 10.5px;
  color: var(--muted);
}
.log-hint {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  color: var(--muted);
  text-align: right;
}
.log-empty {
  margin-top: 10px;
  font-size: 11.5px;
  color: var(--muted);
}
.log-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
}
.log-item {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.log-item-main {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  font-size: 12px;
}
.log-field-name {
  font-weight: 600;
  color: var(--ink-soft);
}
.log-value {
  color: var(--accent);
  font-weight: 600;
}
.log-period {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--muted);
}
.log-note {
  margin: 5px 0 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--ink-soft);
}
.log-item-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 5px;
}
.log-time {
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
  background: var(--surface-2);
}
.mini-action.danger:hover {
  color: var(--danger);
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
}
.link-btn:hover {
  text-decoration: underline;
}
@media (max-width: 760px) {
  .log-form-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .log-hint {
    text-align: left;
  }
}
</style>
