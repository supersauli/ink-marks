<script setup lang="ts">
import { useSettingsStore } from '../stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <select
    class="select model-select"
    :value="settings.currentModel?.id ?? ''"
    :title="settings.currentModel ? `${settings.currentModel.provider.name} · ${settings.currentModel.name}` : '未配置模型'"
    @change="settings.selectModel(($event.target as HTMLSelectElement).value)"
  >
    <option v-if="!settings.allModels.length" value="" disabled>未配置模型</option>
    <optgroup v-for="provider in settings.providers.filter((p) => p.models.length)" :key="provider.id" :label="provider.name">
      <option v-for="model in provider.models" :key="model.id" :value="model.id">
        {{ model.displayName || model.name }}
      </option>
    </optgroup>
  </select>
</template>

<style scoped>
.model-select {
  width: 150px;
  height: 30px;
  font-size: 12px;
  text-overflow: ellipsis;
  padding: 0 6px;
}
</style>
