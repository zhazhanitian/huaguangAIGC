<script setup lang="ts">
import { computed, ref, watch, nextTick, onUnmounted, onMounted } from 'vue'
import { Modal } from '@arco-design/web-vue'
import { CircleX, Pencil, RefreshCcw, SendHorizontal } from 'lucide-vue-next'
import type { CanvasNode } from '../../../stores/canvas'

const props = defineProps<{
  node: CanvasNode
  selected: boolean
  multiSelected?: boolean
  dragging?: boolean
  zoom: number
  viewport?: { x: number; y: number; zoom: number }
  activeTool?: 'select' | 'upload' | 'shape' | 'text' | 'arrow'
}>()

const nodeType = computed(() => props.node.nodeType || 'card')

// 是否是已完成的图片节点（直接显示图片，不套容器）
const isImageNode = computed(() => {
  const status = String(props.node.status || '')
  return !!props.node.previewUrl && (status === 'done' || status === 'completed') && nodeType.value === 'card'
})

const isRawImageNode = computed(() => nodeType.value === 'image')
const isVideoTaskNode = computed(() => {
  const taskType = String(props.node.taskType || '').toLowerCase()
  return props.node.mode === 'video' || taskType === 'text2video' || taskType === 'img2video'
})
const canEditImage = computed(() => !isVideoTaskNode.value && !!(props.node.previewUrl || props.node.resultUrl))

// 是否是正在生成中的节点
const isGenerating = computed(() => 
  props.node.status === 'running' && 
  nodeType.value === 'card'
)

// 是否是生成失败的节点
const isFailed = computed(() =>
  props.node.status === 'failed' &&
  nodeType.value === 'card'
)

// 计算边框宽度，使其不随画布缩放而变化
const borderWidth = computed(() => {
  const baseWidth = props.multiSelected ? 2 : 3
  return `${baseWidth / props.zoom}px`
})

const emit = defineEmits<{
  (e: 'select'): void
  (e: 'generate'): void
  (e: 'duplicate'): void
  (e: 'drag-start', event: PointerEvent): void
  (e: 'update-size', size: { width: number; height: number; x?: number; y?: number }): void
  (e: 'update-text', text: string): void
  (e: 'edit-prompt', prompt: string): void
}>()

// 编辑提示词相关
const editPromptText = ref('')
const isEditing = ref(false)
const editInputRef = ref<HTMLInputElement | null>(null)
const isTextNodeEditing = ref(false)
const textDraft = ref('')
const textInputRef = ref<HTMLTextAreaElement | null>(null)
const textInputHeight = ref(38)

// 开始编辑
function startEdit() {
  editPromptText.value = props.node.prompt || ''
  isEditing.value = true
  nextTick(() => {
    editInputRef.value?.focus()
  })
}

// 取消编辑
function cancelEdit() {
  isEditing.value = false
  editPromptText.value = ''
}

// 提交编辑
function submitEdit() {
  if (editPromptText.value.trim()) {
    emit('edit-prompt', editPromptText.value.trim())
  }
  isEditing.value = false
  editPromptText.value = ''
}

// 处理键盘事件
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    submitEdit()
  } else if (e.key === 'Escape') {
    cancelEdit()
  }
}

function resizeTextArea() {
  const el = textInputRef.value
  if (!el) return
  el.style.height = '0px'
  textInputHeight.value = Math.max(38, Math.min(360, el.scrollHeight))
  el.style.height = `${textInputHeight.value}px`
}

function startTextEdit() {
  if (nodeType.value !== 'text') return
  textDraft.value = props.node.prompt || ''
  isTextNodeEditing.value = true
  nextTick(() => {
    const el = textInputRef.value
    if (!el) return
    el.focus()
    el.select()
    resizeTextArea()
  })
}

function cancelTextEdit() {
  isTextNodeEditing.value = false
  textDraft.value = ''
  textInputHeight.value = 38
}

function commitTextEdit() {
  if (!isTextNodeEditing.value) return
  const next = textDraft.value.trim()
  if (next) {
    emit('update-text', next)
  }
  cancelTextEdit()
}

function handleTextEditKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    e.preventDefault()
    cancelTextEdit()
    return
  }
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
    e.preventDefault()
    commitTextEdit()
  }
}

// 当选中状态变化时，重置编辑状态
watch(() => props.selected, (selected) => {
  if (!selected) {
    isEditing.value = false
    editPromptText.value = ''
    if (isTextNodeEditing.value) {
      commitTextEdit()
    }
  } else {
    // 刚被选中时，如果文本为空则自动进入编辑模式
    if (nodeType.value === 'text' && !props.node.prompt && !isTextNodeEditing.value) {
      startTextEdit()
    }
  }
})

onMounted(() => {
  if (props.selected && nodeType.value === 'text' && !props.node.prompt && !isTextNodeEditing.value) {
    startTextEdit()
  }
})

const progressValue = () => Math.min(100, Math.max(0, props.node.progress ?? 0))

// 图片真实尺寸（像素）
const naturalWidth = ref(0)
const naturalHeight = ref(0)

// 图片显示尺寸：优先使用节点尺寸，避免覆盖用户手动缩放结果
const imageWidth = computed(() => Math.max(48, props.node.width || naturalWidth.value || 320))
const imageHeight = computed(() => Math.max(48, props.node.height || naturalHeight.value || 320))

