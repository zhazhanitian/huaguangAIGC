<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { CanvasNode } from '../../../stores/canvas'
import CanvasNodeCard from './CanvasNodeCard.vue'

const props = defineProps<{
  nodes: CanvasNode[]
  viewport: { x: number; y: number; zoom: number }
  selectedId: string
  selectedIds: string[]
  activeTool: 'select' | 'upload' | 'shape' | 'text' | 'arrow'
  shapeKind: 'square' | 'circle'
  shapeColor: string
  snapEnabled: boolean
  snapThreshold: number
  snapGridSize: number
}>()


const emit = defineEmits<{
  (e: 'update:viewport', value: { x: number; y: number; zoom: number }): void
  (e: 'select', id: string): void
  (e: 'select-multiple', ids: string[]): void
  (e: 'generate', id: string): void
  (e: 'duplicate', id: string): void
  (e: 'update-node', payload: { id: string; patch: Partial<CanvasNode> }): void
  (e: 'move-nodes', payload: Array<{ id: string; x: number; y: number }>): void
  (e: 'create-node', payload: Partial<CanvasNode>): void
  (e: 'edit-image', payload: { nodeId: string; prompt: string }): void
}>()



const stageRef = ref<HTMLElement | null>(null)
const view = ref({ ...props.viewport })
const isPanning = ref(false)
const isDragging = ref(false)
const draggingIds = ref<string[]>([])
const isSelecting = ref(false)
const isShaping = ref(false)
const isArrowing = ref(false)
const isTextPlacing = ref(false)
const textStartWorld = ref({ x: 0, y: 0 })
const textDraft = ref({ x: 0, y: 0, width: 0, height: 0 })

const lastPoint = ref({ x: 0, y: 0 })
const dragStartWorld = ref({ x: 0, y: 0 })
const selectStart = ref({ x: 0, y: 0 })
const selection = ref({ x: 0, y: 0, width: 0, height: 0 })
const shapeStart = ref({ x: 0, y: 0 })
const shapeDraft = ref({ x: 0, y: 0, width: 0, height: 0 })
const arrowStart = ref({ x: 0, y: 0 })
const arrowCurrent = ref({ x: 0, y: 0 })
const arrowDraft = ref({ x: 0, y: 0, width: 0, height: 0 })
const stageSize = ref({ width: 0, height: 0 })
const snapGuides = ref<Array<{ axis: 'x' | 'y'; value: number }>>([])
const dragBypassSnap = ref(false)
const lastPointerClient = ref({ x: 0, y: 0 })


let rafId: number | null = null
let dragRaf: number | null = null
let interactionRaf: number | null = null
let pendingView: { x: number; y: number; zoom: number } | null = null
let pendingDragWorld: { x: number; y: number } | null = null
let pendingInteraction: { world: { x: number; y: number }; shift: boolean; alt: boolean } | null = null
let dragStartPositions = new Map<string, { x: number; y: number }>()
let dragNodeEls = new Map<string, HTMLElement>()
let cachedStageRect: DOMRect | null = null
let resizeObserver: ResizeObserver | null = null
let autoPanRaf: number | null = null
const edgePanVelocity = ref({ x: 0, y: 0 })
const draggingIdSet = computed(() => new Set(draggingIds.value))


watch(
  () => props.viewport,
  (v) => {
    view.value = { ...v }
  },
  { deep: true },
)

const stageClass = computed(() => `tool-${props.activeTool}`)

function scheduleViewport(nextView: { x: number; y: number; zoom: number }) {
  pendingView = nextView
  if (rafId !== null) return
  rafId = window.requestAnimationFrame(() => {
    if (pendingView) {
      view.value = pendingView
      emit('update:viewport', pendingView)
      pendingView = null
    }
    rafId = null
  })
}

function getWorldPoint(event: PointerEvent) {
  const rect = cachedStageRect ?? stageRef.value?.getBoundingClientRect()
  if (!rect) return null
  return {
    x: (event.clientX - rect.left - view.value.x) / view.value.zoom,
    y: (event.clientY - rect.top - view.value.y) / view.value.zoom,
  }
}

function clamp(num: number, min: number, max: number) {
  return Math.max(min, Math.min(max, num))
}

function getTextNodeSizeByContent(text: string, preferredWidth?: number) {
  const width = clamp(
    Math.round(preferredWidth ?? 220),
    120,
    920,
  )
  const charsPerLine = Math.max(1, Math.floor((width - 24) / 10))
  const wrappedLines = String(text || '')
    .split('\n')
    .reduce((sum, line) => sum + Math.max(1, Math.ceil(line.length / charsPerLine)), 0)
  const height = clamp(Math.round(wrappedLines * 26 + 12), 38, 560)
  return { width, height }
}

