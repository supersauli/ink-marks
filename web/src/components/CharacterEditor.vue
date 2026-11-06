<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useChatStore } from '../stores/chat'
import type {
  CharacterField,
  CharacterSkill,
  CharacterStage,
  CharacterStageField,
  CharacterStatus
} from '../api/types'
import { formatTime, itemStatusLabels } from '../utils/format'
import AttributeCard from './AttributeCard.vue'

const novel = useNovelStore()
const chat = useChatStore()

type SectionKey = 'all' | 'profile' | 'attributes' | 'items' | 'skills' | 'status' | 'relations' | 'growth'

const SECTION_STORAGE_KEY = 'moji:character-section'

function readSectionCache(): Record<string, SectionKey> {
  try {
    const parsed = JSON.parse(localStorage.getItem(SECTION_STORAGE_KEY) ?? '{}')
    return typeof parsed === 'object' && parsed ? parsed : {}
  } catch {
    return {}
  }
}

// 模块级缓存：同一个角色在多个页签、多次切换之间保留上次选中的板块
const sectionCache = readSectionCache()

const activeSection = ref<SectionKey>(sectionCache[novel.activeCharacterId] ?? 'profile')

watch(activeSection, (value) => {
  const id = novel.activeCharacterId
  if (!id) return
  sectionCache[id] = value
  try {
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(sectionCache))
  } catch {
    /* 忽略存储失败 */
  }
})

watch(
  () => novel.activeCharacterId,
  (id) => {
    if (!id) return
    activeSection.value = sectionCache[id] ?? 'profile'
  }
)

const bodyRef = ref<HTMLDivElement | null>(null)

const sections: Array<{ key: SectionKey; label: string; icon: string }> = [
  { key: 'profile', label: '基本档案', icon: '◧' },
  { key: 'attributes', label: '属性卡', icon: '◈' },
  { key: 'items', label: '持有物品', icon: '▣' },
  { key: 'skills', label: '技能', icon: '✧' },
  { key: 'status', label: '状态', icon: '◉' },
  { key: 'relations', label: '关系网', icon: '⇄' },
  { key: 'growth', label: '性格成长', icon: '↗' },
  { key: 'all', label: '全部', icon: '▤' }
]

function switchSection(key: SectionKey) {
  activeSection.value = key
  void nextTick(() => {
    bodyRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
  })
}

function show(key: SectionKey) {
  return activeSection.value === 'all' || activeSection.value === key
}

const character = computed(() => novel.activeCharacter)
const currentStage = computed(
  () => character.value?.stages.find((stage) => stage.isCurrent) ?? character.value?.stages[0] ?? null
)

const heldItems = computed(() => {
  const name = character.value?.name?.trim()
  if (!name) return []
  return novel.items.filter((entry) => entry.currentHolder.trim() === name)
})

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function onCharacterInput(field: CharacterField, event: Event) {
  novel.editCharacterField(field, inputValue(event))
}

function onStageInput(stageId: string, field: CharacterStageField, event: Event) {
  novel.editStageField(stageId, field, inputValue(event))
}

function onStageChapter(stageId: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  novel.editStageField(stageId, 'chapterId', value || null)
}

async function openVersions() {
  const value = character.value
  if (!value) return
  await novel.flushAll()
  void novel.openVersions('character', value.id, value.name || '角色')
}

async function addStage() {
  const created = await novel.addCharacterStage()
  if (created) focusStage(created.id)
}

function removeStage(stage: CharacterStage) {
  if (!character.value) return
  if (character.value.stages.length <= 1) {
    window.alert('至少要保留一个性格阶段。可以清空这个阶段的内容，而不是删除它。')
    return
  }
  if (!window.confirm(`删除阶段「${stage.name || '未命名'}」？这一阶段的设定会从角色中移除。`)) return
  void novel.deleteCharacterStage(stage.id)
}

async function removeCharacter() {
  const value = character.value
  if (!value) return
  if (!window.confirm(`删除角色「${value.name || '未命名'}」？其所有性格阶段会一并删除，无法恢复。`)) return
  await novel.deleteCharacter(value.id)
}