// 让工具UI随画布缩放变化，但保持在可读范围内
// 最终屏幕缩放近似为 zoom^0（不会过大/过小）
const overlayUiScale = computed(() => {
  const z = Math.max(props.zoom || 1, 0.05)
  const compensated = Math.pow(z, -0)
  return Math.min(2, Math.max(0.75, compensated))
})

const toolbarStyle = computed(() => ({
  transform: `scale(${overlayUiScale.value})`,
  transformOrigin: 'right bottom',
}))

const bubbleHintStyle = computed(() => ({
  transform: `translateX(-50%) scale(${overlayUiScale.value})`,
  transformOrigin: 'center top',
  bottom: `${-44 * overlayUiScale.value}px`,
}))

const editBubbleStyle = computed(() => ({
  transform: `translateX(-50%) scale(${overlayUiScale.value})`,
  transformOrigin: 'center top',
  bottom: `${-80 * overlayUiScale.value}px`,
}))

// 靠近视口底部时气泡翻到上方，避免被裁切
const shouldFlipBubbleUp = computed(() => {
  const vp = props.viewport
  if (!vp) return false
  const nodeTopScreen = props.node.y * vp.zoom + vp.y
  const nodeBottomScreen = nodeTopScreen + imageHeight.value * vp.zoom
  const estimatedBubbleHeight = isEditing.value ? 96 * overlayUiScale.value : 48 * overlayUiScale.value
  return nodeBottomScreen + estimatedBubbleHeight + 16 > window.innerHeight
})

const bubbleHintPositionStyle = computed(() => {
  if (!shouldFlipBubbleUp.value) return bubbleHintStyle.value
  return {
    transform: `translateX(-50%) scale(${overlayUiScale.value})`,
    transformOrigin: 'center bottom',
    top: `${-44 * overlayUiScale.value}px`,
    bottom: 'auto',
  }
})

const editBubblePositionStyle = computed(() => {
  if (!shouldFlipBubbleUp.value) return editBubbleStyle.value
  return {
    transform: `translateX(-50%) scale(${overlayUiScale.value})`,
    transformOrigin: 'center bottom',
    top: `${-80 * overlayUiScale.value}px`,
    bottom: 'auto',
  }
})

const shapeKind = computed(() => {
  const val = (props.node.params as Record<string, unknown> | undefined)?.shape
  return val === 'circle' ? 'circle' : 'square'
})

const shapeFillColor = computed(() => {
  const val = (props.node.params as Record<string, unknown> | undefined)?.fillColor
  return typeof val === 'string' && val.trim() ? val : '#165DFF'
})

const arrowMeta = computed(() => {
  const p = (props.node.params || {}) as Record<string, unknown>
  const width = props.node.width || 120
  const height = props.node.height || 80
  return {
    color: typeof p.color === 'string' && p.color.trim() ? p.color : '#165DFF',
    startX: typeof p.startX === 'number' ? p.startX : 8,
    startY: typeof p.startY === 'number' ? p.startY : height - 8,
    endX: typeof p.endX === 'number' ? p.endX : width - 8,
    endY: typeof p.endY === 'number' ? p.endY : 8,
    strokeWidth: typeof p.strokeWidth === 'number' ? p.strokeWidth : 4,
  }
})

const failedMessage = computed(() => {
  const explicit = (props.node as CanvasNode & { errorMessage?: string }).errorMessage
  if (explicit && String(explicit).trim()) return String(explicit).trim()
  const fromParams = (props.node.params as Record<string, unknown> | undefined)?.errorMessage
  if (typeof fromParams === 'string' && fromParams.trim()) return fromParams.trim()
  return '任务执行失败，请稍后重试或切换模型。'
})

const failedSummary = computed(() => {
  const msg = failedMessage.value
  return msg.length > 28 ? `${msg.slice(0, 28)}...` : msg
})

function showFailedDetail() {
  Modal.error({
    title: '失败详情',
    content: failedMessage.value,
    okText: '关闭',
    maskClosable: true,
  })
}

// 解析比例字符串，返回宽高比
function parseRatio(ratio: string): { w: number; h: number } {
  if (!ratio || ratio === 'auto') return { w: 1, h: 1 }
  const parts = ratio.split(':').map(Number)
  if (parts.length === 2 && parts[0]! > 0 && parts[1]! > 0) {
    return { w: parts[0]!, h: parts[1]! }
  }
  return { w: 1, h: 1 }
}

// 解析尺寸字符串，返回像素尺寸
function parseSize(size: string): { width: number; height: number } | null {
  if (!size) return null
  // 格式: "1024x1024" 或 "1024x768"
  const match = size.match(/^(\d+)[xX](\d+)$/)
  if (match && match[1] && match[2]) {
    return { width: parseInt(match[1]), height: parseInt(match[2]) }
  }
  return null
}

// 根据尺寸标签获取基础像素
function getSizeBasePixels(sizeLabel: string): number {
  switch (sizeLabel) {
    case '1K': return 1024
    case '2K': return 2048
    case '4K': return 4096
    default: return 1024
  }
}