function handleTextUpdate(id: string, prompt: string) {
  const next = String(prompt || '').trim()
  if (!next) return
  const node = props.nodes.find((n) => n.id === id)
  const size = getTextNodeSizeByContent(next, node?.width || 220)
  emit('update-node', {
    id,
    patch: { prompt: next, width: size.width, height: size.height },
  })
}

function getNodeElement(id: string) {
  return stageRef.value?.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null
}

function getNodeSize(node: CanvasNode) {
  const width = node.width ?? (node.nodeType === 'text' ? 180 : node.nodeType === 'frame' ? 240 : 280)
  const height = node.height ?? (node.nodeType === 'text' ? 40 : node.nodeType === 'frame' ? 160 : 220)
  return { width, height }
}

function updateStageSize() {
  const el = stageRef.value
  if (!el) return
  stageSize.value = { width: el.clientWidth, height: el.clientHeight }
}

function updateEdgePanVelocity(clientX: number, clientY: number) {
  const rect = cachedStageRect ?? stageRef.value?.getBoundingClientRect()
  if (!rect) return
  const threshold = 64
  const maxSpeed = 18
  let vx = 0
  let vy = 0
  if (clientX < rect.left + threshold) {
    vx = -((rect.left + threshold - clientX) / threshold) * maxSpeed
  } else if (clientX > rect.right - threshold) {
    vx = ((clientX - (rect.right - threshold)) / threshold) * maxSpeed
  }
  if (clientY < rect.top + threshold) {
    vy = -((rect.top + threshold - clientY) / threshold) * maxSpeed
  } else if (clientY > rect.bottom - threshold) {
    vy = ((clientY - (rect.bottom - threshold)) / threshold) * maxSpeed
  }
  edgePanVelocity.value = { x: Math.max(-maxSpeed, Math.min(maxSpeed, vx)), y: Math.max(-maxSpeed, Math.min(maxSpeed, vy)) }
}

function stopAutoPanLoop() {
  edgePanVelocity.value = { x: 0, y: 0 }
  if (autoPanRaf !== null) {
    window.cancelAnimationFrame(autoPanRaf)
    autoPanRaf = null
  }
}

function startAutoPanLoop() {
  if (autoPanRaf !== null) return
  const tick = () => {
    autoPanRaf = null
    if (!isDragging.value || !draggingIds.value.length) {
      stopAutoPanLoop()
      return
    }
    const vx = edgePanVelocity.value.x
    const vy = edgePanVelocity.value.y
    if (vx === 0 && vy === 0) return
    const next = {
      x: view.value.x - vx,
      y: view.value.y - vy,
      zoom: view.value.zoom,
    }
    scheduleViewport(next)
    const rect = cachedStageRect ?? stageRef.value?.getBoundingClientRect()
    if (rect) {
      const world = {
        x: (lastPointerClient.value.x - rect.left - next.x) / next.zoom,
        y: (lastPointerClient.value.y - rect.top - next.y) / next.zoom,
      }
      pendingDragWorld = world
      scheduleDragFrame()
    }
    autoPanRaf = window.requestAnimationFrame(tick)
  }
  autoPanRaf = window.requestAnimationFrame(tick)
}

