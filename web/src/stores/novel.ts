import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { api } from '../api/client'
import type {
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
  EditorMode,
  Item,
  ItemBasic,
  ItemEventInput,
  ItemField,
  Note,
  NoteScope,
  OutlineItem,
  OverviewData,
  Project,
  RefineTarget,
  Revision,
  SaveState,
  SelectionInfo,
  TemplateKind,
  VersionDetail,
  VersionInfo,
  VersionTargetType
} from '../api/types'
import { countChars } from '../utils/format'

const PROJECT_KEY = 'moji:project'

export interface OutlineNode {
  item: OutlineItem
  depth: number
}

export interface VersionTargetInfo {
  type: VersionTargetType
  id: string
  title: string
}

export type DocTabType = 'welcome' | 'overview' | 'outline' | 'character' | 'item' | 'template' | 'note' | 'chapter'

export interface DocTab {
  key: string
  type: DocTabType
  targetId: string
  /** 章节页签记录最近一次打开的是章节大纲还是正文 */
  variant?: 'chapterOutline' | 'chapter'
}

type ChapterPatch = Partial<Pick<ChapterMeta, 'title' | 'summary' | 'status'>>

export const useNovelStore = defineStore('novel', () => {
  const projects = ref<Project[]>([])
  const projectId = ref('')
  const outlines = ref<OutlineItem[]>([])
  const chapters = ref<ChapterMeta[]>([])
  const characters = ref<Character[]>([])
  const items = ref<ItemBasic[]>([])
  const templates = ref<CardTemplate[]>([])
  // 记事本：本书记事随作品切换，全局随手记跨作品保留。
  const projectNotes = ref<Note[]>([])
  const globalNotes = ref<Note[]>([])

  const mode = ref<EditorMode>('welcome')
  const openTabs = ref<DocTab[]>([{ key: 'welcome', type: 'welcome', targetId: '' }])
  const activeTabKey = ref('welcome')
  const activeOutlineId = ref('')
  const activeChapterId = ref('')
  const activeCharacterId = ref('')
  const activeItemId = ref('')
  const activeNoteId = ref('')
  const noteScope = ref<NoteScope>('project')
  const templateKind = ref<TemplateKind>('character')
  const chapter = ref<ChapterDetail | null>(null)
  const chapterLoading = ref(false)
  const item = ref<Item | null>(null)
  const itemLoading = ref(false)

  // 人物总览（章节 × 人物矩阵）
  const overview = ref<OverviewData | null>(null)
  const overviewLoading = ref(false)

  // 当前对象（角色 / 物品）的属性值与成长记录
  const attributeValues = ref<AttributeValue[]>([])
  const attributeLogs = ref<AttributeLog[]>([])
  const attributeEntity = ref<{ type: TemplateKind; id: string } | null>(null)
  const attributesLoading = ref(false)

  const revisions = ref<Revision[]>([])
  const versions = ref<VersionInfo[]>([])
  const versionsTarget = ref<VersionTargetInfo | null>(null)
  const versionsOpen = ref(false)
  const revisionsOpen = ref(false)
  const exportOpen = ref(false)

  const saveState = ref<SaveState>('saved')
  const showInstructions = ref(true)
  const refineTarget = ref<RefineTarget | null>(null)
  const selection = ref<SelectionInfo | null>(null)
  const loading = ref(false)
  const errorMessage = ref('')

  // 章节搜索（标题 / 章节大纲 / 正文）
  const chapterSearchQuery = ref('')
  const chapterSearchResults = ref<ChapterSearchResult[]>([])
  const chapterSearching = ref(false)
  const chapterSearchActive = computed(() => chapterSearchQuery.value.trim().length > 0)
  let searchTimer: number | null = null

  // 从搜索结果打开正文时，定位到命中的段落
  const focusBlockId = ref<string | null>(null)

  const project = computed(() => projects.value.find((item) => item.id === projectId.value) ?? null)
  const activeOutline = computed(() => outlines.value.find((item) => item.id === activeOutlineId.value) ?? null)
  const activeCharacter = computed(
    () => characters.value.find((item) => item.id === activeCharacterId.value) ?? null
  )
  const activeItem = computed(() => item.value)
  const activeNote = computed(
    () =>
      projectNotes.value.find((entry) => entry.id === activeNoteId.value) ??
      globalNotes.value.find((entry) => entry.id === activeNoteId.value) ??
      null
  )
  const notesForCurrentScope = computed(() =>
    noteScope.value === 'project' ? projectNotes.value : globalNotes.value
  )
  const characterTemplate = computed(() => templates.value.find((entry) => entry.kind === 'character') ?? null)
  const itemTemplate = computed(() => templates.value.find((entry) => entry.kind === 'item') ?? null)
  const activeTemplate = computed(() =>
    templates.value.find((entry) => entry.kind === templateKind.value) ?? null
  )
  const activeChapterMeta = computed(() => chapters.value.find((item) => item.id === activeChapterId.value) ?? null)

  const chapterWordCount = computed(() =>
    chapter.value ? chapter.value.blocks.reduce((sum, block) => sum + countChars(block.text), 0) : 0
  )

  const totalWordCount = computed(() => chapters.value.reduce((sum, item) => sum + (item.wordCount ?? 0), 0))

  const outlineNodes = computed<OutlineNode[]>(() => {
    const sorted = [...outlines.value].sort((a, b) => a.sortOrder - b.sortOrder)
    const ids = new Set(sorted.map((item) => item.id))
    const children = new Map<string, OutlineItem[]>()
    const roots: OutlineItem[] = []
    for (const item of sorted) {
      if (item.parentId && ids.has(item.parentId)) {
        const list = children.get(item.parentId)
        if (list) list.push(item)
        else children.set(item.parentId, [item])
      } else {
        roots.push(item)
      }
    }
    const result: OutlineNode[] = []
    const walk = (items: OutlineItem[], depth: number) => {
      for (const item of items) {
        result.push({ item, depth })
        walk(children.get(item.id) ?? [], depth + 1)
      }
    }
    walk(roots, 0)
    return result
  })

  const outlineText = computed(() =>
    outlineNodes.value
      .map(({ item, depth }) => {
        const prefix = depth > 0 ? `${'  '.repeat(depth)}- ` : ''
        return `${prefix}${item.title}\n${item.content}`
      })
      .join('\n\n')
  )

  const charactersText = computed(() =>
    characters.value
      .map((character) => {
        const lines: string[] = []
        const head = `【${character.name || '未命名角色'}】${character.role ? `（${character.role}）` : ''}`
        lines.push(character.alias ? `${head} 别名：${character.alias}` : head)
        if (character.age) lines.push(`年龄：${character.age}`)
        if (character.background) lines.push(`背景：${character.background}`)
        if (character.relations) lines.push(`关系：${character.relations}`)
        if (character.goal) lines.push(`目标：${character.goal}`)
        const timeline = character.stages
          .map((stage) => `${stage.name}${stage.period ? `（${stage.period}）` : ''}`)
          .join(' → ')
        if (timeline) lines.push(`性格成长线：${timeline}`)
        const current = character.stages.find((stage) => stage.isCurrent) ?? character.stages[0]
        if (current) {
          lines.push(`当前阶段：${current.name}${current.period ? `（${current.period}）` : ''}`)
          if (current.traits) lines.push(`性格：${current.traits}`)
          if (current.inner) lines.push(`内心动机：${current.inner}`)
          if (current.behavior) lines.push(`行为表现：${current.behavior}`)
          if (current.speech) lines.push(`语言习惯：${current.speech}`)
        }
        return lines.join('\n')
      })
      .join('\n\n')
  )

  let errorTimer: number | null = null
  function setError(message: string) {
    errorMessage.value = message
    if (errorTimer) window.clearTimeout(errorTimer)
    errorTimer = window.setTimeout(() => {
      errorMessage.value = ''
    }, 5000)
  }

  function messageOf(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  // ---------------------------------------------------------------------------
  // 定时保存
  // ---------------------------------------------------------------------------
  const blockTimers = new Map<string, number>()
  const blockPending = new Map<string, string>()
  const outlineTimers = new Map<string, number>()
  const outlinePending = new Map<string, { title?: string; content?: string }>()
  let chapterTimer: number | null = null
  let chapterPending: ChapterPatch = {}
  const characterTimers = new Map<string, number>()
  const characterPending = new Map<string, Partial<Record<CharacterField, string | null>>>()
  const stageTimers = new Map<string, number>()
  const stagePending = new Map<string, Partial<Record<CharacterStageField, string | null>>>()
  const skillTimers = new Map<string, number>()
  const skillPending = new Map<string, Partial<Record<'name' | 'level' | 'description' | 'chapterId', string | null>>>()
  const itemTimers = new Map<string, number>()
  const itemPending = new Map<string, Partial<Record<ItemField, string>>>()
  const templateTimers = new Map<string, number>()
  const templatePending = new Map<string, { name?: string; description?: string }>()
  const fieldTimers = new Map<string, number>()
  const fieldPending = new Map<string, Partial<Pick<CardField, 'label' | 'fieldType' | 'unit' | 'options'>>>()
  const attributeTimers = new Map<string, number>()
  const attributePending = new Map<
    string,
    { entityType: TemplateKind; entityId: string; fieldId: string; value: string }
  >()
  const noteTimers = new Map<string, number>()
  const notePending = new Map<string, { title?: string; content?: string }>()

  function refreshWordCount(meta: ChapterDetail) {
    const count = meta.blocks.reduce((sum, block) => sum + countChars(block.text), 0)
    const stored = chapters.value.find((item) => item.id === meta.id)
    if (stored) stored.wordCount = count
    meta.wordCount = count
  }

  function syncChapterList(meta: Partial<ChapterMeta> & { id: string }) {
    const stored = chapters.value.find((item) => item.id === meta.id)
    if (!stored) return
    if (meta.title !== undefined) stored.title = meta.title
    if (meta.summary !== undefined) stored.summary = meta.summary
    if (meta.status !== undefined) stored.status = meta.status
    if (meta.wordCount !== undefined) stored.wordCount = meta.wordCount
    if (meta.updatedAt !== undefined) stored.updatedAt = meta.updatedAt
  }

  async function flushBlock(blockId: string) {
    const timer = blockTimers.get(blockId)
    if (timer) {
      window.clearTimeout(timer)
      blockTimers.delete(blockId)
    }
    const text = blockPending.get(blockId)
    if (text === undefined) return
    blockPending.delete(blockId)
    try {
      await api.updateBlock(blockId, { text })
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`段落保存失败：${messageOf(error)}`)
    }
  }

  async function flushOutline(outlineId: string) {
    const timer = outlineTimers.get(outlineId)
    if (timer) {
      window.clearTimeout(timer)
      outlineTimers.delete(outlineId)
    }
    const patch = outlinePending.get(outlineId)
    if (!patch) return
    outlinePending.delete(outlineId)
    try {
      const updated = await api.updateOutline(outlineId, patch)
      const index = outlines.value.findIndex((item) => item.id === outlineId)
      if (index >= 0) outlines.value[index] = updated
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`大纲保存失败：${messageOf(error)}`)
    }
  }

  async function flushChapterMeta() {
    if (chapterTimer) {
      window.clearTimeout(chapterTimer)
      chapterTimer = null
    }
    const current = chapter.value
    const patch = chapterPending
    chapterPending = {}
    if (!current || !Object.keys(patch).length) return
    try {
      const updated = await api.updateChapter(current.id, patch)
      syncChapterList(updated)
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`章节信息保存失败：${messageOf(error)}`)
    }
  }

  async function flushCharacter(characterId: string) {
    const timer = characterTimers.get(characterId)
    if (timer) {
      window.clearTimeout(timer)
      characterTimers.delete(characterId)
    }
    const patch = characterPending.get(characterId)
    if (!patch) return
    characterPending.delete(characterId)
    try {
      const updated = await api.updateCharacter(characterId, patch)
      const stored = characters.value.find((item) => item.id === characterId)
      if (stored) Object.assign(stored, updated)
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`角色保存失败：${messageOf(error)}`)
    }
  }

  async function flushStage(stageId: string) {
    const timer = stageTimers.get(stageId)
    if (timer) {
      window.clearTimeout(timer)
      stageTimers.delete(stageId)
    }
    const patch = stagePending.get(stageId)
    if (!patch) return
    stagePending.delete(stageId)
    try {
      const updated = await api.updateCharacterStage(stageId, patch)
      for (const character of characters.value) {
        const stage = character.stages.find((item) => item.id === stageId)
        if (stage) {
          Object.assign(stage, updated)
          break
        }
      }
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`角色阶段保存失败：${messageOf(error)}`)
    }
  }

  async function flushSkill(skillId: string) {
    const timer = skillTimers.get(skillId)
    if (timer) {
      window.clearTimeout(timer)
      skillTimers.delete(skillId)
    }
    const patch = skillPending.get(skillId)
    if (!patch) return
    skillPending.delete(skillId)
    try {
      const updated = await api.updateCharacterSkill(skillId, patch)
      syncCharacter(updated)
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`技能保存失败：${messageOf(error)}`)
    }
  }

  async function flushItem(itemId: string) {
    const timer = itemTimers.get(itemId)
    if (timer) {
      window.clearTimeout(timer)
      itemTimers.delete(itemId)
    }
    const patch = itemPending.get(itemId)
    if (!patch) return
    itemPending.delete(itemId)
    try {
      const updated = await api.updateItem(itemId, patch)
      const stored = items.value.find((entry) => entry.id === itemId)
      if (stored) Object.assign(stored, updated)
      if (item.value?.id === itemId) Object.assign(item.value, updated)
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`物品保存失败：${messageOf(error)}`)
    }
  }

  async function flushTemplate(templateId: string) {
    const timer = templateTimers.get(templateId)
    if (timer) {
      window.clearTimeout(timer)
      templateTimers.delete(templateId)
    }
    const patch = templatePending.get(templateId)
    if (!patch) return
    templatePending.delete(templateId)
    try {
      const updated = await api.updateCardTemplate(templateId, patch)
      const stored = templates.value.find((entry) => entry.id === templateId)
      if (stored) {
        stored.name = updated.name
        stored.description = updated.description
        stored.updatedAt = updated.updatedAt
      }
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`属性卡模板保存失败：${messageOf(error)}`)
    }
  }

  async function flushField(fieldId: string) {
    const timer = fieldTimers.get(fieldId)
    if (timer) {
      window.clearTimeout(timer)
      fieldTimers.delete(fieldId)
    }
    const patch = fieldPending.get(fieldId)
    if (!patch) return
    fieldPending.delete(fieldId)
    try {
      const updated = await api.updateCardField(fieldId, patch)
      for (const template of templates.value) {
        const index = template.fields.findIndex((field) => field.id === fieldId)
        if (index >= 0) {
          template.fields[index] = updated
          break
        }
      }
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`属性保存失败：${messageOf(error)}`)
    }
  }

  async function flushAttribute(key: string) {
    const timer = attributeTimers.get(key)
    if (timer) {
      window.clearTimeout(timer)
      attributeTimers.delete(key)
    }
    const pending = attributePending.get(key)
    if (!pending) return
    attributePending.delete(key)
    try {
      const updated = await api.setAttributeValue(pending)
      const sameEntity =
        attributeEntity.value?.type === pending.entityType && attributeEntity.value?.id === pending.entityId
      if (sameEntity) {
        const index = attributeValues.value.findIndex((entry) => entry.fieldId === pending.fieldId)
        if (index >= 0) attributeValues.value[index] = updated
        else attributeValues.value.push(updated)
      }
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`属性值保存失败：${messageOf(error)}`)
    }
  }

  async function flushNote(noteId: string) {
    const timer = noteTimers.get(noteId)
    if (timer) {
      window.clearTimeout(timer)
      noteTimers.delete(noteId)
    }
    const patch = notePending.get(noteId)
    if (!patch) return
    notePending.delete(noteId)
    try {
      const updated = await api.updateNote(noteId, patch)
      const projectIndex = projectNotes.value.findIndex((entry) => entry.id === noteId)
      if (projectIndex >= 0) projectNotes.value[projectIndex] = updated
      const globalIndex = globalNotes.value.findIndex((entry) => entry.id === noteId)
      if (globalIndex >= 0) globalNotes.value[globalIndex] = updated
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      setError(`记事本保存失败：${messageOf(error)}`)
    }
  }

  async function flushAll() {
    for (const blockId of [...blockPending.keys()]) await flushBlock(blockId)
    for (const outlineId of [...outlinePending.keys()]) await flushOutline(outlineId)
    await flushChapterMeta()
    for (const characterId of [...characterPending.keys()]) await flushCharacter(characterId)
    for (const stageId of [...stagePending.keys()]) await flushStage(stageId)
    for (const skillId of [...skillPending.keys()]) await flushSkill(skillId)
    for (const itemId of [...itemPending.keys()]) await flushItem(itemId)
    for (const templateId of [...templatePending.keys()]) await flushTemplate(templateId)
    for (const fieldId of [...fieldPending.keys()]) await flushField(fieldId)
    for (const key of [...attributePending.keys()]) await flushAttribute(key)
    for (const noteId of [...notePending.keys()]) await flushNote(noteId)
  }

  function cancelPendingBlock(blockId: string) {
    const timer = blockTimers.get(blockId)
    if (timer) window.clearTimeout(timer)
    blockTimers.delete(blockId)
    blockPending.delete(blockId)
  }

  // ---------------------------------------------------------------------------
  // 作品
  // ---------------------------------------------------------------------------
  async function bootstrap() {
    loading.value = true
    try {
      projects.value = await api.listProjects()
      globalNotes.value = await api.listNotes('global')
      const saved = localStorage.getItem(PROJECT_KEY)
      const target = projects.value.find((item) => item.id === saved) ?? projects.value[0] ?? null
      if (target) await openProject(target.id)
      else noteScope.value = 'global'
    } catch (error) {
      setError(`加载作品失败：${messageOf(error)}`)
    } finally {
      loading.value = false
    }
  }

  async function openProject(id: string) {
    await flushAll()
    projectId.value = id
    localStorage.setItem(PROJECT_KEY, id)
    mode.value = 'welcome'
    resetTabs()
    activeOutlineId.value = ''
    activeChapterId.value = ''
    activeCharacterId.value = ''
    activeItemId.value = ''
    activeNoteId.value = ''
    noteScope.value = 'project'
    templateKind.value = 'character'
    chapter.value = null
    item.value = null
    overview.value = null
    characters.value = []
    items.value = []
    templates.value = []
    projectNotes.value = []
    attributeValues.value = []
    attributeLogs.value = []
    attributeEntity.value = null
    chapterPending = {}
    characterPending.clear()
    stagePending.clear()
    skillPending.clear()
    itemPending.clear()
    templatePending.clear()
    fieldPending.clear()
    attributePending.clear()
    notePending.clear()
    revisions.value = []
    versions.value = []
    versionsTarget.value = null
    versionsOpen.value = false
    revisionsOpen.value = false
    selection.value = null
    refineTarget.value = null
    chapterSearchQuery.value = ''
    chapterSearchResults.value = []
    chapterSearching.value = false
    focusBlockId.value = null
    if (searchTimer) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }
    try {
      outlines.value = await api.listOutlines(id)
      chapters.value = await api.listChapters(id)
      characters.value = await api.listCharacters(id)
      items.value = await api.listItems(id)
      templates.value = await api.listCardTemplates(id)
      projectNotes.value = await api.listNotes('project', id)
      globalNotes.value = await api.listNotes('global')
    } catch (error) {
      setError(`加载作品内容失败：${messageOf(error)}`)
    }
  }

  async function reloadProjectLists() {
    if (!projectId.value) return
    outlines.value = await api.listOutlines(projectId.value)
    chapters.value = await api.listChapters(projectId.value)
    characters.value = await api.listCharacters(projectId.value)
    items.value = await api.listItems(projectId.value)
    templates.value = await api.listCardTemplates(projectId.value)
    projectNotes.value = await api.listNotes('project', projectId.value)
    globalNotes.value = await api.listNotes('global')
  }

  async function createProject(name: string) {
    try {
      const created = await api.createProject(name)
      projects.value.unshift(created)
      await openProject(created.id)
      return created
    } catch (error) {
      setError(`新建作品失败：${messageOf(error)}`)
      return null
    }
  }

  async function updateProject(patch: { name?: string; description?: string; styleGuide?: string }) {
    if (!project.value) return
    try {
      const updated = await api.updateProject(project.value.id, patch)
      const index = projects.value.findIndex((item) => item.id === updated.id)
      if (index >= 0) projects.value[index] = updated
    } catch (error) {
      setError(`更新作品失败：${messageOf(error)}`)
    }
  }

  async function deleteProject(id: string) {
    try {
      await api.deleteProject(id)
      projects.value = projects.value.filter((item) => item.id !== id)
      if (projectId.value === id) {
        projectId.value = ''
        mode.value = 'welcome'
        resetTabs()
        chapter.value = null
        outlines.value = []
        chapters.value = []
        characters.value = []
        items.value = []
        templates.value = []
        projectNotes.value = []
        activeNoteId.value = ''
        notePending.clear()
        overview.value = null
        item.value = null
        attributeValues.value = []
        attributeLogs.value = []
        attributeEntity.value = null
        const next = projects.value[0]
        if (next) await openProject(next.id)
      }
    } catch (error) {
      setError(`删除作品失败：${messageOf(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 页签
  // ---------------------------------------------------------------------------
  function tabKey(type: DocTabType, targetId: string) {
    return type === 'welcome' ? 'welcome' : `${type}:${targetId}`
  }

  function resetTabs() {
    openTabs.value = [{ key: 'welcome', type: 'welcome', targetId: '' }]
    activeTabKey.value = 'welcome'
  }

  function ensureTab(type: DocTabType, targetId: string, variant?: 'chapterOutline' | 'chapter') {
    const key = tabKey(type, targetId)
    const existing = openTabs.value.find((tab) => tab.key === key)
    if (existing) {
      if (variant) existing.variant = variant
    } else {
      openTabs.value.push({ key, type, targetId, variant })
    }
    activeTabKey.value = key
  }

  async function activateTab(key: string) {
    const tab = openTabs.value.find((entry) => entry.key === key)
    if (!tab) return
    if (tab.type === 'welcome') {
      if (mode.value === 'welcome') return
      await flushAll()
      mode.value = 'welcome'
      activeOutlineId.value = ''
      activeChapterId.value = ''
      activeCharacterId.value = ''
      activeItemId.value = ''
      chapter.value = null
      item.value = null
      attributeValues.value = []
      attributeLogs.value = []
      attributeEntity.value = null
      selection.value = null
      activeTabKey.value = key
      return
    }
    if (tab.type === 'overview' && mode.value === 'overview') {
      activeTabKey.value = key
      return
    }
    if (tab.type === 'outline' && mode.value === 'outline' && activeOutlineId.value === tab.targetId) return
    if (tab.type === 'character' && mode.value === 'character' && activeCharacterId.value === tab.targetId) return
    if (tab.type === 'item' && mode.value === 'item' && activeItemId.value === tab.targetId) return
    if (tab.type === 'template' && mode.value === 'template' && templateKind.value === tab.targetId) return
    if (tab.type === 'note' && mode.value === 'note' && activeNoteId.value === tab.targetId) return
    if (tab.type === 'chapter' && chapter.value?.id === tab.targetId && activeChapterId.value === tab.targetId) {
      mode.value = tab.variant ?? 'chapter'
      focusBlockId.value = null
      activeTabKey.value = key
      return
    }
    switch (tab.type) {
      case 'overview':
        await openOverview()
        break
      case 'outline':
        await selectOutline(tab.targetId)
        break
      case 'character':
        await selectCharacter(tab.targetId)
        break
      case 'item':
        await selectItem(tab.targetId)
        break
      case 'template':
        await openTemplate(tab.targetId as TemplateKind)
        break
      case 'note':
        await selectNote(tab.targetId)
        break
      case 'chapter':
        await selectChapter(tab.targetId, tab.variant ?? 'chapter')
        break
    }
  }

  async function closeTab(key: string) {
    if (key === 'welcome') return
    const index = openTabs.value.findIndex((tab) => tab.key === key)
    if (index < 0) return
    openTabs.value.splice(index, 1)
    if (activeTabKey.value !== key) return
    const next = openTabs.value[index - 1] ?? openTabs.value[index] ?? openTabs.value[0]
    if (next) await activateTab(next.key)
  }

  async function closeTabFor(type: DocTabType, targetId: string) {
    const key = tabKey(type, targetId)
    if (openTabs.value.some((tab) => tab.key === key)) await closeTab(key)
  }

  // ---------------------------------------------------------------------------
  // 大纲
  // ---------------------------------------------------------------------------
  async function selectOutline(id: string) {
    await flushAll()
    activeOutlineId.value = id
    activeChapterId.value = ''
    activeCharacterId.value = ''
    activeItemId.value = ''
    chapter.value = null
    item.value = null
    attributeValues.value = []
    attributeLogs.value = []
    attributeEntity.value = null
    mode.value = 'outline'
    selection.value = null
    ensureTab('outline', id)
  }

  async function createOutline(parentId: string | null = null) {
    if (!projectId.value) return null
    try {
      const created = await api.createOutline({
        projectId: projectId.value,
        parentId,
        title: parentId ? '新子条目' : '新大纲'
      })
      outlines.value.push(created)
      await selectOutline(created.id)
      return created
    } catch (error) {
      setError(`新建大纲失败：${messageOf(error)}`)
      return null
    }
  }

  function editOutlineTitle(id: string, title: string) {
    const item = outlines.value.find((outline) => outline.id === id)
    if (!item) return
    item.title = title
    saveState.value = 'saving'
    const pending = outlinePending.get(id) ?? {}
    pending.title = title
    outlinePending.set(id, pending)
    const timer = outlineTimers.get(id)
    if (timer) window.clearTimeout(timer)
    outlineTimers.set(
      id,
      window.setTimeout(() => {
        outlineTimers.delete(id)
        void flushOutline(id)
      }, 650)
    )
  }

  function editOutlineContent(id: string, content: string) {
    const item = outlines.value.find((outline) => outline.id === id)
    if (!item) return
    item.content = content
    saveState.value = 'saving'
    const pending = outlinePending.get(id) ?? {}
    pending.content = content
    outlinePending.set(id, pending)
    const timer = outlineTimers.get(id)
    if (timer) window.clearTimeout(timer)
    outlineTimers.set(
      id,
      window.setTimeout(() => {
        outlineTimers.delete(id)
        void flushOutline(id)
      }, 650)
    )
  }

  async function deleteOutline(id: string) {
    try {
      await flushOutline(id)
      await api.deleteOutline(id)
      outlines.value = await api.listOutlines(projectId.value)
      await closeTabFor('outline', id)
    } catch (error) {
      setError(`删除大纲失败：${messageOf(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 角色
  // ---------------------------------------------------------------------------
  function syncCharacter(updated: Character) {
    const index = characters.value.findIndex((item) => item.id === updated.id)
    if (index >= 0) characters.value[index] = updated
    else characters.value.push(updated)
  }

  async function selectCharacter(id: string) {
    await flushAll()
    activeCharacterId.value = id
    activeOutlineId.value = ''
    activeChapterId.value = ''
    activeItemId.value = ''
    chapter.value = null
    item.value = null
    mode.value = 'character'
    selection.value = null
    focusBlockId.value = null
    ensureTab('character', id)
    await loadAttributes('character', id)
  }

  async function createCharacter(name = '新角色') {
    if (!projectId.value) return null
    try {
      await flushAll()
      const created = await api.createCharacter({ projectId: projectId.value, name })
      characters.value.push(created)
      await selectCharacter(created.id)
      return created
    } catch (error) {
      setError(`新建角色失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteCharacter(id: string) {
    const current = characters.value.find((item) => item.id === id)
    try {
      const timer = characterTimers.get(id)
      if (timer) window.clearTimeout(timer)
      characterTimers.delete(id)
      characterPending.delete(id)
      for (const stage of current?.stages ?? []) {
        const stageTimer = stageTimers.get(stage.id)
        if (stageTimer) window.clearTimeout(stageTimer)
        stageTimers.delete(stage.id)
        stagePending.delete(stage.id)
      }
      for (const skill of current?.skills ?? []) {
        const skillTimer = skillTimers.get(skill.id)
        if (skillTimer) window.clearTimeout(skillTimer)
        skillTimers.delete(skill.id)
        skillPending.delete(skill.id)
      }
      await api.deleteCharacter(id)
      characters.value = characters.value.filter((item) => item.id !== id)
      await closeTabFor('character', id)
    } catch (error) {
      setError(`删除角色失败：${messageOf(error)}`)
    }
  }

  function editCharacterField(field: CharacterField, value: string | null) {
    const current = activeCharacter.value
    if (!current) return
    if (field === 'debutChapterId') current.debutChapterId = value
    else (current as unknown as Record<string, string>)[field] = value as string
    saveState.value = 'saving'
    const pending = characterPending.get(current.id) ?? {}
    pending[field] = value
    characterPending.set(current.id, pending)
    const timer = characterTimers.get(current.id)
    if (timer) window.clearTimeout(timer)
    characterTimers.set(
      current.id,
      window.setTimeout(() => {
        characterTimers.delete(current.id)
        void flushCharacter(current.id)
      }, 700)
    )
  }

  function editStageField(stageId: string, field: CharacterStageField, value: string | null) {
    for (const character of characters.value) {
      const stage = character.stages.find((item) => item.id === stageId)
      if (!stage) continue
      if (field === 'chapterId') stage.chapterId = value
      else stage[field] = value as string
      saveState.value = 'saving'
      const pending = stagePending.get(stageId) ?? {}
      pending[field] = value
      stagePending.set(stageId, pending)
      const timer = stageTimers.get(stageId)
      if (timer) window.clearTimeout(timer)
      stageTimers.set(
        stageId,
        window.setTimeout(() => {
          stageTimers.delete(stageId)
          void flushStage(stageId)
        }, 700)
      )
      return
    }
  }

  async function addCharacterStage() {
    const current = activeCharacter.value
    if (!current) return null
    try {
      await flushAll()
      const updated = await api.createCharacterStage(current.id, { name: '新阶段' })
      syncCharacter(updated)
      const created = updated.stages.find((stage) => !current.stages.some((item) => item.id === stage.id))
      return created ?? updated.stages[updated.stages.length - 1] ?? null
    } catch (error) {
      setError(`新增阶段失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteCharacterStage(stageId: string) {
    try {
      const timer = stageTimers.get(stageId)
      if (timer) window.clearTimeout(timer)
      stageTimers.delete(stageId)
      stagePending.delete(stageId)
      await flushAll()
      const updated = await api.deleteCharacterStage(stageId)
      syncCharacter(updated)
    } catch (error) {
      setError(`删除阶段失败：${messageOf(error)}`)
    }
  }

  async function setCurrentCharacterStage(stageId: string) {
    const current = activeCharacter.value
    if (!current) return
    try {
      await flushAll()
      const updated = await api.setCurrentCharacterStage(current.id, stageId)
      syncCharacter(updated)
    } catch (error) {
      setError(`切换当前阶段失败：${messageOf(error)}`)
    }
  }

  type SkillField = 'name' | 'level' | 'description' | 'chapterId'

  function editSkillField(skillId: string, field: SkillField, value: string | null) {
    for (const character of characters.value) {
      const skill = character.skills.find((item) => item.id === skillId)
      if (!skill) continue
      if (field === 'chapterId') skill.chapterId = value
      else (skill as unknown as Record<string, string>)[field] = value as string
      saveState.value = 'saving'
      const pending = skillPending.get(skillId) ?? {}
      pending[field] = value
      skillPending.set(skillId, pending)
      const timer = skillTimers.get(skillId)
      if (timer) window.clearTimeout(timer)
      skillTimers.set(
        skillId,
        window.setTimeout(() => {
          skillTimers.delete(skillId)
          void flushSkill(skillId)
        }, 700)
      )
      return
    }
  }

  async function addCharacterSkill() {
    const current = activeCharacter.value
    if (!current) return
    try {
      await flushAll()
      const updated = await api.createCharacterSkill(current.id, { name: '新技能' })
      syncCharacter(updated)
    } catch (error) {
      setError(`新增技能失败：${messageOf(error)}`)
    }
  }

  async function deleteCharacterSkill(skillId: string) {
    const timer = skillTimers.get(skillId)
    if (timer) window.clearTimeout(timer)
    skillTimers.delete(skillId)
    skillPending.delete(skillId)
    try {
      await flushAll()
      const updated = await api.deleteCharacterSkill(skillId)
      syncCharacter(updated)
    } catch (error) {
      setError(`删除技能失败：${messageOf(error)}`)
    }
  }

  async function addCharacterStatusLog(payload: {
    status: string
    period?: string
    chapterId?: string | null
    note?: string
  }) {
    const current = activeCharacter.value
    if (!current) return false
    try {
      await flushAll()
      const updated = await api.addCharacterStatusLog(current.id, payload)
      syncCharacter(updated)
      return true
    } catch (error) {
      setError(`记录人物状态失败：${messageOf(error)}`)
      return false
    }
  }

  async function deleteCharacterStatusLog(logId: string) {
    try {
      await flushAll()
      const updated = await api.deleteCharacterStatusLog(logId)
      syncCharacter(updated)
    } catch (error) {
      setError(`删除状态记录失败：${messageOf(error)}`)
    }
  }

  async function addCharacterRelation(payload: {
    otherId: string
    relation: string
    period?: string
    chapterId?: string | null
    note?: string
  }) {
    const current = activeCharacter.value
    if (!current) return false
    try {
      await flushAll()
      const updated = await api.addCharacterRelation(current.id, payload)
      syncCharacter(updated)
      return true
    } catch (error) {
      setError(`记录角色关系失败：${messageOf(error)}`)
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // 物品 / 装备
  // ---------------------------------------------------------------------------
  function syncItemDetail(updated: Item) {
    item.value = updated
    activeItemId.value = updated.id
    const index = items.value.findIndex((entry) => entry.id === updated.id)
    if (index >= 0) items.value[index] = updated
    else items.value.push(updated)
  }

  async function selectItem(id: string) {
    await flushAll()
    activeItemId.value = id
    activeOutlineId.value = ''
    activeChapterId.value = ''
    activeCharacterId.value = ''
    chapter.value = null
    mode.value = 'item'
    selection.value = null
    focusBlockId.value = null
    ensureTab('item', id)
    itemLoading.value = true
    try {
      syncItemDetail(await api.getItem(id))
      await loadAttributes('item', id)
    } catch (error) {
      item.value = null
      setError(`打开物品失败：${messageOf(error)}`)
    } finally {
      itemLoading.value = false
    }
  }

  async function createItem(name = '新物品') {
    if (!projectId.value) return null
    try {
      await flushAll()
      const created = await api.createItem({ projectId: projectId.value, name })
      items.value.push(created)
      await selectItem(created.id)
      return created
    } catch (error) {
      setError(`新建物品失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteItem(id: string) {
    try {
      const timer = itemTimers.get(id)
      if (timer) window.clearTimeout(timer)
      itemTimers.delete(id)
      itemPending.delete(id)
      await api.deleteItem(id)
      items.value = items.value.filter((entry) => entry.id !== id)
      await closeTabFor('item', id)
    } catch (error) {
      setError(`删除物品失败：${messageOf(error)}`)
    }
  }

  function editItemField(field: ItemField, value: string) {
    const current = item.value
    if (!current) return
    current[field] = value
    const stored = items.value.find((entry) => entry.id === current.id)
    if (stored) stored[field] = value
    saveState.value = 'saving'
    const pending = itemPending.get(current.id) ?? {}
    pending[field] = value
    itemPending.set(current.id, pending)
    const timer = itemTimers.get(current.id)
    if (timer) window.clearTimeout(timer)
    itemTimers.set(
      current.id,
      window.setTimeout(() => {
        itemTimers.delete(current.id)
        void flushItem(current.id)
      }, 700)
    )
  }

  async function addItemEvent(payload: ItemEventInput) {
    const current = item.value
    if (!current) return null
    try {
      await flushAll()
      const updated = await api.createItemEvent(current.id, payload)
      syncItemDetail(updated)
      return updated
    } catch (error) {
      setError(`新增状态记录失败：${messageOf(error)}`)
      return null
    }
  }

  async function updateItemEvent(eventId: string, payload: ItemEventInput) {
    try {
      await flushAll()
      const updated = await api.updateItemEvent(eventId, payload)
      syncItemDetail(updated)
    } catch (error) {
      setError(`更新状态记录失败：${messageOf(error)}`)
    }
  }

  async function deleteItemEvent(eventId: string) {
    try {
      await flushAll()
      const updated = await api.deleteItemEvent(eventId)
      syncItemDetail(updated)
    } catch (error) {
      setError(`删除状态记录失败：${messageOf(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 记事本（本书记事 / 全局随手记）
  // ---------------------------------------------------------------------------
  function notesOf(scope: NoteScope) {
    return scope === 'project' ? projectNotes.value : globalNotes.value
  }

  async function selectNote(id: string) {
    const target =
      projectNotes.value.find((entry) => entry.id === id) ??
      globalNotes.value.find((entry) => entry.id === id) ??
      null
    if (!target) return
    await flushAll()
    activeNoteId.value = id
    noteScope.value = target.scope
    mode.value = 'note'
    ensureTab('note', id)
  }

  async function createNote(scope: NoteScope = noteScope.value) {
    if (scope === 'project' && !projectId.value) {
      setError('请先打开一部小说，再新建本书记事')
      return null
    }
    try {
      await flushAll()
      const created = await api.createNote({
        scope,
        projectId: scope === 'project' ? projectId.value : undefined
      })
      notesOf(scope).push(created)
      await selectNote(created.id)
      return created
    } catch (error) {
      setError(`新建记事本失败：${messageOf(error)}`)
      return null
    }
  }

  function editNoteField(id: string, field: 'title' | 'content', value: string) {
    const note =
      projectNotes.value.find((entry) => entry.id === id) ??
      globalNotes.value.find((entry) => entry.id === id) ??
      null
    if (!note || note[field] === value) return
    note[field] = value
    notePending.set(id, { ...(notePending.get(id) ?? {}), [field]: value })
    saveState.value = 'saving'
    const timer = noteTimers.get(id)
    if (timer) window.clearTimeout(timer)
    noteTimers.set(
      id,
      window.setTimeout(() => {
        void flushNote(id)
      }, 700)
    )
  }

  async function deleteNote(id: string) {
    const note =
      projectNotes.value.find((entry) => entry.id === id) ??
      globalNotes.value.find((entry) => entry.id === id) ??
      null
    if (!note) return
    try {
      await flushNote(id)
      await api.deleteNote(id)
      const scope = note.scope
      projectNotes.value = projectNotes.value.filter((entry) => entry.id !== id)
      globalNotes.value = globalNotes.value.filter((entry) => entry.id !== id)
      notePending.delete(id)
      await closeTabFor('note', id)
      if (activeNoteId.value === id) {
        activeNoteId.value = ''
        const next = notesOf(scope)[0]
        if (next) await selectNote(next.id)
        else {
          mode.value = 'welcome'
          activeTabKey.value = 'welcome'
        }
      }
    } catch (error) {
      setError(`删除记事本失败：${messageOf(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 人物总览
  // ---------------------------------------------------------------------------
  async function loadOverview() {
    if (!projectId.value) return
    overviewLoading.value = true
    try {
      overview.value = await api.getOverview(projectId.value)
    } catch (error) {
      setError(`加载人物总览失败：${messageOf(error)}`)
    } finally {
      overviewLoading.value = false
    }
  }

  /** 生成上下文要用到各章属性与随身物品，没有加载过就静默拉一次 */
  let overviewPromise: Promise<void> | null = null
  async function ensureOverview() {
    if (overview.value || !projectId.value) return
    if (overviewPromise) return overviewPromise
    overviewPromise = loadOverview().finally(() => {
      overviewPromise = null
    })
    return overviewPromise
  }

  async function openOverview() {
    await flushAll()
    activeOutlineId.value = ''
    activeChapterId.value = ''
    activeCharacterId.value = ''
    activeItemId.value = ''
    chapter.value = null
    item.value = null
    attributeValues.value = []
    attributeLogs.value = []
    attributeEntity.value = null
    mode.value = 'overview'
    selection.value = null
    focusBlockId.value = null
    ensureTab('overview', '')
    await loadOverview()
  }

  // ---------------------------------------------------------------------------
  // 属性卡模板
  // ---------------------------------------------------------------------------
  async function loadTemplates() {
    if (!projectId.value) return
    try {
      templates.value = await api.listCardTemplates(projectId.value)
    } catch (error) {
      setError(`加载属性卡模板失败：${messageOf(error)}`)
    }
  }

  async function openTemplate(kind: TemplateKind) {
    await flushAll()
    templateKind.value = kind
    mode.value = 'template'
    selection.value = null
    ensureTab('template', kind)
  }

  function editTemplateField(field: 'name' | 'description', value: string) {
    const current = activeTemplate.value
    if (!current) return
    current[field] = value
    saveState.value = 'saving'
    const pending = templatePending.get(current.id) ?? {}
    pending[field] = value
    templatePending.set(current.id, pending)
    const timer = templateTimers.get(current.id)
    if (timer) window.clearTimeout(timer)
    templateTimers.set(
      current.id,
      window.setTimeout(() => {
        templateTimers.delete(current.id)
        void flushTemplate(current.id)
      }, 700)
    )
  }

  async function addCardField() {
    const template = activeTemplate.value
    if (!template) return null
    try {
      await flushAll()
      const created = await api.createCardField(template.id, { label: '新属性', fieldType: 'text' })
      template.fields.push(created)
      saveState.value = 'saved'
      return created
    } catch (error) {
      setError(`新增属性失败：${messageOf(error)}`)
      return null
    }
  }

  function editCardField(
    fieldId: string,
    patch: Partial<Pick<CardField, 'label' | 'fieldType' | 'unit' | 'options'>>
  ) {
    for (const template of templates.value) {
      const field = template.fields.find((entry) => entry.id === fieldId)
      if (!field) continue
      Object.assign(field, patch)
      saveState.value = 'saving'
      const pending = fieldPending.get(fieldId) ?? {}
      Object.assign(pending, patch)
      fieldPending.set(fieldId, pending)
      const timer = fieldTimers.get(fieldId)
      if (timer) window.clearTimeout(timer)
      fieldTimers.set(
        fieldId,
        window.setTimeout(() => {
          fieldTimers.delete(fieldId)
          void flushField(fieldId)
        }, 700)
      )
      return
    }
  }

  async function deleteCardField(fieldId: string) {
    try {
      const timer = fieldTimers.get(fieldId)
      if (timer) window.clearTimeout(timer)
      fieldTimers.delete(fieldId)
      fieldPending.delete(fieldId)
      await flushAll()
      await api.deleteCardField(fieldId)
      for (const template of templates.value) {
        template.fields = template.fields.filter((field) => field.id !== fieldId)
      }
      attributeValues.value = attributeValues.value.filter((value) => value.fieldId !== fieldId)
      attributeLogs.value = attributeLogs.value.filter((log) => log.fieldId !== fieldId)
      saveState.value = 'saved'
    } catch (error) {
      setError(`删除属性失败：${messageOf(error)}`)
    }
  }

  async function moveCardField(fieldId: string, direction: -1 | 1) {
    const template = activeTemplate.value
    if (!template) return
    const index = template.fields.findIndex((field) => field.id === fieldId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= template.fields.length) return
    const fields = [...template.fields]
    const temp = fields[index]
    fields[index] = fields[target]
    fields[target] = temp
    template.fields = fields.map((field, order) => ({ ...field, sortOrder: order * 10 }))
    try {
      await flushAll()
      const updated = await api.reorderCardFields(template.id, template.fields.map((field) => field.id))
      const current = templates.value.find((entry) => entry.id === updated.id)
      if (current) current.fields = updated.fields
      saveState.value = 'saved'
    } catch (error) {
      setError(`调整属性顺序失败：${messageOf(error)}`)
      await loadTemplates()
    }
  }

  // ---------------------------------------------------------------------------
  // 属性值与成长记录
  // ---------------------------------------------------------------------------
  async function loadAttributes(entityType: TemplateKind, entityId: string) {
    attributesLoading.value = true
    attributeValues.value = []
    attributeLogs.value = []
    attributeEntity.value = { type: entityType, id: entityId }
    try {
      const bundle = await api.getAttributes(entityType, entityId)
      if (attributeEntity.value?.type !== entityType || attributeEntity.value?.id !== entityId) return
      attributeValues.value = bundle.values
      attributeLogs.value = bundle.logs
    } catch (error) {
      setError(`加载属性失败：${messageOf(error)}`)
    } finally {
      attributesLoading.value = false
    }
  }

  function setAttributeValue(fieldId: string, value: string) {
    const entity = attributeEntity.value
    if (!entity) return
    const existing = attributeValues.value.find((entry) => entry.fieldId === fieldId)
    if (existing) {
      existing.value = value
      existing.updatedAt = new Date().toISOString()
    } else {
      attributeValues.value.push({
        id: '',
        entityType: entity.type,
        entityId: entity.id,
        fieldId,
        value,
        createdAt: '',
        updatedAt: ''
      })
    }
    saveState.value = 'saving'
    const key = `${entity.type}:${entity.id}:${fieldId}`
    attributePending.set(key, {
      entityType: entity.type,
      entityId: entity.id,
      fieldId,
      value
    })
    const timer = attributeTimers.get(key)
    if (timer) window.clearTimeout(timer)
    attributeTimers.set(
      key,
      window.setTimeout(() => {
        attributeTimers.delete(key)
        void flushAttribute(key)
      }, 700)
    )
  }

  async function addAttributeLog(payload: AttributeLogInput) {
    const entity = attributeEntity.value
    if (!entity) return null
    try {
      await flushAll()
      const result = await api.createAttributeLog({
        ...payload,
        entityType: entity.type,
        entityId: entity.id
      })
      attributeLogs.value.unshift(result.log)
      const updatedValue = result.value
      if (updatedValue) {
        const index = attributeValues.value.findIndex((entry) => entry.fieldId === updatedValue.fieldId)
        if (index >= 0) attributeValues.value[index] = updatedValue
        else attributeValues.value.push(updatedValue)
      }
      saveState.value = 'saved'
      return result.log
    } catch (error) {
      setError(`记录属性变化失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteAttributeLog(logId: string) {
    try {
      await api.deleteAttributeLog(logId)
      attributeLogs.value = attributeLogs.value.filter((log) => log.id !== logId)
      saveState.value = 'saved'
    } catch (error) {
      setError(`删除属性记录失败：${messageOf(error)}`)
    }
  }

  // ---------------------------------------------------------------------------
  // 章节
  // ---------------------------------------------------------------------------
  async function selectChapter(
    id: string,
    target: 'chapterOutline' | 'chapter' = 'chapter',
    focusBlock: string | null = null
  ) {
    await flushAll()
    activeChapterId.value = id
    activeOutlineId.value = ''
    activeCharacterId.value = ''
    activeItemId.value = ''
    item.value = null
    attributeValues.value = []
    attributeLogs.value = []
    attributeEntity.value = null
    mode.value = target
    chapterLoading.value = true
    selection.value = null
    focusBlockId.value = focusBlock
    ensureTab('chapter', id, target)
    try {
      chapter.value = await api.getChapter(id)
      revisions.value = await api.listRevisions(id)
    } catch (error) {
      chapter.value = null
      setError(`打开章节失败：${messageOf(error)}`)
    } finally {
      chapterLoading.value = false
    }
  }

  // ---------------------------------------------------------------------------
  // 章节搜索
  // ---------------------------------------------------------------------------
  function setChapterSearch(query: string) {
    chapterSearchQuery.value = query
    const keyword = query.trim()
    if (searchTimer) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }
    if (!keyword || !projectId.value) {
      chapterSearchResults.value = []
      chapterSearching.value = false
      return
    }
    const pid = projectId.value
    chapterSearching.value = true
    searchTimer = window.setTimeout(async () => {
      try {
        const data = await api.searchChapters(pid, keyword)
        if (projectId.value !== pid || chapterSearchQuery.value.trim() !== keyword) return
        chapterSearchResults.value = data.results
      } catch (error) {
        setError(`搜索失败：${messageOf(error)}`)
      } finally {
        if (projectId.value === pid && chapterSearchQuery.value.trim() === keyword) {
          chapterSearching.value = false
        }
      }
    }, 260)
  }

  function clearChapterSearch() {
    if (searchTimer) {
      window.clearTimeout(searchTimer)
      searchTimer = null
    }
    chapterSearchQuery.value = ''
    chapterSearchResults.value = []
    chapterSearching.value = false
  }

  function setMode(next: EditorMode) {
    mode.value = next
  }

  async function createChapter(title = '新章节') {
    if (!projectId.value) return null
    try {
      const created = await api.createChapter({ projectId: projectId.value, title })
      chapters.value.push(created)
      chapters.value.sort((a, b) => a.sortOrder - b.sortOrder)
      await selectChapter(created.id, 'chapterOutline')
      return created
    } catch (error) {
      setError(`新建章节失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteChapter(id: string) {
    try {
      await api.deleteChapter(id)
      chapters.value = chapters.value.filter((item) => item.id !== id)
      await closeTabFor('chapter', id)
    } catch (error) {
      setError(`删除章节失败：${messageOf(error)}`)
    }
  }

  function editChapterMeta(patch: ChapterPatch, immediate = false) {
    const current = chapter.value
    if (!current) return
    Object.assign(current, patch)
    syncChapterList({ id: current.id, ...patch })
    saveState.value = 'saving'
    Object.assign(chapterPending, patch)
    if (immediate) {
      void flushChapterMeta()
      return
    }
    if (chapterTimer) window.clearTimeout(chapterTimer)
    chapterTimer = window.setTimeout(() => {
      chapterTimer = null
      void flushChapterMeta()
    }, 700)
  }

  function setChapterStatus(status: string) {
    editChapterMeta({ status }, true)
  }

  async function addBlock(afterBlockId?: string) {
    const current = chapter.value
    if (!current) return null
    try {
      await flushAll()
      const result = await api.createBlocks(current.id, { text: '', afterBlockId })
      if (result.blocks.length) {
        const blocks = [...current.blocks]
        const index = afterBlockId ? blocks.findIndex((block) => block.id === afterBlockId) : blocks.length - 1
        blocks.splice(index + 1, 0, ...result.blocks)
        current.blocks = blocks.sort((a, b) => a.sortOrder - b.sortOrder)
        refreshWordCount(current)
      }
      return result.blocks[0] ?? null
    } catch (error) {
      setError(`新增段落失败：${messageOf(error)}`)
      return null
    }
  }

  async function deleteBlock(blockId: string) {
    const current = chapter.value
    if (!current) return
    try {
      cancelPendingBlock(blockId)
      await api.deleteBlock(blockId)
      current.blocks = current.blocks.filter((block) => block.id !== blockId)
      refreshWordCount(current)
    } catch (error) {
      setError(`删除段落失败：${messageOf(error)}`)
    }
  }

  async function moveBlock(blockId: string, direction: -1 | 1) {
    const current = chapter.value
    if (!current) return
    const index = current.blocks.findIndex((block) => block.id === blockId)
    const target = index + direction
    if (index < 0 || target < 0 || target >= current.blocks.length) return
    await flushAll()
    const blocks = [...current.blocks]
    ;[blocks[index], blocks[target]] = [blocks[target], blocks[index]]
    current.blocks = blocks
    try {
      await api.reorderBlocks(current.id, blocks.map((block) => block.id))
    } catch (error) {
      setError(`调整段落顺序失败：${messageOf(error)}`)
    }
  }

  function editBlockText(blockId: string, text: string) {
    const current = chapter.value
    if (!current) return
    const block = current.blocks.find((item) => item.id === blockId)
    if (!block) return
    block.text = text
    refreshWordCount(current)
    saveState.value = 'saving'
    blockPending.set(blockId, text)
    const timer = blockTimers.get(blockId)
    if (timer) window.clearTimeout(timer)
    blockTimers.set(
      blockId,
      window.setTimeout(() => {
        blockTimers.delete(blockId)
        void flushBlock(blockId)
      }, 700)
    )
  }

  async function setBlockInstruction(blockId: string, instruction: string) {
    const current = chapter.value
    if (!current) return
    const block = current.blocks.find((item) => item.id === blockId)
    if (!block) return
    block.instruction = instruction
    try {
      const updated = await api.updateBlock(blockId, { instruction })
      Object.assign(block, updated)
    } catch (error) {
      setError(`保存修改要求失败：${messageOf(error)}`)
    }
  }

  async function loadRevisions(chapterId = activeChapterId.value) {
    if (!chapterId) return
    try {
      revisions.value = await api.listRevisions(chapterId)
    } catch (error) {
      setError(`加载修改记录失败：${messageOf(error)}`)
    }
  }

  async function openRevisions() {
    await loadRevisions()
    revisionsOpen.value = true
  }

  function closeRevisions() {
    revisionsOpen.value = false
  }

  function openExport() {
    exportOpen.value = true
  }

  function closeExport() {
    exportOpen.value = false
  }

  async function applyBlockRevision(payload: {
    blockId: string
    revisedText: string
    instruction: string
    originalText: string
    modelName?: string
  }) {
    const current = chapter.value
    if (!current) return null
    cancelPendingBlock(payload.blockId)
    try {
      const result = await api.applyRevision({
        target: 'block',
        chapterId: current.id,
        blockId: payload.blockId,
        revisedText: payload.revisedText,
        instruction: payload.instruction,
        modelName: payload.modelName
      })
      const block = current.blocks.find((item) => item.id === payload.blockId)
      if (block && result.block) {
        block.text = result.block.text
        block.instruction = result.block.instruction
      }
      refreshWordCount(current)
      if (result.chapter) syncChapterList(result.chapter)
      if (result.revision) revisions.value.unshift(result.revision)
      saveState.value = 'saved'
      return result
    } catch (error) {
      setError(`应用修改失败：${messageOf(error)}`)
      return null
    }
  }

  async function applyChapterSummary(revisedText: string, instruction: string, modelName?: string) {
    const current = chapter.value
    if (!current) return null
    try {
      await flushChapterMeta()
      const result = await api.applyRevision({
        target: 'chapter-summary',
        chapterId: current.id,
        revisedText,
        instruction,
        modelName
      })
      if (result.chapter) {
        current.summary = result.chapter.summary
        current.title = result.chapter.title
        syncChapterList(result.chapter)
      }
      if (result.revision) revisions.value.unshift(result.revision)
      saveState.value = 'saved'
      return result
    } catch (error) {
      setError(`应用章节大纲失败：${messageOf(error)}`)
      return null
    }
  }

  async function applyOutlineRevision(outlineId: string, revisedText: string, instruction: string, modelName?: string) {
    try {
      await flushOutline(outlineId)
      const result = await api.applyRevision({
        target: 'outline',
        outlineId,
        revisedText,
        instruction,
        modelName
      })
      const index = outlines.value.findIndex((item) => item.id === outlineId)
      if (index >= 0 && result.outline) outlines.value[index] = result.outline
      return result
    } catch (error) {
      setError(`应用大纲修改失败：${messageOf(error)}`)
      return null
    }
  }

  async function appendParagraphs(texts: string[], instruction: string, modelName?: string) {
    const current = chapter.value
    if (!current) return null
    try {
      await flushAll()
      const result = await api.applyRevision({
        target: 'append',
        chapterId: current.id,
        texts,
        instruction,
        modelName
      })
      if (result.blocks?.length) {
        current.blocks = [...current.blocks, ...result.blocks].sort((a, b) => a.sortOrder - b.sortOrder)
        refreshWordCount(current)
      }
      if (result.chapter) syncChapterList(result.chapter)
      if (result.revision) revisions.value.unshift(result.revision)
      return result
    } catch (error) {
      setError(`写入续写内容失败：${messageOf(error)}`)
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // 版本
  // ---------------------------------------------------------------------------
  async function openVersions(type: VersionTargetType, id: string, title: string) {
    versionsTarget.value = { type, id, title }
    versionsOpen.value = true
    try {
      versions.value = await api.listVersions(type, id)
    } catch (error) {
      setError(`加载版本失败：${messageOf(error)}`)
    }
  }

  function closeVersions() {
    versionsOpen.value = false
  }

  async function saveVersion(label = '手动保存') {
    const target = versionsTarget.value
    if (!target || !projectId.value) return
    try {
      await flushAll()
      await api.createVersion({
        projectId: projectId.value,
        targetType: target.type,
        targetId: target.id,
        label,
        source: 'manual'
      })
      versions.value = await api.listVersions(target.type, target.id)
    } catch (error) {
      setError(`保存版本失败：${messageOf(error)}`)
    }
  }

  async function restoreVersion(versionId: string) {
    const target = versionsTarget.value
    if (!target) return
    try {
      await flushAll()
      const result = await api.restoreVersion(versionId)
      if (result.targetType === 'chapter' && result.chapter) {
        if (chapter.value?.id === result.chapter.id) {
          chapter.value = result.chapter
          revisions.value = await api.listRevisions(result.chapter.id)
        }
        syncChapterList(result.chapter)
        refreshWordCount(chapter.value ?? result.chapter)
      } else if (result.targetType === 'character' && result.character) {
        syncCharacter(result.character)
      } else if (result.outline) {
        const index = outlines.value.findIndex((item) => item.id === result.outline?.id)
        if (index >= 0 && result.outline) outlines.value[index] = result.outline
      }
      versions.value = await api.listVersions(target.type, target.id)
      saveState.value = 'saved'
    } catch (error) {
      setError(`恢复版本失败：${messageOf(error)}`)
    }
  }

  async function removeVersion(versionId: string) {
    const target = versionsTarget.value
    if (!target) return
    try {
      await api.deleteVersion(versionId)
      versions.value = await api.listVersions(target.type, target.id)
    } catch (error) {
      setError(`删除版本失败：${messageOf(error)}`)
    }
  }

  async function getVersionDetail(versionId: string): Promise<VersionDetail | null> {
    try {
      return await api.getVersion(versionId)
    } catch (error) {
      setError(`读取版本失败：${messageOf(error)}`)
      return null
    }
  }

  // ---------------------------------------------------------------------------
  // 选区与精修
  // ---------------------------------------------------------------------------
  function setSelection(value: SelectionInfo | null) {
    selection.value = value
  }

  function requestRefine(target: RefineTarget) {
    refineTarget.value = target
  }

  function closeRefine() {
    refineTarget.value = null
  }

  function findBlock(blockId: string): Block | null {
    return chapter.value?.blocks.find((block) => block.id === blockId) ?? null
  }

  return {
    projects,
    projectId,
    project,
    outlines,
    chapters,
    characters,
    items,
    templates,
    projectNotes,
    globalNotes,
    notesForCurrentScope,
    mode,
    openTabs,
    activeTabKey,
    activateTab,
    closeTab,
    activeOutlineId,
    activeChapterId,
    activeCharacterId,
    activeItemId,
    activeNoteId,
    noteScope,
    activeNote,
    templateKind,
    activeOutline,
    activeCharacter,
    activeItem,
    characterTemplate,
    itemTemplate,
    activeTemplate,
    activeChapterMeta,
    chapter,
    chapterLoading,
    item,
    itemLoading,
    overview,
    overviewLoading,
    attributeValues,
    attributeLogs,
    attributeEntity,
    attributesLoading,
    chapterWordCount,
    totalWordCount,
    outlineNodes,
    outlineText,
    charactersText,
    revisions,
    versions,
    versionsTarget,
    versionsOpen,
    revisionsOpen,
    exportOpen,
    saveState,
    showInstructions,
    refineTarget,
    selection,
    loading,
    errorMessage,
    chapterSearchQuery,
    chapterSearchResults,
    chapterSearching,
    chapterSearchActive,
    focusBlockId,
    setChapterSearch,
    clearChapterSearch,
    bootstrap,
    openProject,
    reloadProjectLists,
    createProject,
    updateProject,
    deleteProject,
    selectOutline,
    createOutline,
    editOutlineTitle,
    editOutlineContent,
    deleteOutline,
    selectCharacter,
    createCharacter,
    deleteCharacter,
    editCharacterField,
    editStageField,
    addCharacterStage,
    deleteCharacterStage,
    setCurrentCharacterStage,
    editSkillField,
    addCharacterSkill,
    deleteCharacterSkill,
    addCharacterStatusLog,
    deleteCharacterStatusLog,
    addCharacterRelation,
    selectItem,
    createItem,
    deleteItem,
    editItemField,
    addItemEvent,
    updateItemEvent,
    deleteItemEvent,
    selectNote,
    createNote,
    editNoteField,
    deleteNote,
    loadOverview,
    ensureOverview,
    openOverview,
    loadTemplates,
    openTemplate,
    editTemplateField,
    addCardField,
    editCardField,
    deleteCardField,
    moveCardField,
    loadAttributes,
    setAttributeValue,
    addAttributeLog,
    deleteAttributeLog,
    selectChapter,
    setMode,
    createChapter,
    deleteChapter,
    editChapterMeta,
    setChapterStatus,
    addBlock,
    deleteBlock,
    moveBlock,
    editBlockText,
    setBlockInstruction,
    loadRevisions,
    openRevisions,
    closeRevisions,
    openExport,
    closeExport,
    applyBlockRevision,
    applyChapterSummary,
    applyOutlineRevision,
    appendParagraphs,
    openVersions,
    closeVersions,
    saveVersion,
    restoreVersion,
    removeVersion,
    getVersionDetail,
    setSelection,
    requestRefine,
    closeRefine,
    findBlock,
    flushAll,
    setError
  }
})
