<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useNovelStore } from '../stores/novel'
import type { Character, CharacterSnapshot, ChapterSnapshot, OutlineSnapshot, VersionDetail } from '../api/types'
import { formatTime, sourceLabels } from '../utils/format'
import DiffView from './DiffView.vue'

const novel = useNovelStore()

const newLabel = ref('手动保存')
const busy = ref(false)
const compare = ref<{ title: string; before: string; after: string } | null>(null)

const target = computed(() => novel.versionsTarget)
const versions = computed(() => novel.versions)

function chapterToText(snapshot: ChapterSnapshot): string {
  const blocks = snapshot.blocks.map((block, index) => `${index + 1}. ${block.text}`).join('\n\n')
  return `标题：${snapshot.chapter.title}\n\n【章节大纲】\n${snapshot.chapter.summary || '（空）'}\n\n【正文】\n${blocks || '（空）'}`
}

function outlineToText(snapshot: OutlineSnapshot): string {
  return `标题：${snapshot.outline.title}\n\n${snapshot.outline.content || '（空）'}`
}

function characterCurrent(character: Character): CharacterSnapshot {
  return {
    kind: 'character',
    character: {
      id: character.id,
      projectId: character.projectId,
      name: character.name,
      alias: character.alias,
      role: character.role,
      gender: character.gender,
      age: character.age,
      debut: character.debut,
      debutChapterId: character.debutChapterId,
      appearance: character.appearance,
      background: character.background,
      relations: character.relations,
      goal: character.goal,
      notes: character.notes,
      sortOrder: character.sortOrder,
      createdAt: character.createdAt,
      updatedAt: character.updatedAt
    },
    stages: character.stages.map((stage) => ({
      id: stage.id,
      name: stage.name,
      period: stage.period,
      traits: stage.traits,
      inner: stage.inner,
      behavior: stage.behavior,
      speech: stage.speech,
      event: stage.event,
      isCurrent: stage.isCurrent,
      sortOrder: stage.sortOrder
    }))
  }
}

function characterToText(snapshot: CharacterSnapshot): string {
  const character = snapshot.character
  const lines = [`【角色】${character.name || '未命名角色'}${character.role ? `（${character.role}）` : ''}`]
  if (character.alias) lines.push(`别名：${character.alias}`)
  if (character.age) lines.push(`年龄：${character.age}`)
  if (character.appearance) lines.push(`外貌：${character.appearance}`)
  if (character.background) lines.push(`背景：${character.background}`)
  if (character.relations) lines.push(`关系：${character.relations}`)
  if (character.goal) lines.push(`目标：${character.goal}`)
  if (character.notes) lines.push(`备注：${character.notes}`)
  snapshot.stages.forEach((stage, index) => {
    lines.push('')
    lines.push(
      `【阶段 ${index + 1}】${stage.name || '未命名阶段'}${stage.period ? ` · ${stage.period}` : ''}${
        stage.isCurrent ? ' ※ 当前阶段' : ''
      }`
    )
    if (stage.traits) lines.push(`性格：${stage.traits}`)
    if (stage.inner) lines.push(`内心动机：${stage.inner}`)
    if (stage.behavior) lines.push(`行为表现：${stage.behavior}`)
    if (stage.speech) lines.push(`说话方式：${stage.speech}`)
    if (stage.event) lines.push(`关键事件：${stage.event}`)
  })
  return lines.join('\n')
}

const currentText = computed(() => {
  const info = target.value
  if (!info) return ''
  if (info.type === 'chapter') {
    const active = novel.chapter
    if (active && active.id === info.id) {
      return chapterToText({
        kind: 'chapter',
        chapter: {
          id: active.id,
          projectId: active.projectId,
          title: active.title,
          summary: active.summary,
          status: active.status
        },
        blocks: active.blocks.map((block) => ({
          id: block.id,
          text: block.text,
          instruction: block.instruction,
          sortOrder: block.sortOrder
        }))
      })
    }
    const meta = novel.chapters.find((item) => item.id === info.id)
    if (!meta) return ''
    return `标题：${meta.title}\n\n【章节大纲】\n${meta.summary || '（空）'}\n\n【正文】\n（打开这一章后可对比正文）`
  }
  const outline = novel.outlines.find((item) => item.id === info.id)
  if (info.type === 'character') {
    const character = novel.characters.find((item) => item.id === info.id)
    return character ? characterToText(characterCurrent(character)) : ''
  }
  return outline ? `标题：${outline.title}\n\n${outline.content || '（空）'}` : ''
})

async function saveVersion() {
  if (busy.value) return
  busy.value = true
  try {
    await novel.saveVersion(newLabel.value.trim() || '手动保存')
    newLabel.value = '手动保存'
  } finally {
    busy.value = false
  }
}

async function showCompare(versionId: string) {
  const detail: VersionDetail | null = await novel.getVersionDetail(versionId)
  if (!detail) return
  const before =
    detail.snapshot.kind === 'chapter'
      ? chapterToText(detail.snapshot)
      : detail.snapshot.kind === 'character'
        ? characterToText(detail.snapshot)
        : outlineToText(detail.snapshot)
  compare.value = {
    title: `${formatTime(detail.createdAt)} · ${detail.label || sourceLabels[detail.source] || '版本'}`,
    before,
    after: currentText.value
  }
}