function computeSnapForPrimary(primaryId: string, dx: number, dy: number) {
  const start = dragStartPositions.get(primaryId)
  const node = props.nodes.find(n => n.id === primaryId)
  if (!start || !node) return { dx, dy, guides: [] as Array<{ axis: 'x' | 'y'; value: number }> }
  if (!props.snapEnabled || dragBypassSnap.value) return { dx, dy, guides: [] as Array<{ axis: 'x' | 'y'; value: number }> }

  const movedX = start.x + dx
  const movedY = start.y + dy
  const { width, height } = getNodeSize(node)
  const thresholdWorld = Math.max(2, props.snapThreshold) / Math.max(view.value.zoom, 0.02)
  const guides: Array<{ axis: 'x' | 'y'; value: number }> = []

  let bestXDelta: number | null = null
  let bestYDelta: number | null = null
  let bestXAbs = Number.POSITIVE_INFINITY
  let bestYAbs = Number.POSITIVE_INFINITY
  let bestXGuide = 0
  let bestYGuide = 0

  const movingXPoints = [movedX, movedX + width / 2, movedX + width]
  const movingYPoints = [movedY, movedY + height / 2, movedY + height]

  for (const other of props.nodes) {
    if (draggingIdSet.value.has(other.id)) continue
    const otherSize = getNodeSize(other)
    const otherXPoints = [other.x, other.x + otherSize.width / 2, other.x + otherSize.width]
    const otherYPoints = [other.y, other.y + otherSize.height / 2, other.y + otherSize.height]
    for (const a of movingXPoints) {
      for (const b of otherXPoints) {
        const delta = b - a
        const abs = Math.abs(delta)
        if (abs <= thresholdWorld && abs < bestXAbs) {
          bestXAbs = abs
          bestXDelta = delta
          bestXGuide = b
        }
      }
    }
    for (const a of movingYPoints) {
      for (const b of otherYPoints) {
        const delta = b - a
        const abs = Math.abs(delta)
        if (abs <= thresholdWorld && abs < bestYAbs) {
          bestYAbs = abs
          bestYDelta = delta
          bestYGuide = b
        }
      }
    }
  }

  if (props.snapGridSize > 0) {
    const gx = Math.round(movedX / props.snapGridSize) * props.snapGridSize
    const gy = Math.round(movedY / props.snapGridSize) * props.snapGridSize
    const gxDelta = gx - movedX
    const gyDelta = gy - movedY
    if (Math.abs(gxDelta) <= thresholdWorld && Math.abs(gxDelta) < bestXAbs) {
      bestXDelta = gxDelta
      bestXAbs = Math.abs(gxDelta)
      bestXGuide = gx
    }
    if (Math.abs(gyDelta) <= thresholdWorld && Math.abs(gyDelta) < bestYAbs) {
      bestYDelta = gyDelta
      bestYAbs = Math.abs(gyDelta)
      bestYGuide = gy
    }
  }

  const nextDx = dx + (bestXDelta ?? 0)
  const nextDy = dy + (bestYDelta ?? 0)
  if (bestXDelta !== null) guides.push({ axis: 'x', value: bestXGuide })
  if (bestYDelta !== null) guides.push({ axis: 'y', value: bestYGuide })
  return { dx: nextDx, dy: nextDy, guides }
}

function updateTextDraft(world: { x: number; y: number }) {
  const startX = textStartWorld.value.x
  const startY = textStartWorld.value.y
  const dx = world.x - startX
  const width = Math.abs(dx)
  const x = dx >= 0 ? startX : startX - width
  textDraft.value = { x, y: startY, width, height: 38 }
}

function finalizeTextPlacement() {
  if (!isTextPlacing.value) return
  const draft = textDraft.value
  const width = draft.width >= 8 ? clamp(Math.round(draft.width), 120, 920) : 220
  
  emit('create-node', {
    title: '文本',
    tag: '文本',
    prompt: '',
    x: Math.round(draft.width >= 8 ? draft.x : textStartWorld.value.x),
    y: Math.round(textStartWorld.value.y),
    nodeType: 'text',
    width,
    height: 38,
  })
  
  isTextPlacing.value = false
  textDraft.value = { x: 0, y: 0, width: 0, height: 0 }
}

function updateSelectionDraft(world: { x: number; y: number }) {
  const x = Math.min(selectStart.value.x, world.x)
  const y = Math.min(selectStart.value.y, world.y)
  const width = Math.abs(world.x - selectStart.value.x)
  const height = Math.abs(world.y - selectStart.value.y)
  selection.value = { x, y, width, height }
}

function updateShapeDraft(world: { x: number; y: number }, shiftKey: boolean, altKey: boolean) {
  let dx = world.x - shapeStart.value.x
  let dy = world.y - shapeStart.value.y
  if (shiftKey) {
    const side = Math.max(Math.abs(dx), Math.abs(dy))
    dx = (dx >= 0 ? 1 : -1) * side
    dy = (dy >= 0 ? 1 : -1) * side
  }

  const startX = altKey ? shapeStart.value.x - dx : shapeStart.value.x
  const startY = altKey ? shapeStart.value.y - dy : shapeStart.value.y
  const endX = altKey ? shapeStart.value.x + dx : shapeStart.value.x + dx
  const endY = altKey ? shapeStart.value.y + dy : shapeStart.value.y + dy
  const x = Math.min(startX, endX)
  const y = Math.min(startY, endY)
  const width = Math.abs(endX - startX)
  const height = Math.abs(endY - startY)
  shapeDraft.value = { x, y, width, height }
}

