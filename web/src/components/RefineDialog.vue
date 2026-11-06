<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import { useSettingsStore } from '../stores/settings'
import { streamChat } from '../api/client'
import type { Block, RefineTarget } from '../api/types'
import {
  buildBlockMessages,
  buildChapterSummaryMessages,
  buildContinueMessages,
  buildOutlineMessages,
  buildSnippetMessages,
  type PromptMessage,
  type WritingContext
} from '../utils/prompts'
import { buildCharacterContext } from '../utils/characterContext'
import { buildContextSections, buildStableContextSections, type ContextSection } from '../utils/contextSections'
import ContextInspector from './ContextInspector.vue'
import DiffView from './DiffView.vue'
import ModelSelect from './ModelSelect.vue'

const novel = useNovelStore()
const settings = useSettingsStore()

const target = computed(() => novel.refineTarget)
const chapter = computed(() => novel.chapter)
const kind = computed(() => target.value?.kind ?? '')
const hasStyleGuide = computed(() => Boolean(novel.project?.styleGuide?.trim()))

const instruction = ref('')
const usedInstruction = ref('')
const singleResult = ref('')
const results = ref<string[]>([])
const running = ref(false)
const applying = ref(false)
const error = ref('')
const progress = ref('')
interface RefineOptionValues {
  includeStyle: boolean
  includeOutline: boolean
  includeCharacters: boolean
  includeSummary: boolean
  includeBefore: boolean
  keepInstruction: boolean
  includeAttributes: boolean
  includeSkills: boolean
  includeItems: boolean
}

const DEFAULT_OPTIONS: RefineOptionValues = {
  includeStyle: true,
  includeOutline: true,
  includeCharacters: true,
  includeSummary: true,
  includeBefore: true,
  keepInstruction: true,
  // 角色设定里更细的三项：打斗时打开，日常可以关掉
  includeAttributes: true,
  includeSkills: true,
  includeItems: true
}

const options = reactive<RefineOptionValues>({ ...DEFAULT_OPTIONS })

// 勾选状态按「作品 → 章节 → 场景」记住：本章单独改过的用本章的，
// 换到新章沿用最近一次设置，省得每章都重勾一遍。和主题 / 每页章数一样存浏览器本地。
const OPTION_KEYS = Object.keys(DEFAULT_OPTIONS) as (keyof RefineOptionValues)[]
const OPTION_STORAGE_PREFIX = 'moji:refine-options:'
const optionSource = ref<'chapter' | 'scene' | 'default'>('default')
const sceneLabels: Record<string, string> = {
  snippet: '选中文字',
  blocks: '段落精修',
  'chapter-summary': '章节大纲',
  outline: '大纲',
  append: '续写'
}
const optionSourceLabel = computed(() => {
  const scene = sceneLabels[kind.value] ?? '当前场景'
  if (optionSource.value === 'chapter') return `本章 · ${scene} 的勾选已记住`
  if (optionSource.value === 'scene') return '沿用上次设置（本章还没单独改过）'
  return '默认全选，改动后会自动记住'
})

