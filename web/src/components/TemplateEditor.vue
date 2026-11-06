<script setup lang="ts">
import { computed } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { CardField } from '../api/types'
import { fieldTypeLabels, templateKindLabels } from '../utils/format'

const novel = useNovelStore()

const template = computed(() => novel.activeTemplate)
const fields = computed(() => template.value?.fields ?? [])
const kindLabel = computed(() => templateKindLabels[novel.templateKind] ?? '属性卡')

const typeOptions = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数值' },
  { value: 'longtext', label: '长文本' },
  { value: 'select', label: '选项' }
]

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLSelectElement).value
}

function onTemplateInput(field: 'name' | 'description', event: Event) {
  novel.editTemplateField(field, inputValue(event))
}

function onFieldInput(
  field: CardField,
  key: 'label' | 'fieldType' | 'unit' | 'options',
  event: Event
) {
  novel.editCardField(field.id, { [key]: inputValue(event) })
}

function previewValue(field: CardField) {
  if (field.fieldType === 'select') {
    return field.options.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean)[0] ?? '未设置'
  }
  if (field.fieldType === 'number') return '0'
  return field.fieldType === 'longtext' ? '一段更长的属性说明' : '示例内容'
}

async function removeField(field: CardField) {
  if (!window.confirm(`删除属性「${field.label}」？所有角色/物品上这个属性的当前值和成长记录也会一起删除。`)) return
  await novel.deleteCardField(field.id)
}

function openUsage() {
  if (novel.templateKind === 'character') {
    const first = novel.characters[0]
    if (first) void novel.selectCharacter(first.id)
  } else {
    const first = novel.items[0]
    if (first) void novel.selectItem(first.id)
  }
}
</script>

<template>
  <div v-if="template" class="template-editor">
    <header class="template-head">
      <div class="crumbs">
        <span>{{ novel.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">属性卡模板</span>
      </div>
      <div class="title-row">
        <input
          class="title-input"
          :value="template.name"
          placeholder="模板名称"
          @input="onTemplateInput('name', $event)"
        />
        <span class="kind-badge">{{ kindLabel }}</span>
        <div class="head-actions">
          <button class="btn btn-sm" @click="openUsage">查看使用效果</button>
          <button
            v-if="novel.templateKind === 'character'"
            class="btn btn-sm"
            @click="novel.openTemplate('item')"
          >
            物品属性卡 →
          </button>
          <button v-else class="btn btn-sm" @click="novel.openTemplate('character')">← 人物属性卡</button>
        </div>
      </div>
      <input
        class="desc-input"
        :value="template.description"
        placeholder="给这套属性卡写一句说明，例如「记录角色在每一卷结束时的能力值」"
        @input="onTemplateInput('description', $event)"
      />
    </header>

    <div class="template-body scroll-y">
      <div class="template-inner">
        <p class="tip">
          在这里自由设计卡片包含哪些属性。修改会自动保存；所有使用这套模板的角色/物品会立刻采用新结构。
          删除属性会同时删除对应的属性值与成长记录。
        </p>

        <section class="editor-section">
          <div class="section-bar">
            <span class="section-title">属性字段</span>
            <span class="section-hint">{{ fields.length }} 个字段 · 名称会自动保存</span>
            <button class="btn btn-sm btn-primary-ghost" @click="novel.addCardField()">＋ 添加属性</button>
          </div>

          <div v-if="!fields.length" class="empty-card">
            还没有任何属性。点「添加属性」开始设计这张卡。
          </div>

          <div v-else class="field-list">
            <div v-for="(field, index) in fields" :key="field.id" class="field-row">
              <span class="field-index">{{ index + 1 }}</span>
              <input
                class="field-label-input"
                :value="field.label"
                placeholder="属性名"
                @input="onFieldInput(field, 'label', $event)"
              />
              <select
                class="field-type"
                :value="field.fieldType"
                @change="onFieldInput(field, 'fieldType', $event)"
              >
                <option v-for="option in typeOptions" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
              <input
                class="field-unit"
                :value="field.unit"
                placeholder="单位"
                @input="onFieldInput(field, 'unit', $event)"
              />
              <input
                class="field-options"
                :value="field.options"
                :disabled="field.fieldType !== 'select'"
                :placeholder="field.fieldType === 'select' ? '选项，用逗号分隔：普通,稀有,史诗' : '仅选项类型可填'"
                @input="onFieldInput(field, 'options', $event)"
              />
              <div class="field-actions">
                <button class="mini-action" title="上移" :disabled="index === 0" @click="novel.moveCardField(field.id, -1)">
                  ↑
                </button>
                <button
                  class="mini-action"
                  title="下移"
                  :disabled="index === fields.length - 1"
                  @click="novel.moveCardField(field.id, 1)"
                >
                  ↓
                </button>
                <button class="mini-action danger" title="删除属性" @click="removeField(field)">✕</button>
              </div>
            </div>
          </div>

          <p class="type-hint">
            支持四种类型：文本 / 数值 / 长文本 / 选项。选项类型在「选项」里用逗号分隔可选项，填写时会变成下拉框。
            类型：{{ Object.entries(fieldTypeLabels).map(([key, label]) => `${label}(${key})`).join(' · ') }}
          </p>
        </section>

        <section class="preview-section">
          <div class="section-bar">
            <span class="section-title">卡片预览</span>
            <span class="section-hint">角色/物品页会以这种样式显示当前属性</span>
          </div>
          <div class="preview-card">
            <div class="preview-head">
              <span class="preview-icon">▤</span>
              <span class="preview-name">{{ template.name || '属性卡' }}</span>
              <span class="preview-badge">当前属性</span>
            </div>
            <div class="preview-grid">
              <div v-for="field in fields" :key="`preview-${field.id}`" class="preview-item">
                <span class="preview-label">{{ field.label || '未命名属性' }}</span>
                <span class="preview-value">
                  {{ previewValue(field) }}
                  <span v-if="field.unit" class="preview-unit">{{ field.unit }}</span>
                </span>
              </div>
              <div v-if="!fields.length" class="preview-empty">添加属性后在这里预览。</div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.template-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--surface);
}
.template-head {
  flex: 0 0 auto;
  padding: 16px clamp(20px, 4vw, 48px) 12px;
  border-bottom: 1px solid var(--border);
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
  align-items: center;
  gap: 12px;
}
.title-input {
  flex: 0 1 420px;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  padding: 2px 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  color: var(--ink);
  border-bottom: 1px solid transparent;
}
.title-input:focus {
  border-bottom-color: var(--border);
}
.kind-badge {
  flex: 0 0 auto;
  padding: 2px 8px;
  border-radius: 5px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 10.5px;
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
}
.desc-input {
  width: 100%;
  margin-top: 10px;
  padding: 7px 9px;
  border: 1px dashed var(--border-strong);
  border-radius: 7px;
  background: transparent;
  outline: none;
  font-size: 12px;
  color: var(--ink-soft);
}
.desc-input:focus {
  border-style: solid;
  border-color: var(--accent);
  background: var(--surface-2);
}