// 生成中卡片的尺寸（模拟真实比例和尺寸）
const generatingCardSize = computed(() => {
  const params = props.node.params || {}
  const ratio = (params.ratio as string) || '1:1'
  const sizeLabel = (params.size as string) || ''
  
  // 解析比例
  const { w, h } = parseRatio(ratio)
  
  // 计算基础尺寸
  let basePixels = 1024 // 默认 1K
  
  // 如果有尺寸标签（1K, 2K, 4K）
  if (sizeLabel && ['1K', '2K', '4K'].includes(sizeLabel)) {
    basePixels = getSizeBasePixels(sizeLabel)
  } else {
    // 尝试解析 node.size (格式: "1024x1024")
    const parsedSize = parseSize(props.node.size || '')
    if (parsedSize) {
      // 使用解析出的尺寸，但限制最大显示尺寸
      const maxDisplay = 600
      const scale = Math.min(1, maxDisplay / Math.max(parsedSize.width, parsedSize.height))
      return {
        width: Math.round(parsedSize.width * scale),
        height: Math.round(parsedSize.height * scale)
      }
    }
  }
  
  // 根据比例和基础尺寸计算显示尺寸
  // 限制最大显示尺寸为 600px
  const maxDisplay = 600
  const aspectRatio = w / h
  
  let displayWidth: number
  let displayHeight: number
  
  if (aspectRatio >= 1) {
    // 横向或正方形
    displayWidth = Math.min(basePixels, maxDisplay)
    displayHeight = Math.round(displayWidth / aspectRatio)
  } else {
    // 竖向
    displayHeight = Math.min(basePixels, maxDisplay)
    displayWidth = Math.round(displayHeight * aspectRatio)
  }
  
  // 确保最小尺寸
  displayWidth = Math.max(displayWidth, 150)
  displayHeight = Math.max(displayHeight, 150)
  
  return { width: displayWidth, height: displayHeight }
})

// 生成阶段文字
const stageText = computed(() => {
  const p = progressValue()
  if (p < 15) return '初始化'
  if (p < 40) return '构建构图'
  if (p < 70) return '细化细节'
  if (p < 90) return '渲染优化'
  return '即将完成'
})

// 图片加载状态
const imageLoaded = ref(false)
const imageError = ref(false)

function handleImageLoad(event: Event) {
  const img = event.target as HTMLImageElement
  naturalWidth.value = img.naturalWidth
  naturalHeight.value = img.naturalHeight
  imageLoaded.value = true
  
  // 仅在节点尚未设置尺寸时，用图片真实尺寸初始化一次
  if (img.naturalWidth > 0 && img.naturalHeight > 0) {
    const hasNodeSize = (props.node.width || 0) > 0 && (props.node.height || 0) > 0
    if (!hasNodeSize) {
      emit('update-size', { width: img.naturalWidth, height: img.naturalHeight })
    }
  }
}

function handleImageError() {
  imageError.value = true
}

function handlePointerDown(event: PointerEvent) {
  if (nodeType.value === 'text' && props.activeTool === 'text' && event.button === 0) {
    emit('select')
    startTextEdit()
    return
  }
  // 多选状态下优先保留组选择，用于组拖拽
  if (!props.multiSelected) {
    emit('select')
  }
  emit('drag-start', event)
}

const isResizing = ref(false)
type ResizeDirection = 'n' | 's' | 'w' | 'e' | 'nw' | 'ne' | 'sw' | 'se'
const resizeStart = ref({
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  nodeX: 0,
  nodeY: 0,
  direction: 'se' as ResizeDirection,
})
const resizingHandleEl = ref<HTMLElement | null>(null)
const resizeHandles: { direction: ResizeDirection; title: string }[] = [
  { direction: 'nw', title: '左上拉伸' },
  { direction: 'n', title: '上边拉伸' },
  { direction: 'ne', title: '右上拉伸' },
  { direction: 'e', title: '右边拉伸' },
  { direction: 'se', title: '右下拉伸' },
  { direction: 's', title: '下边拉伸' },
  { direction: 'sw', title: '左下拉伸' },
  { direction: 'w', title: '左边拉伸' },
]

const resizeHandleScale = computed(() => {
  const z = Math.max(props.zoom || 1, 0.02)
  return Math.min(2, Math.max(0.9, 1 / z))
})

const resizeHandleStyle = computed(() => ({
  '--resize-handle-scale': `${resizeHandleScale.value}`,
}))

function handleResizeStart(event: PointerEvent, direction: ResizeDirection) {
  event.preventDefault()
  event.stopPropagation()
  isResizing.value = true
  emit('select')
  resizingHandleEl.value = event.currentTarget as HTMLElement | null
  resizeStart.value = {
    x: event.clientX,
    y: event.clientY,
    width: imageWidth.value,
    height: imageHeight.value,
    nodeX: props.node.x,
    nodeY: props.node.y,
    direction,
  }
  resizingHandleEl.value?.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', handleResizeMove)
  window.addEventListener('pointerup', handleResizeEnd)
  window.addEventListener('pointercancel', handleResizeEnd)
}