function focusStage(stageId: string) {
  void nextTick(() => {
    const element = document.querySelector(`[data-stage-id="${stageId}"]`)
    if (element instanceof HTMLElement) element.scrollIntoView({ behavior: 'smooth', block: 'center' })
  })
}

function discussCharacter() {
  const value = character.value
  if (!value) return
  const stage = currentStage.value
  const lines = [
    `我们在写小说《${novel.project?.name ?? ''}》，想讨论角色「${value.name || '未命名'}」${value.role ? `（${value.role}）` : ''}。`,
    value.goal ? `目标：${value.goal}` : '',
    stage
      ? `当前阶段：${stage.name}${stage.period ? `（${stage.period}）` : ''}\n性格：${stage.traits || '（未填写）'}\n内心动机：${stage.inner || '（未填写）'}`
      : '',
    '请帮我检查这个角色在当前阶段的行为是否自洽，并给出 2-3 个能推动他/她成长的剧情节点。'
  ]
  chat.draft = lines.filter(Boolean).join('\n')
  chat.open = true
}

function discussStage(stage: CharacterStage, index: number) {
  const value = character.value
  if (!value) return
  const previous = character.value?.stages[index - 1]
  const lines = [
    `我们在写小说《${novel.project?.name ?? ''}》，想讨论角色「${value.name || '未命名'}」的性格成长。`,
    previous
      ? `上一阶段「${previous.name}」：${previous.traits || '（未填写）'}`
      : '这是角色的第一个阶段，还没有前一阶段。',
    `这一阶段「${stage.name}」${stage.period ? `（${stage.period}）` : ''}：\n性格：${stage.traits || '（未填写）'}\n内心动机：${stage.inner || '（未填写）'}\n关键事件：${stage.event || '（未填写）'}`,
    '请判断从上一阶段到这一阶段的转变是否可信，并建议一个能体现这种转变的具体场景。'
  ]
  chat.draft = lines.join('\n')
  chat.open = true
}

// ---------------------------------------------------------------------------
// 性别 / 登场 / 技能 / 状态 / 关系网
// ---------------------------------------------------------------------------
const GENDERS = ['男', '女', '其他']

const statusLabels: Record<string, string> = {
  alive: '存活',
  dead: '死亡',
  missing: '失踪',
  unknown: '未知'
}

const STATUS_OPTIONS: Array<{ value: CharacterStatus; label: string }> = [
  { value: 'alive', label: '存活' },
  { value: 'dead', label: '死亡' },
  { value: 'missing', label: '失踪' },
  { value: 'unknown', label: '未知' }
]

const RELATION_OPTIONS = ['陌生', '认识', '友善', '合作', '亲密', '对立', '敌对', '亲情', '爱情', '师徒', '利用', '其他']

const statusDraft = reactive({ status: 'alive' as CharacterStatus, period: '', chapterId: '', note: '' })
const relationDraft = reactive({ otherId: '', relation: '陌生', chapterId: '', note: '' })

const otherCharacters = computed(() => novel.characters.filter((entry) => entry.id !== character.value?.id))
const relationMap = computed(
  () => new Map((character.value?.relationships ?? []).map((entry) => [entry.otherId, entry]))
)
const statusLogsDesc = computed(() => [...(character.value?.statusLogs ?? [])].reverse())
const currentStatusLabel = computed(() => statusLabels[character.value?.currentStatus ?? 'alive'] ?? '存活')

watch(
  otherCharacters,
  (list) => {
    if (!list.some((entry) => entry.id === relationDraft.otherId)) relationDraft.otherId = list[0]?.id ?? ''
  },
  { immediate: true }
)

function chapterTitle(chapterId: string | null | undefined) {
  if (!chapterId) return ''
  return novel.chapters.find((entry) => entry.id === chapterId)?.title ?? ''
}

function onDebutChapter(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  novel.editCharacterField('debutChapterId', value || null)
}

function onGender(event: Event) {
  novel.editCharacterField('gender', (event.target as HTMLSelectElement).value)
}

