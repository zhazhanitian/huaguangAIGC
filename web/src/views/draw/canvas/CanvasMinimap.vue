<script setup lang="ts">
import { computed, ref } from 'vue'
import type { CanvasNode } from '../../../stores/canvas'

const props = defineProps<{
  nodes: CanvasNode[]
  viewport: { x: number; y: number; zoom: number }
  viewportSize: { width: number; height: number }
}>()

const emit = defineEmits<{
  (e: 'update:viewport', value: { x: number; y: number; zoom: number }): void
}>()

const mapRef = ref<HTMLElement | null>(null)
const dragMode = ref<'none' | 'viewport' | 'selection'>('none')
const selectionStart = ref({ x: 0, y: 0 })
const selectionCurrent = ref({ x: 0, y: 0 })

const bounds = computed(() => {
  const viewLeft = -props.viewport.x / props.viewport.zoom
  const viewTop = -props.viewport.y / props.viewport.zoom
  const viewRight = viewLeft + props.viewportSize.width / props.viewport.zoom
  const viewBottom = viewTop + props.viewportSize.height / props.viewport.zoom
  if (props.nodes.length === 0) {
    return { minX: viewLeft - 300, minY: viewTop - 300, maxX: viewRight + 300, maxY: viewBottom + 300 }
  }
  const xs = props.nodes.map((n) => n.x)
  const ys = props.nodes.map((n) => n.y)
  return {
    minX: Math.min(...xs, viewLeft) - 220,
    minY: Math.min(...ys, viewTop) - 220,
    maxX: Math.max(...xs, viewRight) + 420,
    maxY: Math.max(...ys, viewBottom) + 320,
  }
})

const viewBox = computed(() => ({
  width: Math.max(1, bounds.value.maxX - bounds.value.minX),
  height: Math.max(1, bounds.value.maxY - bounds.value.minY),
}))

const scale = computed(() => {
  const mapW = 180
  const mapH = 126
  return Math.min(mapW / viewBox.value.width, mapH / viewBox.value.height)
})

function mapX(x: number) {
  return (x - bounds.value.minX) * scale.value
}

function mapY(y: number) {
  return (y - bounds.value.minY) * scale.value
}

function unmapX(x: number) {
  return x / scale.value + bounds.value.minX
}

function unmapY(y: number) {
  return y / scale.value + bounds.value.minY
}

const viewportStyle = computed(() => {
  const viewLeft = -props.viewport.x / props.viewport.zoom
  const viewTop = -props.viewport.y / props.viewport.zoom
  const viewWidth = props.viewportSize.width / props.viewport.zoom
  const viewHeight = props.viewportSize.height / props.viewport.zoom
  return {
    width: `${Math.max(10, viewWidth * scale.value)}px`,
    height: `${Math.max(8, viewHeight * scale.value)}px`,
    transform: `translate(${mapX(viewLeft)}px, ${mapY(viewTop)}px)`,
  }
})