function handleResizeMove(event: PointerEvent) {
  if (!isResizing.value) return
  const zoom = Math.max(props.zoom || 1, 0.02)
  const dx = (event.clientX - resizeStart.value.x) / zoom
  const dy = (event.clientY - resizeStart.value.y) / zoom
  const minSize = 48
  const dir = resizeStart.value.direction
  const keepAspect = event.shiftKey
  const fromCenter = event.altKey

  const startW = resizeStart.value.width
  const startH = resizeStart.value.height
  const startX = resizeStart.value.nodeX
  const startY = resizeStart.value.nodeY
  const startR = startX + startW
  const startB = startY + startH
  const centerX = startX + startW / 2
  const centerY = startY + startH / 2
  const aspect = Math.max(0.0001, startW / Math.max(1, startH))
  const hSign = dir.includes('w') ? -1 : dir.includes('e') ? 1 : 0
  const vSign = dir.includes('n') ? -1 : dir.includes('s') ? 1 : 0

  let width = startW
  let height = startH
  let x = startX
  let y = startY

  if (!keepAspect) {
    if (hSign !== 0) {
      width = startW + hSign * (fromCenter ? dx * 2 : dx)
    }
    if (vSign !== 0) {
      height = startH + vSign * (fromCenter ? dy * 2 : dy)
    }

    if (width < minSize) {
      width = minSize
    }
    if (height < minSize) {
      height = minSize
    }
  } else {
    let scale = 1
    if (hSign !== 0 && vSign !== 0) {
      const scaleW = (startW + hSign * (fromCenter ? dx * 2 : dx)) / startW
      const scaleH = (startH + vSign * (fromCenter ? dy * 2 : dy)) / startH
      scale = Math.abs(scaleW - 1) >= Math.abs(scaleH - 1) ? scaleW : scaleH
    } else if (hSign !== 0) {
      scale = (startW + hSign * (fromCenter ? dx * 2 : dx)) / startW
    } else if (vSign !== 0) {
      scale = (startH + vSign * (fromCenter ? dy * 2 : dy)) / startH
    }

    // 保持与 Figma 一致：限制翻转，最小值后仍保持比例
    const minScale = Math.max(minSize / startW, minSize / startH)
    if (!Number.isFinite(scale)) scale = 1
    scale = Math.max(minScale, scale)

    width = startW * scale
    height = startH * scale
    if (height <= 0) {
      height = Math.max(minSize, width / aspect)
    }
  }

  if (fromCenter) {
    x = centerX - width / 2
    y = centerY - height / 2
  } else {
    if (hSign < 0) {
      x = startR - width
    } else if (hSign > 0) {
      x = startX
    } else if (keepAspect) {
      x = centerX - width / 2
    } else {
      x = startX
    }

    if (vSign < 0) {
      y = startB - height
    } else if (vSign > 0) {
      y = startY
    } else if (keepAspect) {
      y = centerY - height / 2
    } else {
      y = startY
    }
  }

  emit('update-size', {
    width: Math.round(width),
    height: Math.round(height),
    x: Math.round(x),
    y: Math.round(y),
  })
}

function handleResizeEnd() {
  isResizing.value = false
  resizingHandleEl.value = null
  window.removeEventListener('pointermove', handleResizeMove)
  window.removeEventListener('pointerup', handleResizeEnd)
  window.removeEventListener('pointercancel', handleResizeEnd)
}

// 当 previewUrl 变化时重置状态
watch(() => props.node.previewUrl, () => {
  naturalWidth.value = 0
  naturalHeight.value = 0
  imageLoaded.value = false
  imageError.value = false
})

onUnmounted(() => {
  handleResizeEnd()
  cancelTextEdit()
})

</script>