.template-body {
  flex: 1;
  min-height: 0;
}
.template-inner {
  max-width: 1000px;
  margin: 0 auto;
  padding: 22px clamp(20px, 4vw, 48px) 60px;
}
.tip {
  margin: 0 0 20px;
  padding: 10px 13px;
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  background: var(--accent-soft);
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
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
  color: var(--ink-soft);
}
.section-hint {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
}
.btn-primary-ghost {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.btn-primary-ghost:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.field-list {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.field-row {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}
.field-index {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--muted);
}
.field-label-input {
  flex: 1 1 180px;
  min-width: 100px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.field-label-input:focus {
  border-color: var(--accent);
}
.field-type {
  flex: 0 0 86px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.field-unit {
  flex: 0 0 64px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 12px;
  color: var(--ink-soft);
}
.field-options {
  flex: 1 1 240px;
  min-width: 120px;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.field-options:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.field-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 2px;
}
.mini-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 11px;
}
.mini-action:hover:not(:disabled) {
  background: var(--surface);
  color: var(--accent);
}
.mini-action:disabled {
  opacity: 0.35;
}
.mini-action.danger:hover {
  color: var(--danger);
}
.empty-card {
  padding: 18px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  font-size: 12px;
  color: var(--muted);
  text-align: center;
}
.type-hint {
  margin: 10px 0 0;
  font-size: 10.5px;
  line-height: 1.8;
  color: var(--muted);
}

.preview-section {
  margin-top: 28px;
  padding-top: 20px;
  border-top: 1px dashed var(--border);
}
.preview-card {
  padding: 16px 18px;
  border: 1px solid var(--accent);
  border-radius: 14px;
  background: var(--surface-2);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.preview-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.preview-icon {
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
.preview-name {
  font-size: 13px;
  font-weight: 600;
}
.preview-badge {
  padding: 1px 6px;
  border-radius: 4px;
  background: var(--surface-3);
  font-size: 10px;
  color: var(--muted);
}
.preview-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 9px;
}
.preview-item {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.preview-label {
  font-size: 10.5px;
  color: var(--muted);
}
.preview-value {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}
.preview-unit {
  font-size: 10.5px;
  font-weight: 400;
  color: var(--muted);
}
.preview-empty {
  grid-column: 1 / -1;
  font-size: 12px;
  color: var(--muted);
}
@media (max-width: 860px) {
  .field-row {
    flex-wrap: wrap;
  }
  .field-options {
    flex-basis: 100%;
  }
}
</style>
