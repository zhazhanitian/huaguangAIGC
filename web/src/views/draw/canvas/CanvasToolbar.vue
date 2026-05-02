<script setup lang="ts">
import { computed } from 'vue'
import { Minus, Plus } from 'lucide-vue-next'

const props = defineProps<{ zoom: number; running: number; queued: number; canUndo: boolean; canRedo: boolean }>()
const emit = defineEmits<{
  (e: 'create-node'): void
  (e: 'save'): void
  (e: 'export'): void
  (e: 'zoom-in'): void
  (e: 'zoom-out'): void
  (e: 'zoom-reset'): void
  (e: 'undo'): void
  (e: 'redo'): void
}>()

const zoomLabel = computed(() => `${Math.round(props.zoom * 100)}%`)
const canZoomIn = computed(() => props.zoom < 2)
const canZoomOut = computed(() => props.zoom > 0.02)
</script>

<template>
  <header class="canvas-toolbar">
    <div class="toolbar-left">
      <div class="logo">
        <span class="mark">LO</span>
        <p class="title">Untitled</p>
      </div>
    </div>

    <div class="toolbar-center">
      <div class="history-controls">
        <button class="history-btn" :disabled="!canUndo" title="撤销 (Ctrl+Z)" @click="emit('undo')">
          撤销
        </button>
        <button class="history-btn" :disabled="!canRedo" title="重做 (Ctrl+Y)" @click="emit('redo')">
          重做
        </button>
      </div>
      <div class="zoom-controls">
        <button class="zoom-btn" :disabled="!canZoomOut" @click="emit('zoom-out')" title="缩小">
          <Minus :size="14" />
        </button>
        <button class="zoom-label" @click="emit('zoom-reset')" title="重置为100%">
          {{ zoomLabel }}
        </button>
        <button class="zoom-btn" :disabled="!canZoomIn" @click="emit('zoom-in')" title="放大">
          <Plus :size="14" />
        </button>
      </div>
    </div>

  </header>
</template>

<style scoped>
.canvas-toolbar {
  flex-shrink: 0;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--glass-bg, rgba(255, 255, 255, 0.92));
  border-bottom: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  backdrop-filter: blur(8px);
  z-index: 20;
}

.toolbar-left {
  display: flex;
  align-items: center;
}

.logo {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo .mark {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  background: var(--primary, #232324);
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
}

.title {
  font-size: 15px;
  font-weight: 600;
  margin: 0;
  color: var(--text-1, #232324);
}

.toolbar-center {
  display: flex;
  align-items: center;
  gap: 8px;
}

.history-controls {
  display: flex;
  align-items: center;
  gap: 6px;
}

.history-btn {
  min-width: 52px;
  height: 30px;
  border-radius: 8px;
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  background: var(--bg-surface-1, #fff);
  color: var(--text-2, #334155);
  font-size: 12px;
  cursor: pointer;
}

.history-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

button {
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  padding: 6px 12px;
  border-radius: var(--radius-sm, 8px);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--duration-fast, 0s) ease;
  background: var(--bg-surface-1, #fff);
  color: var(--text-2, #1f2937);
}

button.ghost {
  background: transparent;
  border-color: transparent;
}

button:hover {
  background: var(--bg-surface-2, #F5F5F5);
}

.zoom-controls {
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--bg-surface-2, #F5F5F5);
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  border-radius: 999px;
  padding: 2px;
}

.zoom-btn {
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-2, #334155);
  transition: all 0s ease;
}

.zoom-btn:hover:not(:disabled) {
  background: var(--bg-surface-1, #fff);
}

.zoom-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.zoom-label {
  min-width: 52px;
  padding: 4px 8px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2, #334155);
  cursor: pointer;
  text-align: center;
}

.zoom-label:hover {
  color: var(--primary, #232324);
}
</style>