<template>
  <!-- 已完成的图片：直接显示图片，不套容器 -->
  <div
    v-if="isImageNode"
    class="image-node"
    data-node="true"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <img 
      :src="node.previewUrl" 
      alt="generated"
      :class="{ loaded: imageLoaded }"
      @load="handleImageLoad"
      @error="handleImageError"
      draggable="false"
    />
    <!-- 选中边框 -->
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
    <button
      v-for="handle in selected ? resizeHandles : []"
      :key="`img-${handle.direction}`"
      class="resize-handle"
      :class="`resize-handle-${handle.direction}`"
      :style="resizeHandleStyle"
      :title="handle.title"
      @pointerdown.stop.prevent="handleResizeStart($event, handle.direction)"
    />
    <!-- 悬停工具栏 -->
    <div class="image-toolbar" :style="toolbarStyle" @pointerdown.stop @click.stop>
      <button v-if="canEditImage" class="tool-btn tool-btn-edit" title="编辑提示词" @pointerdown.stop @click.stop="startEdit">
        <Pencil :size="16" />
      </button>
      <button class="tool-btn tool-btn-regen" title="重新生成" @pointerdown.stop @click.stop="emit('generate')">
        <RefreshCcw :size="16" />
      </button>
    </div>

    <!-- 选中时底部提示词编辑气泡 -->
    <div
      v-if="canEditImage && selected && !isEditing"
      class="edit-bubble-hint"
      :style="bubbleHintPositionStyle"
      @pointerdown.stop
      @click.stop="startEdit"
    >
      <Pencil :size="14" />
      <span>输入提示词编辑图片...</span>
    </div>

    <div v-if="isEditing" class="edit-bubble" :style="editBubblePositionStyle" @pointerdown.stop @click.stop>
      <div class="edit-bubble-inner">
        <input
          ref="editInputRef"
          v-model="editPromptText"
          class="edit-input"
          placeholder="描述你想要的修改..."
          @keydown="handleKeydown"
        />
        <button class="edit-send" :disabled="!editPromptText.trim()" @click="submitEdit">
          <SendHorizontal :size="15" />
        </button>
      </div>
      <div class="edit-hint">按 Enter 发送 · Esc 取消</div>
    </div>
  </div>

  <!-- 生成中的卡片：紧凑的进度展示 -->
  <div
    v-else-if="isGenerating"
    class="generating-node"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${generatingCardSize.width}px`,
      height: `${generatingCardSize.height}px`,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <!-- 背景动画 -->
    <div class="generating-bg">
      <div class="shimmer" />
    </div>
    
    <!-- 进度环 -->
    <div class="progress-ring">
      <svg viewBox="0 0 100 100">
        <circle 
          class="progress-ring-bg" 
          cx="50" cy="50" r="42" 
          fill="none" 
          stroke="rgba(255,255,255,0.1)" 
          stroke-width="6"
        />
        <circle 
          class="progress-ring-fill" 
          cx="50" cy="50" r="42" 
          fill="none" 
          stroke="url(#progressGradient)" 
          stroke-width="6"
          stroke-linecap="round"
          :stroke-dasharray="`${progressValue() * 24} 264`"
          transform="rotate(-90 50 50)"
        />
        <defs>
          <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stop-color="#165DFF" />
            <stop offset="100%" stop-color="#22d3ee" />
          </linearGradient>
        </defs>
      </svg>
      <div class="progress-text">
        <span class="progress-percent">{{ Math.round(progressValue()) }}</span>
        <span class="progress-symbol">%</span>
      </div>
    </div>
    
    <!-- 状态信息 -->
    <div class="generating-info">
      <span class="stage-text">{{ stageText }}</span>
      <span class="model-tag">{{ node.model || node.provider || 'AI' }}</span>
    </div>
    
    <!-- 提示词预览（截断） -->
    <div class="prompt-preview" v-if="node.prompt">
      {{ node.prompt.slice(0, 50) }}{{ node.prompt.length > 50 ? '...' : '' }}
    </div>
    
    <!-- 选中边框 -->
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
  </div>

  <!-- 生成失败的卡片 -->
  <div
    v-else-if="isFailed"
    class="failed-node"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${generatingCardSize.width}px`,
      height: `${generatingCardSize.height}px`,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <div class="failed-content">
      <CircleX class="failed-icon" :size="32" />
      <span class="failed-text">生成失败</span>
      <p class="failed-summary">{{ failedSummary }}</p>
      <button class="detail-btn" @pointerdown.stop @click.stop="showFailedDetail">查看详情</button>
      <button class="retry-btn" @pointerdown.stop @click.stop="emit('generate')">
        <RefreshCcw :size="14" />
        重试
      </button>
    </div>
    <div v-if="selected" class="selection-border failed-border" />
  </div>

  <!-- 上传图片：按图片本体显示（无卡片壳） -->
  <div
    v-else-if="isRawImageNode"
    class="raw-image-node"
    data-node="true"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${imageWidth}px`,
      height: `${imageHeight}px`,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <img
      v-if="node.previewUrl && !imageError"
      :src="node.previewUrl"
      alt="uploaded"
      :class="{ loaded: imageLoaded }"
      @load="handleImageLoad"
      @error="handleImageError"
      draggable="false"
    />
    <div v-if="node.previewUrl && imageError" class="raw-image-placeholder">图片加载失败</div>
    <div v-else-if="!node.previewUrl" class="raw-image-placeholder">图片上传中...</div>
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
    <button
      v-for="handle in selected ? resizeHandles : []"
      :key="`raw-${handle.direction}`"
      class="resize-handle"
      :class="`resize-handle-${handle.direction}`"
      :style="resizeHandleStyle"
      :title="handle.title"
      @pointerdown.stop.prevent="handleResizeStart($event, handle.direction)"
    />

    <!-- 上传图片：同款工具栏与气泡编辑 -->
    <div class="image-toolbar" :style="toolbarStyle" @pointerdown.stop @click.stop>
      <button v-if="canEditImage" class="tool-btn tool-btn-edit" title="编辑提示词" @pointerdown.stop @click.stop="startEdit">
        <Pencil :size="16" />
      </button>
      <button class="tool-btn tool-btn-regen" title="重新生成" @pointerdown.stop @click.stop="emit('generate')">
        <RefreshCcw :size="16" />
      </button>
    </div>

    <div
      v-if="canEditImage && selected && !isEditing"
      class="edit-bubble-hint"
      :style="bubbleHintPositionStyle"
      @pointerdown.stop
      @click.stop="startEdit"
    >
      <Pencil :size="14" />
      <span>输入提示词编辑图片...</span>
    </div>

    <div v-if="isEditing" class="edit-bubble" :style="editBubblePositionStyle" @pointerdown.stop @click.stop>
      <div class="edit-bubble-inner">
        <input
          ref="editInputRef"
          v-model="editPromptText"
          class="edit-input"
          placeholder="描述你想要的修改..."
          @keydown="handleKeydown"
        />
        <button class="edit-send" :disabled="!editPromptText.trim()" @click="submitEdit">
          <SendHorizontal :size="15" />
        </button>
      </div>
      <div class="edit-hint">按 Enter 发送 · Esc 取消</div>
    </div>
  </div>

  <!-- 色块：按本体显示（无卡片壳） -->
  <div
    v-else-if="nodeType === 'shape'"
    class="raw-shape-node"
    data-node="true"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width || 80}px`,
      height: `${node.height || 80}px`,
      background: shapeFillColor,
      borderRadius: shapeKind === 'circle' ? '50%' : '14px',
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
  </div>

  <!-- 箭头：按本体显示（无卡片壳） -->
  <div
    v-else-if="nodeType === 'arrow'"
    class="raw-arrow-node"
    data-node="true"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: `${node.width || 120}px`,
      height: `${node.height || 80}px`,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <svg class="arrow-node" :width="node.width || 120" :height="node.height || 80">
      <defs>
        <marker :id="`arrowHead-${node.id}`" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
          <polygon points="0 0, 7 3, 0 7" :fill="arrowMeta.color" />
        </marker>
      </defs>
      <line
        :x1="arrowMeta.startX"
        :y1="arrowMeta.startY"
        :x2="arrowMeta.endX"
        :y2="arrowMeta.endY"
        :stroke="arrowMeta.color"
        :stroke-width="arrowMeta.strokeWidth"
        :marker-end="`url(#arrowHead-${node.id})`"
      />
    </svg>
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
  </div>

  <!-- 文本：按本体显示（无卡片壳） -->
  <div
    v-else-if="nodeType === 'text'"
    class="raw-text-node"
    data-node="true"
    :class="{ selected, dragging: dragging, 'tool-text-active': activeTool === 'text' }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: node.width ? `${node.width}px` : undefined,
      height: node.height ? `${node.height}px` : undefined,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
    @dblclick.stop="startTextEdit"
  >
    <textarea
      v-if="isTextNodeEditing"
      ref="textInputRef"
      v-model="textDraft"
      class="text-editor"
      :style="{ height: `${textInputHeight}px` }"
      rows="1"
      placeholder="输入文本（Ctrl/Cmd+Enter 确认）"
      @pointerdown.stop
      @click.stop
      @keydown="handleTextEditKeydown"
      @input="resizeTextArea"
      @blur="commitTextEdit"
    />
    <p v-else class="text-content">{{ node.prompt || '双击输入文本' }}</p>
  </div>

  <!-- 框：按本体显示（无卡片壳） -->
  <div
    v-else-if="nodeType === 'frame'"
    class="raw-frame-node"
    data-node="true"
    :class="{ selected, dragging: dragging }"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: node.width ? `${node.width}px` : undefined,
      height: node.height ? `${node.height}px` : undefined,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <div class="frame-title">{{ node.title || '画框' }}</div>
    <div v-if="selected || multiSelected" class="selection-border" :class="{ 'multi-selected': multiSelected }" :style="{ borderWidth }" />
  </div>

  <!-- 其他类型节点：保留原有卡片样式 -->
  <div
    v-else
    class="node-card"
    data-node="true"
    :class="[node.status, { selected, dragging: dragging }, nodeType]"
    :style="{
      left: `${node.x}px`,
      top: `${node.y}px`,
      width: node.width ? `${node.width}px` : undefined,
      height: node.height ? `${node.height}px` : undefined,
      zIndex: node.zIndex ?? 1,
    }"
    @pointerdown.stop="handlePointerDown"
  >
    <header class="node-header">
      <div>
        <p class="node-title">{{ node.title }}</p>
        <span class="node-tag">{{ node.tag }}</span>
      </div>
      <span class="node-status">待命</span>
    </header>

    <p class="node-prompt">{{ node.prompt }}</p>
    <div class="node-actions">
      <button class="ghost" @click.stop="emit('duplicate')">复用参数</button>
      <button class="primary" @click.stop="emit('generate')">开始生成</button>
    </div>
  </div>