function getSnappedArrowEnd(world: { x: number; y: number }, shiftKey: boolean) {
  if (!shiftKey) return world
  const dx = world.x - arrowStart.value.x
  const dy = world.y - arrowStart.value.y
  const distance = Math.hypot(dx, dy)
  if (distance <= 0.001) return world
  const angle = Math.atan2(dy, dx)
  const snapped = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4)
  return {
    x: arrowStart.value.x + Math.cos(snapped) * distance,
    y: arrowStart.value.y + Math.sin(snapped) * distance,
  }
}

function updateArrowDraft(world: { x: number; y: number }, shiftKey: boolean) {
  const end = getSnappedArrowEnd(world, shiftKey)
  arrowCurrent.value = end
  const pad = 8
  const x = Math.min(arrowStart.value.x, end.x) - pad
  const y = Math.min(arrowStart.value.y, end.y) - pad
  const width = Math.abs(end.x - arrowStart.value.x) + pad * 2
  const height = Math.abs(end.y - arrowStart.value.y) + pad * 2
  arrowDraft.value = { x, y, width, height }
}

function applyPendingInteraction(
  world: { x: number; y: number },
  shiftKey: boolean,
  altKey: boolean,
) {
  if (isTextPlacing.value) {
    updateTextDraft(world)
    return
  }
  if (isSelecting.value) {
    updateSelectionDraft(world)
    return
  }
  if (isShaping.value) {
    updateShapeDraft(world, shiftKey, altKey)
    return
  }
  if (isArrowing.value) {
    updateArrowDraft(world, shiftKey)
  }
}

function scheduleInteractionFrame() {
  if (interactionRaf !== null) return
  interactionRaf = window.requestAnimationFrame(() => {
    interactionRaf = null
    if (!pendingInteraction) return
    applyPendingInteraction(
      pendingInteraction.world,
      pendingInteraction.shift,
      pendingInteraction.alt,
    )
    pendingInteraction = null
  })
}

function scheduleDragFrame() {
  if (dragRaf !== null) return
  dragRaf = window.requestAnimationFrame(() => {
    dragRaf = null
    if (!draggingIds.value.length || !dragStartPositions.size || !pendingDragWorld) return
    const rawDx = pendingDragWorld.x - dragStartWorld.value.x
    const rawDy = pendingDragWorld.y - dragStartWorld.value.y
    const primaryId = draggingIds.value[0]
    if (!primaryId) return
    const snapped = computeSnapForPrimary(primaryId, rawDx, rawDy)
    const dx = snapped.dx
    const dy = snapped.dy
    snapGuides.value = snapped.guides
    for (const id of draggingIds.value) {
      const nodeEl = dragNodeEls.get(id)
      if (nodeEl) {
        nodeEl.style.transform = `translate3d(${dx}px, ${dy}px, 0)`
      }
    }
  })
}

function handleNodePointerDown(id: string, event: PointerEvent) {
  if (event.button !== 0) return
  const world = getWorldPoint(event)
  if (!world) return

  if (event.shiftKey) {
    const current = new Set(props.selectedIds)
    if (current.has(id)) current.delete(id)
    else current.add(id)
    const next = Array.from(current)
    if (next.length === 0) emit('select', '')
    else if (next.length === 1) emit('select', next[0]!)
    else emit('select-multiple', next)
    return
  }

  dragBypassSnap.value = event.altKey
  if (!props.selectedIds.includes(id) || props.selectedIds.length <= 1) {
    emit('select', id)
  }

  const dragTargets =
    props.selectedIds.length > 1 && props.selectedIds.includes(id) ? props.selectedIds : [id]
  const nextStartPositions = new Map<string, { x: number; y: number }>()
  for (const targetId of dragTargets) {
    const node = props.nodes.find(n => n.id === targetId)
    if (node) nextStartPositions.set(targetId, { x: node.x, y: node.y })
  }
  if (!nextStartPositions.size) return

  // 记录拖动起始位置与起始指针坐标，用总位移避免增量漂移
  draggingIds.value = Array.from(nextStartPositions.keys())
  dragStartPositions = nextStartPositions
  dragStartWorld.value = { x: world.x, y: world.y }
  cachedStageRect = stageRef.value?.getBoundingClientRect() ?? null
  dragNodeEls = new Map()
  for (const targetId of draggingIds.value) {
    const nodeEl = getNodeElement(targetId)
    if (nodeEl) dragNodeEls.set(targetId, nodeEl)
  }
  pendingDragWorld = null
  lastPointerClient.value = { x: event.clientX, y: event.clientY }
  updateEdgePanVelocity(event.clientX, event.clientY)
  if (edgePanVelocity.value.x !== 0 || edgePanVelocity.value.y !== 0) startAutoPanLoop()
  else stopAutoPanLoop()
  snapGuides.value = []

  isDragging.value = true
  stageRef.value?.setPointerCapture(event.pointerId)
}

