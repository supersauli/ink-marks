<script setup lang="ts">
import { computed } from 'vue'
import type { UsageStats } from '../api/types'

const props = defineProps<{ usage: UsageStats | null }>()

const numberFormat = new Intl.NumberFormat('zh-CN')
const fmt = (value: number) => numberFormat.format(Math.round(value ?? 0))
function short(value: number): string {
  const n = Math.round(value ?? 0)
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 10000) return `${Math.round(n / 1000)}K`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}

const hitRate = computed(() => {
  const rate = props.usage?.cacheHitRate
  return typeof rate === 'number' ? Math.round(rate * 100) : null
})
const hasContext = computed(() => (props.usage?.contextLength ?? 0) > 0)
const contextPercent = computed(() => Math.round((props.usage?.contextRate ?? 0) * 100))
const barWidth = computed(() => `${Math.max(1.5, Math.min(100, (props.usage?.contextRate ?? 0) * 100))}%`)
const barColor = computed(() => {
  const rate = props.usage?.contextRate ?? 0
  if (rate >= 0.9) return 'var(--danger, #A32D2D)'
  if (rate >= 0.7) return '#BA7517'
  return 'var(--accent, #185FA5)'
})
const speedLabel = computed(() => {
  const rate = props.usage?.tokensPerSecond
  return typeof rate === 'number' && rate > 0 ? rate.toFixed(1) : null
})
function seconds(ms: number | null | undefined): string | null {
  return typeof ms === 'number' && ms > 0 ? `${(ms / 1000).toFixed(1)}s` : null
}
const timingTitle = computed(() => {
  const usage = props.usage
  if (!usage) return ''
  const parts = [`输出 ${fmt(usage.completionTokens)} token`]
  const duration = seconds(usage.durationMs)
  const first = seconds(usage.firstTokenMs)
  if (duration) parts.push(`总耗时 ${duration}`)
  if (first) parts.push(`首字 ${first}`)
  const decodeMs = usage.durationMs - (usage.firstTokenMs ?? 0)
  if (decodeMs > 50 && usage.completionTokens > 1) {
    parts.push(`首字后 ${(usage.completionTokens / (decodeMs / 1000)).toFixed(1)} tok/s`)
  }
  parts.push('速率 = 输出 token ÷ 总耗时（含首字等待）')
  if (usage.estimated) parts.push('按字符数估算，仅供参考')
  return parts.join(' · ')
})
</script>

<template>
  <div v-if="usage" class="usage-badge" :title="usage.estimated ? '服务商未返回用量，这里按字符数估算，仅供参考' : '来自模型服务返回的 usage 统计'">
    <div class="usage-line">
      <span>输入 <b>{{ fmt(usage.promptTokens) }}</b></span>
      <span>输出 <b>{{ fmt(usage.completionTokens) }}</b></span>
      <span :title="hitRate === null ? '该服务商未提供缓存命中数据' : '命中 token ÷ 输入 token'">
        缓存命中 <b :class="{ 'hit-good': hitRate !== null && hitRate >= 50 }">{{ hitRate === null ? '—' : `${hitRate}%` }}</b>
      </span>
      <span :title="timingTitle">
        生成速率 <b :class="{ 'speed-value': speedLabel !== null }">{{ speedLabel === null ? '—' : `${speedLabel} tok/s` }}</b>
      </span>
      <span v-if="usage.estimated" class="usage-est">估算</span>
    </div>
    <div v-if="hasContext" class="usage-context">
      <div class="usage-context-label">
        <span>上下文 <b>{{ short(usage.contextUsed) }} / {{ short(usage.contextLength) }}</b></span>
        <span>
          {{ contextPercent }}%<template v-if="usage.contextRemaining !== null"> · 余 {{ short(usage.contextRemaining) }}</template>
        </span>
      </div>
      <div class="usage-bar"><div class="usage-bar-fill" :style="{ width: barWidth, background: barColor }" /></div>
    </div>
  </div>
</template>

<style scoped>
.usage-badge {
  margin-top: 7px;
  padding: 7px 9px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font-size: 10.5px;
  line-height: 1.5;
}
.usage-line {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
}
.usage-line b {
  font-weight: 600;
  color: var(--ink-soft);
}
.usage-line b.hit-good {
  color: #0f6e56;
}
.usage-line b.speed-value {
  color: var(--accent, #185fa5);
}
.usage-est {
  padding: 0 5px;
  border-radius: 4px;
  background: var(--surface-2);
  color: var(--muted);
}
.usage-context {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
}
.usage-context-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}
.usage-context-label b {
  font-weight: 600;
  color: var(--ink-soft);
}
.usage-bar {
  height: 5px;
  border-radius: 3px;
  background: var(--surface-3, var(--surface-2));
  overflow: hidden;
}
.usage-bar-fill {
  height: 100%;
  border-radius: 3px;
  transition: width 0.25s ease;
}
</style>