</template>


<style scoped>
/* 图片节点样式 */
.image-node {
  position: absolute;
  touch-action: none;
  border-radius: 8px;
  overflow: visible;
  cursor: grab;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s;
  /* GPU 加速优化 */
  will-change: transform;
  transform: translateZ(0);
}

.image-node:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
}

.image-node.selected {
  box-shadow: 0 0 0 2px var(--primary, #165DFF), 0 4px 16px rgba(0, 0, 0, 0.15);
}

.image-node img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.image-node img.loaded {
  opacity: 1;
}

.image-node.dragging,
.raw-image-node.dragging,
.generating-node.dragging,
.failed-node.dragging,
.node-card.dragging,
.raw-shape-node.dragging,
.raw-arrow-node.dragging,
.raw-text-node.dragging,
.raw-frame-node.dragging {
  transition: none !important;
}

.image-node.dragging,
.raw-image-node.dragging,
.generating-node.dragging,
.failed-node.dragging,
.node-card.dragging {
  box-shadow: none !important;
}

.generating-node.dragging .shimmer,
.generating-node.dragging .progress-ring-fill {
  animation: none !important;
  transition: none !important;
}

.image-node.dragging .image-toolbar,
.raw-image-node.dragging .image-toolbar,
.image-node.dragging .edit-bubble,
.raw-image-node.dragging .edit-bubble,
.image-node.dragging .edit-bubble-hint,
.raw-image-node.dragging .edit-bubble-hint {
  opacity: 0 !important;
  pointer-events: none;
}

.selection-border {
  position: absolute;
  inset: 0;
  border: 2px solid var(--primary, #165DFF);
  border-radius: 8px;
  pointer-events: none;
}

.resize-handle {
  position: absolute;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.95);
  background: #165DFF;
  transform: translate(-50%, -50%) scale(var(--resize-handle-scale, 1));
  z-index: 15;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  touch-action: none;
  padding: 0;
}

.resize-handle-nw { left: 0; top: 0; cursor: nwse-resize; }
.resize-handle-n { left: 50%; top: 0; cursor: ns-resize; }
.resize-handle-ne { left: 100%; top: 0; cursor: nesw-resize; }
.resize-handle-e { left: 100%; top: 50%; cursor: ew-resize; }
.resize-handle-se { left: 100%; top: 100%; cursor: nwse-resize; }
.resize-handle-s { left: 50%; top: 100%; cursor: ns-resize; }
.resize-handle-sw { left: 0; top: 100%; cursor: nesw-resize; }
.resize-handle-w { left: 0; top: 50%; cursor: ew-resize; }

.resize-handle:hover {
  background: #4080FF;
}

.selection-border.multi-selected {
  border-color: var(--primary, #165DFF);
  border-style: dashed;
}

.failed-border {
  border-color: #F53F3F;
}

.image-toolbar {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 6px;
  padding: 4px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(18, 23, 33, 0.56);
  backdrop-filter: blur(8px);
  opacity: 0;
  pointer-events: none;
  transform: translateY(4px) scale(0.96);
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.image-node:hover .image-toolbar,
.raw-image-node:hover .image-toolbar,
.image-node.selected .image-toolbar,
.raw-image-node.selected .image-toolbar {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(0) scale(1);
}

.image-toolbar .tool-btn {
  width: 30px;
  height: 30px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s ease, transform 0.2s ease, box-shadow 0.2s ease;
}

.image-toolbar .tool-btn svg {
  width: 16px;
  height: 16px;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.image-toolbar .tool-btn:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px) scale(1.03);
  box-shadow: 0 6px 12px rgba(0, 0, 0, 0.28);
}

.image-toolbar .tool-btn-regen:hover {
  background: rgba(22, 93, 255, 0.3);
}

/* ── 选中时底部提示词气泡（极简风格） ── */
.edit-bubble-hint {
  position: absolute;
  left: 50%;
  bottom: -44px;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--bg-surface-2);
  border: none;
  border-radius: 8px;
  color: var(--text-3);
  font-size: 12px;
  white-space: nowrap;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
  transition: color 0.15s, box-shadow 0.15s;
  z-index: 20;
}

.edit-bubble-hint:hover {
  color: var(--text-1);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.edit-bubble-hint svg {
  opacity: 0.5;
}

.edit-bubble {
  position: absolute;
  left: 50%;
  bottom: -80px;
  width: max(300px, 100%);
  max-width: 440px;
  z-index: 20;
  animation: bubble-in 0.15s ease-out;
}

@keyframes bubble-in {
  from { opacity: 0; transform: translateX(-50%) translateY(4px); }
  to { opacity: 1; transform: translateX(-50%) translateY(0); }
}

.edit-bubble-inner {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 14px;
  background: var(--bg-surface-2);
  border: none;
  border-radius: 10px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}

.edit-input {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-1);
  font-size: 13px;
  outline: none;
  padding: 7px 0;
  min-width: 0;
}

.edit-input::placeholder {
  color: var(--text-4);
}

.edit-send {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  border: none;
  background: var(--primary, #165DFF);
  color: var(--text-1);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
  padding: 0;
}

.edit-send:hover:not(:disabled) {
  opacity: 0.85;
}

.edit-send:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

.edit-hint {
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.3);
  margin-top: 6px;
}

/* 生成中节点样式 */
.generating-node {
  position: absolute;
  touch-action: none;
  border-radius: 12px;
  overflow: hidden;
  cursor: grab;
  background: var(--bg-surface-2);
  border: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px;
  /* GPU 加速优化 */
  will-change: transform;
  transform: translateZ(0);
}

.generating-node.selected {
  box-shadow: 0 0 0 2px var(--primary, #165DFF), 0 4px 16px rgba(0, 0, 0, 0.15);
}

.generating-bg {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.shimmer {
  position: absolute;
  inset: -100%;
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(22, 93, 255, 0.1) 50%,
    transparent 100%
  );
  animation: shimmer 2s infinite;
}

@keyframes shimmer {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}

.progress-ring {
  position: relative;
  width: 80px;
  height: 80px;
  margin-bottom: 16px;
}

.progress-ring svg {
  width: 100%;
  height: 100%;
}

.progress-ring-fill {
  transition: stroke-dasharray 0.3s ease;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-1);
}

.progress-percent {
  font-size: 20px;
  font-weight: 700;
}

.progress-symbol {
  font-size: 12px;
  font-weight: 500;
  opacity: 0.7;
  margin-left: 2px;
}

.generating-info {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  margin-bottom: 12px;
}

.stage-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-1);
}