function resetTransient() {
  isTextPlacing.value = false
  isSelecting.value = false
  isShaping.value = false
  isArrowing.value = false
  selection.value = { x: 0, y: 0, width: 0, height: 0 }
  shapeDraft.value = { x: 0, y: 0, width: 0, height: 0 }
  arrowDraft.value = { x: 0, y: 0, width: 0, height: 0 }
  arrowCurrent.value = { x: 0, y: 0 }
  textDraft.value = { x: 0, y: 0, width: 0, height: 0 }
}

function handlePointerDown(e: PointerEvent) {
  const target = e.target as HTMLElement | null
  if (target?.closest('[data-node="true"]')) return
  if (e.button !== 0 && e.button !== 1 && e.button !== 2) return
  const world = getWorldPoint(e)
  if (!world) return

  if (e.button !== 0) {
    isPanning.value = true
    lastPoint.value = { x: e.clientX, y: e.clientY }
    stageRef.value?.setPointerCapture(e.pointerId)
    return
  }

  if (props.activeTool === 'text') {
    isTextPlacing.value = true
    textStartWorld.value = { x: world.x, y: world.y }
    textDraft.value = { x: world.x, y: world.y, width: 0, height: 38 }
    stageRef.value?.setPointerCapture(e.pointerId)
    return
  }

  if (props.activeTool === 'shape') {
    isShaping.value = true
    shapeStart.value = { x: world.x, y: world.y }
    shapeDraft.value = { x: world.x, y: world.y, width: 0, height: 0 }
    stageRef.value?.setPointerCapture(e.pointerId)
    return
  }

  if (props.activeTool === 'arrow') {
    isArrowing.value = true
    arrowStart.value = { x: world.x, y: world.y }
    arrowCurrent.value = { x: world.x, y: world.y }
    arrowDraft.value = { x: world.x, y: world.y, width: 0, height: 0 }
    stageRef.value?.setPointerCapture(e.pointerId)
    return
  }

  if (props.activeTool === 'select') {
    isSelecting.value = true
    selectStart.value = { x: world.x, y: world.y }
    selection.value = { x: world.x, y: world.y, width: 0, height: 0 }
    stageRef.value?.setPointerCapture(e.pointerId)
    return
  }
}


function handlePointerMove(e: PointerEvent) {
  if (isDragging.value && draggingIds.value.length) {
    dragBypassSnap.value = e.altKey
    lastPointerClient.value = { x: e.clientX, y: e.clientY }
    updateEdgePanVelocity(e.clientX, e.clientY)
    if (edgePanVelocity.value.x !== 0 || edgePanVelocity.value.y !== 0) startAutoPanLoop()
    else stopAutoPanLoop()
    const world = getWorldPoint(e)
    if (!world) return
    pendingDragWorld = world
    scheduleDragFrame()
    return
  }

  if (isTextPlacing.value) {
    const world = getWorldPoint(e)
    if (!world) return
    pendingInteraction = { world, shift: e.shiftKey, alt: e.altKey }
    scheduleInteractionFrame()
    return
  }

  if (isSelecting.value) {
    const world = getWorldPoint(e)
    if (!world) return
    pendingInteraction = { world, shift: e.shiftKey, alt: e.altKey }
    scheduleInteractionFrame()
    return
  }

  if (isShaping.value) {
    const world = getWorldPoint(e)
    if (!world) return
    pendingInteraction = { world, shift: e.shiftKey, alt: e.altKey }
    scheduleInteractionFrame()
    return
  }

  if (isArrowing.value) {
    const world = getWorldPoint(e)
    if (!world) return
    pendingInteraction = { world, shift: e.shiftKey, alt: e.altKey }
    scheduleInteractionFrame()
    return
  }

  if (!isPanning.value) return
  const dx = e.clientX - lastPoint.value.x
  const dy = e.clientY - lastPoint.value.y
  lastPoint.value = { x: e.clientX, y: e.clientY }
  scheduleViewport({
    x: view.value.x + dx,
    y: view.value.y + dy,
    zoom: view.value.zoom,
  })
}


