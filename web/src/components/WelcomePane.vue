<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { useNovelStore } from '../stores/novel'
import { formatRelative } from '../utils/format'

const novel = useNovelStore()

const recentChapters = computed(() =>
  [...novel.chapters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 5)
)

const hasBodyChapter = computed(() => novel.chapters.some((item) => item.wordCount > 0))

async function createProject() {
  const name = window.prompt('给这部作品起个名字', '未命名作品')
  if (!name || !name.trim()) return
  await novel.createProject(name.trim())
}

function editDescription() {
  if (!novel.project) return
  const description = window.prompt('作品简介', novel.project.description)
  if (description !== null) void novel.updateProject({ description })
}

// 作品级写作风格：失焦即保存，所有 AI 场景自动带上，不会被导出
const styleSaved = ref(false)
let styleTimer: number | null = null

function onStyleChange(event: Event) {
  const value = (event.target as HTMLTextAreaElement).value
  if (value === (novel.project?.styleGuide ?? '')) return
  void novel.updateProject({ styleGuide: value })
  styleSaved.value = true
  if (styleTimer) window.clearTimeout(styleTimer)
  styleTimer = window.setTimeout(() => {
    styleSaved.value = false
  }, 1800)
}

onBeforeUnmount(() => {
  if (styleTimer) window.clearTimeout(styleTimer)
})

async function openOutline() {
  const first = novel.outlineNodes[0]
  if (first) await novel.selectOutline(first.item.id)
  else await novel.createOutline(null)
}

async function createChapter() {
  await novel.createChapter()
}

async function openLatestChapter(mode: 'chapterOutline' | 'chapter') {
  const sorted = [...novel.chapters].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const target = mode === 'chapter' ? sorted.find((item) => item.wordCount > 0) ?? sorted[0] : sorted[0]
  if (target) await novel.selectChapter(target.id, mode)
  else await novel.createChapter()
}
</script>

<template>
  <div class="welcome">
    <div v-if="!novel.project" class="onboard">
      <span class="eyebrow">NOVEL STUDIO</span>
      <h1>从一条大纲，开始写你的小说。</h1>
      <p class="lead">
        这是一个完全本地运行的小说工作台：先定全书大纲，再拆章节大纲，最后写正文。正文里的任意段落都可以选中并交给大模型改写，
        每次修改都会保留你的要求，也可以随时回退到旧版本。
      </p>
      <div class="onboard-actions">
        <button class="btn btn-primary" @click="createProject">新建一部作品</button>
      </div>
      <div class="onboard-tips">
        <span>数据保存在本机 SQLite</span>
        <span>支持任意 OpenAI 兼容模型</span>
        <span>版本可回退</span>
      </div>
    </div>

    <template v-else>
      <div class="hero">
        <span class="eyebrow">CURRENT WORK</span>
        <h1>{{ novel.project.name }}</h1>
        <p class="lead">
          {{ novel.project.description || '还没有简介。写一句话，让这部作品有个起点。' }}
          <button class="inline-link" @click="editDescription">编辑</button>
        </p>
        <div class="stats">
          <div class="stat">
            <span class="num">{{ novel.outlines.length }}</span>
            <span class="cap">大纲条目</span>
          </div>
          <div class="stat">
            <span class="num">{{ novel.chapters.length }}</span>
            <span class="cap">章节</span>
          </div>
          <div class="stat">
            <span class="num">{{ novel.totalWordCount.toLocaleString() }}</span>
            <span class="cap">已写字数</span>
          </div>
        </div>
      </div>

      <section class="style-card">
        <div class="style-head">
          <div>
            <h3>写作风格</h3>
            <p>写给 AI 的全局文风要求：续写、精修、章节大纲和对话都会自动带上，不写进导出文件。</p>
          </div>
          <span class="style-state">{{ styleSaved ? '已保存' : '失焦自动保存' }}</span>
        </div>
        <textarea
          class="style-input"
          :value="novel.project.styleGuide"
          rows="3"
          placeholder="例如：第三人称限知视角；句子偏短，少用形容词；不要直接写情绪，用动作和细节暗示；避免排比和 AI 腔套话。"
          @change="onStyleChange"
        />
      </section>

      <div class="flow">
        <article class="flow-card">
          <span class="step">01</span>
          <h2>定大纲</h2>
          <p>写故事主线、世界观和人物。大纲可以一层层拆子条目，随时补充与修改。</p>
          <button class="btn" @click="openOutline">{{ novel.outlineNodes.length ? '打开大纲' : '新建大纲' }}</button>
        </article>
        <article class="flow-card">
          <span class="step">02</span>
          <h2>写章节大纲</h2>
          <p>为每一章写情节节拍：场景、人物行动、冲突、结尾钩子。也可以让 AI 根据总大纲起草。</p>
          <button class="btn" @click="openLatestChapter('chapterOutline')">
            {{ novel.chapters.length ? '打开章节大纲' : '新建章节' }}
          </button>
        </article>
        <article class="flow-card">
          <span class="step">03</span>
          <h2>写正文</h2>
          <p>在章节里逐段写作。选中任意文字会出现「AI 修改」小按钮，改完会保留你的修改要求。</p>
          <button class="btn" @click="openLatestChapter('chapter')">
            {{ hasBodyChapter ? '继续写正文' : novel.chapters.length ? '开始写正文' : '新建章节' }}
          </button>
        </article>
      </div>

      <div class="recent">
        <div class="recent-head">
          <h3>最近更新</h3>
          <button class="btn btn-sm" @click="createChapter">＋ 新章节</button>
        </div>
        <div v-if="recentChapters.length" class="recent-list">
          <button
            v-for="item in recentChapters"
            :key="item.id"
            class="recent-row"
            @click="novel.selectChapter(item.id, item.wordCount ? 'chapter' : 'chapterOutline')"
          >
            <span class="recent-title">{{ item.title }}</span>
            <span class="recent-meta">{{ item.wordCount }} 字 · {{ formatRelative(item.updatedAt) }}</span>
          </button>
        </div>
        <div v-else class="empty-state">还没有章节。点击右上角「＋ 新章节」开始。</div>
      </div>

      <div class="tips">
        <div class="tip">
          <strong>选中段落即可精修</strong>
          在正文中选中文字，会浮出「AI 修改」按钮；按 Shift 点击段号，可以一次选中多段。
        </div>
        <div class="tip">
          <strong>修改要求会留下来</strong>
          每次精修都会记录你的指令，显示在段落下方，也汇总在章节的「修改记录」里。
        </div>
        <div class="tip">
          <strong>随时反悔</strong>
          应用 AI 修改、手动保存和恢复版本都会生成快照，可在「历史版本」中对比并回退。
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.welcome {
  flex: 1;
  overflow-y: auto;
  padding: 44px clamp(24px, 5vw, 72px) 60px;
  background: var(--surface);
}
.onboard,
.hero,
.style-card,
.flow,
.recent,
.tips {
  max-width: 900px;
  margin: 0 auto;
}
.style-card {
  margin-bottom: 26px;
  padding: 16px 18px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}