function onSkillInput(skillId: string, field: 'name' | 'level' | 'description', event: Event) {
  novel.editSkillField(skillId, field, inputValue(event))
}

function onSkillChapter(skillId: string, event: Event) {
  const value = (event.target as HTMLSelectElement).value
  novel.editSkillField(skillId, 'chapterId', value || null)
}

function relationOf(otherId: string) {
  return relationMap.value.get(otherId) ?? null
}

function isProtagonist(role: string) {
  return role.includes('主角')
}

async function submitStatus() {
  const ok = await novel.addCharacterStatusLog({
    status: statusDraft.status,
    chapterId: statusDraft.chapterId || null,
    period: statusDraft.period,
    note: statusDraft.note
  })
  if (!ok) return
  statusDraft.period = ''
  statusDraft.chapterId = ''
  statusDraft.note = ''
}

async function submitRelation() {
  if (!relationDraft.otherId) return
  const ok = await novel.addCharacterRelation({
    otherId: relationDraft.otherId,
    relation: relationDraft.relation,
    chapterId: relationDraft.chapterId || null,
    note: relationDraft.note
  })
  if (!ok) return
  relationDraft.chapterId = ''
  relationDraft.note = ''
}

function removeSkill(skill: CharacterSkill) {
  if (!window.confirm(`删除技能「${skill.name || '未命名'}」？`)) return
  void novel.deleteCharacterSkill(skill.id)
}
</script>