function handlePointerUp(e: PointerEvent) {
  const upWorld = getWorldPoint(e)
  if (upWorld && (isTextPlacing.value || isSelecting.value || isShaping.value || isArrowing.value)) {
    applyPendingInteraction(upWorld, e.shiftKey, e.altKey)
  }
  pendingInteraction = null
  if (interactionRaf !== null) {
    window.cancelAnimationFrame(interactionRaf)
    interactionRaf = null
  }

  if (isDragging.value && draggingIds.value.length && dragStartPositions.size) {
    const endWorld = getWorldPoint(e) || pendingDragWorld || dragStartWorld.value
    const rawDx = endWorld.x - dragStartWorld.value.x
    const rawDy = endWorld.y - dragStartWorld.value.y
    const primaryId = draggingIds.value[0]!
    const snapped = computeSnapForPrimary(primaryId, rawDx, rawDy)
    const dx = snapped.dx
    const dy = snapped.dy
    const moves: Array<{ id: string; x: number; y: number }> = []
    for (const id of draggingIds.value) {
      const start = dragStartPositions.get(id)
      if (!start) continue
      moves.push({ id, x: start.x + dx, y: start.y + dy })
      const nodeEl = dragNodeEls.get(id)
      if (nodeEl) nodeEl.style.transform = ''
    }
    if (moves.length) emit('move-nodes', moves)
  }

  if (isTextPlacing.value) {
    finalizeTextPlacement()
  }

  if (isSelecting.value) {
    const rect = selection.value
    if (rect.width > 4 && rect.height > 4) {
      // 框选多个节点：检测与选框相交的所有节点
      const hitIds = props.nodes.filter(node => {
        const width = node.width ?? (node.nodeType === 'text' ? 180 : node.nodeType === 'frame' ? 240 : 280)
        const height = node.height ?? (node.nodeType === 'text' ? 40 : node.nodeType === 'frame' ? 160 : 220)
        const nodeRight = node.x + width
        const nodeBottom = node.y + height
        // 检测节点与选框是否相交
        const intersects = !(
          node.x > rect.x + rect.width ||
          nodeRight < rect.x ||
          node.y > rect.y + rect.height ||
          nodeBottom < rect.y
        )
        return intersects
      }).map(n => n.id)
      
      if (hitIds.length > 0) {
        if (hitIds.length === 1) {
          emit('select', hitIds[0]!)
        } else {
          emit('select-multiple', hitIds)
        }
      }
    } else {
      // 点击画布空白处，取消所有选中
      emit('select', '')
    }
  }

  if (isShaping.value) {
    const shape = shapeDraft.value
    const width = Math.max(12, Math.round(shape.width))
    const height = Math.max(12, Math.round(shape.height))
    if (width >= 12 && height >= 12) {
      emit('create-node', {
        title: props.shapeKind === 'circle' ? '圆形色块' : '方形色块',
        tag: '色块',
        prompt: '',
        x: Math.round(shape.x),
        y: Math.round(shape.y),
        width,
        height,
        nodeType: 'shape',
        params: {
          shape: props.shapeKind,
          fillColor: props.shapeColor,
        },
      })
    }
  }

  if (isArrowing.value) {
    const startX = arrowStart.value.x
    const startY = arrowStart.value.y
    const endX = arrowCurrent.value.x
    const endY = arrowCurrent.value.y
    const distance = Math.hypot(endX - startX, endY - startY)
    if (distance >= 8) {
      const pad = 8
      const x = Math.min(startX, endX) - pad
      const y = Math.min(startY, endY) - pad
      const width = Math.abs(endX - startX) + pad * 2
      const height = Math.abs(endY - startY) + pad * 2
      emit('create-node', {
        title: '箭头',
        tag: '箭头',
        prompt: '',
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(Math.max(16, width)),
        height: Math.round(Math.max(16, height)),
        nodeType: 'arrow',
        params: {
          color: props.shapeColor,
          startX: Math.round(startX - x),
          startY: Math.round(startY - y),
          endX: Math.round(endX - x),
          endY: Math.round(endY - y),
          strokeWidth: 3,
        },
      })
    }
  }

  isDragging.value = false
  draggingIds.value = []
  dragStartPositions.clear()
  dragNodeEls.clear()
  pendingDragWorld = null
  snapGuides.value = []
  dragBypassSnap.value = false
  cachedStageRect = null
  stopAutoPanLoop()
  if (dragRaf !== null) {
    window.cancelAnimationFrame(dragRaf)
    dragRaf = null
  }
  isPanning.value = false
  resetTransient()
  const stageEl = stageRef.value
  if (stageEl && stageEl.hasPointerCapture(e.pointerId)) {
    stageEl.releasePointerCapture(e.pointerId)
  }
}



