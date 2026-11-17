<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { api } from '../api/client'
import type { UsageStatsResult } from '../api/types'
import { useNovelStore } from '../stores/novel'

const novel = useNovelStore()
const days = ref(30)
const onlyProject = ref(false)
const data = ref<UsageStatsResult | null>(null)
const loading = ref(false)
const clearing = ref(false)
const error = ref('')

const SCENE_LABELS: Record<string, string> = {
  chat: '对话',
  refine: '段落精修',
  append: '续写正文',
  summary: '章节大纲',
  outline: '大纲',
  other: '其他'
}
const sceneLabel = (value: string) => SCENE_LABELS[value] ?? value

const numberFormat = new Intl.NumberFormat('zh-CN')
const fmt = (value: number) => numberFormat.format(Math.round(value ?? 0))
function short(value: number): string {
  const n = Math.round(value ?? 0)
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return String(n)
}
const pct = (value: number | null) => (value === null || value === undefined ? '—' : `${Math.round(value * 100)}%`)
const timeLabel = (value: string) => {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN', { hour12: false })
}

const totals = computed(() => data.value?.totals ?? null)
const maxDayTokens = computed(() => Math.max(1, ...(data.value?.byDay ?? []).map((day) => day.totalTokens)))
const avgSpeed = computed(() => {
  const rate = totals.value?.avgTokensPerSecond
  return typeof rate === 'number' && rate > 0 ? rate.toFixed(1) : '—'
})

async function load() {
  loading.value = true
  error.value = ''
  try {
    data.value = await api.usageStats(days.value, onlyProject.value ? novel.project?.id ?? '' : '')
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = false
  }
}

async function clearAll() {
  const scope = onlyProject.value ? '当前作品' : '全部作品'
  if (!window.confirm(`清空${scope}的用量记录？聊天记录不会受影响，此操作不可恢复。`)) return
  clearing.value = true
  try {
    await api.clearUsageLogs(onlyProject.value ? novel.project?.id ?? '' : '')
    await load()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    clearing.value = false
  }
}

onMounted(load)
watch([days, onlyProject], load)
</script>

