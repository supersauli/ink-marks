export type EditorMode =
  | 'welcome'
  | 'overview'
  | 'outline'
  | 'character'
  | 'item'
  | 'template'
  | 'chapterOutline'
  | 'chapter'

export type SaveState = 'saved' | 'saving' | 'error'

export interface Project {
  id: string
  name: string
  description: string
  styleGuide: string
  createdAt: string
  updatedAt: string
}

export interface OutlineItem {
  id: string
  projectId: string
  parentId: string | null
  title: string
  content: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ChapterMeta {
  id: string
  projectId: string
  title: string
  summary: string
  status: 'outline' | 'writing' | 'done' | string
  sortOrder: number
  wordCount: number
  createdAt: string
  updatedAt: string
}

export interface Block {
  id: string
  chapterId: string
  text: string
  instruction: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ChapterDetail extends ChapterMeta {
  blocks: Block[]
}

export type ChapterMatchField = 'title' | 'summary' | 'body'

export interface ChapterSearchResult extends ChapterMeta {
  matchFields: ChapterMatchField[]
  blockId: string | null
  snippet: string
}

export interface Revision {
  id: string
  projectId: string
  chapterId: string | null
  blockId: string | null
  targetId: string | null
  scope: 'block' | 'chapter-summary' | 'outline' | 'append' | string
  instruction: string
  originalText: string
  revisedText: string
  modelName: string | null
  createdAt: string
}

export interface CharacterBasic {
  id: string
  projectId: string
  name: string
  alias: string
  role: string
  gender: string
  age: string
  debut: string
  debutChapterId: string | null
  appearance: string
  background: string
  relations: string
  goal: string
  notes: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CharacterStage {
  id: string
  characterId: string
  name: string
  period: string
  chapterId: string | null
  traits: string
  inner: string
  behavior: string
  speech: string
  event: string
  isCurrent: boolean
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CharacterSkill {
  id: string
  characterId: string
  name: string
  level: string
  description: string
  chapterId: string | null
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export type CharacterStatus = 'alive' | 'dead' | 'missing' | 'unknown'

export interface CharacterStatusLog {
  id: string
  characterId: string
  status: CharacterStatus | string
  period: string
  chapterId: string | null
  note: string
  createdAt: string
}

export interface CharacterRelation {
  id: string
  characterId: string
  otherId: string
  otherName: string
  relation: string
  period: string
  chapterId: string | null
  note: string
  createdAt: string
}

export interface Character extends CharacterBasic {
  stages: CharacterStage[]
  skills: CharacterSkill[]
  statusLogs: CharacterStatusLog[]
  currentStatus: CharacterStatus | string
  relationships: CharacterRelation[]
}

export type CharacterField =
  | 'name'
  | 'alias'
  | 'role'
  | 'gender'
  | 'age'
  | 'debut'
  | 'debutChapterId'
  | 'appearance'
  | 'background'
  | 'relations'
  | 'goal'
  | 'notes'

export type CharacterStageField =
  | 'name'
  | 'period'
  | 'chapterId'
  | 'traits'
  | 'inner'
  | 'behavior'
  | 'speech'
  | 'event'

export type VersionTargetType = 'chapter' | 'outline' | 'character'

export interface VersionInfo {
  id: string
  projectId: string
  targetType: VersionTargetType
  targetId: string
  label: string
  source: 'auto' | 'manual' | 'ai' | 'restore' | string
  createdAt: string
}

export interface VersionDetail extends VersionInfo {
  snapshot: ChapterSnapshot | OutlineSnapshot | CharacterSnapshot
}

export interface ChapterSnapshot {
  kind: 'chapter'
  chapter: {
    id: string
    projectId: string
    title: string
    summary: string
    status: string
  }
  blocks: Array<{ id: string; text: string; instruction: string; sortOrder: number }>
}

export interface OutlineSnapshot {
  kind: 'outline'
  outline: {
    id: string
    projectId: string
    parentId: string | null
    title: string
    content: string
    sortOrder: number
  }
}

export interface CharacterSnapshot {
  kind: 'character'
  character: CharacterBasic
  stages: Array<{
    id: string
    name: string
    period: string
    traits: string
    inner: string
    behavior: string
    speech: string
    event: string
    isCurrent: boolean
    sortOrder: number
  }>
}

export type TemplateKind = 'character' | 'item'
export type FieldType = 'text' | 'number' | 'longtext' | 'select'

export interface CardField {
  id: string
  templateId: string
  label: string
  fieldType: FieldType | string
  unit: string
  options: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface CardTemplate {
  id: string
  projectId: string
  kind: TemplateKind
  name: string
  description: string
  createdAt: string
  updatedAt: string
  fields: CardField[]
}

export interface AttributeValue {
  id: string
  entityType: TemplateKind
  entityId: string
  fieldId: string
  value: string
  createdAt: string
  updatedAt: string
}

export interface AttributeLog {
  id: string
  entityType: TemplateKind
  entityId: string
  fieldId: string
  value: string
  period: string
  chapterId: string | null
  note: string
  createdAt: string
}

export interface AttributeBundle {
  values: AttributeValue[]
  logs: AttributeLog[]
}

export interface AttributeLogInput {
  fieldId: string
  value: string
  period?: string
  chapterId?: string | null
  note?: string
  applyCurrent?: boolean
}

export type ItemField =
  | 'name'
  | 'category'
  | 'rarity'
  | 'origin'
  | 'reason'
  | 'debut'
  | 'background'
  | 'notes'
  | 'status'
  | 'currentHolder'
  | 'destroyedBy'
  | 'destroyedAt'

export interface ItemBasic {
  id: string
  projectId: string
  name: string
  category: string
  rarity: string
  origin: string
  reason: string
  debut: string
  background: string
  notes: string
  status: string
  currentHolder: string
  isDestroyed: boolean
  destroyedBy: string
  destroyedAt: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface ItemEvent {
  id: string
  itemId: string
  period: string
  chapterId: string | null
  holder: string
  status: string
  destroyedBy: string
  note: string
  createdAt: string
  updatedAt: string
}

export interface Item extends ItemBasic {
  events: ItemEvent[]
  holders: string[]
}

export interface ItemEventInput {
  period?: string
  chapterId?: string | null
  holder?: string
  status?: string
  destroyedBy?: string
  note?: string
  applyCurrent?: boolean
}

export interface OverviewStage {
  id: string
  name: string
  period: string
  chapterId: string | null
}

export interface OverviewAttribute {
  fieldId: string
  label: string
  fieldType: string
  unit: string
  value: string | null
}

export interface OverviewItem {
  id: string
  name: string
  category: string
  status: string
}

export interface OverviewSkill {
  id: string
  name: string
  level: string
}

export interface OverviewCell {
  chapterId: string
  debuted: boolean
  stage: OverviewStage | null
  status: CharacterStatus | string
  attributes: OverviewAttribute[]
  items: OverviewItem[]
  skills: OverviewSkill[]
}

export interface OverviewCharacter {
  id: string
  name: string
  role: string
  gender: string
  debut: string
  debutChapterId: string | null
  debutIndex: number
  cells: OverviewCell[]
}

export interface OverviewField {
  id: string
  label: string
  fieldType: string
  unit: string
}

export interface OverviewChapter {
  id: string
  title: string
  summary?: string
  status: string
  sortOrder: number
}

export interface OverviewData {
  chapters: OverviewChapter[]
  fields: OverviewField[]
  characters: OverviewCharacter[]
}

export interface Model {
  id: string
  providerId: string
  name: string
  displayName: string
  temperature: number
  maxTokens: number
  isDefault: boolean
  sortOrder: number
}

export interface Provider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  apiType: string
  extraHeaders: string
  createdAt: string
  updatedAt: string
  models: Model[]
}

export interface ChatMessage {
  id: string
  projectId: string
  role: 'user' | 'assistant' | 'system'
  content: string
  modelName: string | null
  createdAt: string
}

export type RefineTarget =
  | { kind: 'snippet'; chapterId: string; blockId: string; start: number; end: number; text: string }
  | { kind: 'blocks'; chapterId: string; blockIds: string[] }
  | { kind: 'chapter-summary'; chapterId: string }
  | { kind: 'outline'; outlineId: string }
  | { kind: 'append'; chapterId: string }

export interface SelectionInfo {
  chapterId: string
  blockId: string
  start: number
  end: number
  text: string
}