function optionStorageKey() {
  return `${OPTION_STORAGE_PREFIX}${novel.project?.id ?? 'default'}`
}
function readOptionRecords(): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(optionStorageKey())
    const parsed: unknown = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  } catch {
    return {}
  }
}
function writeOptionRecords(records: Record<string, unknown>) {
  try {
    localStorage.setItem(optionStorageKey(), JSON.stringify(records))
  } catch {
    /* 隐私模式 / 存储被禁用时忽略，不影响使用 */
  }
}
function sanitizeOptions(saved: unknown): Partial<RefineOptionValues> {
  const result: Partial<RefineOptionValues> = {}
  if (!saved || typeof saved !== 'object') return result
  const record = saved as Record<string, unknown>
  for (const key of OPTION_KEYS) {
    if (typeof record[key] === 'boolean') result[key] = record[key] as boolean
  }
  return result
}
function optionRecordKeys(value: RefineTarget) {
  const scene = `scene:${value.kind}`
  const chapterId = 'chapterId' in value ? value.chapterId : null
  return { scene, chapter: chapterId ? `chapter:${chapterId}:${value.kind}` : null }
}
function loadOptions(value: RefineTarget): RefineOptionValues {
  const records = readOptionRecords()
  const keys = optionRecordKeys(value)
  const hasChapter = Boolean(keys.chapter && records[keys.chapter])
  optionSource.value = hasChapter ? 'chapter' : records[keys.scene] ? 'scene' : 'default'
  return {
    ...DEFAULT_OPTIONS,
    ...sanitizeOptions(records[keys.scene]),
    ...(hasChapter ? sanitizeOptions(records[keys.chapter!]) : {})
  }
}
function persistOptions(value: RefineTarget) {
  const records = readOptionRecords()
  const keys = optionRecordKeys(value)
  const snapshot: RefineOptionValues = { ...options }
  records[keys.scene] = snapshot
  if (keys.chapter) records[keys.chapter] = snapshot
  writeOptionRecords(records)
}
let pausePersist = false
function resetOptions() {
  const value = target.value
  pausePersist = true
  Object.assign(options, DEFAULT_OPTIONS)
  if (value) {
    const records = readOptionRecords()
    const keys = optionRecordKeys(value)
    delete records[keys.scene]
    if (keys.chapter) delete records[keys.chapter]
    writeOptionRecords(records)
    optionSource.value = 'default'
  }
  nextTick(() => {
    pausePersist = false
  })
}
watch(
  options,
  () => {
    if (pausePersist || !target.value) return
    persistOptions(target.value)
    optionSource.value = optionRecordKeys(target.value).chapter ? 'chapter' : 'scene'
  },
  { deep: true }
)

let controller: AbortController | null = null
const instructionRef = ref<HTMLTextAreaElement | null>(null)
// 右侧上下文栏：默认展开，可收起，和修改预览并排显示
const contextOpen = ref(true)

// 角色设定按「当前章节」解析：只看该章已登场的角色，每人取该章生效的阶段
const contextChapterId = computed(() => (kind.value === 'outline' ? null : chapter.value?.id ?? null))
const characterContext = computed(() =>
  buildCharacterContext(novel.characters, novel.chapters, contextChapterId.value, {
    maxLength: 6000,
    overview: novel.overview,
    includeAttributes: options.includeAttributes,
    includeSkills: options.includeSkills,
    includeItems: options.includeItems
  })
)

// 全部子开关都打开时的角色设定，只用于「未勾选」页签里预览「勾上会发什么」
const fullCharacterContext = computed(() =>
  buildCharacterContext(novel.characters, novel.chapters, contextChapterId.value, {
    maxLength: 6000,
    overview: novel.overview,
    includeAttributes: true,
    includeSkills: true,
    includeItems: true
  })
)

watch(target, (value) => {
  if (value) void novel.ensureOverview()
})

// 每个场景可能出现的页签，顺序固定；取消勾选只置灰，不删除
const APPLICABLE_KEYS: Record<string, string[]> = {
  snippet: ['style', 'outline', 'characters', 'summary', 'before', 'after', 'instruction'],
  blocks: ['style', 'outline', 'characters', 'summary', 'before', 'after', 'instruction'],
  'chapter-summary': ['style', 'outline', 'characters', 'summary', 'instruction'],
  outline: ['style', 'outline', 'characters', 'instruction'],
  append: ['style', 'outline', 'characters', 'summary', 'before', 'instruction']
}

// 页签位置固定，勾了什么只是变亮/变灰，选中项不会因为取消勾选而跳走
const contextSections = computed<ContextSection[]>(() => {
  const value = target.value
  if (!value) return []
  const actual = writingContext(value)
  const enabledKeys = buildContextSections(actual).map((section) => section.key)
  const instructionText = (usedInstruction.value || instruction.value.trim() || defaultInstructionFor(value)).trim()
  if (options.keepInstruction) enabledKeys.push('instruction')
  return buildStableContextSections({
    keys: APPLICABLE_KEYS[value.kind] ?? APPLICABLE_KEYS.outline,
    actual,
    full: writingContext(value, true),
    enabledKeys,
    instruction: {
      text: instructionText,
      hint: '这段要求始终会发给 AI；「在段落上保留修改要求」只决定应用后是否把它写进段落下方与本章「修改记录」。'
    },
    reasons: {
      instruction: '未勾选「在段落上保留修改要求」：要求仍会发给 AI，只是应用后不留痕。'
    }
  })
})

// 计数只算真正会发送的段，灰色页签不计字数
const enabledCount = computed(() => contextSections.value.filter((section) => section.enabled !== false).length)