<template>
  <div v-if="character" class="character-editor">
    <header class="character-head">
      <div class="crumbs">
        <span>{{ novel.project?.name }}</span>
        <span class="crumb-sep">/</span>
        <span class="crumb-muted">角色设定</span>
      </div>

      <div class="title-row">
        <input
          class="title-input"
          :value="character.name"
          placeholder="角色姓名"
          @input="onCharacterInput('name', $event)"
        />
        <div class="head-actions">
          <button class="btn btn-sm" title="让 AI 一起讨论这个角色" @click="discussCharacter">✦ AI 讨论</button>
          <button class="btn btn-sm" title="查看并恢复角色设定历史" @click="openVersions">历史版本</button>
          <button class="btn btn-sm btn-danger" @click="removeCharacter">删除</button>
        </div>
      </div>

      <div class="meta-row">
        <label class="meta-field">
          <span>定位</span>
          <input :value="character.role" placeholder="主角 / 反派 / 配角…" @input="onCharacterInput('role', $event)" />
        </label>
        <label class="meta-field">
          <span>别名</span>
          <input :value="character.alias" placeholder="别人怎么称呼他/她" @input="onCharacterInput('alias', $event)" />
        </label>
        <label class="meta-field">
          <span>性别</span>
          <select :value="character.gender" @change="onGender">
            <option value="">未设定</option>
            <option v-for="gender in GENDERS" :key="gender" :value="gender">{{ gender }}</option>
          </select>
        </label>
        <label class="meta-field">
          <span>年龄</span>
          <input :value="character.age" placeholder="如 29 岁" @input="onCharacterInput('age', $event)" />
        </label>
        <span v-if="character.updatedAt" class="meta-time">更新于 {{ formatTime(character.updatedAt) }}</span>
      </div>

      <nav class="section-tabs">
        <button
          v-for="entry in sections"
          :key="entry.key"
          class="section-tab"
          :class="{ active: activeSection === entry.key }"
          @click="switchSection(entry.key)"
        >
          <span class="tab-icon">{{ entry.icon }}</span>
          <span>{{ entry.label }}</span>
          <span v-if="entry.key === 'items'" class="tab-count">{{ heldItems.length }}</span>
          <span v-if="entry.key === 'skills'" class="tab-count">{{ character.skills.length }}</span>
          <span v-if="entry.key === 'relations'" class="tab-count">{{ otherCharacters.length }}</span>
          <span v-if="entry.key === 'growth'" class="tab-count">{{ character.stages.length }}</span>
        </button>
      </nav>
    </header>

    <div ref="bodyRef" class="character-body scroll-y">
      <div class="article">
        <section v-if="show('profile')" class="basic-section">
          <div class="section-bar">
            <span class="section-title">基本档案</span>
            <span class="section-hint">不会随剧情变化的客观信息</span>
          </div>
          <div class="basic-grid">
            <label class="field">
              <span class="field-label">登场时间 / 描述</span>
              <input
                class="field-input"
                :value="character.debut"
                placeholder="如「第一章 雨夜来信」或「十年前」"
                @input="onCharacterInput('debut', $event)"
              />
            </label>
            <label class="field">
              <span class="field-label">登场章节</span>
              <select class="field-input" :value="character.debutChapterId ?? ''" @change="onDebutChapter">
                <option value="">未指定（视为第一章在场）</option>
                <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                  {{ chapter.title }}
                </option>
              </select>
            </label>
            <label class="field field-wide">
              <span class="field-label">外貌与习惯</span>
              <textarea
                class="field-input"
                rows="3"
                :value="character.appearance"
                placeholder="外形、穿着、习惯性动作、说话时的体态……"
                @input="onCharacterInput('appearance', $event)"
              />
            </label>
            <label class="field field-wide">
              <span class="field-label">背景经历</span>
              <textarea
                class="field-input"
                rows="4"
                :value="character.background"
                placeholder="出身、关键经历、目前处境……"
                @input="onCharacterInput('background', $event)"
              />
            </label>
            <label class="field">
              <span class="field-label">人物关系</span>
              <textarea
                class="field-input"
                rows="4"
                :value="character.relations"
                placeholder="与谁亲近、与谁对立，彼此欠着什么"
                @input="onCharacterInput('relations', $event)"
              />
            </label>
            <label class="field">
              <span class="field-label">核心目标</span>
              <textarea
                class="field-input"
                rows="4"
                :value="character.goal"
                placeholder="他/她最想要什么？愿意为此付出什么代价？"
                @input="onCharacterInput('goal', $event)"
              />
            </label>
            <label class="field field-wide">
              <span class="field-label">补充备注</span>
              <textarea
                class="field-input"
                rows="3"
                :value="character.notes"
                placeholder="口癖、禁忌、写作时需要注意的点……"
                @input="onCharacterInput('notes', $event)"
              />
            </label>
          </div>
        </section>

        <AttributeCard v-if="show('attributes')" kind="character" :template="novel.characterTemplate" />

        <section v-if="show('items')" class="held-section">
          <div class="section-bar">
            <span class="section-title">当前持有物品</span>
            <span class="section-hint">按物品的「当前持有人」自动汇总，点击可打开物品页</span>
            <span class="held-count">{{ heldItems.length }} 件</span>
          </div>
          <div v-if="!heldItems.length" class="held-empty">
            没有登记在这个角色名下的物品。到「物品」页把「当前持有人」写成「{{ character.name || '角色名' }}」即可自动出现在这里。
          </div>
          <div v-else class="held-list">
            <button
              v-for="entry in heldItems"
              :key="entry.id"
              class="held-item"
              :data-status="entry.status"
              @click="novel.selectItem(entry.id)"
            >
              <span class="held-icon">▣</span>
              <span class="held-main">
                <span class="held-name">{{ entry.name || '未命名物品' }}</span>
                <span class="held-meta">
                  {{ entry.category || '物品' }} · {{ itemStatusLabels[entry.status] || entry.status }}
                </span>
              </span>
            </button>
          </div>
        </section>

        <section v-if="show('status')" class="status-section">
          <div class="section-bar">
            <span class="section-title">人物状态</span>
            <span class="section-hint">存活 / 死亡 / 失踪等状态按章节记录，人物总览会据此回溯</span>
            <span class="status-current" :data-status="character.currentStatus">{{ currentStatusLabel }}</span>
          </div>

          <div class="summary-chips">
            <span>性别：{{ character.gender || '未设定' }}</span>
            <span>年龄：{{ character.age || '未设定' }}</span>
            <span>
              登场：{{ chapterTitle(character.debutChapterId) || character.debut || '第一章' }}
            </span>
          </div>

          <div class="status-form">
            <label class="field">
              <span class="field-label">变化后的状态</span>
              <select v-model="statusDraft.status" class="field-input">
                <option v-for="option in STATUS_OPTIONS" :key="option.value" :value="option.value">
                  {{ option.label }}
                </option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">关联章节</span>
              <select v-model="statusDraft.chapterId" class="field-input">
                <option value="">不关联章节</option>
                <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                  {{ chapter.title }}
                </option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">时间 / 章节描述</span>
              <input v-model="statusDraft.period" class="field-input" placeholder="如「第一章 雨夜」" />
            </label>
            <label class="field">
              <span class="field-label">原因 / 说明</span>
              <input v-model="statusDraft.note" class="field-input" placeholder="死亡原因、失踪经过……" />
            </label>
            <div class="form-actions">
              <button class="btn btn-sm btn-primary-ghost" @click="submitStatus">记录状态变化</button>
            </div>
          </div>

          <div v-if="!character.statusLogs.length" class="empty-hint">
            还没有状态记录，默认视为「存活」。
          </div>
          <div v-else class="status-log-list">
            <div v-for="log in statusLogsDesc" :key="log.id" class="status-log" :data-status="log.status">
              <span class="status-badge" :data-status="log.status">
                {{ statusLabels[log.status] || log.status }}
              </span>
              <span class="log-meta">
                {{ chapterTitle(log.chapterId) || log.period || '未指定时间' }}
              </span>
              <span class="log-note">{{ log.note }}</span>
              <button class="mini-action danger" title="删除状态记录" @click="novel.deleteCharacterStatusLog(log.id)">
                ✕
              </button>
            </div>
          </div>
        </section>

        <section v-if="show('skills')" class="skill-section">
          <div class="section-bar">
            <span class="section-title">技能</span>
            <span class="section-hint">可以记录能力、熟练度和获得章节</span>
            <button class="btn btn-sm btn-primary-ghost" @click="novel.addCharacterSkill">＋ 添加技能</button>
          </div>

          <div v-if="!character.skills.length" class="empty-hint">
            还没有技能。添加后可以写明等级、效果和限制。
          </div>
          <div v-else class="skill-list">
            <article v-for="skill in character.skills" :key="skill.id" class="skill-card">
              <div class="skill-head">
                <input
                  class="field-input skill-name"
                  :value="skill.name"
                  placeholder="技能名称"
                  @input="onSkillInput(skill.id, 'name', $event)"
                />
                <input
                  class="field-input skill-level"
                  :value="skill.level"
                  placeholder="等级 / 熟练度"
                  @input="onSkillInput(skill.id, 'level', $event)"
                />
                <select
                  class="field-input skill-chapter"
                  :value="skill.chapterId ?? ''"
                  @change="onSkillChapter(skill.id, $event)"
                >
                  <option value="">未指定获得章节</option>
                  <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                    {{ chapter.title }}
                  </option>
                </select>
                <button class="mini-action danger" title="删除技能" @click="removeSkill(skill)">✕</button>
              </div>
              <textarea
                class="field-input"
                rows="2"
                :value="skill.description"
                placeholder="技能效果、使用限制、代价……"
                @input="onSkillInput(skill.id, 'description', $event)"
              />
            </article>
          </div>
        </section>

        <section v-if="show('relations')" class="relation-section">
          <div class="section-bar">
            <span class="section-title">关系网</span>
            <span class="section-hint">与所有其他角色的关系，可以按章节记录变化</span>
            <span class="held-count">{{ otherCharacters.length }} 人</span>
          </div>

          <div v-if="!otherCharacters.length" class="empty-hint">
            还没有其他角色。先创建更多人物，才能建立关系网。
          </div>
          <div v-else class="relation-form">
            <label class="field">
              <span class="field-label">对方角色</span>
              <select v-model="relationDraft.otherId" class="field-input">
                <option v-for="other in otherCharacters" :key="other.id" :value="other.id">
                  {{ other.name || '未命名角色' }}{{ isProtagonist(other.role) ? '（主角）' : '' }}
                </option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">关系</span>
              <select v-model="relationDraft.relation" class="field-input">
                <option v-for="option in RELATION_OPTIONS" :key="option" :value="option">{{ option }}</option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">从哪一章开始</span>
              <select v-model="relationDraft.chapterId" class="field-input">
                <option value="">不关联章节</option>
                <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                  {{ chapter.title }}
                </option>
              </select>
            </label>
            <label class="field">
              <span class="field-label">变化原因 / 备注</span>
              <input v-model="relationDraft.note" class="field-input" placeholder="为什么关系会变成这样？" />
            </label>
            <div class="form-actions">
              <button class="btn btn-sm btn-primary-ghost" @click="submitRelation">记录变化</button>
            </div>
          </div>

          <div class="relation-list">
            <div v-for="other in otherCharacters" :key="other.id" class="relation-row">
              <span class="relation-name">
                {{ other.name || '未命名角色' }}
                <span v-if="isProtagonist(other.role)" class="protagonist-badge">主角</span>
              </span>
              <span class="relation-value" :data-relation="relationOf(other.id)?.relation || '陌生'">
                {{ relationOf(other.id)?.relation || '陌生' }}
              </span>
              <span class="relation-meta">
                {{
                  relationOf(other.id)
                    ? chapterTitle(relationOf(other.id)?.chapterId) || relationOf(other.id)?.period || '已记录'
                    : '尚未记录'
                }}
              </span>
              <span class="relation-note-text">{{ relationOf(other.id)?.note }}</span>
            </div>
          </div>
        </section>

        <section v-if="show('growth')" class="stage-section">
          <div class="section-bar">
            <span class="section-title">性格成长线</span>
            <span class="section-hint">同一个角色，在不同时期可以有不同的性格</span>
            <button class="btn btn-sm btn-primary-ghost" @click="addStage">＋ 添加阶段</button>
          </div>

          <p class="stage-tip">
            每个阶段写一段「这个时期的他/她」。用「生效范围」标出它对应的时间或章节（例如「第 1-5 章」「十年前」「归来后」）。
          </p>

          <div v-if="character.stages.length > 1" class="timeline">
            <button
              v-for="(stage, index) in character.stages"
              :key="`timeline-${stage.id}`"
              class="timeline-node"
              :class="{ current: stage.isCurrent }"
              @click="focusStage(stage.id)"
            >
              <span class="timeline-index">{{ index + 1 }}</span>
              <span class="timeline-name">{{ stage.name || '未命名阶段' }}</span>
              <span v-if="stage.period" class="timeline-period">{{ stage.period }}</span>
              <span class="timeline-arrow">→</span>
            </button>
          </div>

          <div v-if="!character.stages.length" class="stage-empty">
            还没有性格阶段。
            <button class="link-btn" @click="addStage">添加第一个阶段</button>
          </div>

          <article
            v-for="(stage, index) in character.stages"
            :key="stage.id"
            class="stage-card"
            :class="{ 'is-current': stage.isCurrent }"
            :data-stage-id="stage.id"
          >
            <header class="stage-head">
              <span class="stage-index">{{ index + 1 }}</span>
              <input
                class="stage-name"
                :value="stage.name"
                placeholder="阶段名，如「少年时期」"
                @input="onStageInput(stage.id, 'name', $event)"
              />
              <input
                class="stage-period"
                :value="stage.period"
                placeholder="生效范围，如「第 1-5 章」"
                @input="onStageInput(stage.id, 'period', $event)"
              />
              <select
                class="stage-chapter"
                :value="stage.chapterId ?? ''"
                title="关联网到具体章节后，人物总览会从这一章开始显示该阶段"
                @change="onStageChapter(stage.id, $event)"
              >
                <option value="">不关联章节</option>
                <option v-for="chapter in novel.chapters" :key="chapter.id" :value="chapter.id">
                  {{ chapter.title }}
                </option>
              </select>
              <span v-if="stage.isCurrent" class="current-badge">当前阶段</span>
              <button
                v-else
                class="btn btn-sm btn-ghost"
                title="AI 对话与生成会默认采用这个阶段"
                @click="novel.setCurrentCharacterStage(stage.id)"
              >
                设为当前
              </button>
              <button class="mini-action" title="和 AI 讨论这个阶段的转变" @click="discussStage(stage, index)">
                ✦
              </button>
              <button class="mini-action danger" title="删除阶段" @click="removeStage(stage)">✕</button>
            </header>

            <div class="stage-grid">
              <label class="field">
                <span class="field-label">性格特点</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="stage.traits"
                  placeholder="这个时期他/她是什么样的人？优点、缺点、矛盾之处"
                  @input="onStageInput(stage.id, 'traits', $event)"
                />
              </label>
              <label class="field">
                <span class="field-label">内心动机</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="stage.inner"
                  placeholder="他/她真正想要什么？害怕什么？不肯承认什么？"
                  @input="onStageInput(stage.id, 'inner', $event)"
                />
              </label>
              <label class="field">
                <span class="field-label">行为表现</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="stage.behavior"
                  placeholder="遇到事情时会怎么做？有哪些小动作？"
                  @input="onStageInput(stage.id, 'behavior', $event)"
                />
              </label>
              <label class="field">
                <span class="field-label">语言习惯</span>
                <textarea
                  class="field-input"
                  rows="3"
                  :value="stage.speech"
                  placeholder="说话长短、口癖、生气或示弱时的语气"
                  @input="onStageInput(stage.id, 'speech', $event)"
                />
              </label>
              <label class="field field-wide">
                <span class="field-label">关键事件 / 转折点</span>
                <textarea
                  class="field-input"
                  rows="2"
                  :value="stage.event"
                  placeholder="是什么让这个阶段开始？又是什么让它结束？"
                  @input="onStageInput(stage.id, 'event', $event)"
                />
              </label>
            </div>
          </article>
        </section>
      </div>
    </div>
  </div>