.style-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}
.style-head h3 {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--ink);
}
.style-head p {
  margin: 0;
  font-size: 11.5px;
  line-height: 1.7;
  color: var(--muted);
}
.style-state {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--muted);
}
.style-input {
  display: block;
  width: 100%;
  min-height: 76px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  outline: none;
  resize: vertical;
  font-family: var(--font-ui);
  font-size: 12.5px;
  line-height: 1.8;
  color: var(--ink-soft);
}
.style-input:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}
.style-input::placeholder {
  color: var(--muted);
  opacity: 0.7;
}
.onboard {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 14px;
  padding-top: 6vh;
}
.eyebrow {
  font-size: 11px;
  letter-spacing: 0.24em;
  color: var(--muted);
}
h1 {
  margin: 0;
  font-family: var(--font-serif);
  font-size: clamp(28px, 3.4vw, 42px);
  font-weight: 500;
  letter-spacing: 0.02em;
  line-height: 1.35;
}
.lead {
  margin: 0;
  max-width: 680px;
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-soft);
}
.onboard-actions {
  margin-top: 8px;
}
.onboard-tips {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}
.inline-link {
  border: none;
  background: none;
  padding: 0 4px;
  color: var(--accent);
  font-size: 12px;
}
.inline-link:hover {
  text-decoration: underline;
}

.hero {
  padding-bottom: 26px;
  border-bottom: 1px solid var(--border);
}
.stats {
  display: flex;
  gap: 34px;
  margin-top: 22px;
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat .num {
  font-family: var(--font-serif);
  font-size: 24px;
}
.stat .cap {
  font-size: 11px;
  letter-spacing: 0.08em;
  color: var(--muted);
}

.flow {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
  margin-top: 26px;
}
.flow-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding: 18px 18px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
}
.flow-card .step {
  position: absolute;
  top: 14px;
  right: 16px;
  font-family: var(--font-serif);
  font-size: 13px;
  color: var(--border-strong);
}
.flow-card h2 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.flow-card p {
  margin: 0;
  flex: 1;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--muted);
}
.flow-card .btn {
  margin-top: 4px;
}

.recent {
  margin-top: 34px;
}
.recent-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}
.recent-head h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}
.recent-list {
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
}
.recent-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  padding: 11px 14px;
  border: none;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  text-align: left;
}
.recent-row:last-child {
  border-bottom: none;
}
.recent-row:hover {
  background: var(--surface-2);
}
.recent-title {
  font-size: 13px;
}
.recent-meta {
  font-size: 11.5px;
  color: var(--muted);
}

.tips {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  margin-top: 34px;
  padding-top: 20px;
  border-top: 1px dashed var(--border);
}
.tip {
  font-size: 12px;
  line-height: 1.8;
  color: var(--muted);
}
.tip strong {
  display: block;
  margin-bottom: 2px;
  color: var(--ink-soft);
  font-weight: 600;
}
</style>