function defaultInstructionFor(value: RefineTarget): string {
  switch (value.kind) {
    case 'snippet':
      return '润色这段文字，让表达更精炼、更有画面感，但不要改变原意。'
    case 'blocks':
      return '润色选中的段落，保持情节与人物不变，让语言更自然、更有节奏。'
    case 'chapter-summary':
      return '根据全书大纲，写出一版具体、有悬念的章节大纲。'
    case 'outline':
      return '扩写并梳理这条大纲，让设定更具体，补充可以执行的细节。'
    case 'append':
      return '顺着当前情节续写 3 个自然段，保持原有文风，并在结尾留下悬念。'
    default:
      return ''
  }
}

const presets = computed(() => {
  const value = target.value
  if (!value) return []
  if (value.kind === 'snippet' || value.kind === 'blocks') {
    return ['润色文字，更流畅自然', '增强画面感与细节', '更口语化一些', '压缩到原来一半', '增加悬念与紧张感', '修正语病与标点']
  }
  if (value.kind === 'chapter-summary') {
    return ['写得更具体，补充场景与冲突', '加强本章结尾的悬念', '压缩到 300 字以内', '增加人物关系的张力']
  }
  if (value.kind === 'outline') {
    return ['扩写得更具体', '梳理条理，分点说明', '补全逻辑漏洞', '精简到要点']
  }
  if (value.kind === 'append') {
    return ['续写 3 段，保持文风', '推进到下一个冲突点', '写一段人物内心独白', '以悬念收尾']
  }
  return []
})

const targetBlocks = computed<Block[]>(() => {
  const value = target.value
  if (!value) return []
  if (value.kind === 'snippet') {
    const block = novel.findBlock(value.blockId)
    return block ? [block] : []
  }
  if (value.kind === 'blocks') {
    return value.blockIds
      .map((id) => novel.findBlock(id))
      .filter((block): block is Block => Boolean(block))
  }
  return []
})

const startIndex = computed(() => {
  const value = target.value
  if (!value || !chapter.value) return -1
  if (value.kind === 'snippet') return chapter.value.blocks.findIndex((block) => block.id === value.blockId)
  if (value.kind === 'blocks') return chapter.value.blocks.findIndex((block) => block.id === value.blockIds[0])
  return -1
})

const dialogTitle = computed(() => {
  const value = target.value
  if (!value) return ''
  if (value.kind === 'snippet') return '精修选中文字'
  if (value.kind === 'blocks') return `精修选中段落（${value.blockIds.length} 段）`
  if (value.kind === 'chapter-summary') return 'AI 写作章节大纲'
  if (value.kind === 'outline') return 'AI 修改大纲'
  return 'AI 续写正文'
})

const targetSummary = computed(() => {
  const value = target.value
  if (!value) return ''
  if (value.kind === 'snippet') {
    const prefix = startIndex.value >= 0 ? `第 ${startIndex.value + 1} 段 · ` : ''
    return `${prefix}「${value.text.slice(0, 30)}${value.text.length > 30 ? '…' : ''}」`
  }
  if (value.kind === 'blocks') {
    const prefix = startIndex.value >= 0 ? `第 ${startIndex.value + 1} 段起 · ` : ''
    return `${prefix}共 ${value.blockIds.length} 段`
  }
  if (value.kind === 'chapter-summary') return `《${chapter.value?.title ?? ''}》`
  if (value.kind === 'outline') {
    const outline = novel.outlines.find((item) => item.id === value.outlineId)
    return outline ? `大纲条目「${outline.title || '未命名'}」` : '大纲条目'
  }
  return `《${chapter.value?.title ?? ''}》· 追加到本章末尾`
})

const outlineTarget = computed(() => {
  const value = target.value
  if (!value || value.kind !== 'outline') return null
  return novel.outlines.find((item) => item.id === value.outlineId) ?? null
})

const previewBefore = computed(() => {
  const value = target.value
  if (!value) return ''
  if (value.kind === 'snippet') return value.text
  if (value.kind === 'chapter-summary') return chapter.value?.summary ?? ''
  if (value.kind === 'outline') return outlineTarget.value?.content ?? ''
  return ''
})

const hasResult = computed(() => {
  const value = target.value
  if (!value) return false
  if (value.kind === 'blocks') return results.value.some((item) => item.trim())
  return Boolean(singleResult.value.trim())
})

