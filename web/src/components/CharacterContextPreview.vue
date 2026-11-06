<script setup lang="ts">
import { reactive, ref } from 'vue'
import type { CharacterContextResult } from '../utils/characterContext'

defineProps<{
  result: CharacterContextResult | null
  /** 放进更大的容器时去掉外框，避免套娃 */
  bare?: boolean
}>()

const expanded = reactive(new Set<string>())
const copied = ref('')

function toggle(id: string) {
  if (expanded.has(id)) expanded.delete(id)
  else expanded.add(id)
}

async function copyText(entry: { id: string; text: string }) {
  try {
    await navigator.clipboard.writeText(entry.text)
    copied.value = entry.id
    window.setTimeout(() => {
      if (copied.value === entry.id) copied.value = ''
    }, 1500)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div v-if="result" class="ctx-preview" :class="{ bare }">
    <div class="ctx-head">
      <span class="ctx-chapter">
        {{ result.chapterLabel ? `按「${result.chapterLabel}」解析` : '没有打开章节，按角色的当前阶段' }}
      </span>
      <span class="ctx-count">
        带入 {{ result.included.length }} 人<template v-if="result.excluded.length"> · 略过 {{ result.excluded.length }} 人</template>
      </span>
    </div>

    <ul class="ctx-list">
      <li v-for="entry in result.included" :key="entry.id" class="ctx-item" :data-open="expanded.has(entry.id)">
        <button class="ctx-row" :title="expanded.has(entry.id) ? '收起详情' : '展开这个人的完整设定'" @click="toggle(entry.id)">
          <span class="ctx-caret">{{ expanded.has(entry.id) ? '▾' : '▸' }}</span>
          <span class="ctx-name">{{ entry.name }}</span>
          <span class="ctx-stage">{{ entry.stageName }}</span>
          <span class="ctx-note">{{ entry.stageNote }}</span>
        </button>

        <div v-if="expanded.has(entry.id)" class="ctx-detail">
          <dl class="ctx-fields">
            <template v-for="field in entry.fields" :key="field.label">
              <dt>{{ field.label }}</dt>
              <dd>{{ field.value }}</dd>
            </template>
          </dl>
          <p v-if="!entry.fields.length" class="ctx-empty">这个人还没有填写任何设定。</p>
          <div class="ctx-detail-foot">
            <span class="ctx-detail-tip">以上文字就是发给 AI 的这一段原文</span>
            <button class="ctx-copy" @click="copyText(entry)">{{ copied === entry.id ? '已复制' : '复制这段' }}</button>
          </div>
        </div>
      </li>
    </ul>

    <p v-if="result.excluded.length" class="ctx-excluded">
      未登场，已略过：{{ result.excluded.map((entry) => entry.name).join('、') }}
    </p>

    <p v-for="warning in result.warnings" :key="warning" class="ctx-warning">{{ warning }}</p>

    <p class="ctx-foot">点人名可展开逐字段详情；属性、技能与随身物品取该章的快照。</p>
  </div>
</template>

<style scoped>
.ctx-preview {
  margin-top: 8px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  font-size: 11px;
  line-height: 1.7;
}
.ctx-preview.bare {
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font-size: 12.5px;
}
.ctx-preview.bare .ctx-fields dd {
  font-size: 12.5px;
}
.ctx-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  margin-bottom: 6px;
}
.ctx-chapter {
  font-weight: 600;
  color: var(--ink-soft);
}
.ctx-count {
  margin-left: auto;
  color: var(--muted);
}
.ctx-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.ctx-item {
  border-top: 1px dashed var(--border);
}
.ctx-item:first-child {
  border-top: none;
}
.ctx-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  width: 100%;
  padding: 4px 0;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
}
.ctx-row:hover .ctx-name {
  color: var(--accent);
}
.ctx-caret {
  flex: 0 0 auto;
  width: 9px;
  font-size: 9px;
  color: var(--border-strong);
}
.ctx-name {
  flex: 0 0 auto;
  font-weight: 600;
  color: var(--ink);
}
.ctx-stage {
  flex: 0 0 auto;
  padding: 0 6px;
  border: 1px solid var(--accent-2);
  border-radius: 4px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 10.5px;
}
.ctx-note {
  flex: 1 1 120px;
  min-width: 0;
  color: var(--muted);
}
.ctx-detail {
  margin: 2px 0 8px 15px;
  padding: 8px 10px;
  border-left: 2px solid var(--accent-2);
  border-radius: 0 6px 6px 0;
  background: var(--surface);
}
.ctx-fields {
  margin: 0;
}
.ctx-fields dt {
  margin-top: 6px;
  font-size: 10px;
  color: var(--muted);
}
.ctx-fields dt:first-child {
  margin-top: 0;
}
.ctx-fields dd {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--ink-soft);
  white-space: pre-wrap;
}
.ctx-empty {
  margin: 0;
  color: var(--muted);
}
.ctx-detail-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed var(--border);
}
.ctx-detail-tip {
  color: var(--muted);
  font-size: 10px;
}
.ctx-copy {
  margin-left: auto;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  font-size: 10.5px;
}
.ctx-copy:hover {
  text-decoration: underline;
}
.ctx-excluded {
  margin: 6px 0 0;
  color: var(--muted);
}
.ctx-warning {
  margin: 6px 0 0;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--danger-soft);
  color: var(--danger);
}
.ctx-foot {
  margin: 6px 0 0;
  color: var(--muted);
  font-size: 10px;
}
</style>
