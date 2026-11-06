<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { PROVIDER_PRESETS, useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()

const selectedId = ref(settings.providers[0]?.id ?? '')
const provider = computed(() => settings.providers.find((item) => item.id === selectedId.value) ?? null)

const form = reactive({ name: '', baseUrl: '', apiKey: '', extraHeaders: '{}' })
const showKey = ref(false)
const savingProvider = ref(false)
const formError = ref('')
const flashMessage = ref('')

let flashTimer: number | null = null
function flash(text: string) {
  flashMessage.value = text
  if (flashTimer) window.clearTimeout(flashTimer)
  flashTimer = window.setTimeout(() => {
    flashMessage.value = ''
  }, 2600)
}

const testInfo = ref('')
const remoteList = ref<string[]>([])

interface ModelEdit {
  name: string
  displayName: string
  temperature: number
  maxTokens: number
}

const modelEdits = reactive<Record<string, ModelEdit>>({})

// 服务商列表是异步加载的，加载完成后确保有一个选中的服务商
watch(
  () => settings.providers,
  (list) => {
    if (!list.some((item) => item.id === selectedId.value)) {
      selectedId.value = list[0]?.id ?? ''
    }
  },
  { immediate: true }
)

watch(
  () => provider.value?.id,
  () => {
    form.name = provider.value?.name ?? ''
    form.baseUrl = provider.value?.baseUrl ?? ''
    form.apiKey = provider.value?.apiKey ?? ''
    form.extraHeaders = provider.value?.extraHeaders || '{}'
    formError.value = ''
    testInfo.value = ''
    remoteList.value = []
    resetModelEdits()
  },
  { immediate: true }
)

// 新建服务商 ---------------------------------------------------------------
const presetIndex = ref(0)
const newProvider = reactive({ name: PROVIDER_PRESETS[0].name, baseUrl: PROVIDER_PRESETS[0].baseUrl })
const creating = ref(false)

function applyPreset(index: number) {
  presetIndex.value = index
  const preset = PROVIDER_PRESETS[index]
  newProvider.name = preset.name
  newProvider.baseUrl = preset.baseUrl
}

async function createProvider() {
  if (!newProvider.name.trim()) return
  creating.value = true
  formError.value = ''
  try {
    const created = await settings.createProvider({
      name: newProvider.name.trim(),
      baseUrl: newProvider.baseUrl.trim() || 'https://api.openai.com/v1'
    })
    selectedId.value = created.id
    flash('已创建服务商，接着填写 API Key 并添加模型')
  } catch (error) {
    formError.value = (error as Error).message
  } finally {
    creating.value = false
  }
}

// 保存 / 删除服务商 -------------------------------------------------------
async function saveProviderForm() {
  if (!provider.value) return
  savingProvider.value = true
  formError.value = ''
  try {
    await settings.saveProvider(provider.value.id, {
      name: form.name.trim() || provider.value.name,
      baseUrl: form.baseUrl.trim(),
      apiKey: form.apiKey,
      extraHeaders: form.extraHeaders.trim() || '{}'
    })
    flash('服务商已保存')
  } catch (error) {
    formError.value = (error as Error).message
  } finally {
    savingProvider.value = false
  }
}

async function removeProvider() {
  if (!provider.value) return
  if (!window.confirm(`删除服务商「${provider.value.name}」？它下面的模型配置也会一起删除。`)) return
  try {
    await settings.removeProvider(provider.value.id)
    selectedId.value = settings.providers[0]?.id ?? ''
  } catch (error) {
    formError.value = (error as Error).message
  }
}

// 测试连接 / 远程模型 ------------------------------------------------------
const testing = ref(false)

async function testConnection() {
  if (!provider.value) return
  testing.value = true
  testInfo.value = ''
  try {
    const result = await settings.testProvider(provider.value.id, form.apiKey || undefined)
    testInfo.value = result.ok ? `连接成功，可用模型 ${result.count ?? 0} 个` : `连接失败：${result.error || '未知错误'}`
  } catch (error) {
    testInfo.value = `连接失败：${(error as Error).message}`
  } finally {
    testing.value = false
  }
}

const remoteLoading = ref(false)

async function loadRemoteModels() {
  if (!provider.value) return
  remoteLoading.value = true
  testInfo.value = ''
  try {
    const result = await settings.remoteModels(provider.value.id, form.apiKey || undefined)
    const existing = new Set(provider.value.models.map((model) => model.name))
    remoteList.value = result.models.filter((name) => !existing.has(name))
    testInfo.value = `拉取到 ${result.models.length} 个模型，${remoteList.value.length} 个尚未添加`
  } catch (error) {
    testInfo.value = `拉取失败：${(error as Error).message}`
  } finally {
    remoteLoading.value = false
  }
}

// 模型编辑 ---------------------------------------------------------------
function resetModelEdits() {
  for (const key of Object.keys(modelEdits)) delete modelEdits[key]
  for (const model of provider.value?.models ?? []) {
    modelEdits[model.id] = {
      name: model.name,
      displayName: model.displayName,
      temperature: model.temperature,
      maxTokens: model.maxTokens
    }
  }
}

async function saveModelRow(id: string) {
  const edit = modelEdits[id]
  if (!edit || !edit.name.trim()) return
  try {
    const updated = await settings.saveModel(id, {
      name: edit.name.trim(),
      displayName: edit.displayName.trim() || edit.name.trim(),
      temperature: Number(edit.temperature),
      maxTokens: Number(edit.maxTokens)
    })
    modelEdits[id] = {
      name: updated.name,
      displayName: updated.displayName,
      temperature: updated.temperature,
      maxTokens: updated.maxTokens
    }
    flash('模型已保存')
  } catch (error) {
    formError.value = (error as Error).message
  }
}

async function setDefaultModel(id: string) {
  try {
    await settings.saveModel(id, { isDefault: true })
    resetModelEdits()
    settings.selectModel(id)
    flash('已设为默认模型')
  } catch (error) {
    formError.value = (error as Error).message
  }
}

async function removeModel(id: string) {
  if (!window.confirm('删除这个模型配置？已使用的历史记录不受影响。')) return
  try {
    await settings.removeModel(id)
    delete modelEdits[id]
  } catch (error) {
    formError.value = (error as Error).message
  }
}

const newModel = reactive({ name: '', displayName: '', temperature: 0.7, maxTokens: 4096 })
const addingModel = ref(false)

async function addModel(name?: string) {
  if (!provider.value) return
  const modelName = (name ?? newModel.name).trim()
  if (!modelName) return
  addingModel.value = true
  try {
    const created = await settings.addModel(provider.value.id, {
      name: modelName,
      displayName: name ? modelName : newModel.displayName.trim() || modelName,
      temperature: Number(newModel.temperature),
      maxTokens: Number(newModel.maxTokens)
    })
    modelEdits[created.id] = {
      name: created.name,
      displayName: created.displayName,
      temperature: created.temperature,
      maxTokens: created.maxTokens
    }
    remoteList.value = remoteList.value.filter((item) => item !== modelName)
    if (!name) {
      newModel.name = ''
      newModel.displayName = ''
    }
    flash(`已添加模型 ${modelName}`)
  } catch (error) {
    formError.value = (error as Error).message
  } finally {
    addingModel.value = false
  }
}

function close() {
  settings.closeSettings()
}
</script>

<template>
  <Teleport to="body">
    <div v-if="settings.settingsOpen" class="modal-overlay" @click.self="close">
      <div class="modal settings-modal">
        <header class="modal-head">
          <div>
            <div class="modal-title">模型与服务商</div>
            <div class="modal-sub">所有配置保存在本地 SQLite，API Key 不会离开这台机器</div>
          </div>
          <button class="btn btn-icon btn-ghost" title="关闭" @click="close">✕</button>
        </header>

        <div class="settings-body">
          <aside class="provider-list">
            <div class="list-head">服务商</div>
            <div class="providers scroll-y">
              <button
                v-for="item in settings.providers"
                :key="item.id"
                class="provider-item"
                :class="{ active: item.id === selectedId }"
                @click="selectedId = item.id"
              >
                <span class="provider-name">{{ item.name }}</span>
                <span class="provider-meta">{{ item.models.length }} 个模型</span>
              </button>
              <div v-if="!settings.providers.length" class="empty-state">还没有服务商，先在下面新增一个。</div>
            </div>

            <div class="new-provider">
              <div class="list-head">新增服务商</div>
              <select
                class="select"
                :value="presetIndex"
                @change="applyPreset(Number(($event.target as HTMLSelectElement).value))"
              >
                <option v-for="(preset, index) in PROVIDER_PRESETS" :key="preset.name" :value="index">
                  {{ preset.name }}
                </option>
              </select>
              <p class="hint preset-hint">{{ PROVIDER_PRESETS[presetIndex].hint }}</p>
              <input v-model="newProvider.name" class="input" placeholder="服务商名称" />
              <input v-model="newProvider.baseUrl" class="input" placeholder="Base URL，例如 https://api.deepseek.com/v1" />
              <button class="btn" :disabled="creating" @click="createProvider">
                {{ creating ? '创建中…' : '＋ 创建服务商' }}
              </button>
            </div>
          </aside>

          <section class="provider-detail">
            <div v-if="!provider" class="empty-state detail-empty">
              从左侧选择一个服务商，或先在左下方新增。<br />
              需要填写 Base URL、API Key，再添加要用的模型名称。
            </div>

            <template v-else>
              <div class="detail-head">
                <div>
                  <div class="detail-title">{{ provider.name }}</div>
                  <div class="detail-sub">OpenAI 兼容接口 · 支持流式输出</div>
                </div>
                <button class="btn btn-danger btn-sm" @click="removeProvider">删除服务商</button>
              </div>

              <div class="form-grid">
                <label class="field">
                  <span class="label">名称</span>
                  <input v-model="form.name" class="input" placeholder="DeepSeek" />
                </label>
                <label class="field">
                  <span class="label">Base URL</span>
                  <input v-model="form.baseUrl" class="input" placeholder="https://api.deepseek.com/v1" />
                </label>
                <label class="field span-2">
                  <span class="label">API Key</span>
                  <div class="key-row">
                    <input
                      v-model="form.apiKey"
                      class="input"
                      :type="showKey ? 'text' : 'password'"
                      placeholder="sk-…（本地模型可留空）"
                      autocomplete="off"
                    />
                    <button class="btn btn-sm" @click="showKey = !showKey">{{ showKey ? '隐藏' : '显示' }}</button>
                  </div>
                </label>
                <label class="field span-2">
                  <span class="label">额外请求头（JSON，可留空）</span>
                  <textarea
                    v-model="form.extraHeaders"
                    class="textarea"
                    rows="2"
                    placeholder='{"HTTP-Referer": "https://example.com"}'
                  />
                </label>
              </div>

              <div class="form-actions">
                <button class="btn btn-primary" :disabled="savingProvider" @click="saveProviderForm">
                  {{ savingProvider ? '保存中…' : '保存服务商' }}
                </button>
                <button class="btn" :disabled="testing" @click="testConnection">
                  {{ testing ? '测试中…' : '测试连接' }}
                </button>
                <button class="btn" :disabled="remoteLoading" @click="loadRemoteModels">
                  {{ remoteLoading ? '拉取中…' : '拉取模型列表' }}
                </button>
                <span v-if="testInfo" class="test-info">{{ testInfo }}</span>
              </div>

              <hr class="divider" />

              <div class="models-head">
                <div>
                  <div class="detail-title">模型</div>
                  <div class="detail-sub">对话与改写时可随时在顶栏切换模型</div>
                </div>
              </div>

              <div v-if="remoteList.length" class="remote-box">
                <div class="remote-title">远端可用模型（点击添加）</div>
                <div class="remote-tags">
                  <button
                    v-for="name in remoteList"
                    :key="name"
                    class="remote-tag"
                    :disabled="addingModel"
                    @click="addModel(name)"
                  >
                    ＋ {{ name }}
                  </button>
                </div>
              </div>

              <div class="model-list">
                <div v-if="!provider.models.length" class="empty-state">还没有模型，请在下方添加模型名称。</div>
                <article v-for="model in provider.models" :key="model.id" class="model-row">
                  <div class="model-main">
                    <div class="model-line">
                      <input
                        v-if="modelEdits[model.id]"
                        v-model="modelEdits[model.id].name"
                        class="input model-name"
                        @blur="saveModelRow(model.id)"
                      />
                      <span v-if="model.isDefault" class="badge badge-accent">默认</span>
                    </div>
                    <div class="model-line">
                      <input
                        v-if="modelEdits[model.id]"
                        v-model="modelEdits[model.id].displayName"
                        class="input model-display"
                        placeholder="显示名称"
                        @blur="saveModelRow(model.id)"
                      />
                    </div>
                  </div>
                  <div class="model-params">
                    <label class="param">
                      <span class="label">温度</span>
                      <input
                        v-if="modelEdits[model.id]"
                        v-model.number="modelEdits[model.id].temperature"
                        class="input"
                        type="number"
                        min="0"
                        max="2"
                        step="0.1"
                        @blur="saveModelRow(model.id)"
                      />
                    </label>
                    <label class="param">
                      <span class="label">最大 tokens</span>
                      <input
                        v-if="modelEdits[model.id]"
                        v-model.number="modelEdits[model.id].maxTokens"
                        class="input"
                        type="number"
                        min="128"
                        step="128"
                        @blur="saveModelRow(model.id)"
                      />
                    </label>
                  </div>
                  <div class="model-actions">
                    <button class="btn btn-sm" :disabled="model.isDefault" @click="setDefaultModel(model.id)">设为默认</button>
                    <button class="btn btn-sm btn-danger" @click="removeModel(model.id)">删除</button>
                  </div>
                </article>
              </div>

              <div class="add-model">
                <input v-model="newModel.name" class="input" placeholder="模型名称，如 deepseek-chat" />
                <input v-model="newModel.displayName" class="input" placeholder="显示名称（可留空）" />
                <label class="param">
                  <span class="label">温度</span>
                  <input v-model.number="newModel.temperature" class="input" type="number" min="0" max="2" step="0.1" />
                </label>
                <label class="param">
                  <span class="label">最大 tokens</span>
                  <input v-model.number="newModel.maxTokens" class="input" type="number" min="128" step="128" />
                </label>
                <button class="btn btn-primary" :disabled="addingModel || !newModel.name.trim()" @click="addModel()">
                  ＋ 添加
                </button>
              </div>

              <div v-if="formError" class="form-error">{{ formError }}</div>
              <div v-else-if="flashMessage" class="form-ok">{{ flashMessage }}</div>
            </template>
          </section>
        </div>

        <footer class="modal-foot">
          <span class="hint">提示：添加模型后，可在顶栏下拉框中切换当前使用的模型。</span>
          <button class="btn" @click="close">关闭</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.settings-modal {
  max-width: 900px;
}
.modal-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: var(--muted);
}