const canApply = computed(() => hasResult.value && !running.value && !applying.value)

const applyLabel = computed(() => {
  const value = target.value
  if (!value) return '应用'
  if (value.kind === 'blocks') return `应用到 ${value.blockIds.length} 段`
  if (value.kind === 'chapter-summary') return '应用到章节大纲'
  if (value.kind === 'outline') return '应用到大纲'
  if (value.kind === 'append') return '追加到正文'
  return '应用修改'
})

function cleanOutput(raw: string): string {
  let text = raw.trim()
  if (text.startsWith('```')) {
    text = text.replace(/^```[^\n]*\n?/, '').replace(/\n?```\s*$/, '').trim()
  }
  text = text.replace(/^(好的[，,]?|当然可以[，,]?|以下是(修改|改写)后的(文字|段落|内容|片段)[：:]?\s*)/, '').trim()
  return text
}

function writingContext(value: RefineTarget, forceAll = false): WritingContext {
  const on = (flag: boolean) => forceAll || flag
  const context: WritingContext = {}
  if (novel.project) context.projectName = novel.project.name
  const styleGuide = novel.project?.styleGuide?.trim() ?? ''
  if (on(options.includeStyle) && styleGuide) context.styleText = styleGuide.slice(0, 2000)
  if (on(options.includeOutline) && novel.outlineText) context.outlineText = novel.outlineText.slice(0, 4200)
  const charactersText = forceAll ? fullCharacterContext.value.text : characterContext.value.text
  if (on(options.includeCharacters) && charactersText) context.charactersText = charactersText
  if (value.kind === 'outline') return context

  const current = chapter.value
  if (!current) return context
  context.chapterTitle = current.title
  if (on(options.includeSummary) && current.summary) context.chapterSummary = current.summary

  if ((value.kind === 'snippet' || value.kind === 'blocks') && on(options.includeBefore)) {
    const firstId = value.kind === 'snippet' ? value.blockId : value.blockIds[0]
    const lastId = value.kind === 'snippet' ? value.blockId : value.blockIds[value.blockIds.length - 1]
    const firstIndex = current.blocks.findIndex((block) => block.id === firstId)
    const lastIndex = current.blocks.findIndex((block) => block.id === lastId)
    if (firstIndex > 0) {
      context.beforeText = current.blocks
        .slice(Math.max(0, firstIndex - 2), firstIndex)
        .map((block) => block.text)
        .join('\n\n')
        .slice(-1200)
    }
    if (lastIndex >= 0 && lastIndex < current.blocks.length - 1) {
      context.afterText = current.blocks
        .slice(lastIndex + 1, lastIndex + 3)
        .map((block) => block.text)
        .join('\n\n')
        .slice(0, 1200)
    }
  }
  // 续写时「附带上下文段落」控制的就是末尾三段：取消勾选就不再发送，
  // 右侧「前文」页签会置灰，模型也只看得到大纲 / 角色设定。
  if (value.kind === 'append' && on(options.includeBefore)) {
    context.beforeText = current.blocks
      .slice(-3)
      .map((block) => block.text)
      .join('\n\n')
      .slice(-1500)
  }
  return context
}

async function runMessages(messages: PromptMessage[], onUpdate: (text: string) => void): Promise<string> {
  const model = settings.currentModel
  if (!model) throw new Error('还没有可用的模型，请先在设置中配置。')
  let buffer = ''
  await streamChat(
    { modelId: model.id, messages },
    {
      onDelta: (delta) => {
        buffer += delta
        onUpdate(buffer)
      }
    },
    controller?.signal
  )
  return buffer
}

