<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useNovelStore } from './stores/novel'
import { useChatStore } from './stores/chat'
import { useSettingsStore } from './stores/settings'
import TopBar from './components/TopBar.vue'
import Sidebar from './components/Sidebar.vue'
import WelcomePane from './components/WelcomePane.vue'
import DocTabs from './components/DocTabs.vue'
import OverviewEditor from './components/OverviewEditor.vue'
import OutlineEditor from './components/OutlineEditor.vue'
import CharacterEditor from './components/CharacterEditor.vue'
import ItemEditor from './components/ItemEditor.vue'
import TemplateEditor from './components/TemplateEditor.vue'
import ChapterEditor from './components/ChapterEditor.vue'
import ChatPanel from './components/ChatPanel.vue'
import RefineDialog from './components/RefineDialog.vue'
import VersionDrawer from './components/VersionDrawer.vue'
import RevisionDrawer from './components/RevisionDrawer.vue'
import SettingsDialog from './components/SettingsDialog.vue'
import ExportDialog from './components/ExportDialog.vue'
import Toast from './components/Toast.vue'

const THEME_KEY = 'moji:theme'

const novel = useNovelStore()
const chat = useChatStore()
const settings = useSettingsStore()

const theme = ref<'light' | 'dark'>('light')

function applyTheme() {
  document.documentElement.dataset.theme = theme.value
  localStorage.setItem(THEME_KEY, theme.value)
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY)
  if (saved === 'light' || saved === 'dark') {
    theme.value = saved
  } else if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) {
    theme.value = 'dark'
  }
  applyTheme()
}

function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
  applyTheme()
}

onMounted(async () => {
  initTheme()
  await Promise.all([settings.load(), novel.bootstrap()])
})

watch(
  () => novel.projectId,
  (pid) => {
    void chat.load(pid)
  }
)

onBeforeUnmount(() => {
  void novel.flushAll()
})
</script>

<template>
  <div class="app-shell">
    <TopBar :theme="theme" @toggle-theme="toggleTheme" />

    <div class="app-body">
      <Sidebar />

      <main class="workspace">
        <DocTabs />
        <WelcomePane v-if="novel.mode === 'welcome' || !novel.project" />
        <OverviewEditor v-else-if="novel.mode === 'overview'" />
        <OutlineEditor
          v-else-if="novel.mode === 'outline' && novel.activeOutline"
          :key="novel.activeOutline.id"
        />
        <CharacterEditor
          v-else-if="novel.mode === 'character' && novel.activeCharacter"
          :key="novel.activeCharacter.id"
        />
        <ItemEditor
          v-else-if="novel.mode === 'item' && novel.activeItem"
          :key="novel.activeItem.id"
        />
        <TemplateEditor
          v-else-if="novel.mode === 'template' && novel.activeTemplate"
          :key="novel.activeTemplate.id"
        />
        <ChapterEditor
          v-else-if="(novel.mode === 'chapter' || novel.mode === 'chapterOutline') && novel.chapter"
          :key="novel.chapter.id"
        />
        <div v-else-if="novel.loading" class="workspace-tip">加载中…</div>
        <div v-else class="workspace-tip">
          <p>从左侧选择一条大纲或一个章节开始写作。</p>
          <p class="hint">写作顺序建议：先定全书大纲 → 再写章节大纲 → 最后写正文。</p>
        </div>
      </main>

      <ChatPanel v-if="chat.open && novel.project" />
    </div>

    <RefineDialog />
    <VersionDrawer />
    <RevisionDrawer />
    <SettingsDialog />
    <ExportDialog />
    <Toast />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--bg);
}

.app-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.workspace {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.workspace-tip {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  padding: 30px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
}
.workspace-tip p {
  margin: 0;
}

@media (max-width: 900px) {
  .app-body {
    flex-wrap: wrap;
  }
  .workspace {
    flex-basis: calc(100% - 220px);
  }
  :deep(.chat-panel) {
    width: 100%;
    flex-basis: 100%;
    border-left: none;
    border-top: 1px solid var(--border);
    max-height: 45vh;
  }
}
</style>