function handleWheel(e: WheelEvent) {
  const rect = stageRef.value?.getBoundingClientRect()
  if (!rect) return
  const px = e.clientX - rect.left
  const py = e.clientY - rect.top
  const zoomFactor = Math.exp(-e.deltaY * 0.001)
  const nextZoom = Math.min(2, Math.max(0.02, view.value.zoom * zoomFactor))
  const worldX = (px - view.value.x) / view.value.zoom
  const worldY = (py - view.value.y) / view.value.zoom
  scheduleViewport({
    x: px - worldX * nextZoom,
    y: py - worldY * nextZoom,
    zoom: nextZoom,
  })
}

const worldStyle = computed(() => ({
  transform: `translate3d(${view.value.x}px, ${view.value.y}px, 0) scale(${view.value.zoom})`,
}))

const visibleWorldRect = computed(() => {
  const zoom = Math.max(view.value.zoom, 0.02)
  const left = -view.value.x / zoom
  const top = -view.value.y / zoom
  const width = stageSize.value.width / zoom
  const height = stageSize.value.height / zoom
  const buffer = Math.max(240, 160 / zoom)
  return {
    left: left - buffer,
    top: top - buffer,
    right: left + width + buffer,
    bottom: top + height + buffer,
  }
})

const renderedNodes = computed(() => {
  if (!stageSize.value.width || !stageSize.value.height) return props.nodes
  const rect = visibleWorldRect.value
  return props.nodes.filter((node) => {
    if (draggingIdSet.value.has(node.id)) return true
    const size = getNodeSize(node)
    const right = node.x + size.width
    const bottom = node.y + size.height
    return !(node.x > rect.right || right < rect.left || node.y > rect.bottom || bottom < rect.top)
  })
})

onMounted(() => {
  updateStageSize()
  if (stageRef.value) {
    resizeObserver = new ResizeObserver(() => updateStageSize())
    resizeObserver.observe(stageRef.value)
  }
})

onUnmounted(() => {
  if (rafId !== null) window.cancelAnimationFrame(rafId)
  if (dragRaf !== null) window.cancelAnimationFrame(dragRaf)
  if (interactionRaf !== null) window.cancelAnimationFrame(interactionRaf)
  stopAutoPanLoop()
  resizeObserver?.disconnect()
})
</script>

<template>
  <div
    ref="stageRef"
    class="canvas-stage"
    :class="stageClass"
    @pointerdown="handlePointerDown"
    @pointermove="handlePointerMove"
    @pointerup="handlePointerUp"
    @pointercancel="handlePointerUp"
    @pointerleave="handlePointerUp"
    @wheel.prevent="handleWheel"
  >
    <div class="canvas-grid" />
    <div class="canvas-world" :class="{ dragging: isPanning || isDragging }" :style="worldStyle">
      <div
        v-for="(guide, idx) in snapGuides"
        :key="`guide-${idx}-${guide.axis}`"
        class="snap-guide"
        :class="guide.axis === 'x' ? 'snap-guide-x' : 'snap-guide-y'"
        :style="guide.axis === 'x' ? { left: `${guide.value}px` } : { top: `${guide.value}px` }"
      />

      <div v-if="isSelecting" class="selection-rect" :style="{
        left: `${selection.x}px`,
        top: `${selection.y}px`,
        width: `${selection.width}px`,
        height: `${selection.height}px`,
      }" />

      <div v-if="isTextPlacing" class="text-draft" :style="{
        left: `${textDraft.x}px`,
        top: `${textDraft.y}px`,
        width: `${Math.max(8, textDraft.width)}px`,
        height: `${textDraft.height}px`,
      }" />

      <div v-if="isShaping" class="shape-draft" :style="{
        left: `${shapeDraft.x}px`,
        top: `${shapeDraft.y}px`,
        width: `${Math.max(8, shapeDraft.width)}px`,
        height: `${Math.max(8, shapeDraft.height)}px`,
        borderRadius: shapeKind === 'circle' ? '50%' : '12px',
        background: shapeColor,
      }" />

      <div v-if="isArrowing" class="arrow-draft" :style="{
        left: `${arrowDraft.x}px`,
        top: `${arrowDraft.y}px`,
        width: `${Math.max(16, arrowDraft.width)}px`,
        height: `${Math.max(16, arrowDraft.height)}px`,
      }">
        <svg :width="Math.max(16, arrowDraft.width)" :height="Math.max(16, arrowDraft.height)">
          <defs>
            <marker id="arrowHeadDraft" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <polygon points="0 0, 7 3, 0 7" :fill="shapeColor" />
            </marker>
          </defs>
          <line
            :x1="arrowStart.x - arrowDraft.x"
            :y1="arrowStart.y - arrowDraft.y"
            :x2="arrowCurrent.x - arrowDraft.x"
            :y2="arrowCurrent.y - arrowDraft.y"
            :stroke="shapeColor"
            stroke-width="3"
            marker-end="url(#arrowHeadDraft)"
          />
        </svg>
      </div>

      <CanvasNodeCard
        v-for="node in renderedNodes"
        :key="node.id"
        :node="node"
        :selected="node.id === selectedId"
        :multi-selected="selectedIds.includes(node.id)"
        :dragging="isDragging && draggingIdSet.has(node.id)"
        :zoom="view.zoom"
        :viewport="view"
        :active-tool="activeTool"
        :data-node-id="node.id"
        @select="emit('select', node.id)"
        @generate="emit('generate', node.id)"
        @duplicate="emit('duplicate', node.id)"
        @drag-start="handleNodePointerDown(node.id, $event)"
        @update-size="emit('update-node', { id: node.id, patch: { width: $event.width, height: $event.height, x: $event.x, y: $event.y } })"
        @update-text="handleTextUpdate(node.id, $event)"
        @edit-prompt="emit('edit-image', { nodeId: node.id, prompt: $event })"
      />
    </div>
  </div>