async function generate() {
  const value = target.value
  if (!value || running.value) return
  if (!settings.currentModel) {
    error.value = '还没有可用的模型，请先在右上角「设置」中配置。'
    return
  }

  const text = (instruction.value.trim() || defaultInstructionFor(value)).trim()
  usedInstruction.value = text
  error.value = ''
  singleResult.value = ''
  results.value = value.kind === 'blocks' ? targetBlocks.value.map(() => '') : []
  running.value = true
  progress.value = ''
  controller = new AbortController()
  const context = writingContext(value)

  try {
    if (value.kind === 'snippet') {
      const block = targetBlocks.value[0]
      if (!block) throw new Error('找不到要修改的段落')
      const messages = buildSnippetMessages({ instruction: text, paragraph: block.text, snippet: value.text, context })
      const output = await runMessages(messages, (full) => {
        singleResult.value = full
      })
      singleResult.value = cleanOutput(output)
    } else if (value.kind === 'blocks') {
      const list = targetBlocks.value
      if (!list.length) throw new Error('找不到要修改的段落')
      for (let index = 0; index < list.length; index += 1) {
        progress.value = `正在改写 ${index + 1}/${list.length} 段…`
        const messages = buildBlockMessages({
          instruction: text,
          text: list[index].text,
          index,
          total: list.length,
          context
        })
        const output = await runMessages(messages, (full) => {
          results.value[index] = full
        })
        results.value[index] = cleanOutput(output)
      }
    } else if (value.kind === 'chapter-summary') {
      if (!chapter.value) throw new Error('章节还没有加载')
      const messages = buildChapterSummaryMessages({
        instruction: text,
        chapterTitle: chapter.value.title,
        currentSummary: chapter.value.summary,
        context
      })
      const output = await runMessages(messages, (full) => {
        singleResult.value = full
      })
      singleResult.value = cleanOutput(output)
    } else if (value.kind === 'outline') {
      const outline = outlineTarget.value
      if (!outline) throw new Error('大纲条目不存在')
      const messages = buildOutlineMessages({
        instruction: text,
        title: outline.title,
        content: outline.content,
        projectDescription: novel.project?.description,
        context
      })
      const output = await runMessages(messages, (full) => {
        singleResult.value = full
      })
      singleResult.value = cleanOutput(output)
    } else if (value.kind === 'append') {
      if (!chapter.value) throw new Error('章节还没有加载')
      // 末尾三段只发一份：它既是右侧「前文」页签的内容，也是续写任务的「已有正文结尾」。
      // 从上下文副本里摘掉 beforeText，避免同一段文字在提示词里被塞两次。
      const tail = context.beforeText ?? ''
      const contextWithoutTail: WritingContext = { ...context }
      delete contextWithoutTail.beforeText
      const messages = buildContinueMessages({
        instruction: text,
        chapterTitle: chapter.value.title,
        context: contextWithoutTail,
        tail
      })
      const output = await runMessages(messages, (full) => {
        singleResult.value = full
      })
      singleResult.value = cleanOutput(output)
    }

    if (!hasResult.value) {
      error.value = 'AI 没有返回内容，可以调整要求后重试。'
    }
  } catch (err) {
    const errorObj = err as Error
    error.value = errorObj.name === 'AbortError' ? '已停止生成。' : errorObj.message
  } finally {
    running.value = false
    progress.value = ''
    controller = null
  }
}

function stop() {
  controller?.abort()
}

async function apply() {
  const value = target.value
  if (!value || !hasResult.value) return
  const modelName = settings.currentModel?.name
  const finalInstruction = options.keepInstruction ? usedInstruction.value || instruction.value.trim() : ''
  applying.value = true
  try {
    if (value.kind === 'snippet') {
      const block = novel.findBlock(value.blockId)
      if (!block) throw new Error('段落不存在，可能已被删除')
      const replacement = singleResult.value.trim()
      if (!replacement) return
      const nextText = block.text.slice(0, value.start) + replacement + block.text.slice(value.end)
      const applied = await novel.applyBlockRevision({
        blockId: value.blockId,
        revisedText: nextText,
        originalText: block.text,
        instruction: finalInstruction,
        modelName
      })
      if (!applied) return
    } else if (value.kind === 'blocks') {
      for (let index = 0; index < targetBlocks.value.length; index += 1) {
        const block = targetBlocks.value[index]
        const nextText = (results.value[index] ?? '').trim()
        if (!nextText) continue
        const applied = await novel.applyBlockRevision({
          blockId: block.id,
          revisedText: nextText,
          originalText: block.text,
          instruction: finalInstruction,
          modelName
        })
        if (!applied) return
      }
    } else if (value.kind === 'chapter-summary') {
      const applied = await novel.applyChapterSummary(singleResult.value.trim(), finalInstruction, modelName)
      if (!applied) return
    } else if (value.kind === 'outline') {
      const applied = await novel.applyOutlineRevision(value.outlineId, singleResult.value.trim(), finalInstruction, modelName)
      if (!applied) return
    } else if (value.kind === 'append') {
      const texts = singleResult.value
        .split(/\n{2,}/)
        .map((item) => item.trim())
        .filter(Boolean)
      if (!texts.length) return
      const applied = await novel.appendParagraphs(texts, finalInstruction, modelName)
      if (!applied) return
    }
    // 保留的修改要求默认显示在段落下方，避免用户以为没存下来
    if (finalInstruction) novel.showInstructions = true
    close()
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    applying.value = false
  }
}