</template>

<style scoped>
.character-editor {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  background: var(--surface);
}

.character-head {
  padding: 16px clamp(20px, 4vw, 48px) 0;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  flex: 0 0 auto;
}

.crumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
.crumb-sep {
  font-size: 10px;
}
.crumb-muted {
  color: var(--muted);
}

.title-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.title-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  outline: none;
  padding: 2px 0;
  font-family: var(--font-serif);
  font-size: 24px;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--ink);
  border-bottom: 1px solid transparent;
}
.title-input:focus {
  border-bottom-color: var(--border);
}
.head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.meta-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px 18px;
  margin-top: 12px;
  padding-bottom: 10px;
}
.meta-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--muted);
}
.meta-field input,
.meta-field select {
  width: 130px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  outline: none;
  font-size: 12px;
  color: var(--ink-soft);
}
.meta-field select {
  width: 92px;
  cursor: pointer;
}
.meta-field input:focus,
.meta-field select:focus {
  border-color: var(--accent);
}
.meta-time {
  margin-left: auto;
  font-size: 11px;
  color: var(--muted);
}

.section-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  padding: 2px 0 0;
}
.section-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-size: 12px;
  color: var(--muted);
  transition: color 0.14s ease, border-color 0.14s ease;
}
.section-tab:hover {
  color: var(--accent);
}
.section-tab.active {
  border-bottom-color: var(--accent);
  color: var(--accent);
  font-weight: 600;
}
.tab-icon {
  font-size: 11px;
}
.tab-count {
  padding: 0 5px;
  border-radius: 8px;
  background: var(--surface-3);
  font-size: 10px;
  color: var(--muted);
}
.section-tab.active .tab-count {
  background: var(--accent-soft);
  color: var(--accent);
}

