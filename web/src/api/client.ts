import type {
  AttributeBundle,
  AttributeLog,
  AttributeLogInput,
  AttributeValue,
  Block,
  CardField,
  CardTemplate,
  ChapterDetail,
  ChapterMeta,
  ChapterSearchResult,
  Character,
  CharacterBasic,
  CharacterField,
  CharacterStage,
  CharacterStageField,
  ChatMessage,
  Item,
  ItemBasic,
  ItemEventInput,
  ItemField,
  Model,
  Note,
  NoteScope,
  OutlineItem,
  OverviewData,
  Project,
  Provider,
  Revision,
  TemplateKind,
  UsageLog,
  UsageStats,
  UsageStatsResult,
  VersionDetail,
  VersionInfo,
  VersionTargetType
} from './types'

const BASE = '/api'

// 访问令牌：公网部署时通过 ?token=xxx 传入一次，存会话期间复用。
// 本地使用没有令牌，headers 保持原样，行为不变。
const TOKEN_KEY = 'novel_access_token'
function initToken(): void {
  try {
    const urlToken = new URLSearchParams(location.search).get('token')
    if (urlToken) sessionStorage.setItem(TOKEN_KEY, urlToken)
  } catch { /* localStorage 不可用时忽略 */ }
}
initToken()
function authHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    return token ? { Authorization: `Bearer ${token}` } : {}
  } catch { return {} }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...(init.headers ?? {})
    }
  })
  if (!response.ok) {
    let message = response.statusText || `请求失败（${response.status}）`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      /* 忽略非 JSON 错误体 */
    }
    throw new Error(message)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

const q = (value: string) => encodeURIComponent(value)

export interface CreateBlockResult {
  blocks: Block[]
  chapter: ChapterMeta
}

export interface ApplyRevisionPayload {
  target: 'block' | 'chapter-summary' | 'outline' | 'append'
  chapterId?: string
  blockId?: string
  outlineId?: string
  texts?: string[]
  instruction?: string
  revisedText?: string
  modelName?: string
}

export interface ApplyRevisionResult {
  revision: Revision
  block?: Block
  chapter?: ChapterMeta
  outline?: OutlineItem
  blocks?: Block[]
}

export interface RestoreResult {
  targetType: VersionTargetType
  chapter?: ChapterDetail
  outline?: OutlineItem
  character?: Character
}

export interface StreamPayload {
  modelId: string
  messages: Array<{ role: string; content: string }>
  temperature?: number
  maxTokens?: number
  projectId?: string
  scene?: 'chat' | 'refine' | 'append' | 'summary' | 'outline' | 'other'
}

export async function streamChat(
  payload: StreamPayload,
  handlers: {
    onDelta: (delta: string) => void
    onReasoning?: (delta: string) => void
    onUsage?: (usage: UsageStats) => void
    onDone?: () => void
  },
  signal?: AbortSignal
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify(payload),
      signal
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new Error(`无法连接本地服务：${(error as Error).message}`)
  }

  if (!response.ok) {
    let message = response.statusText || `请求失败（${response.status}）`
    try {
      const data = await response.json()
      if (data?.error) message = data.error
    } catch {
      /* 忽略 */
    }
    throw new Error(message)
  }
  if (!response.body) throw new Error('当前浏览器不支持读取流式响应')

  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buffer = ''

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split(/\r?\n\r?\n/)
      buffer = events.pop() ?? ''
      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue
          const raw = line.slice(5).trim()
          if (!raw) continue
          let data: { delta?: string; reasoning?: string; error?: string; done?: boolean; usage?: UsageStats }
          try {
            data = JSON.parse(raw)
          } catch {
            continue
          }
          if (data.error) throw new Error(data.error)
          if (typeof data.reasoning === 'string' && data.reasoning) handlers.onReasoning?.(data.reasoning)
          if (typeof data.delta === 'string' && data.delta) handlers.onDelta(data.delta)
          // 只接受归一化后的结构；旧版后端转发的是原始 usage（prompt_tokens），直接忽略
          if (data.usage && typeof data.usage.promptTokens === 'number') handlers.onUsage?.(data.usage)
        }
      }
    }
  } finally {
    try {
      reader.releaseLock()
    } catch {
      /* 忽略 */
    }
  }
  handlers.onDone?.()
}

