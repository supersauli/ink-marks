<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useChatStore } from '../stores/chat'
import { useNovelStore } from '../stores/novel'
import { useSettingsStore } from '../stores/settings'
import { buildChatSystemPrompt, type WritingContext } from '../utils/prompts'
import { buildCharacterContext } from '../utils/characterContext'
import { buildContextSections } from '../utils/contextSections'
import ContextInspector from './ContextInspector.vue'
import { formatTime } from '../utils/format'
import ModelSelect from './ModelSelect.vue'
import UsageBadge from './UsageBadge.vue'

const chat = useChatStore()
const novel = useNovelStore()
const settings = useSettingsStore()

const input = ref(chat.draft)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)
const stickToBottom = ref(true)
const contextOn = reactive({ style: true, outline: true, characters: true, summary: true, body: false, selection: true })
const showContextPanel = ref(false)

// 角色设定按当前打开的章节解析，避免把后面章节的阶段写进这一章
const characterContext = computed(() =>
  buildCharacterContext(novel.characters, novel.chapters, novel.chapter?.id ?? null, {
    maxLength: 6000,
    overview: novel.overview
  })
)

const selectionPreview = computed(() => {
  const text = novel.selection?.text?.trim() ?? ''
  return text.length > 14 ? `${text.slice(0, 14)}…` : text
})

const streamingId = computed(() => {
  if (!chat.sending) return ''
  return chat.messages[chat.messages.length - 1]?.id ?? ''
})

const thinkingPreview = computed(() => {
  const text = chat.thinking
  return text.length > 900 ? `…${text.slice(-900)}` : text
})

const bigContextHint = computed(() => {
  const items: string[] = []
  if (contextOn.style && novel.project?.styleGuide?.trim()) items.push('写作风格')
  if (contextOn.outline && novel.outlineText) items.push('全书大纲')
  if (contextOn.characters && characterContext.value.text) {
    const index = characterContext.value.chapterIndex
    items.push(index >= 0 ? `角色设定（第 ${index + 1} 章）` : '角色设定')
  }
  if (contextOn.summary && novel.chapter?.summary) items.push('章节大纲')
  if (contextOn.body && novel.chapter?.blocks.length) items.push('章节正文')
  if (contextOn.selection && novel.selection) items.push('选中段落')
  return items.length ? `已附带：${items.join('、')}` : '未附带创作上下文'
})

// 勾了什么就有几个页签，内容是真正会发给模型的那几段
const contextSections = computed(() => buildContextSections(buildContext()))

const suggestions = [
  '帮我分析这一章的情节节奏是否合理',
  '这个人物做这件事的动机站得住吗？',
  '把这段对话写得更有张力一些',
  '给我三个后续剧情走向，各有不同的风险'
]