.character-body {
  flex: 1;
  min-height: 0;
}
.article {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px clamp(20px, 4vw, 48px) 60px;
}

.section-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}
.section-title {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ink-soft);
}
.section-hint {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--muted);
}

.basic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.field-wide {
  grid-column: 1 / -1;
}
.field-label {
  font-size: 11.5px;
  color: var(--muted);
}
.field-input {
  width: 100%;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  outline: none;
  resize: vertical;
  font-size: 13px;
  line-height: 1.75;
  color: var(--ink-soft);
}
.field-input:focus {
  border-color: var(--accent);
  background: var(--surface);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.held-section {
  margin-top: 26px;
  padding-top: 20px;
  border-top: 1px dashed var(--border);
}
.held-count {
  font-size: 10.5px;
  color: var(--muted);
}
.held-empty {
  padding: 12px 14px;
  border: 1px dashed var(--border);
  border-radius: 9px;
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
}
.held-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.held-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 180px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface-2);
  text-align: left;
  transition: border-color 0.14s ease, background 0.14s ease;
}
.held-item:hover {
  border-color: var(--accent);
  background: var(--surface);
}
.held-icon {
  flex: 0 0 auto;
  font-size: 12px;
  color: var(--accent-2);
}
.held-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.held-name {
  font-size: 12.5px;
  color: var(--ink-soft);
}
.held-meta {
  font-size: 10.5px;
  color: var(--muted);
}

