export const mapProject = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  styleGuide: row.style_guide ?? '',
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapOutline = (row) => ({
  id: row.id,
  projectId: row.project_id,
  parentId: row.parent_id,
  title: row.title,
  content: row.content,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapChapter = (row) => ({
  id: row.id,
  projectId: row.project_id,
  title: row.title,
  summary: row.summary,
  status: row.status,
  sortOrder: row.sort_order,
  wordCount: row.word_count ?? 0,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapBlock = (row) => ({
  id: row.id,
  chapterId: row.chapter_id,
  text: row.text,
  instruction: row.instruction,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapCharacter = (row) => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  alias: row.alias,
  role: row.role,
  gender: row.gender ?? '',
  age: row.age,
  debut: row.debut ?? '',
  debutChapterId: row.debut_chapter_id ?? null,
  appearance: row.appearance,
  background: row.background,
  relations: row.relations,
  goal: row.goal,
  notes: row.notes,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapCharacterStage = (row) => ({
  id: row.id,
  characterId: row.character_id,
  name: row.name,
  period: row.period,
  chapterId: row.chapter_id ?? null,
  traits: row.traits,
  inner: row.inner,
  behavior: row.behavior,
  speech: row.speech,
  event: row.event,
  isCurrent: row.is_current === 1,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapCharacterSkill = (row) => ({
  id: row.id,
  characterId: row.character_id,
  name: row.name,
  level: row.level,
  description: row.description,
  chapterId: row.chapter_id ?? null,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapCharacterStatusLog = (row) => ({
  id: row.id,
  characterId: row.character_id,
  status: row.status,
  period: row.period,
  chapterId: row.chapter_id ?? null,
  note: row.note,
  createdAt: row.created_at
})

export const mapCharacterRelation = (row) => ({
  id: row.id,
  characterId: row.from_character_id,
  otherId: row.other_id ?? row.to_character_id,
  otherName: row.other_name ?? '',
  relation: row.relation,
  period: row.period,
  chapterId: row.chapter_id ?? null,
  note: row.note,
  createdAt: row.created_at
})

export const mapRevision = (row) => ({
  id: row.id,
  projectId: row.project_id,
  chapterId: row.chapter_id,
  blockId: row.block_id,
  targetId: row.target_id,
  scope: row.scope,
  instruction: row.instruction,
  originalText: row.original_text,
  revisedText: row.revised_text,
  modelName: row.model_name,
  createdAt: row.created_at
})

export const mapVersion = (row, withSnapshot = false) => ({
  id: row.id,
  projectId: row.project_id,
  targetType: row.target_type,
  targetId: row.target_id,
  label: row.label,
  source: row.source,
  createdAt: row.created_at,
  ...(withSnapshot ? { snapshot: JSON.parse(row.snapshot) } : {})
})

export const mapCardTemplate = (row) => ({
  id: row.id,
  projectId: row.project_id,
  kind: row.kind,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapCardField = (row) => ({
  id: row.id,
  templateId: row.template_id,
  label: row.label,
  fieldType: row.field_type,
  unit: row.unit,
  options: row.options,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapAttributeValue = (row) => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  fieldId: row.field_id,
  value: row.value,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapAttributeLog = (row) => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  fieldId: row.field_id,
  value: row.value,
  period: row.period,
  chapterId: row.chapter_id ?? null,
  note: row.note,
  createdAt: row.created_at
})

export const mapItem = (row) => ({
  id: row.id,
  projectId: row.project_id,
  name: row.name,
  category: row.category,
  rarity: row.rarity,
  origin: row.origin,
  reason: row.reason,
  debut: row.debut,
  background: row.background,
  notes: row.notes,
  status: row.status,
  currentHolder: row.current_holder,
  isDestroyed: row.is_destroyed === 1 || row.status === 'destroyed',
  destroyedBy: row.destroyed_by,
  destroyedAt: row.destroyed_at,
  sortOrder: row.sort_order,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapItemEvent = (row) => ({
  id: row.id,
  itemId: row.item_id,
  period: row.period,
  chapterId: row.chapter_id ?? null,
  holder: row.holder,
  status: row.status,
  destroyedBy: row.destroyed_by,
  note: row.note,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapModel = (row) => ({
  id: row.id,
  providerId: row.provider_id,
  name: row.name,
  displayName: row.display_name,
  temperature: row.temperature,
  maxTokens: row.max_tokens,
  isDefault: row.is_default === 1,
  sortOrder: row.sort_order
})

export const mapProvider = (row) => ({
  id: row.id,
  name: row.name,
  baseUrl: row.base_url,
  apiKey: row.api_key,
  apiType: row.api_type,
  extraHeaders: row.extra_headers,
  createdAt: row.created_at,
  updatedAt: row.updated_at
})

export const mapChatMessage = (row) => ({
  id: row.id,
  projectId: row.project_id,
  role: row.role,
  content: row.content,
  modelName: row.model_name,
  createdAt: row.created_at
})
