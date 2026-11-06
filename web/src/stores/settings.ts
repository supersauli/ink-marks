import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import type { Model, Provider } from '../api/types'

const MODEL_KEY = 'moji:model'

export interface ProviderPreset {
  name: string
  baseUrl: string
  hint: string
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  { name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', hint: 'deepseek-chat / deepseek-reasoner' },
  { name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', hint: 'gpt-4o / gpt-4o-mini' },
  { name: 'Kimi（Moonshot）', baseUrl: 'https://api.moonshot.cn/v1', hint: 'moonshot-v1-8k 等' },
  { name: '智谱 GLM', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', hint: 'glm-4-plus / glm-4-flash' },
  { name: '硅基流动', baseUrl: 'https://api.siliconflow.cn/v1', hint: '多种开源模型' },
  { name: 'Ollama 本地', baseUrl: 'http://localhost:11434/v1', hint: 'llama3.1 / qwen2.5 等' },
  { name: '自定义', baseUrl: '', hint: '任何 OpenAI 兼容接口' }
]

export const useSettingsStore = defineStore('settings', () => {
  const providers = ref<Provider[]>([])
  const loading = ref(false)
  const settingsOpen = ref(false)
  const error = ref('')
  const currentModelId = ref<string>(localStorage.getItem(MODEL_KEY) ?? '')

  const allModels = computed(() =>
    providers.value.flatMap((provider) => provider.models.map((model) => ({ ...model, provider })))
  )

  const currentModel = computed(
    () =>
      allModels.value.find((model) => model.id === currentModelId.value) ??
      allModels.value.find((model) => model.isDefault) ??
      allModels.value[0] ??
      null
  )

  const currentModelLabel = computed(() => {
    const model = currentModel.value
    if (!model) return '未配置模型'
    return model.displayName || model.name
  })

  function persistModel() {
    localStorage.setItem(MODEL_KEY, currentModelId.value)
  }

  function ensureSelection() {
    const exists = allModels.value.some((model) => model.id === currentModelId.value)
    if (exists) return
    const preferred = allModels.value.find((model) => model.isDefault) ?? allModels.value[0]
    currentModelId.value = preferred?.id ?? ''
    persistModel()
  }

  watch(currentModel, (model) => {
    if (model && model.id !== currentModelId.value) {
      currentModelId.value = model.id
      persistModel()
    }
  })

  async function load() {
    loading.value = true
    try {
      providers.value = await api.listProviders()
      ensureSelection()
    } catch (err) {
      error.value = (err as Error).message
    } finally {
      loading.value = false
    }
  }

  function selectModel(id: string) {
    currentModelId.value = id
    persistModel()
  }

  function openSettings() {
    settingsOpen.value = true
  }

  function closeSettings() {
    settingsOpen.value = false
    error.value = ''
  }

  function replaceProvider(updated: Provider) {
    const index = providers.value.findIndex((provider) => provider.id === updated.id)
    if (index >= 0) providers.value[index] = updated
    else providers.value.push(updated)
  }

  async function createProvider(payload: { name: string; baseUrl: string; apiKey?: string }) {
    const created = await api.createProvider(payload)
    providers.value.push(created)
    return created
  }

  async function saveProvider(id: string, patch: { name?: string; baseUrl?: string; apiKey?: string; extraHeaders?: string }) {
    const updated = await api.updateProvider(id, patch)
    replaceProvider(updated)
    ensureSelection()
  }

  async function removeProvider(id: string) {
    await api.deleteProvider(id)
    providers.value = providers.value.filter((provider) => provider.id !== id)
    ensureSelection()
  }

  async function addModel(
    providerId: string,
    payload: { name: string; displayName?: string; temperature?: number; maxTokens?: number; isDefault?: boolean }
  ) {
    const created = await api.createModel({ providerId, ...payload })
    const provider = providers.value.find((item) => item.id === providerId)
    if (provider) {
      if (created.isDefault) {
        providers.value.forEach((p) => p.models.forEach((model) => (model.isDefault = false)))
      }
      provider.models.push(created)
    }
    ensureSelection()
    return created
  }

  async function saveModel(id: string, patch: { name?: string; displayName?: string; temperature?: number; maxTokens?: number; isDefault?: boolean }) {
    const updated = await api.updateModel(id, patch)
    if (updated.isDefault) {
      providers.value.forEach((provider) => provider.models.forEach((model) => (model.isDefault = false)))
    }
    for (const provider of providers.value) {
      const index = provider.models.findIndex((model) => model.id === id)
      if (index >= 0) provider.models[index] = updated
    }
    return updated
  }

  async function removeModel(id: string) {
    await api.deleteModel(id)
    providers.value.forEach((provider) => {
      provider.models = provider.models.filter((model) => model.id !== id)
    })
    ensureSelection()
  }

  async function testProvider(id: string, apiKey?: string) {
    return api.testProvider(id, apiKey)
  }

  async function remoteModels(id: string, apiKey?: string) {
    return api.fetchRemoteModels(id, apiKey)
  }

  function findModel(id: string): Model | null {
    return allModels.value.find((model) => model.id === id) ?? null
  }

  return {
    providers,
    loading,
    settingsOpen,
    error,
    currentModelId,
    allModels,
    currentModel,
    currentModelLabel,
    load,
    selectModel,
    openSettings,
    closeSettings,
    createProvider,
    saveProvider,
    removeProvider,
    addModel,
    saveModel,
    removeModel,
    testProvider,
    remoteModels,
    findModel
  }
})