.model-tag {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 999px;
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary-light);
}

.prompt-preview {
  font-size: 11px;
  color: var(--text-4);
  text-align: center;
  max-width: 90%;
  line-height: 1;
}

/* 失败节点样式 */
.failed-node {
  position: absolute;
  touch-action: none;
  border-radius: 12px;
  overflow: hidden;
  cursor: grab;
  background: var(--bg-surface-2);
  border: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
}

.failed-node.selected {
  box-shadow: 0 0 0 2px #F53F3F, 0 4px 16px rgba(0, 0, 0, 0.15);
}

.failed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 20px;
}

.failed-icon {
  color: #fca5a5;
}

.failed-text {
  font-size: 14px;
  font-weight: 500;
  color: #fecaca;
}

.failed-summary {
  margin: 0;
  max-width: 220px;
  text-align: center;
  font-size: 12px;
  line-height: 1;
  color: rgba(254, 202, 202, 0.8);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.detail-btn {
  flex: 0 0 auto;
  width: auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 6px;
  border: none;
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s;
}

.detail-btn:hover {
  background: rgba(255, 255, 255, 0.14);
}

.retry-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 6px;
  border: none;
  background: #F53F3F;
  color: var(--text-1);
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.12s;
}

.retry-btn:hover {
  opacity: 0.85;
}