</template>


<style scoped>
.canvas-stage {
  position: relative;
  flex: 1;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  background: var(--bg-canvas, #0F0F11);
}

.canvas-stage.tool-select {
  cursor: grab;
}

.canvas-stage.tool-text {
  cursor: text;
}

.canvas-stage.tool-shape,
.canvas-stage.tool-arrow {
  cursor: crosshair;
}


.canvas-stage:active {
  cursor: grabbing;
}

.canvas-stage.tool-text:active,
.canvas-stage.tool-shape:active,
.canvas-stage.tool-arrow:active {
  cursor: crosshair;
}

.canvas-grid {
  position: absolute;
  inset: 0;
  background-image: linear-gradient(rgba(148, 163, 184, 0.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.05) 1px, transparent 1px);
  background-size: 48px 48px;
  background-position: center;
}

.text-input-layer {
  position: absolute;
  z-index: 30;
  transform: translateY(-2px);
}

.text-inline-input {
  width: 100%;
  min-height: 34px;
  max-height: 360px;
  resize: none;
  border: 1px solid rgba(22, 93, 255, 0.35);
  border-radius: 8px;
  padding: 7px 10px;
  outline: none;
  background: rgba(255, 255, 255, 0.96);
  color: #1f2937;
  font-size: var(--text-input-font-size, 18px);
  line-height: 1.35;
  box-shadow: 0 8px 20px rgba(15, 23, 42, 0.2);
}

.text-inline-input::placeholder {
  color: #6b7280;
}

.text-inline-input:focus {
  border-color: rgba(22, 93, 255, 0.7);
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.18), 0 8px 20px rgba(15, 23, 42, 0.2);
}

.canvas-world {
  position: absolute;
  inset: 0;
  transform-origin: 0 0;
  /* 拖动时禁用 transition，避免延迟感 */
  transition: transform 0.06s ease-out;
  /* 启用 GPU 加速 */
  will-change: transform;
}

/* 拖动时禁用 transition */
.canvas-world.dragging {
  transition: none;
}

.selection-rect {
  position: absolute;
  border: 1px dashed rgba(59, 130, 246, 0.1);
  background: rgba(59, 130, 246, 0.1);
}

.text-draft {
  position: absolute;
  border: 1px dashed rgba(22, 93, 255, 0.8);
  border-radius: 8px;
  background: rgba(22, 93, 255, 0.08);
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.15);
  pointer-events: none;
}

.shape-draft {
  position: absolute;
  opacity: 0.78;
  border: 1px solid rgba(255, 255, 255, 0.78);
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.45);
}

.arrow-draft {
  position: absolute;
  pointer-events: none;
  filter: drop-shadow(0 2px 6px rgba(15, 23, 42, 0.25));
}

.snap-guide {
  position: absolute;
  pointer-events: none;
  z-index: 9999;
}

.snap-guide-x {
  top: -20000px;
  width: 1px;
  height: 40000px;
  background: rgba(34, 211, 238, 0.9);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

.snap-guide-y {
  left: -20000px;
  width: 40000px;
  height: 1px;
  background: rgba(34, 211, 238, 0.9);
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}

</style>
