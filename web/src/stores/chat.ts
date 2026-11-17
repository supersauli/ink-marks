import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api, streamChat } from '../api/client'
import type { ChatMessage, UsageStats } from '../api/types'
import { useSettingsStore } from './settings'

export const useChatStore = defineStore('chat', () => {
  const messages = ref<ChatMessage[]>([])
  const sending = ref(false)
  const thinking = ref('')
  const error = ref('')
  const open = ref(true)
  const projectId = ref('')
  const draft = ref('')
  let controller: AbortController | null = null

  const visibleMessages = computed(() => messages.value.filter((message) => message.role !== 'system'))
  const lastAssistant = computed(() => [...messages.value].reverse().find((message) => message.role === 'assistant') ?? null)

  async function load(pid: string) {
    projectId.value = pid
    error.value = ''
    if (!pid) {
      messages.value = []
      return
    }
    try {
      messages.value = await api.listChatMessages(pid)
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  function toggle() {
    open.value = !open.value
  }

  async function send(text: string, systemPrompt: string | null) {
    const content = text.trim()
    if (!content || sending.value) return
    const settings = useSettingsStore()
    const model = settings.currentModel
    if (!model) {
      error.value = '还没有可用的模型，请先在右上角「设置」中添加服务商与模型。'
      return
    }
    const pid = projectId.value
    if (!pid) {
      error.value = '请先打开一个作品。'
      return
    }

    error.value = ''
    const userMessage: ChatMessage = {
      id: `local-user-${Date.now()}`,
      projectId: pid,
      role: 'user',
      content,
      modelName: null,
      createdAt: new Date().toISOString()
    }
    messages.value.push(userMessage)
    api
      .saveChatMessage({ projectId: pid, role: 'user', content })
      .then((saved) => {
        userMessage.id = saved.id
      })
      .catch(() => {
        /* 本地消息已展示，忽略持久化失败 */
      })

    const assistant: ChatMessage = {
      id: `local-assistant-${Date.now()}`,
      projectId: pid,
      role: 'assistant',
      content: '',
      modelName: model.name,
      usage: null,
      createdAt: new Date().toISOString()
    }
    messages.value.push(assistant)
    const index = messages.value.length - 1

    const history = messages.value
      .slice(0, index)
      .filter((message) => message.content.trim() && message.role !== 'system')
      .slice(-12)
      .map((message) => ({ role: message.role, content: message.content }))

    const payloadMessages: Array<{ role: string; content: string }> = []
    if (systemPrompt) payloadMessages.push({ role: 'system', content: systemPrompt })
    payloadMessages.push(...history)

    sending.value = true
    thinking.value = ''
    controller = new AbortController()
    let usage: UsageStats | null = null
    try {
      await streamChat(
        { modelId: model.id, messages: payloadMessages, projectId: pid, scene: 'chat' },
        {
          onDelta: (delta) => {
            if (projectId.value !== pid) return
            const target = messages.value[index]
            if (target) target.content += delta
          },
          onReasoning: (delta) => {
            if (projectId.value !== pid) return
            thinking.value += delta
          },
          onUsage: (value) => {
            usage = value
            if (projectId.value !== pid) return
            const target = messages.value[index]
            if (target) target.usage = value
          }
        },
        controller.signal
      )
    } catch (err) {
      const message = err as Error
      if (message.name !== 'AbortError') {
        error.value = message.message
      }
    } finally {
      sending.value = false
      thinking.value = ''
      controller = null
      if (projectId.value !== pid) return
      const finalContent = messages.value[index]?.content ?? ''
      if (!finalContent.trim()) {
        messages.value.splice(index, 1)
      } else {
        api
          .saveChatMessage({ projectId: pid, role: 'assistant', content: finalContent, modelName: model.name, usage })
          .then((saved) => {
            const target = messages.value[index]
            if (target) target.id = saved.id
          })
          .catch(() => {
            /* 忽略 */
          })
      }
    }
  }

  function stop() {
    controller?.abort()
  }

  async function clear() {
    const pid = projectId.value
    if (!pid) return
    try {
      await api.clearChatMessages(pid)
      messages.value = []
      error.value = ''
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  return {
    messages,
    visibleMessages,
    lastAssistant,
    sending,
    thinking,
    error,
    open,
    projectId,
    draft,
    load,
    send,
    stop,
    clear,
    toggle
  }
})