function resizeInput() {
  const element = inputRef.value
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${Math.min(element.scrollHeight, 180)}px`
}

async function scrollToBottom(force = false) {
  if (!force && !stickToBottom.value) return
  await nextTick()
  const element = listRef.value
  if (element) element.scrollTop = element.scrollHeight
}

function onListScroll() {
  const element = listRef.value
  if (!element) return
  stickToBottom.value = element.scrollHeight - element.scrollTop - element.clientHeight < 48
}

function buildContext(): WritingContext {
  const context: WritingContext = {}
  if (novel.project) context.projectName = novel.project.name
  if (contextOn.style && novel.project?.styleGuide?.trim()) {
    context.styleText = novel.project.styleGuide.trim().slice(0, 2000)
  }
  if (contextOn.outline && novel.outlineText) context.outlineText = novel.outlineText.slice(0, 6000)
  if (contextOn.characters && characterContext.value.text) context.charactersText = characterContext.value.text
  const current = novel.chapter
  if (current) {
    context.chapterTitle = current.title
    if (contextOn.summary && current.summary) context.chapterSummary = current.summary.slice(0, 2500)
    if (contextOn.body && current.blocks.length) {
      const body = current.blocks.map((block) => block.text).join('\n\n')
      context.bodyText =
        body.length > 7000 ? `${body.slice(0, 3500)}\n\n……（中略）……\n\n${body.slice(-3000)}` : body
    }
  }
  if (contextOn.selection && novel.selection?.text) {
    context.selectionText = novel.selection.text.slice(0, 1200)
  }
  return context
}

function send() {
  const text = input.value.trim()
  if (!text || chat.sending) return
  const systemPrompt = buildChatSystemPrompt(buildContext())
  input.value = ''
  chat.draft = ''
  resizeInput()
  stickToBottom.value = true
  void chat.send(text, systemPrompt)
  void scrollToBottom(true)
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault()
    send()
  }
}

function useSuggestion(text: string) {
  input.value = text
  chat.draft = text
  nextTick(() => {
    resizeInput()
    inputRef.value?.focus()
  })
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    /* 忽略剪贴板错误 */
  }
}

async function clearChat() {
  if (!window.confirm('清空当前作品的全部对话记录？此操作不可恢复。')) return
  await chat.clear()
}

watch(
  () => chat.draft,
  (value) => {
    if (value !== input.value) {
      input.value = value
      nextTick(() => {
        resizeInput()
        inputRef.value?.focus()
        scrollToBottom()
      })
    }
  }
)

watch(
  () => chat.messages.map((message) => `${message.id}:${message.content}`).join('|'),
  () => scrollToBottom()
)

watch(
  () => chat.sending,
  () => scrollToBottom()
)

watch(
  () => novel.selection,
  (value) => {
    if (value) contextOn.selection = true
  }
)

onMounted(() => {
  resizeInput()
  scrollToBottom(true)
  void novel.ensureOverview()
  window.addEventListener('keydown', onGlobalKey)
})

onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKey))

function onGlobalKey(event: KeyboardEvent) {
  if (event.key === 'Escape' && showContextPanel.value) {
    showContextPanel.value = false
  }
}

watch(
  () => novel.chapter?.id,
  () => {
    void novel.ensureOverview()
  }
)
</script>

<template>
  <aside class="chat-panel" :class="{ 'chat-wide': showContextPanel }">
    <header class="chat-head">
      <div class="chat-title">
        <span class="chat-dot" />
        <span>AI 对话</span>
      </div>
      <div class="chat-tools">
        <ModelSelect />
        <button class="btn btn-icon btn-sm btn-ghost" title="清空对话" @click="clearChat">✕</button>
        <button class="btn btn-icon btn-sm btn-ghost" title="收起对话" @click="chat.open = false">⟩</button>
      </div>
    </header>

    <div v-if="!settings.allModels.length" class="model-warning">
      还没有配置模型。
      <button class="link-btn" @click="settings.openSettings()">去设置服务商与模型</button>
    </div>

    <div class="context-row">
      <button
        class="tag"
        :class="{ active: contextOn.style }"
        :disabled="!novel.project?.styleGuide?.trim()"
        title="作品级写作风格，在首页编辑"
        @click="contextOn.style = !contextOn.style"
      >
        写作风格
      </button>
      <button class="tag" :class="{ active: contextOn.outline }" :disabled="!novel.outlineText" @click="contextOn.outline = !contextOn.outline">
        全书大纲
      </button>
      <button
        class="tag"
        :class="{ active: contextOn.characters }"
        :disabled="!characterContext.text"
        :title="
          characterContext.chapterLabel
            ? `按「${characterContext.chapterLabel}」解析：带入 ${characterContext.included.length} 人，略过 ${characterContext.excluded.length} 人（未登场）`
            : `按角色当前阶段带入 ${characterContext.included.length} 人`
        "
        @click="contextOn.characters = !contextOn.characters"
      >
        角色设定
      </button>
      <button
        class="tag"
        :class="{ active: contextOn.summary }"
        :disabled="!novel.chapter?.summary"
        @click="contextOn.summary = !contextOn.summary"
      >
        章节大纲
      </button>
      <button
        class="tag"
        :class="{ active: contextOn.body }"
        :disabled="!novel.chapter?.blocks.length"
        @click="contextOn.body = !contextOn.body"
      >
        正文
      </button>
      <button
        class="tag"
        :class="{ active: contextOn.selection }"
        :disabled="!novel.selection"
        :title="novel.selection?.text || '先在正文中选中一段文字'"
        @click="contextOn.selection = !contextOn.selection"
      >
        选中{{ selectionPreview ? `：${selectionPreview}` : '段落' }}
      </button>
    </div>

    <div v-if="showContextPanel" class="chat-context-panel">
      <div class="chat-context-head">
        <span class="chat-context-title">将发送的上下文</span>
        <button class="link-btn" @click="showContextPanel = false">返回对话</button>
      </div>
      <ContextInspector :sections="contextSections" :character-result="characterContext" />
    </div>

    <div v-else ref="listRef" class="chat-messages scroll-y" @scroll="onListScroll">
      <div v-if="!chat.messages.length" class="chat-empty">
        <div class="empty-mark">✦</div>
        <p class="empty-title">和 AI 一起打磨这部小说</p>
        <p class="empty-hint">可以让它帮你续写、分析人物动机、检查情节漏洞，或者讨论某一段的改法。</p>
        <div class="suggestions">
          <button v-for="item in suggestions" :key="item" class="suggest" @click="useSuggestion(item)">
            {{ item }}
          </button>
        </div>
      </div>

      <div v-for="message in chat.visibleMessages" :key="message.id" class="msg" :class="message.role">
        <div v-if="message.role === 'assistant'" class="msg-avatar">✦</div>
        <div class="msg-body">
          <div class="msg-meta">
            {{ message.role === 'user' ? '你' : message.modelName || 'AI' }}
            <span v-if="message.createdAt">· {{ formatTime(message.createdAt) }}</span>
          </div>
          <div class="msg-content">
            {{ message.content }}
            <span v-if="message.id === streamingId" class="cursor">▍</span>
          </div>
          <UsageBadge v-if="message.role === 'assistant' && message.usage" :usage="message.usage" />
          <div v-if="message.role === 'assistant' && message.content" class="msg-actions">
            <button class="mini-link" @click="copyText(message.content)">复制</button>
            <button class="mini-link" @click="chat.draft = `基于下面的内容继续展开：\n\n${message.content}\n\n`">
              继续追问
            </button>
          </div>
        </div>
      </div>

      <div v-if="chat.sending && chat.thinking" class="thinking-block">
        <span class="thinking-label">模型思考中…</span>
        <span class="thinking-text">{{ thinkingPreview }}</span>
      </div>
    </div>

    <div class="chat-composer">
      <div v-if="chat.error" class="chat-error">{{ chat.error }}</div>
      <textarea
        ref="inputRef"
        v-model="input"
        class="composer-input"
        rows="2"
        placeholder="讨论剧情、人物或文风……（Enter 发送，Shift + Enter 换行）"
        @input="resizeInput"
        @keydown="onKeydown"
      />
      <div class="composer-foot">
        <button class="context-hint context-toggle" @click="showContextPanel = true">
          {{ bigContextHint }}
          <span class="context-toggle-mark">查看</span>
        </button>
        <div class="composer-actions">
          <button v-if="chat.sending" class="btn btn-sm" @click="chat.stop()">停止</button>
          <button v-else class="btn btn-sm btn-primary" :disabled="!input.trim()" @click="send">发送 ↵</button>
        </div>
      </div>
    </div>
  </aside>
</template>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  width: 360px;
  flex: 0 0 360px;
  border-left: 1px solid var(--border);
  background: var(--surface);
  min-height: 0;
  transition: width 0.18s ease, flex-basis 0.18s ease;
}
.chat-wide {
  width: 500px;
  flex: 0 0 500px;
}
.chat-context-panel {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.chat-context-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
}
.chat-context-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.chat-context-head .link-btn {
  margin-left: auto;
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11px;
}
.chat-context-panel :deep(.inspector) {
  flex: 1;
  min-height: 0;
}

.chat-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 46px;
  padding: 0 10px 0 14px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.chat-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.04em;
}
.chat-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-2);
  box-shadow: 0 0 0 3px var(--accent-2-soft);
}
.chat-tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.model-warning {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  background: var(--accent-soft);
  font-size: 11.5px;
  color: var(--accent);
  border-bottom: 1px solid var(--border);
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  text-decoration: underline;
  font-size: 11.5px;
}

.context-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
  flex: 0 0 auto;
}
.context-row .tag {
  height: 22px;
  font-size: 11px;
  padding: 0 8px;
}
.context-row .tag:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

.chat-messages {
  flex: 1;
  min-height: 0;
  padding: 14px 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  background: var(--surface);
}

.chat-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 6vh 10px 20px;
  text-align: center;
}
.empty-mark {
  font-size: 22px;
  color: var(--border-strong);
}
.empty-title {
  margin: 4px 0 0;
  font-family: var(--font-serif);
  font-size: 16px;
  color: var(--ink);
}
.empty-hint {
  margin: 0;
  max-width: 240px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
}
.suggestions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
}
.suggest {
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--ink-soft);
  font-size: 11.5px;
  line-height: 1.5;
  text-align: left;
}
.suggest:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.msg {
  display: flex;
  gap: 8px;
  align-items: flex-start;
}
.msg.user {
  flex-direction: row-reverse;
}
.msg-avatar {
  flex: 0 0 24px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  background: var(--accent-2-soft);
  color: var(--accent-2);
  font-size: 12px;
  margin-top: 2px;
}
.msg-body {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  max-width: 86%;
}
.msg.user .msg-body {
  align-items: flex-end;
}
.msg-meta {
  font-size: 10.5px;
  color: var(--muted);
}
.msg-content {
  white-space: pre-wrap;
  word-break: break-word;
  padding: 9px 11px;
  border-radius: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-soft);
}
.msg.user .msg-content {
  background: var(--accent-soft);
  border-color: transparent;
  color: var(--ink);
}
.cursor {
  color: var(--accent);
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.msg-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.msg:hover .msg-actions {
  opacity: 1;
}
.mini-link {
  border: none;
  background: transparent;
  padding: 0 2px;
  font-size: 10.5px;
  color: var(--muted);
}
.mini-link:hover {
  color: var(--accent);
}

.thinking-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 11px;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
  background: var(--surface-2);
}
.thinking-label {
  font-size: 10.5px;
  color: var(--accent);
}
.thinking-text {
  max-height: 160px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 11.5px;
  line-height: 1.75;
  color: var(--muted);
}

.chat-composer {
  flex: 0 0 auto;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
  background: var(--surface-2);
}
.chat-error {
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 7px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 11.5px;
  line-height: 1.6;
}
.composer-input {
  width: 100%;
  min-height: 54px;
  max-height: 180px;
  padding: 10px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
  resize: none;
  outline: none;
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--ink);
}
.composer-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.composer-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 7px;
}
.context-hint {
  min-width: 0;
  font-size: 10.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.context-toggle {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  max-width: 100%;
  border: none;
  background: none;
  padding: 0;
  text-align: left;
}
.context-toggle:hover .context-toggle-mark {
  text-decoration: underline;
}
.context-toggle-mark {
  flex: 0 0 auto;
  color: var(--accent);
}
.composer-actions {
  flex: 0 0 auto;
}

@media (max-width: 1180px) {
  .chat-panel {
    width: 320px;
    flex-basis: 320px;
  }
}
</style>