function close() {
  if (running.value) stop()
  novel.closeRefine()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && target.value) close()
}

watch(
  target,
  (value) => {
    if (!value) return
    controller?.abort()
    instruction.value = defaultInstructionFor(value)
    usedInstruction.value = ''
    singleResult.value = ''
    results.value = []
    error.value = ''
    running.value = false
    progress.value = ''
    applying.value = false
    // 打开弹窗时恢复上次勾选（本章 > 上次设置 > 默认），期间不要回写存储
    pausePersist = true
    Object.assign(options, loadOptions(value))
    nextTick(() => {
      pausePersist = false
    })
    nextTick(() => instructionRef.value?.focus())
  },
  { flush: 'post' }
)

onMounted(() => document.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <Teleport to="body">
    <div v-if="target" class="modal-overlay" @click.self="close">
      <div class="modal refine-modal">
        <header class="modal-head">
          <div class="head-text">
            <div class="modal-title">{{ dialogTitle }}</div>
            <div class="refine-sub">{{ targetSummary }}</div>
          </div>
          <button class="btn btn-icon btn-ghost" title="关闭" @click="close">✕</button>
        </header>

        <div class="refine-body" :class="{ 'no-context': !contextOpen }">
          <section class="refine-form">
            <label class="label" for="refine-instruction">你的修改要求</label>
            <textarea
              id="refine-instruction"
              ref="instructionRef"
              v-model="instruction"
              class="textarea instruction"
              rows="5"
              placeholder="例如：把这段改得更克制一点，不要直接写出人物的情绪，用动作暗示。"
            />

            <div class="presets">
              <button v-for="preset in presets" :key="preset" class="tag" @click="instruction = preset">
                {{ preset }}
              </button>
            </div>

            <div class="options">
              <label class="check"><input v-model="options.includeStyle" type="checkbox" /> 附带写作风格</label>
              <p v-if="!hasStyleGuide" class="check-note">
                还没写写作风格：到首页「写作风格」里写一次，之后续写 / 精修 / 对话都会带上。
              </p>
              <label class="check"><input v-model="options.includeOutline" type="checkbox" /> 附带全书大纲</label>
              <label class="check">
                <input v-model="options.includeCharacters" type="checkbox" /> 附带角色设定（{{
                  kind === 'outline' ? '当前阶段' : '按本章阶段'
                }}）
              </label>
              <div class="sub-options" :class="{ 'sub-off': !options.includeCharacters }">
                <label class="check sub">
                  <input v-model="options.includeAttributes" type="checkbox" :disabled="!options.includeCharacters" />
                  属性
                </label>
                <label class="check sub">
                  <input v-model="options.includeSkills" type="checkbox" :disabled="!options.includeCharacters" />
                  技能
                </label>
                <label class="check sub">
                  <input v-model="options.includeItems" type="checkbox" :disabled="!options.includeCharacters" />
                  随身物品
                </label>
                <span class="sub-note">写打斗时打开，日常可以关掉</span>
              </div>
              <label v-if="kind !== 'outline'" class="check">
                <input v-model="options.includeSummary" type="checkbox" /> 附带章节大纲
              </label>
              <label
                v-if="kind === 'snippet' || kind === 'blocks' || kind === 'append'"
                class="check"
              >
                <input v-model="options.includeBefore" type="checkbox" /> 附带上下文段落{{
                  kind === 'append' ? '（末尾 3 段）' : ''
                }}
              </label>
              <p v-if="kind === 'append' && !options.includeBefore" class="check-note">
                已关掉：右侧「前文」页签会置灰，AI 也看不到已有正文，续写可能接不上情节。
              </p>
              <label class="check">
                <input v-model="options.keepInstruction" type="checkbox" /> 在段落上保留修改要求
              </label>
              <div class="options-memory">
                <span>{{ optionSourceLabel }}</span>
                <button class="link-btn" title="清除本章与该场景的记忆，恢复全选" @click="resetOptions">
                  恢复默认
                </button>
              </div>
            </div>

            <div class="options-foot">
              <button class="link-btn" @click="contextOpen = !contextOpen">
                {{ contextOpen ? '收起右侧上下文' : '在右侧查看上下文' }}（{{ enabledCount }} / {{ contextSections.length }} 段）
              </button>
              <span v-if="options.includeCharacters" class="options-note">
                带入 {{ characterContext.included.length }} 人<template v-if="characterContext.excluded.length"
                  >，略过 {{ characterContext.excluded.length }} 人（未登场）</template
                >
              </span>
              <span v-else class="options-note">未附带角色设定，这一段不会发送</span>
            </div>

            <p class="hint">
              右侧页签位置固定：取消勾选只置灰、不删除，点开灰页签还能预览「勾上之后会发什么」；只有亮着的段才计入发送字数。
              勾选按「章节 + 场景」自动记住，换到新章会沿用上次设置，刷新页面也在；想清掉就点上面的「恢复默认」。
              应用修改前会自动生成版本快照，修改要求会保留在段落下方并汇总进本章的「修改记录」。
            </p>
          </section>

          <section class="refine-preview">
            <div class="preview-head">
              <span class="preview-title">
                {{ running ? progress || 'AI 正在修改…' : '修改预览' }}
              </span>
              <span v-if="hasResult && !running" class="preview-legend">
                <span class="legend-del">删除</span>
                <span class="legend-add">新增</span>
              </span>
            </div>

            <div class="preview-body scroll-y">
              <div v-if="error" class="error-box">{{ error }}</div>

              <div v-else-if="!hasResult && !running" class="preview-empty">
                <span class="preview-empty-mark">✦</span>
                <p>写清修改要求后点击「生成修改」，AI 返回的内容会先在这里预览，确认后再应用。</p>
              </div>

              <div v-else-if="running && !hasResult" class="preview-empty">
                <span class="preview-empty-mark spin">◌</span>
                <p>正在等待模型返回…</p>
              </div>

              <template v-else>
                <div v-if="kind === 'append'" class="append-preview">
                  <div class="preview-item-label">将追加 {{ singleResult.split(/\n{2,}/).filter((t) => t.trim()).length }} 段</div>
                  <div class="append-text">{{ singleResult }}</div>
                </div>

                <div v-else-if="kind === 'blocks'" class="preview-list">
                  <div v-for="(block, index) in targetBlocks" :key="block.id" class="preview-item">
                    <div class="preview-item-label">第 {{ index + 1 }} 段</div>
                    <DiffView :before="block.text" :after="results[index] ?? ''" />
                  </div>
                </div>

                <div v-else class="preview-item">
                  <div class="preview-item-label">
                    {{ kind === 'snippet' ? '选中的片段' : '修改前后对比' }}
                  </div>
                  <DiffView :before="previewBefore" :after="singleResult" />
                </div>
              </template>
            </div>
          </section>

          <section v-if="contextOpen" class="refine-context">
            <div class="context-head">
              <span class="preview-title">上下文</span>
              <span class="context-count">{{ enabledCount }} / {{ contextSections.length }} 段</span>
              <button class="link-btn" @click="contextOpen = false">收起</button>
            </div>
            <ContextInspector :sections="contextSections" :character-result="characterContext" />
          </section>
        </div>

        <footer class="modal-foot">
          <div class="model-note">
            <span>使用模型</span>
            <ModelSelect />
          </div>
          <div class="foot-actions">
            <button v-if="running" class="btn" @click="stop">停止生成</button>
            <button v-else class="btn" @click="generate">{{ hasResult ? '重新生成' : '生成修改' }}</button>
            <button class="btn" @click="close">取消</button>
            <button class="btn btn-primary" :disabled="!canApply" @click="apply">
              {{ applying ? '应用中…' : applyLabel }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.refine-modal {
  width: 96vw;
  max-width: 1560px;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.refine-sub {
  font-size: 12px;
  color: var(--muted);
}

.refine-body {
  display: grid;
  grid-template-columns: 400px minmax(0, 1fr) clamp(380px, 32vw, 540px);
  grid-template-rows: minmax(0, 1fr);
  gap: 0;
  height: calc(92vh - 140px);
  min-height: 420px;
  max-height: calc(92vh - 140px);
  overflow: hidden;
}
.refine-body.no-context {
  grid-template-columns: 400px minmax(0, 1fr);
}
.refine-context {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  border-left: 1px solid var(--border);
  background: var(--surface-2);
}
.context-head {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.context-count {
  font-size: 10.5px;
  color: var(--muted);
}
.context-head .link-btn {
  margin-left: auto;
}
.refine-context :deep(.inspector) {
  flex: 1;
  min-height: 0;
}

.refine-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px 20px;
  border-right: 1px solid var(--border);
  min-height: 0;
  overflow-y: auto;
  background: var(--surface);
}

.instruction {
  min-height: 118px;
  font-size: 13px;
  line-height: 1.75;
}

.presets {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 12px;
  border-radius: 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
}
.check {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: var(--ink-soft);
  cursor: pointer;
}
.check input {
  accent-color: var(--accent);
}
.check-note {
  margin: -3px 0 0 21px;
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--muted);
}
.options-memory {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 3px;
  padding-top: 8px;
  border-top: 1px dashed var(--border);
  font-size: 10.5px;
  line-height: 1.6;
  color: var(--muted);
}
.options-memory .link-btn {
  flex: 0 0 auto;
}
.sub-options {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 14px;
  margin: -2px 0 2px 22px;
}
.check.sub {
  gap: 5px;
  font-size: 11.5px;
  color: var(--muted);
}
.sub-note {
  flex: 1 0 100%;
  margin-top: 1px;
  font-size: 10px;
  color: var(--muted);
  opacity: 0.8;
}
.sub-off {
  opacity: 0.45;
}
.options-foot {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 10px;
  margin: 8px 0 0;
}
.link-btn {
  border: none;
  background: none;
  padding: 0;
  color: var(--accent);
  font-size: 11.5px;
}
.link-btn:hover {
  text-decoration: underline;
}
.options-note {
  font-size: 10.5px;
  color: var(--muted);
}
.ctx-off {
  margin: 8px 0 0;
  padding: 9px 11px;
  border: 1px dashed var(--border-strong);
  border-radius: 9px;
  background: transparent;
  font-size: 11px;
  line-height: 1.75;
  color: var(--muted);
}

.refine-preview {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  background: var(--surface-2);
}
.preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--border);
}
.preview-title {
  font-size: 11.5px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ink-soft);
}
.preview-legend {
  display: flex;
  gap: 10px;
  font-size: 11px;
  color: var(--muted);
}
.legend-del {
  color: var(--danger);
}
.legend-add {
  color: var(--success);
}
.preview-body {
  flex: 1;
  padding: 16px 20px 24px;
  min-height: 0;
}

