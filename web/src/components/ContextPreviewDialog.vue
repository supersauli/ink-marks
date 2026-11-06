<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import CharacterContextPreview from './CharacterContextPreview.vue'
import type { CharacterContextResult } from '../utils/characterContext'
import { sectionCharCount, type ContextSection } from '../utils/contextSections'

const props = defineProps<{
  open: boolean
  sections: ContextSection[]
  characterResult: CharacterContextResult | null
  subtitle?: string
}>()

const emit = defineEmits<{ (event: 'close'): void }>()

const activeKey = ref('')
const mode = ref<'cards' | 'raw'>('cards')
const copied = ref(false)

watch(
  () => [props.open, props.sections.map((section) => section.key).join(',')],
  () => {
    if (!props.open) return
    const exists = props.sections.some((section) => section.key === activeKey.value)
    if (!exists) activeKey.value = props.sections[0]?.key ?? ''
  },
  { immediate: true }
)

const activeSection = computed(
  () => props.sections.find((section) => section.key === activeKey.value) ?? props.sections[0] ?? null
)

const activeText = computed(() => activeSection.value?.text ?? '')

const totalCount = computed(() => props.sections.reduce((total, section) => total + sectionCharCount(section.text), 0))

function countOf(section: ContextSection) {
  return sectionCharCount(section.text)
}

async function copyAll() {
  const text = props.sections.map((section) => `【${section.label}】\n${section.text}`).join('\n\n')
  try {
    await navigator.clipboard.writeText(text)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && props.open) {
    event.stopPropagation()
    emit('close')
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="open" class="ctx-overlay" @click.self="emit('close')">
      <section class="ctx-dialog">
        <header class="ctx-head">
          <div class="ctx-head-text">
            <div class="ctx-head-title">将发送的上下文</div>
            <div class="ctx-head-sub">{{ subtitle || '按当前勾选的内容生成' }}</div>
          </div>
          <button class="ctx-close" title="关闭（Esc）" @click="emit('close')">✕</button>
        </header>

        <nav class="ctx-tabs">
          <button
            v-for="section in sections"
            :key="section.key"
            class="ctx-tab"
            :class="{ active: section.key === activeKey }"
            @click="activeKey = section.key"
          >
            {{ section.label }}
            <span class="ctx-tab-count">{{ countOf(section) }} 字</span>
          </button>
          <span v-if="!sections.length" class="ctx-tabs-empty">上面没有勾选任何上下文，AI 只会收到你的要求。</span>
        </nav>

        <div class="ctx-body">
          <div v-if="activeKey === 'characters' && characterResult" class="ctx-mode">
            <button class="ctx-mode-btn" :class="{ active: mode === 'cards' }" @click="mode = 'cards'">按人查看</button>
            <button class="ctx-mode-btn" :class="{ active: mode === 'raw' }" @click="mode = 'raw'">原始文本</button>
          </div>

          <CharacterContextPreview
            v-if="activeKey === 'characters' && characterResult && mode === 'cards'"
            :result="characterResult"
            bare
          />
          <pre v-else-if="activeText" class="ctx-raw">{{ activeText }}</pre>
          <p v-else class="ctx-empty">这一段没有内容。</p>
        </div>

        <footer class="ctx-foot">
          <span class="ctx-foot-note">共 {{ sections.length }} 段 · {{ totalCount }} 字</span>
          <button class="ctx-copy" @click="copyAll">{{ copied ? '已复制' : '复制全部' }}</button>
          <button class="btn btn-sm" @click="emit('close')">关闭</button>
        </footer>
      </section>
    </div>
  </Teleport>
</template>

<style scoped>
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2vh 2vw;
  background: rgba(28, 22, 14, 0.4);
  animation: fade-in 0.18s ease;
}
.ctx-dialog {
  display: flex;
  flex-direction: column;
  width: 96vw;
  height: 92vh;
  border-radius: 14px;
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}
.ctx-head {
  flex: 0 0 auto;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 22px 12px;
  border-bottom: 1px solid var(--border);
}
.ctx-head-text {
  flex: 1;
  min-width: 0;
}
.ctx-head-title {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink);
}
.ctx-head-sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--muted);
}
.ctx-close {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--muted);
  font-size: 14px;
}
.ctx-close:hover {
  border-color: var(--border);
  color: var(--ink);
}

.ctx-tabs {
  flex: 0 0 auto;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 22px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.ctx-tab {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  padding: 5px 12px;
  border: 1px solid var(--border);
  border-radius: 20px;
  background: var(--surface);
  color: var(--ink-soft);
  font-size: 12px;
}
.ctx-tab:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.ctx-tab.active {
  border-color: var(--accent);
  background: var(--accent);
  color: #fff;
}
.ctx-tab-count {
  font-size: 10px;
  opacity: 0.7;
}
.ctx-tabs-empty {
  font-size: 11.5px;
  color: var(--muted);
}

.ctx-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 16px 22px 24px;
}
.ctx-mode {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}
.ctx-mode-btn {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 11px;
  color: var(--muted);
}
.ctx-mode-btn.active {
  border-color: var(--accent-2);
  background: var(--accent-2-soft);
  color: var(--accent-2);
}
.ctx-raw {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 13.5px;
  line-height: 2;
  color: var(--ink-soft);
  white-space: pre-wrap;
  word-break: break-word;
  max-width: 88ch;
}
.ctx-empty {
  margin: 0;
  color: var(--muted);
  font-size: 12.5px;
}

.ctx-foot {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 22px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
.ctx-foot-note {
  flex: 1;
  font-size: 11px;
  color: var(--muted);
}
.ctx-copy {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11.5px;
}
.ctx-copy:hover {
  text-decoration: underline;
}
</style>