.settings-body {
  display: grid;
  grid-template-columns: 232px minmax(0, 1fr);
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.provider-list {
  display: flex;
  flex-direction: column;
  min-height: 0;
  border-right: 1px solid var(--border);
  background: var(--surface-2);
}
.list-head {
  padding: 10px 14px 6px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--muted);
  letter-spacing: 0.06em;
}
.providers {
  flex: 1;
  min-height: 80px;
  padding: 0 8px;
}
.provider-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 10px;
  margin-bottom: 4px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.provider-item:hover {
  background: var(--surface-3);
}
.provider-item.active {
  border-color: var(--accent);
  background: var(--accent-soft);
}
.provider-name {
  font-size: 13px;
  color: var(--ink);
}
.provider-item.active .provider-name {
  color: var(--accent);
}
.provider-meta {
  font-size: 11px;
  color: var(--muted);
}

.new-provider {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px 12px;
  border-top: 1px solid var(--border);
}
.new-provider .select,
.new-provider .input {
  height: 30px;
  font-size: 12px;
}
.preset-hint {
  margin: -2px 0 2px;
  font-size: 11px;
}

.provider-detail {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 16px 18px 18px;
  overflow-y: auto;
}
.detail-empty {
  margin: auto;
}
.detail-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.detail-title {
  font-size: 14px;
  font-weight: 600;
}
.detail-sub {
  margin-top: 3px;
  font-size: 11.5px;
  color: var(--muted);
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 12px;
}
.field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.span-2 {
  grid-column: span 2;
}
.key-row {
  display: flex;
  gap: 6px;
}
.key-row .input {
  flex: 1;
}
.form-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.test-info {
  font-size: 12px;
  color: var(--accent-2);
  line-height: 1.5;
}