.stage-section {
  margin-top: 30px;
  padding-top: 22px;
  border-top: 1px dashed var(--border);
}
.btn-primary-ghost {
  border-color: var(--accent);
  color: var(--accent);
  background: var(--accent-soft);
}
.btn-primary-ghost:hover {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}

.stage-tip {
  margin: 0 0 14px;
  padding: 10px 13px;
  border-left: 3px solid var(--accent-2);
  border-radius: 0 8px 8px 0;
  background: var(--accent-2-soft);
  font-size: 11.5px;
  line-height: 1.8;
  color: var(--muted);
}

.timeline {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 14px;
}
.timeline-node {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-2);
  color: var(--ink-soft);
  font-size: 11px;
}
.timeline-node:hover {
  border-color: var(--accent);
  color: var(--accent);
}
.timeline-node.current {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}
.timeline-index {
  font-size: 10px;
  color: var(--muted);
}
.timeline-period {
  font-size: 10px;
  color: var(--muted);
}
.timeline-arrow {
  margin-left: 3px;
  color: var(--border-strong);
}
.timeline-node:last-child .timeline-arrow {
  display: none;
}

.stage-card {
  margin-bottom: 14px;
  padding: 12px 14px 14px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}
.stage-card.is-current {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
  background: var(--surface);
}
.stage-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.stage-index {
  flex: 0 0 20px;
  width: 20px;
  height: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--surface-3);
  font-size: 10.5px;
  color: var(--muted);
}
.stage-card.is-current .stage-index {
  background: var(--accent);
  color: #fff;
}
.stage-name {
  flex: 0 1 190px;
  min-width: 90px;
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  outline: none;
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}
.stage-name:focus {
  border-color: var(--accent);
}
.stage-period {
  flex: 1 1 220px;
  min-width: 120px;
  height: 30px;
  padding: 0 9px;
  border: 1px dashed var(--border-strong);
  border-radius: 7px;
  background: transparent;
  outline: none;
  font-size: 11.5px;
  color: var(--ink-soft);
}
.stage-period:focus {
  border-style: solid;
  border-color: var(--accent);
  background: var(--surface);
}
.stage-chapter {
  flex: 0 1 170px;
  min-width: 110px;
  height: 30px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  outline: none;
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
}
.stage-chapter:focus {
  border-color: var(--accent);
}
.current-badge {
  flex: 0 0 auto;
  padding: 2px 7px;
  border-radius: 5px;
  background: var(--accent);
  color: #fff;
  font-size: 10.5px;
}
.mini-action {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font-size: 12px;
}
.mini-action:hover {
  background: var(--surface);
  color: var(--accent);
}
.mini-action.danger:hover {
  color: var(--danger);
}

.stage-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.stage-empty {
  padding: 14px;
  font-size: 12px;
  color: var(--muted);
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 12px;
}
.link-btn:hover {
  text-decoration: underline;
}

@media (max-width: 860px) {
  .basic-grid,
  .stage-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .meta-time {
    display: none;
  }
  .stage-head {
    flex-wrap: wrap;
  }
}
</style>