<template>
  <div class="usage-panel scroll-y">
    <div class="usage-toolbar">
      <div class="range-tabs">
        <button
          v-for="option in [7, 30, 90]"
          :key="option"
          class="btn btn-sm"
          :class="{ 'btn-primary': days === option }"
          @click="days = option"
        >
          近 {{ option }} 天
        </button>
      </div>
      <label class="check">
        <input v-model="onlyProject" type="checkbox" :disabled="!novel.project" /> 仅当前作品
      </label>
      <div class="toolbar-actions">
        <button class="btn btn-sm" :disabled="loading" @click="load">{{ loading ? '加载中…' : '刷新' }}</button>
        <button class="btn btn-sm btn-danger" :disabled="clearing || !totals?.requests" @click="clearAll">清空记录</button>
      </div>
    </div>

    <div v-if="error" class="usage-error">{{ error }}</div>

    <div v-if="!totals" class="usage-empty">正在读取用量记录…</div>
    <template v-else>
      <div v-if="!totals.requests" class="usage-empty">
        <p>这段时间还没有 AI 调用记录。</p>
        <p class="hint">发一条对话或做一次段落精修，这里就会开始累计。用量在每次 AI 返回后写入本地 SQLite。</p>
      </div>

      <template v-else>
        <div class="metric-grid">
          <div class="metric">
            <span class="metric-label">调用次数</span>
            <span class="metric-value">{{ fmt(totals.requests) }}</span>
            <span class="metric-note">输入 {{ short(totals.promptTokens) }} · 输出 {{ short(totals.completionTokens) }}</span>
          </div>
          <div class="metric">
            <span class="metric-label">总 token</span>
            <span class="metric-value">{{ short(totals.totalTokens) }}</span>
            <span class="metric-note">约 {{ fmt(totals.totalTokens) }} tokens</span>
          </div>
          <div class="metric">
            <span class="metric-label">缓存命中率</span>
            <span class="metric-value" :class="{ 'metric-good': (totals.cacheHitRate ?? 0) >= 0.5 }">
              {{ pct(totals.cacheHitRate) }}
            </span>
            <span class="metric-note">{{ totals.cacheReported }} 次调用上报了缓存字段</span>
          </div>
          <div class="metric">
            <span class="metric-label">上下文峰值</span>
            <span class="metric-value">{{ pct(totals.maxContextRate) }}</span>
            <span class="metric-note">占模型窗口的最大比例</span>
          </div>
          <div class="metric">
            <span class="metric-label">平均生成速率</span>
            <span class="metric-value">{{ avgSpeed }}<small v-if="avgSpeed !== '—'" class="unit"> tok/s</small></span>
            <span class="metric-note">{{ totals.timedRequests }} 次调用有耗时记录</span>
          </div>
        </div>

        <p class="usage-note">
          「缓存命中率」= 命中 token ÷ 输入 token，按服务商实际上报的数据计算；DeepSeek / OpenAI 会返回该字段，部分本地模型不返回时显示「—」。
          <template v-if="totals.estimatedCount">
            其中 {{ totals.estimatedCount }} 次调用服务商未返回用量，已按字符数估算并标记。
          </template>
          上下文占用取本次输入 token ÷ 模型窗口，窗口大小可在「模型与服务商」里逐个调整。
          「生成速率」= 输出 token ÷ 本次调用耗时（从请求发出到流结束，含首字等待），平均值按有耗时记录的调用加权，旧记录没有耗时会自动跳过。
        </p>

        <div class="usage-columns">
          <section class="usage-block">
            <div class="block-title">按模型</div>
            <div v-for="item in data?.byModel ?? []" :key="item.name" class="stat-row">
              <span class="stat-name" :title="item.name">{{ item.name }}</span>
              <span class="stat-num">{{ fmt(item.requests) }} 次</span>
              <span class="stat-num">{{ short(item.totalTokens) }}</span>
              <span class="stat-num" :class="{ 'metric-good': (item.cacheHitRate ?? 0) >= 0.5 }">{{ pct(item.cacheHitRate) }}</span>
            </div>
          </section>
          <section class="usage-block">
            <div class="block-title">按场景</div>
            <div v-for="item in data?.byScene ?? []" :key="item.name" class="stat-row">
              <span class="stat-name">{{ sceneLabel(item.name) }}</span>
              <span class="stat-num">{{ fmt(item.requests) }} 次</span>
              <span class="stat-num">{{ short(item.totalTokens) }}</span>
              <span class="stat-num" :class="{ 'metric-good': (item.cacheHitRate ?? 0) >= 0.5 }">{{ pct(item.cacheHitRate) }}</span>
            </div>
          </section>
        </div>

        <section v-if="(data?.byDay ?? []).length" class="usage-block day-block">
          <div class="block-title">每日 token 消耗</div>
          <div class="day-chart">
            <div v-for="day in data?.byDay ?? []" :key="day.name" class="day-col" :title="`${day.name} · ${fmt(day.totalTokens)} tokens · ${day.requests} 次`">
              <div class="day-bar" :style="{ height: `${Math.max(3, (day.totalTokens / maxDayTokens) * 100)}%` }" />
              <span class="day-label">{{ day.name.slice(5) }}</span>
            </div>
          </div>
        </section>

        <section class="usage-block">
          <div class="block-title">最近调用</div>
          <div class="log-head">
            <span>时间</span><span>场景</span><span>模型</span><span>输入 / 输出</span><span>缓存</span><span>上下文</span><span>速率</span>
          </div>
          <div v-for="log in data?.recent ?? []" :key="log.id" class="log-row">
            <span class="log-time">{{ timeLabel(log.createdAt) }}</span>
            <span>{{ sceneLabel(log.scene) }}</span>
            <span class="stat-name" :title="log.modelName ?? ''">{{ log.modelName || '—' }}</span>
            <span>{{ short(log.promptTokens) }} / {{ short(log.completionTokens) }}</span>
            <span>{{ pct(log.cacheHitRate) }}<i v-if="log.estimated" class="estimate-tag">估算</i></span>
            <span>{{ pct(log.contextRate) }}</span>
            <span :title="log.durationMs ? `耗时 ${(log.durationMs / 1000).toFixed(1)}s` : ''">
              {{ log.tokensPerSecond === null ? '—' : `${log.tokensPerSecond.toFixed(1)} tok/s` }}
            </span>
          </div>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.usage-panel {
  min-height: 0;
  height: 100%;
  padding: 14px 18px 24px;
  overflow-y: auto;
  background: var(--surface);
}
.usage-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 14px;
}
.range-tabs {
  display: flex;
  gap: 4px;
}
.check {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.toolbar-actions {
  display: flex;
  gap: 6px;
  margin-left: auto;
}
.usage-error,
.usage-empty {
  padding: 18px;
  border-radius: 9px;
  background: var(--surface-2);
  color: var(--muted);
  font-size: 12px;
  line-height: 1.8;
}
.usage-error {
  color: var(--danger);
  background: var(--danger-soft);
  margin-bottom: 12px;
}
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 10px;
}
.metric {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}
.metric-label {
  font-size: 11px;
  color: var(--muted);
}
.metric-value {
  font-size: 22px;
  line-height: 1.2;
  color: var(--ink);
}
.metric-value .unit {
  font-size: 11px;
  color: var(--muted);
}
.metric-note {
  font-size: 10.5px;
  color: var(--muted);
}
.metric-good {
  color: #0f6e56;
}
.usage-note {
  margin: 12px 0 16px;
  font-size: 11px;
  line-height: 1.8;
  color: var(--muted);
}
.usage-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 14px;
}
.usage-block {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.block-title {
  margin-bottom: 9px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.stat-row,
.log-row,
.log-head {
  display: grid;
  grid-template-columns: minmax(0, 1.6fr) 0.7fr 0.7fr 0.7fr;
  gap: 8px;
  align-items: center;
  padding: 6px 0;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--ink-soft);
}
.stat-num {
  text-align: right;
  color: var(--muted);
}
.stat-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.day-block {
  margin-bottom: 14px;
}
.day-chart {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 110px;
  padding-top: 6px;
  overflow-x: auto;
}
.day-col {
  display: flex;
  flex: 1 0 14px;
  min-width: 14px;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  gap: 4px;
}
.day-bar {
  width: 100%;
  max-width: 22px;
  border-radius: 3px 3px 0 0;
  background: var(--accent);
  opacity: 0.75;
}
.day-label {
  font-size: 9.5px;
  color: var(--muted);
  white-space: nowrap;
}
.log-head,
.log-row {
  grid-template-columns: minmax(0, 1.3fr) 0.7fr minmax(0, 1.1fr) 0.9fr 0.8fr 0.6fr 0.9fr;
}
.log-head {
  color: var(--muted);
  font-size: 10.5px;
}
.log-time {
  color: var(--muted);
}
.estimate-tag {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 3px;
  background: var(--surface-2);
  font-size: 9.5px;
  font-style: normal;
  color: var(--muted);
}
@media (max-width: 760px) {
  .usage-columns {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
