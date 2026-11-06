<script setup lang="ts">
import { computed } from 'vue'
import { diffText } from '../utils/diff'

const props = defineProps<{ before: string; after: string }>()

const parts = computed(() => diffText(props.before, props.after))
</script>

<template>
  <div class="diff">
    <template v-for="(part, index) in parts" :key="index">
      <span :class="`diff-${part.type}`">{{ part.text }}</span>
    </template>
  </div>
</template>

<style scoped>
.diff {
  white-space: pre-wrap;
  word-break: break-word;
  font-family: var(--font-serif);
  font-size: 14px;
  line-height: 1.9;
  color: var(--ink-soft);
}
.diff-add {
  background: rgba(60, 116, 83, 0.18);
  color: var(--success);
  border-radius: 2px;
}
.diff-del {
  background: rgba(178, 57, 57, 0.12);
  color: var(--danger);
  text-decoration: line-through;
  border-radius: 2px;
}
</style>
