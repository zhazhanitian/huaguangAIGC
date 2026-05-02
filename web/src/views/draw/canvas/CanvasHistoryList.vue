<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronDown, ChevronUp, CircleX, Download, Image as ImageIcon, RefreshCcw, Trash2, Video } from 'lucide-vue-next'
import type { CanvasNode } from '../../../stores/canvas'

const props = defineProps<{
  nodes: CanvasNode[]
  selectedId: string
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'generate', id: string): void
  (e: 'delete', id: string): void
  (e: 'download', id: string): void
}>()

// 倒序排列，最新的在下面
const reversedList = computed(() => [...props.nodes].reverse())

// 展开状态
const expandedMap = ref<Record<string, boolean>>({})

function toggleExpand(id: string) {
  expandedMap.value[id] = !expandedMap.value[id]
}

function formatTime(value?: string) {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

function handleDownload(node: CanvasNode) {
  if (node.previewUrl) {
    const link = document.createElement('a')
    link.href = node.previewUrl
    link.download = `canvas-${node.id}.png`
    link.click()
  }
  emit('download', node.id)
}
</script>

<template>
  <section class="history">
    <div class="history-header">
      <h3>历史记录</h3>
      <span class="count">{{ nodes.length }}</span>
    </div>

    <div class="history-list">
      <article
        v-for="node in reversedList"
        :key="node.id"
        class="history-card"
        :class="{ active: node.id === selectedId }"
        @click="emit('select', node.id)"
      >
        <!-- 第一行：图片区域 -->
        <div class="card-media">
          <img v-if="node.previewUrl && node.status !== 'failed'" :src="node.previewUrl" alt="preview" />
          <div v-else class="placeholder" :class="{ failed: node.status === 'failed' }">
            <span class="placeholder-icon">
              <CircleX v-if="node.status === 'failed'" :size="18" />
              <Video v-else-if="node.mode === 'video'" :size="18" />
              <ImageIcon v-else :size="18" />
            </span>
            <span class="placeholder-text">
              {{ node.status === 'failed' ? '生成失败' : node.mode === 'video' ? '视频' : '图像' }}
            </span>
          </div>
          
          <!-- 悬停蒙层和操作按钮 -->
          <div class="media-overlay">
            <button class="overlay-btn" title="重新生成" @click.stop="emit('generate', node.id)">
              <RefreshCcw :size="16" />
            </button>
            <button class="overlay-btn" title="下载" @click.stop="handleDownload(node)">
              <Download :size="16" />
            </button>
            <button class="overlay-btn delete" title="删除" @click.stop="emit('delete', node.id)">
              <Trash2 :size="16" />
            </button>
          </div>
          
          <!-- 状态标签 -->
          <span v-if="node.status === 'running'" class="status-badge running">
            <span class="spinner"></span>
            生成中
          </span>
        </div>

        <!-- 第二行：提示词 -->
        <div class="card-prompt">
          <p class="prompt-text" :class="{ expanded: expandedMap[node.id] }">
            {{ node.prompt || '无提示词' }}
          </p>
          <button
            v-if="(node.prompt?.length || 0) > 60"
            class="expand-btn"
            @click.stop="toggleExpand(node.id)"
          >
            <ChevronDown v-if="!expandedMap[node.id]" :size="12" />
            <ChevronUp v-else :size="12" />
          </button>
        </div>

        <!-- 第三行：模型标签 + 时间戳 -->
        <div class="card-footer">
          <span class="model-tag">{{ node.model || node.provider || '默认' }}</span>
          <span class="time-stamp">{{ formatTime(node.updatedAt) }}</span>
        </div>
      </article>
    </div>
  </section>
</template>

<style scoped>
.history {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.history-header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.count {
  font-size: 11px;
  color: var(--text-3);
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: var(--color-fill-2);
  color: var(--text-2);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid var(--border-2);
  background: var(--bg-surface-2);
  cursor: pointer;
  transition: border-color 0.18s ease, background-color 0.18s ease, box-shadow 0.18s ease;
}

.history-card:hover {
  border-color: var(--border-3);
  background: var(--bg-surface-3);
}

.history-card.active {
  border-color: var(--border-focus);
  background: color-mix(in srgb, var(--primary) 10%, var(--bg-surface-2));
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.16);
}

/* 图片区域 */
.card-media {
  position: relative;
  width: 100%;
  height: 120px;
  border-radius: 10px;
  overflow: hidden;
  background: var(--bg-surface-3);
}

.card-media img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-2);
}

.placeholder.failed {
  background: rgba(245, 63, 63, 0.1);
  color: #f87171;
}

.placeholder-icon {
  font-size: 20px;
  opacity: 0.7;
}

.placeholder-text {
  font-size: 11px;
}

/* 悬停蒙层 */
.media-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  opacity: 0;
  transition: opacity 0.16s ease;
}

.card-media:hover .media-overlay {
  opacity: 1;
}

.overlay-btn {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  border: none;
  background: var(--bg-overlay);
  backdrop-filter: blur(8px);
  color: var(--text-1);
  font-size: 18px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.16s ease, transform 0.16s ease, color 0.16s ease;
}

.overlay-btn:hover {
  background: rgba(22, 93, 255, 0.1);
  transform: scale(1.1);
}

.overlay-btn.delete:hover {
  background: rgba(245, 63, 63, 0.9);
}

/* 状态标签 */
.status-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 10px;
  font-size: 10px;
  font-weight: 500;
  border-radius: 999px;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(56, 189, 248, 0.1);
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.3);
}

.spinner {
  width: 10px;
  height: 10px;
  border: 2px solid transparent;
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

/* 提示词区域 */
.card-prompt {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.prompt-text {
  margin: 0;
  font-size: 12px;
  color: var(--text-1);
  line-height: 1.4;
  max-height: 3em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  flex: 1;
}

.prompt-text.expanded {
  -webkit-line-clamp: unset;
  max-height: none;
}

.expand-btn {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  background: rgba(22, 93, 255, 0.1);
  border-radius: 6px;
  color: var(--text-3);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color 0.16s ease, color 0.16s ease;
}

.expand-btn:hover {
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary);
}

/* 底部信息 */
.card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.model-tag {
  padding: 3px 8px;
  border-radius: 6px;
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary);
  font-size: 10px;
  font-weight: 500;
  border: 1px solid rgba(22, 93, 255, 0.25);
}

.time-stamp {
  font-size: 10px;
  color: var(--text-3);
}

/* 暗黑模式下提升卡片与文本对比度 */
:global(body[arco-theme='dark']) .history-card {
  background: color-mix(in srgb, var(--bg-surface-2) 92%, #0b1220);
  border-color: color-mix(in srgb, var(--border-2) 70%, #2b3a55);
}

:global(body[arco-theme='dark']) .history-card:hover {
  background: color-mix(in srgb, var(--bg-surface-3) 78%, #111d33);
  border-color: color-mix(in srgb, var(--border-3) 72%, #3a5182);
}

:global(body[arco-theme='dark']) .history-card.active {
  background: color-mix(in srgb, var(--primary) 18%, #101a2e);
  border-color: color-mix(in srgb, var(--primary) 55%, #6ea8ff);
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.26);
}

:global(body[arco-theme='dark']) .prompt-text {
  color: #e6edf7;
}

:global(body[arco-theme='dark']) .model-tag {
  background: rgba(22, 93, 255, 0.2);
  color: #b7d4ff;
}

:global(body[arco-theme='dark']) .time-stamp {
  color: #9fb0ca;
}
</style>