/* 卡片节点样式 */
.node-card {
  position: absolute;
  width: 280px;
  touch-action: none;
  padding: 14px;
  border-radius: 12px;
  background: var(--bg-surface-2);
  border: none;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  color: var(--text-1);
  transition: box-shadow 0.15s;
  /* GPU 加速优化 */
  will-change: transform;
  transform: translateZ(0);
}

.node-card.frame {
  background: transparent;
  border: 1.5px dashed rgba(59, 130, 246, 0.35);
  box-shadow: none;
  padding: 10px;
}

.node-card.frame .frame-title {
  font-size: 12px;
  color: var(--primary-light);
  background: rgba(59, 130, 246, 0.15);
  padding: 4px 8px;
  border-radius: 8px;
  display: inline-block;
}

.raw-image-node,
.raw-shape-node,
.raw-arrow-node,
.raw-text-node,
.raw-frame-node {
  position: absolute;
  touch-action: none;
  cursor: grab;
}

.raw-image-node {
  overflow: visible;
}

.raw-image-node img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 8px;
  opacity: 0;
  transition: opacity 0s ease;
}

.raw-image-node img.loaded {
  opacity: 1;
}

.raw-image-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: 1px dashed rgba(148, 163, 184, 0.1);
  background: rgba(35, 35, 36, 0.1);
  color: rgba(35, 35, 36, 0.75);
  font-size: 12px;
}

.arrow-node {
  display: block;
  overflow: visible;
}

.raw-text-node .text-content {
  margin: 0;
  font-size: 18px;
  line-height: 1.35;
  color: var(--color-text-1, #1f2937);
  white-space: pre-wrap;
  min-width: 24px;
  user-select: none;
  cursor: text;
  word-break: break-word;
}

.raw-text-node.tool-text-active {
  cursor: text;
}

.raw-text-node .text-editor {
  width: 100%;
  min-width: 120px;
  min-height: 38px;
  max-height: 560px;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 0;
  margin: 0;
  resize: none;
  outline: none;
  font-size: 18px;
  line-height: 1.35;
  color: var(--color-text-1, #1f2937);
  background: transparent;
  box-shadow: none;
  font-family: inherit;
  overflow: hidden;
}

.raw-text-node .text-editor::placeholder {
  color: var(--color-text-3, #86909c);
}

.raw-text-node .text-editor:focus {
  border-color: rgba(22, 93, 255, 0.5);
  background: var(--color-fill-1, rgba(255, 255, 255, 0.05));
}

.raw-frame-node {
  border: 2px dashed rgba(59, 130, 246, 0.7);
  border-radius: 12px;
  background: rgba(59, 130, 246, 0.05);
}

.raw-frame-node .frame-title {
  margin: 6px;
  display: inline-block;
  font-size: 12px;
  color: var(--primary-light);
  background: rgba(59, 130, 246, 0.15);
  padding: 4px 8px;
  border-radius: 8px;
}

.node-card.text {
  background: transparent;
  border: none;
  box-shadow: none;
  padding: 0;
  color: #232324;
}

.node-card.text .text-content {
  margin: 0;
  font-size: 14px;
  color: #232324;
}


.node-card.selected {
  box-shadow: 0 0 0 2px var(--primary, #165DFF), 0 4px 16px rgba(0, 0, 0, 0.12);
}

.node-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.node-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.node-tag {
  display: inline-flex;
  padding: 2px 8px;
  margin-top: 6px;
  border-radius: 999px;
  font-size: 11px;
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.1);
}

.node-status {
  font-size: 11px;
  color: var(--text-3);
}

.node-prompt {
  margin: 12px 0 10px;
  font-size: 12px;
  line-height: 1;
  color: var(--text-2);
}

.node-actions {
  display: flex;
  gap: 8px;
}

button {
  flex: 1;
  border: none;
  padding: 8px 10px;
  border-radius: 10px;
  font-size: 12px;
  cursor: pointer;
  transition: transform 0s ease, box-shadow 0s ease, background 0s ease;
}

button.primary {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.9), rgba(64, 128, 255, 0.9));
  color: var(--text-1);
}

button.ghost {
  background: rgba(148, 163, 184, 0.2);
  color: var(--text-2);
}

button:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 14px rgba(35, 35, 36, 0.1);
}

.resize-handle,
.resize-handle:hover {
  border: 2px solid rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.35);
  transform: translate(-50%, -50%) scale(var(--resize-handle-scale, 1));
}

/* 覆盖通用 button 规则，确保气泡发送按钮固定宽度 */
.edit-bubble .edit-send {
  flex: 0 0 30px;
  width: 30px;
  min-width: 30px;
  height: 30px;
  padding: 0;
}
</style>