const mapSelectionStyle = computed(() => {
  if (dragMode.value !== 'selection') return null
  const x = Math.min(selectionStart.value.x, selectionCurrent.value.x)
  const y = Math.min(selectionStart.value.y, selectionCurrent.value.y)
  const width = Math.abs(selectionCurrent.value.x - selectionStart.value.x)
  const height = Math.abs(selectionCurrent.value.y - selectionStart.value.y)
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` }
})

function updateViewportByCenter(worldX: number, worldY: number, zoom = props.viewport.zoom) {
  emit('update:viewport', {
    x: props.viewportSize.width / 2 - worldX * zoom,
    y: props.viewportSize.height / 2 - worldY * zoom,
    zoom,
  })
}

function getMapPoint(event: PointerEvent) {
  const rect = mapRef.value?.getBoundingClientRect()
  if (!rect) return null
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function handlePointerDown(event: PointerEvent) {
  const point = getMapPoint(event)
  if (!point) return
  if (event.shiftKey) {
    dragMode.value = 'selection'
    selectionStart.value = point
    selectionCurrent.value = point
  } else {
    const target = event.target as HTMLElement | null
    if (target?.closest('.viewport')) {
      dragMode.value = 'viewport'
      const worldX = unmapX(point.x)
      const worldY = unmapY(point.y)
      updateViewportByCenter(worldX, worldY)
    } else {
      dragMode.value = 'viewport'
      const worldX = unmapX(point.x)
      const worldY = unmapY(point.y)
      updateViewportByCenter(worldX, worldY)
    }
  }
  mapRef.value?.setPointerCapture(event.pointerId)
}

function handlePointerMove(event: PointerEvent) {
  if (dragMode.value === 'none') return
  const point = getMapPoint(event)
  if (!point) return
  if (dragMode.value === 'selection') {
    selectionCurrent.value = point
    return
  }
  const worldX = unmapX(point.x)
  const worldY = unmapY(point.y)
  updateViewportByCenter(worldX, worldY)
}

function handlePointerUp(event: PointerEvent) {
  if (dragMode.value === 'selection') {
    const x = Math.min(selectionStart.value.x, selectionCurrent.value.x)
    const y = Math.min(selectionStart.value.y, selectionCurrent.value.y)
    const width = Math.abs(selectionCurrent.value.x - selectionStart.value.x)
    const height = Math.abs(selectionCurrent.value.y - selectionStart.value.y)
    if (width > 6 && height > 6) {
      const worldLeft = unmapX(x)
      const worldTop = unmapY(y)
      const worldRight = unmapX(x + width)
      const worldBottom = unmapY(y + height)
      const worldW = Math.max(10, worldRight - worldLeft)
      const worldH = Math.max(10, worldBottom - worldTop)
      const fitZoom = Math.min(
        2,
        Math.max(
          0.02,
          Math.min(props.viewportSize.width / worldW, props.viewportSize.height / worldH),
        ),
      )
      updateViewportByCenter((worldLeft + worldRight) / 2, (worldTop + worldBottom) / 2, fitZoom)
    }
  }
  dragMode.value = 'none'
  mapRef.value?.releasePointerCapture(event.pointerId)
}
</script>

<template>
  <div class="minimap">
    <div
      ref="mapRef"
      class="map"
      @pointerdown.stop="handlePointerDown"
      @pointermove.stop="handlePointerMove"
      @pointerup.stop="handlePointerUp"
      @pointercancel.stop="handlePointerUp"
      @pointerleave.stop="handlePointerUp"
    >
      <span
        v-for="node in nodes"
        :key="node.id"
        class="dot"
        :style="{ left: `${mapX(node.x)}px`, top: `${mapY(node.y)}px` }"
      />
      <div class="viewport" :style="viewportStyle" />
      <div v-if="mapSelectionStyle" class="map-selection" :style="mapSelectionStyle" />
    </div>
    <p class="label">Minimap (拖拽移动 / Shift 框选定位)</p>
  </div>
</template>

<style scoped>
.minimap {
  position: absolute;
  right: 16px;
  bottom: 16px;
  width: 202px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(15, 23, 42, 0.72);
  border: 1px solid rgba(148, 163, 184, 0.28);
  backdrop-filter: blur(10px);
  z-index: 14;
}

.map {
  position: relative;
  width: 180px;
  height: 126px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.08);
  border: 1px solid rgba(148, 163, 184, 0.2);
  overflow: hidden;
  touch-action: none;
  cursor: crosshair;
}

.dot {
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(34, 211, 238, 0.9);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.5);
  transform: translate(-50%, -50%);
}

.viewport {
  position: absolute;
  left: 0;
  top: 0;
  border: 1px solid rgba(34, 211, 238, 0.9);
  border-radius: 5px;
  background: rgba(34, 211, 238, 0.08);
  box-shadow: 0 0 20px rgba(34, 211, 238, 0.25);
}

.map-selection {
  position: absolute;
  border: 1px dashed rgba(34, 211, 238, 0.9);
  background: rgba(34, 211, 238, 0.15);
}

.label {
  margin: 6px 0 0;
  font-size: 11px;
  color: rgba(226, 232, 240, 0.82);
}
</style>