.preview-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 18vh 20px;
  text-align: center;
  color: var(--muted);
  font-size: 12.5px;
  line-height: 1.8;
}
.preview-empty-mark {
  font-size: 26px;
  color: var(--border-strong);
}
.preview-empty p {
  margin: 0;
  max-width: 320px;
}

.error-box {
  padding: 12px 14px;
  border-radius: 9px;
  background: var(--danger-soft);
  color: var(--danger);
  font-size: 12.5px;
  line-height: 1.7;
}

.preview-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.preview-item-label {
  margin-bottom: 6px;
  font-size: 11px;
  color: var(--muted);
  letter-spacing: 0.04em;
}
.preview-item {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}

.append-preview {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--surface);
}
.append-text {
  white-space: pre-wrap;
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-soft);
}

.model-note {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: auto;
  font-size: 11.5px;
  color: var(--muted);
}
.foot-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1240px) {
  .refine-body {
    grid-template-columns: 360px minmax(0, 1fr) clamp(300px, 26vw, 360px);
  }
}

@media (max-width: 980px) {
  .refine-body {
    grid-template-columns: 340px minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) minmax(0, 42%);
  }
  .refine-body.no-context {
    grid-template-rows: minmax(0, 1fr);
  }
  .refine-context {
    grid-column: 1 / -1;
    grid-row: 2;
    border-left: none;
    border-top: 1px solid var(--border);
  }
}

@media (max-width: 860px) {
  .refine-body {
    grid-template-columns: 1fr;
    grid-template-rows: auto 1fr;
    max-height: calc(100vh - 190px);
  }
  .refine-form {
    border-right: none;
    border-bottom: 1px solid var(--border);
    max-height: 44vh;
  }
  .refine-context {
    display: none;
  }
}
</style>
