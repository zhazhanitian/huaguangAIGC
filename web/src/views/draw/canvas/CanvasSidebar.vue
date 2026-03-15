<script setup lang="ts">
import { computed } from 'vue'
import type { CanvasNode } from '../../../stores/canvas'
import CanvasHistoryList from './CanvasHistoryList.vue'
import CanvasPromptPanel from './CanvasPromptPanel.vue'

// 参数选项类型
type RatioOption = { value: string; label: string; icon: string }
type SizeOption = { value: string; label: string }

// 模型配置类型
interface ModelConfig {
  ratios: RatioOption[]
  sizes?: SizeOption[]
  resolutions?: SizeOption[]
  durations?: SizeOption[]
}

const props = defineProps<{
  nodes: CanvasNode[]
  selectedId: string
  promptMode: 'image' | 'video'
  promptText: string
  selectedModel: string
  paramSettings: { size?: string; style?: string; ratio?: string; duration?: string }
  models: Array<{ id: string; name: string; tag?: string; color?: string }>
  modelConfigs?: Record<string, ModelConfig>
  /** 上传参考图并返回服务器 URL */
  uploadRefFile?: (file: File) => Promise<string>
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'generate-node', id: string): void
  (e: 'delete-node', id: string): void
  (e: 'download-node', id: string): void
  (e: 'update-prompt', patch: {
    mode?: 'image' | 'video'
    promptText?: string
    model?: string
  }): void
  (e: 'update-params', params: { size?: string; style?: string; ratio?: string; duration?: string }): void
  (e: 'generate-from-prompt'): void
  (e: 'update-ref-images', images: { id: string; file: File; url: string }[]): void
}>()

// 获取当前模型的配置
const currentModelConfig = computed(() => {
  if (!props.modelConfigs || !props.selectedModel) return undefined
  return props.modelConfigs[props.selectedModel]
})
</script>

<template>
  <aside class="canvas-sidebar">
    <div class="history-wrapper">
      <CanvasHistoryList
        :nodes="nodes"
        :selected-id="selectedId"
        @select="emit('select', $event)"
        @generate="emit('generate-node', $event)"
        @delete="emit('delete-node', $event)"
        @download="emit('download-node', $event)"
      />
    </div>

    <CanvasPromptPanel
      :mode="promptMode"
      :prompt-text="promptText"
      :model="selectedModel"
      :params="paramSettings"
      :models="models"
      :model-config="currentModelConfig"
      :upload-ref-file="uploadRefFile"
      @update="emit('update-prompt', $event)"
      @update-params="emit('update-params', $event)"
      @generate="emit('generate-from-prompt')"
      @update-ref-images="emit('update-ref-images', $event)"
    />
  </aside>
</template>

<style scoped>
.canvas-sidebar {
  width: 360px;
  flex-shrink: 0;
  border-left: 1px solid var(--border-2);
  background: var(--bg-surface-1);
  backdrop-filter: blur(16px);
  padding: 20px;
  color: var(--text-1);
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: hidden;
  height: 100vh;
}

.history-wrapper {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding-right: 4px;
}

.history-wrapper::-webkit-scrollbar {
  width: 4px;
}

.history-wrapper::-webkit-scrollbar-track {
  background: transparent;
}

.history-wrapper::-webkit-scrollbar-thumb {
  background: rgba(22, 93, 255, 0.1);
  border-radius: 4px;
}

.history-wrapper::-webkit-scrollbar-thumb:hover {
  background: rgba(22, 93, 255, 0.1);
}

:global(body[arco-theme='light']) .canvas-sidebar {
  background: var(--bg-surface-1);
  border-left-color: var(--border-2);
}

:global(body[arco-theme='dark']) .canvas-sidebar {
  background: color-mix(in srgb, var(--bg-surface-1) 92%, transparent);
}
</style>
