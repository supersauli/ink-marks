<script setup lang="ts">
import { useNovelStore } from '../stores/novel'

const novel = useNovelStore()
</script>

<template>
  <Transition name="toast">
    <div v-if="novel.errorMessage" class="toast" role="status">{{ novel.errorMessage }}</div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 8px);
}
</style>