.models-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.remote-box {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
  background: var(--surface-2);
}
.remote-title {
  margin-bottom: 8px;
  font-size: 11.5px;
  color: var(--muted);
}
.remote-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 132px;
  overflow-y: auto;
}
.remote-tag {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font-size: 11.5px;
  color: var(--ink-soft);
}
.remote-tag:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.model-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.model-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
}
.model-main {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.model-line {
  display: flex;
  align-items: center;
  gap: 6px;
}
.model-name {
  height: 28px;
  font-size: 12.5px;
  padding: 0 8px;
}
.model-display {
  height: 26px;
  font-size: 11.5px;
  padding: 0 8px;
}
.model-params {
  display: flex;
  gap: 8px;
}
.param {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}
.param .label {
  margin: 0;
  font-size: 10.5px;
}
.param .input {
  height: 28px;
  padding: 0 6px;
  font-size: 12px;
}
.model-actions {
  display: flex;
  gap: 4px;
}

.add-model {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) 76px 96px auto;
  align-items: end;
  gap: 8px;
  margin-top: 12px;
  padding: 12px;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
}
.add-model .input {
  height: 30px;
  font-size: 12px;
}
.add-model .param .label {
  margin-bottom: 4px;
}

.form-error,
.form-ok {
  margin-top: 12px;
  font-size: 12px;
  line-height: 1.5;
}
.form-error {
  color: var(--danger);
}
.form-ok {
  color: var(--success);
}

@media (max-width: 860px) {
  .settings-body {
    grid-template-columns: 1fr;
  }
  .provider-list {
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 220px;
  }
  .form-grid,
  .add-model,
  .model-row {
    grid-template-columns: 1fr;
  }
  .span-2 {
    grid-column: span 1;
  }
}
</style>