export const api = {
  // ---------- 作品 ----------
  listProjects: () => request<Project[]>('/projects'),
  createProject: (name: string, description = '') =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify({ name, description }) }),
  updateProject: (id: string, patch: Partial<Pick<Project, 'name' | 'description' | 'styleGuide'>>) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => request<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // ---------- 大纲 ----------
  listOutlines: (projectId: string) => request<OutlineItem[]>(`/outlines?projectId=${q(projectId)}`),
  createOutline: (payload: { projectId: string; parentId?: string | null; title?: string; content?: string }) =>
    request<OutlineItem>('/outlines', { method: 'POST', body: JSON.stringify(payload) }),
  updateOutline: (id: string, patch: { title?: string; content?: string; parentId?: string | null; sortOrder?: number }) =>
    request<OutlineItem>(`/outlines/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteOutline: (id: string) => request<{ ok: boolean }>(`/outlines/${id}`, { method: 'DELETE' }),
  reorderOutlines: (projectId: string, ids: string[]) =>
    request<OutlineItem[]>('/outlines/reorder', { method: 'POST', body: JSON.stringify({ projectId, ids }) }),

  // ---------- 章节 ----------
  listChapters: (projectId: string) => request<ChapterMeta[]>(`/chapters?projectId=${q(projectId)}`),
  searchChapters: (projectId: string, keyword: string) =>
    request<{ query: string; results: ChapterSearchResult[] }>(
      `/chapters/search?projectId=${q(projectId)}&q=${q(keyword)}`
    ),
  getChapter: (id: string) => request<ChapterDetail>(`/chapters/${id}`),
  createChapter: (payload: { projectId: string; title?: string; summary?: string; afterChapterId?: string }) =>
    request<ChapterMeta>('/chapters', { method: 'POST', body: JSON.stringify(payload) }),
  updateChapter: (id: string, patch: { title?: string; summary?: string; status?: string }) =>
    request<ChapterMeta>(`/chapters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteChapter: (id: string) => request<{ ok: boolean }>(`/chapters/${id}`, { method: 'DELETE' }),
  reorderChapters: (projectId: string, ids: string[]) =>
    request<ChapterMeta[]>('/chapters/reorder', { method: 'POST', body: JSON.stringify({ projectId, ids }) }),

  // ---------- 段落 ----------
  createBlocks: (chapterId: string, payload: { text?: string; texts?: string[]; afterBlockId?: string; instruction?: string }) =>
    request<CreateBlockResult>(`/chapters/${chapterId}/blocks`, { method: 'POST', body: JSON.stringify(payload) }),
  updateBlock: (blockId: string, patch: { text?: string; instruction?: string }) =>
    request<Block>(`/blocks/${blockId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBlock: (blockId: string) => request<{ ok: boolean }>(`/blocks/${blockId}`, { method: 'DELETE' }),
  reorderBlocks: (chapterId: string, ids: string[]) =>
    request<{ blocks: Block[] }>(`/chapters/${chapterId}/blocks/order`, { method: 'PUT', body: JSON.stringify({ ids }) }),

  // ---------- 角色 ----------
  listCharacters: (projectId: string) => request<Character[]>(`/characters?projectId=${q(projectId)}`),
  getCharacter: (id: string) => request<Character>(`/characters/${id}`),
  createCharacter: (payload: {
    projectId: string
    name?: string
    role?: string
    gender?: string
    age?: string
    debut?: string
    debutChapterId?: string | null
  }) => request<Character>('/characters', { method: 'POST', body: JSON.stringify(payload) }),
  updateCharacter: (id: string, patch: Partial<Record<CharacterField, string | null>>) =>
    request<CharacterBasic>(`/characters/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCharacter: (id: string) => request<{ ok: boolean }>(`/characters/${id}`, { method: 'DELETE' }),
  createCharacterStage: (
    characterId: string,
    payload: { name?: string; period?: string; chapterId?: string | null; isCurrent?: boolean }
  ) => request<Character>(`/characters/${characterId}/stages`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCharacterStage: (
    stageId: string,
    patch: Partial<Record<CharacterStageField, string | null>> & { isCurrent?: boolean; sortOrder?: number }
  ) => request<CharacterStage>(`/character-stages/${stageId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCharacterStage: (stageId: string) =>
    request<Character>(`/character-stages/${stageId}`, { method: 'DELETE' }),
  setCurrentCharacterStage: (characterId: string, stageId: string) =>
    request<Character>(`/characters/${characterId}/current-stage`, {
      method: 'POST',
      body: JSON.stringify({ stageId })
    }),
  createCharacterSkill: (
    characterId: string,
    payload: { name?: string; level?: string; description?: string; chapterId?: string | null }
  ) => request<Character>(`/characters/${characterId}/skills`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCharacterSkill: (
    skillId: string,
    patch: Partial<Record<'name' | 'level' | 'description' | 'chapterId', string | null>> & {
      sortOrder?: number
    }
  ) => request<Character>(`/character-skills/${skillId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCharacterSkill: (skillId: string) =>
    request<Character>(`/character-skills/${skillId}`, { method: 'DELETE' }),
  addCharacterStatusLog: (
    characterId: string,
    payload: { status?: string; period?: string; chapterId?: string | null; note?: string }
  ) =>
    request<Character>(`/characters/${characterId}/status-logs`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  deleteCharacterStatusLog: (logId: string) =>
    request<Character>(`/character-status-logs/${logId}`, { method: 'DELETE' }),
  addCharacterRelation: (
    characterId: string,
    payload: { otherId: string; relation?: string; period?: string; chapterId?: string | null; note?: string }
  ) =>
    request<Character>(`/characters/${characterId}/relations`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // ---------- 物品 / 装备 ----------
  listItems: (projectId: string) => request<ItemBasic[]>(`/items?projectId=${q(projectId)}`),
  getItem: (id: string) => request<Item>(`/items/${id}`),
  createItem: (payload: { projectId: string; name?: string; category?: string; currentHolder?: string }) =>
    request<Item>('/items', { method: 'POST', body: JSON.stringify(payload) }),
  updateItem: (id: string, patch: Partial<Record<ItemField, string>>) =>
    request<ItemBasic>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteItem: (id: string) => request<{ ok: boolean }>(`/items/${id}`, { method: 'DELETE' }),
  createItemEvent: (itemId: string, payload: ItemEventInput) =>
    request<Item>(`/items/${itemId}/events`, { method: 'POST', body: JSON.stringify(payload) }),
  updateItemEvent: (eventId: string, payload: ItemEventInput) =>
    request<Item>(`/item-events/${eventId}`, { method: 'PATCH', body: JSON.stringify(payload) }),
  deleteItemEvent: (eventId: string) => request<Item>(`/item-events/${eventId}`, { method: 'DELETE' }),

  // ---------- 记事本（本书记事 / 全局随手记） ----------
  listNotes: (scope: NoteScope, projectId?: string) =>
    request<Note[]>(`/notes?scope=${q(scope)}${projectId ? `&projectId=${q(projectId)}` : ''}`),
  createNote: (payload: { scope: NoteScope; projectId?: string; title?: string }) =>
    request<Note>('/notes', { method: 'POST', body: JSON.stringify(payload) }),
  updateNote: (id: string, patch: { title?: string; content?: string; sortOrder?: number }) =>
    request<Note>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteNote: (id: string) => request<{ ok: boolean }>(`/notes/${id}`, { method: 'DELETE' }),

  // ---------- 人物总览 ----------
  getOverview: (projectId: string) => request<OverviewData>(`/overview?projectId=${q(projectId)}`),

  // ---------- 属性卡模板 ----------
  listCardTemplates: (projectId: string) =>
    request<CardTemplate[]>(`/card-templates?projectId=${q(projectId)}`),
  getCardTemplate: (id: string) => request<CardTemplate>(`/card-templates/${id}`),
  updateCardTemplate: (id: string, patch: { name?: string; description?: string }) =>
    request<CardTemplate>(`/card-templates/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  createCardField: (
    templateId: string,
    payload: { label?: string; fieldType?: string; unit?: string; options?: string }
  ) => request<CardField>(`/card-templates/${templateId}/fields`, { method: 'POST', body: JSON.stringify(payload) }),
  updateCardField: (
    fieldId: string,
    patch: Partial<Pick<CardField, 'label' | 'fieldType' | 'unit' | 'options' | 'sortOrder'>>
  ) => request<CardField>(`/card-fields/${fieldId}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCardField: (fieldId: string) => request<{ ok: boolean }>(`/card-fields/${fieldId}`, { method: 'DELETE' }),
  reorderCardFields: (templateId: string, ids: string[]) =>
    request<CardTemplate>(`/card-templates/${templateId}/fields/reorder`, {
      method: 'POST',
      body: JSON.stringify({ ids })
    }),

  // ---------- 属性值与成长记录 ----------
  getAttributes: (entityType: TemplateKind, entityId: string) =>
    request<AttributeBundle>(`/attributes?entityType=${q(entityType)}&entityId=${q(entityId)}`),
  setAttributeValue: (payload: { entityType: TemplateKind; entityId: string; fieldId: string; value: string }) =>
    request<AttributeValue>('/attributes', { method: 'PUT', body: JSON.stringify(payload) }),
  createAttributeLog: (payload: AttributeLogInput & { entityType: TemplateKind; entityId: string }) =>
    request<{ log: AttributeLog; value: AttributeValue | null }>('/attribute-logs', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateAttributeLog: (id: string, patch: { value?: string; period?: string; chapterId?: string | null; note?: string }) =>
    request<AttributeLog>(`/attribute-logs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteAttributeLog: (id: string) => request<{ ok: boolean }>(`/attribute-logs/${id}`, { method: 'DELETE' }),

  // ---------- 修改记录 ----------
  listRevisions: (chapterId: string) => request<Revision[]>(`/chapters/${chapterId}/revisions`),
  applyRevision: (payload: ApplyRevisionPayload) =>
    request<ApplyRevisionResult>('/revisions/apply', { method: 'POST', body: JSON.stringify(payload) }),
  deleteRevision: (id: string) => request<{ ok: boolean }>(`/revisions/${id}`, { method: 'DELETE' }),

  // ---------- 版本 ----------
  listVersions: (targetType: VersionTargetType, targetId: string) =>
    request<VersionInfo[]>(`/versions?targetType=${q(targetType)}&targetId=${q(targetId)}`),
  createVersion: (payload: { projectId: string; targetType: VersionTargetType; targetId: string; label?: string; source?: string }) =>
    request<VersionInfo>('/versions', { method: 'POST', body: JSON.stringify(payload) }),
  getVersion: (id: string) => request<VersionDetail>(`/versions/${id}`),
  restoreVersion: (id: string) => request<RestoreResult>(`/versions/${id}/restore`, { method: 'POST' }),
  deleteVersion: (id: string) => request<{ ok: boolean }>(`/versions/${id}`, { method: 'DELETE' }),

  // ---------- 模型配置 ----------
  listProviders: () => request<Provider[]>('/providers'),
  createProvider: (payload: { name: string; baseUrl: string; apiKey?: string; apiType?: string; extraHeaders?: string }) =>
    request<Provider>('/providers', { method: 'POST', body: JSON.stringify(payload) }),
  updateProvider: (id: string, patch: { name?: string; baseUrl?: string; apiKey?: string; apiType?: string; extraHeaders?: string }) =>
    request<Provider>(`/providers/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProvider: (id: string) => request<{ ok: boolean }>(`/providers/${id}`, { method: 'DELETE' }),
  testProvider: (id: string, apiKey?: string) =>
    request<{ ok: boolean; count?: number; models?: string[]; error?: string }>(`/providers/${id}/test`, {
      method: 'POST',
      body: JSON.stringify({ apiKey })
    }),
  fetchRemoteModels: (id: string, apiKey?: string) =>
    request<{ models: string[] }>(`/providers/${id}/remote-models`, { method: 'POST', body: JSON.stringify({ apiKey }) }),
  createModel: (payload: { providerId: string; name: string; displayName?: string; temperature?: number; maxTokens?: number; contextLength?: number; extraBody?: string; isDefault?: boolean }) =>
    request<Model>('/models', { method: 'POST', body: JSON.stringify(payload) }),
  updateModel: (id: string, patch: { name?: string; displayName?: string; temperature?: number; maxTokens?: number; contextLength?: number; extraBody?: string; isDefault?: boolean }) =>
    request<Model>(`/models/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteModel: (id: string) => request<{ ok: boolean }>(`/models/${id}`, { method: 'DELETE' }),

  // ---------- 对话记录 ----------
  listChatMessages: (projectId: string) => request<ChatMessage[]>(`/chat/messages?projectId=${q(projectId)}`),
  saveChatMessage: (payload: { projectId: string; role: string; content: string; modelName?: string | null; usage?: UsageStats | null }) =>
    request<ChatMessage>('/chat/messages', { method: 'POST', body: JSON.stringify(payload) }),
  clearChatMessages: (projectId: string) =>
    request<{ ok: boolean }>(`/chat/messages?projectId=${q(projectId)}`, { method: 'DELETE' }),

  // ---------- 用量统计 ----------
  usageStats: (days = 30, projectId = '') =>
    request<UsageStatsResult>(`/usage/stats?days=${days}${projectId ? `&projectId=${q(projectId)}` : ''}`),
  usageLogs: (limit = 50, projectId = '') =>
    request<UsageLog[]>(`/usage/logs?limit=${limit}${projectId ? `&projectId=${q(projectId)}` : ''}`),
  clearUsageLogs: (projectId = '') =>
    request<{ ok: boolean; deleted: number }>(`/usage/logs${projectId ? `?projectId=${q(projectId)}` : ''}`, {
      method: 'DELETE'
    })
}