async function restoreVersion(versionId: string) {
  if (!window.confirm('恢复到这个版本？当前内容会先自动备份，仍可再恢复回来。')) return
  busy.value = true
  try {
    await novel.restoreVersion(versionId)
    compare.value = null
  } finally {
    busy.value = false
  }
}

async function removeVersion(versionId: string) {
  if (!window.confirm('删除这个版本快照？删除后无法再恢复。')) return
  await novel.removeVersion(versionId)
}

function close() {
  compare.value = null
  novel.closeVersions()
}

watch(
  () => novel.versionsOpen,
  (open) => {
    if (!open) compare.value = null
  }
)
</script>

<template>
  <Teleport to="body">
    <div v-if="novel.versionsOpen" class="drawer-overlay" @click.self="close">
      <aside class="drawer">
        <header class="drawer-head">
          <div class="head-text">
            <div class="drawer-title">历史版本</div>
            <div class="drawer-sub">
              {{ target?.type === 'chapter' ? '章节' : target?.type === 'character' ? '角色' : '大纲' }} · {{ target?.title || '未命名' }}
            </div>
          </div>
          <button class="btn btn-icon btn-ghost" title="关闭" @click="close">✕</button>
        </header>

        <div class="drawer-tools">
          <input v-model="newLabel" class="input label-input" placeholder="版本备注（可选）" />
          <button class="btn btn-primary btn-sm" :disabled="busy" @click="saveVersion">
            {{ busy ? '处理中…' : '保存当前版本' }}
          </button>
        </div>
        <p class="tools-hint">
          编辑内容时每约 2 分钟会自动生成快照；应用 AI 修改前也会自动备份。
        </p>

        <div class="version-list scroll-y">
          <div v-if="!versions.length" class="empty-state">还没有版本快照。点击上方按钮保存一个。</div>

          <article v-for="version in versions" :key="version.id" class="version-item">
            <div class="version-main">
              <div class="version-top">
                <span class="version-label">{{ version.label || '未命名版本' }}</span>
                <span class="badge" :class="{ 'badge-accent': version.source === 'manual' }">
                  {{ sourceLabels[version.source] || version.source }}
                </span>
              </div>
              <div class="version-time">{{ formatTime(version.createdAt) }}</div>
            </div>
            <div class="version-actions">
              <button class="btn btn-sm" @click="showCompare(version.id)">对比</button>
              <button class="btn btn-sm" :disabled="busy" @click="restoreVersion(version.id)">恢复</button>
              <button class="btn btn-icon btn-sm btn-danger" title="删除版本" @click="removeVersion(version.id)">✕</button>
            </div>
          </article>
        </div>
      </aside>

      <div v-if="compare" class="compare-overlay" @click.self="compare = null">
        <div class="modal compare-modal">
          <header class="modal-head">
            <div class="head-text">
              <div class="modal-title">版本对比</div>
              <div class="drawer-sub">{{ compare.title }}</div>
            </div>
            <button class="btn btn-icon btn-ghost" @click="compare = null">✕</button>
          </header>
          <div class="compare-body scroll-y">
            <div class="compare-legend">
              <span class="legend-del">删除线 = 旧版本</span>
              <span class="legend-add">绿色 = 当前版本</span>
            </div>
            <DiffView :before="compare.before" :after="compare.after" />
          </div>
          <footer class="modal-foot">
            <button class="btn" @click="compare = null">关闭</button>
          </footer>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.drawer-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
}
.head-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.drawer-title {
  font-size: 15px;
  font-weight: 600;
}
.drawer-sub {
  font-size: 11.5px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.drawer-tools {
  display: flex;
  gap: 8px;
  padding: 14px 18px 8px;
}
.label-input {
  height: 32px;
  font-size: 12px;
}
.tools-hint {
  margin: 0;
  padding: 0 18px 12px;
  font-size: 11px;
  line-height: 1.7;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.version-list {
  flex: 1;
  min-height: 0;
  padding: 10px 14px 24px;
}
.version-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px;
  border-radius: 9px;
  border: 1px solid transparent;
}
.version-item:hover {
  background: var(--surface-2);
  border-color: var(--border);
}
.version-main {
  flex: 1;
  min-width: 0;
}
.version-top {
  display: flex;
  align-items: center;
  gap: 7px;
}
.version-label {
  font-size: 12.5px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.version-time {
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
}
.version-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
}

.compare-overlay {
  position: fixed;
  inset: 0;
  z-index: 150;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 30px;
  background: rgba(20, 16, 10, 0.5);
  backdrop-filter: blur(2px);
}
.compare-modal {
  max-width: 860px;
  height: calc(100vh - 60px);
}
.compare-body {
  flex: 1;
  min-height: 0;
  padding: 16px 22px;
  background: var(--surface-2);
}
.compare-legend {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 11px;
  color: var(--muted);
}
.legend-del {
  color: var(--danger);
}
.legend-add {
  color: var(--success);
}
</style>
