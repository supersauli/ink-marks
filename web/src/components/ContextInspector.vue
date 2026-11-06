<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import CharacterContextPreview from './CharacterContextPreview.vue'
import type { CharacterContextResult } from '../utils/characterContext'
import { sectionCharCount, type ContextSection } from '../utils/contextSections'

const props = defineProps<{
  sections: ContextSection[]
  characterResult: CharacterContextResult | null
}>()

const activeKey = ref('')
const mode = ref<'cards' | 'raw'>('cards')
const copied = ref(false)

watch(
  () => props.sections.map((section) => section.key).join(','),
  () => {
    if (!props.sections.some((section) => section.key === activeKey.value)) {
      activeKey.value = props.sections[0]?.key ?? ''
    }
  },
  { immediate: true }
)

const active = computed(
  () => props.sections.find((section) => section.key === activeKey.value) ?? props.sections[0] ?? null
)

const activeText = computed(() => active.value?.text ?? '')
const total = computed(() => props.sections.reduce((sum, section) => sum + sectionCharCount(section.text), 0))

async function copyActive() {
  if (!activeText.value) return
  try {
    await navigator.clipboard.writeText(activeText.value)
    copied.value = true
    window.setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <div class="inspector">
    <nav class="inspector-nav">
      <button
        v-for="section in sections"
        :key="section.key"
        class="nav-item"
        :class="{ active: section.key === activeKey }"
        @click="activeKey = section.key"
      >
        <span class="nav-label">{{ section.label }}</span>
        <span class="nav-count">{{ sectionCharCount(section.text) }}</span>
      </button>
      <p v-if="!sections.length" class="nav-empty">上面没有勾选任何内容</p>
    </nav>

    <div class="inspector-body">
      <header class="inspector-head">
        <span class="inspector-title">{{ active?.label || '上下文' }}</span>
        <span v-if="activeText" class="inspector-meta">{{ sectionCharCount(activeText) }} 字</span>
        <button v-if="activeText" class="inspector-copy" @click="copyActive">
          {{ copied ? '已复制' : '复制这段' }}
        </button>
      </header>

      <div v-if="activeKey === 'characters' && characterResult" class="inspector-mode">
        <button class="mode-btn" :class="{ active: mode === 'cards' }" @click="mode = 'cards'">按人查看</button>
        <button class="mode-btn" :class="{ active: mode === 'raw' }" @click="mode = 'raw'">原始文本</button>
      </div>

      <div class="inspector-content">
        <CharacterContextPreview
          v-if="activeKey === 'characters' && characterResult && mode === 'cards'"
          :result="characterResult"
          bare
        />
        <pre v-else-if="activeText" class="inspector-pre">{{ activeText }}</pre>
        <p v-else class="inspector-empty">这一段没有内容。</p>
      </div>

      <footer class="inspector-foot">共 {{ sections.length }} 段 · {{ total }} 字</footer>
    </div>
  </div>
</template>

<style scoped>
.inspector {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--surface);
}

.inspector-nav {
  flex: 0 0 148px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 10px 8px;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
  overflow-y: auto;
}
.nav-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 6px 8px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  color: var(--ink-soft);
  font-size: 11.5px;
}
.nav-item:hover {
  border-color: var(--border);
  color: var(--ink);
}
.nav-item.active {
  border-color: var(--accent);
  background: var(--surface);
  color: var(--accent);
}
.nav-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.nav-count {
  flex: 0 0 auto;
  font-size: 9.5px;
  color: var(--muted);
}
.nav-item.active .nav-count {
  color: var(--accent);
}
.nav-empty {
  margin: 0;
  padding: 6px 8px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
}

.inspector-body {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.inspector-head {
  flex: 0 0 auto;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 10px 16px 8px;
  border-bottom: 1px solid var(--border);
}
.inspector-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}
.inspector-meta {
  font-size: 10.5px;
  color: var(--muted);
}
.inspector-copy {
  margin-left: auto;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11px;
}
.inspector-copy:hover {
  text-decoration: underline;
}
.inspector-mode {
  flex: 0 0 auto;
  display: flex;
  gap: 6px;
  padding: 8px 16px 0;
}
.mode-btn {
  padding: 2px 9px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 10.5px;
  color: var(--muted);
}
.mode-btn.active {
  border-color: var(--accent-2);
  background: var(--accent-2-soft);
  color: var(--accent-2);
}

.inspector-content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 16px 16px;
}
.inspector-pre {
  margin: 0;
  font-family: var(--font-ui);
  font-size: 12.5px;
  line-height: 1.95;
  color: var(--ink-soft);
  white-space: pre-wrap;
  word-break: break-word;
}
.inspector-empty {
  margin: 0;
  font-size: 11.5px;
  color: var(--muted);
}
.inspector-foot {
  flex: 0 0 auto;
  padding: 7px 16px;
  border-top: 1px dashed var(--border);
  font-size: 10px;
  color: var(--muted);
}

@media (max-width: 720px) {
  .inspector {
    flex-direction: column;
  }
  .inspector-nav {
    flex: 0 0 auto;
    flex-direction: row;
    width: 100%;
    border-right: none;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
  }
  .nav-item {
    white-space: nowrap;
  }
}
</style>
