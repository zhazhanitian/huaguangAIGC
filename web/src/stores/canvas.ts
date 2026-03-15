import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { createDrawTask, getTasksStatusBatch as getDrawTasksStatusBatch, type CreateDrawTaskData, type DrawTask } from '../api/draw'
import { createVideoTask, getTasksStatusBatch as getVideoTasksStatusBatch, type CreateVideoTaskData, type VideoTask } from '../api/video'
import { onTaskEvent, connectRealtime, disconnectRealtime, type TaskEventPayload } from '../realtime/socket'

export interface CanvasNode {
  id: string
  title: string
  prompt: string
  negativePrompt?: string
  status: 'idle' | 'running' | 'done' | 'failed'
  progress?: number
  x: number
  y: number
  tag: string
  previewUrl?: string
  resultUrl?: string
  taskId?: string
  provider?: string
  taskType?: string
  size?: string
  style?: string
  createdAt: string
  updatedAt: string
  mode?: 'image' | 'video'
  model?: string
  params?: Record<string, unknown>
  errorMessage?: string
  nodeType?: 'card' | 'frame' | 'text' | 'image' | 'shape' | 'arrow'
  width?: number
  height?: number
  zIndex?: number
}



export interface CanvasEdge {
  id: string
  sourceId: string
  targetId: string
}

export interface CanvasProject {
  id: string
  name: string
  nodes: CanvasNode[]
  edges: CanvasEdge[]
  viewport: { x: number; y: number; zoom: number }
  updatedAt: string
}

const STORAGE_KEY = 'huaguang_canvas_default_v1'
const MAX_HISTORY = 80

export const useCanvasStore = defineStore('canvas', () => {
  const nodes = ref<CanvasNode[]>([])
  const edges = ref<CanvasEdge[]>([])
  const viewport = ref({ x: 180, y: 140, zoom: 0.9 })
  const selectedNodeId = ref<string | null>(null)
  const selectedNodeIds = ref<Set<string>>(new Set()) // 多选节点ID集合
  const lastSavedAt = ref<string | null>(null)
  const loaded = ref(false)

  const promptMode = ref<'image' | 'video'>('image')
  const promptText = ref('')
  const negativePromptText = ref('')
  const selectedModel = ref('')
  const paramSettings = ref<{
    size?: string
    style?: string
    ratio?: string
    duration?: string
  }>({
    size: '1024x1024',
    style: '电影级质感',
    ratio: '1:1',
  })

  const runningCount = computed(() => nodes.value.filter(n => n.status === 'running').length)
  const queuedCount = computed(() => nodes.value.filter(n => n.status === 'idle').length)
  const selectedNode = computed(() => nodes.value.find(n => n.id === selectedNodeId.value) || null)
  const historyNodes = computed(() =>
    [...nodes.value].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
  )


  let saveTimer: number | null = null
  const historyPast = ref<string[]>([])
  const historyFuture = ref<string[]>([])
  const canUndo = computed(() => historyPast.value.length > 0)
  const canRedo = computed(() => historyFuture.value.length > 0)

  function nextZIndex() {
    let max = 0
    for (const n of nodes.value) {
      max = Math.max(max, Number(n.zIndex || 0))
    }
    return max + 1
  }

  function snapshotState() {
    return JSON.stringify({
      nodes: nodes.value,
      edges: edges.value,
      viewport: viewport.value,
      selectedNodeId: selectedNodeId.value,
      selectedNodeIds: Array.from(selectedNodeIds.value),
    })
  }

  function applySnapshot(raw: string) {
    const parsed = JSON.parse(raw) as {
      nodes: CanvasNode[]
      edges: CanvasEdge[]
      viewport: { x: number; y: number; zoom: number }
      selectedNodeId: string | null
      selectedNodeIds: string[]
    }
    nodes.value = (parsed.nodes || []).map((n, i) => ({
      ...n,
      zIndex: Number(n.zIndex || i + 1),
    }))
    edges.value = parsed.edges || []
    viewport.value = parsed.viewport || viewport.value
    selectedNodeId.value = parsed.selectedNodeId || null
    selectedNodeIds.value = new Set(parsed.selectedNodeIds || [])
  }

  function pushHistory() {
    historyPast.value.push(snapshotState())
    if (historyPast.value.length > MAX_HISTORY) historyPast.value.shift()
    historyFuture.value = []
  }

  function undo() {
    if (!historyPast.value.length) return
    const previous = historyPast.value.pop()
    if (!previous) return
    historyFuture.value.push(snapshotState())
    applySnapshot(previous)
    scheduleSave()
  }

  function redo() {
    if (!historyFuture.value.length) return
    const next = historyFuture.value.pop()
    if (!next) return
    historyPast.value.push(snapshotState())
    applySnapshot(next)
    scheduleSave()
  }


  function ensureLoaded() {
    if (loaded.value) return
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as CanvasProject
      const now = new Date().toISOString()
      nodes.value = (parsed.nodes || []).map(node => ({
        ...node,
        status: node.status || 'idle',
        previewUrl: node.previewUrl || node.resultUrl,
        resultUrl: node.resultUrl || node.previewUrl,
        createdAt: node.createdAt || now,
        updatedAt: node.updatedAt || node.createdAt || now,
        mode: node.mode || (node.taskType === 'text2video' ? 'video' : 'image'),
        model: node.model || node.provider,
        zIndex: Number(node.zIndex || 0),
      }))
      nodes.value.forEach((node, i) => {
        if (!node.zIndex || node.zIndex <= 0) node.zIndex = i + 1
      })
      edges.value = parsed.edges || []
      viewport.value = parsed.viewport || viewport.value
      lastSavedAt.value = parsed.updatedAt ? new Date(parsed.updatedAt).toLocaleTimeString() : null

    } else {
      // 无虚拟数据，从空白画布开始
        nodes.value = []
        edges.value = []
    }
    if (!selectedNodeId.value && nodes.value.length) selectedNodeId.value = nodes.value[0]!.id
    historyPast.value = []
    historyFuture.value = []
    loaded.value = true
  }

  function setViewport(next: { x: number; y: number; zoom: number }) {
    viewport.value = next
  }

  // 选择单个节点（清除多选）
  function selectNode(id: string | null) {
    selectedNodeId.value = id
    if (id) {
      selectedNodeIds.value.clear()
      selectedNodeIds.value.add(id)
    } else {
      selectedNodeIds.value.clear()
    }
  }

  function createNode(partial?: Partial<CanvasNode>) {
    pushHistory()
    const id = `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const now = new Date().toISOString()
    const node: CanvasNode = {
      id,
      title: partial?.title ?? '参数补充',
      prompt: partial?.prompt ?? '补充材质、光线与镜头信息以统一视觉风格',
      status: partial?.status ?? 'idle',
      progress: partial?.progress,
      x: partial?.x ?? 320 + Math.random() * 320,
      y: partial?.y ?? 220 + Math.random() * 240,
      tag: partial?.tag ?? '补充',
      previewUrl: partial?.previewUrl,
      resultUrl: partial?.resultUrl,
      taskId: partial?.taskId,
      size: partial?.size || '1024x1024',
      style: partial?.style || '精细质感',
      provider: partial?.provider,
      taskType: partial?.taskType,
      negativePrompt: partial?.negativePrompt,
      createdAt: partial?.createdAt || now,
      updatedAt: partial?.updatedAt || now,
      mode: partial?.mode,
      model: partial?.model,
      params: partial?.params,
      nodeType: partial?.nodeType || 'card',
      width: partial?.width,
      height: partial?.height,
      zIndex: partial?.zIndex || nextZIndex(),
    }

    nodes.value.push(node)
    selectedNodeId.value = node.id
    scheduleSave()
    return node
  }


  function duplicateNode(id: string) {
    const node = nodes.value.find(n => n.id === id)
    if (!node) return null
    return createNode({
      title: `${node.title} · 派生`,
      prompt: node.prompt,
      negativePrompt: node.negativePrompt,
      tag: node.tag,
      size: node.size,
      style: node.style,
      provider: node.provider,
      taskType: node.taskType,
      x: node.x + 40,
      y: node.y + 40,
      nodeType: node.nodeType,
      width: node.width,
      height: node.height,
    })

  }

  function deleteNode(id: string) {
    const idx = nodes.value.findIndex(n => n.id === id)
    if (idx >= 0) {
      pushHistory()
      nodes.value.splice(idx, 1)
      if (selectedNodeId.value === id) {
        selectedNodeId.value = nodes.value[0]?.id || null
      }
      selectedNodeIds.value.delete(id)
      scheduleSave()
    }
  }

  // 批量删除节点
  function deleteSelectedNodes() {
    if (selectedNodeIds.value.size === 0) return
    pushHistory()
    const idsToDelete = Array.from(selectedNodeIds.value)
    nodes.value = nodes.value.filter(n => !idsToDelete.includes(n.id))
    selectedNodeIds.value.clear()
    selectedNodeId.value = nodes.value[0]?.id || null
    scheduleSave()
  }

  // 添加到多选
  function addToSelection(id: string) {
    selectedNodeIds.value.add(id)
    selectedNodeId.value = id
  }

  // 从多选中移除
  function removeFromSelection(id: string) {
    selectedNodeIds.value.delete(id)
    if (selectedNodeId.value === id) {
      selectedNodeId.value = Array.from(selectedNodeIds.value)[0] || null
    }
  }

  // 设置多选节点
  function setSelectedNodes(ids: string[]) {
    selectedNodeIds.value = new Set(ids)
    selectedNodeId.value = ids[0] || null
  }

  // 清除所有选择
  function clearSelection() {
    selectedNodeIds.value.clear()
    selectedNodeId.value = null
  }

  // 全选
  function selectAll() {
    selectedNodeIds.value = new Set(nodes.value.map(n => n.id))
    selectedNodeId.value = nodes.value[0]?.id || null
  }

  function updateNode(id: string, patch: Partial<CanvasNode>) {
    const node = nodes.value.find(n => n.id === id)
    if (!node) return
    const isPositionOnlyUpdate = Object.keys(patch).every(k => k === 'x' || k === 'y')
    if (!isPositionOnlyUpdate) {
      pushHistory()
    }
    Object.assign(node, patch)
    node.updatedAt = new Date().toISOString()
    // 仅在非拖动场景下触发保存（拖动结束后会统一保存）
    // 如果 patch 只包含 x/y，说明是拖动更新，延迟保存
    if (!isPositionOnlyUpdate) {
      scheduleSave()
    } else {
      // 位置更新使用更长的防抖时间
      scheduleSave(2000)
    }
  }

  function moveNodesBatch(moves: Array<{ id: string; x: number; y: number }>) {
    if (!moves.length) return
    pushHistory()
    const moveMap = new Map(moves.map((m) => [m.id, m]))
    const now = new Date().toISOString()
    for (const node of nodes.value) {
      const m = moveMap.get(node.id)
      if (!m) continue
      node.x = m.x
      node.y = m.y
      node.updatedAt = now
    }
    scheduleSave(1200)
  }

  function setSelectionZOrder(mode: 'front' | 'back' | 'forward' | 'backward') {
    const ids = Array.from(selectedNodeIds.value)
    if (!ids.length) return
    const selectedSet = new Set(ids)
    const sorted = [...nodes.value].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0))
    pushHistory()

    if (mode === 'front') {
      let z = nextZIndex()
      for (const n of sorted) {
        if (!selectedSet.has(n.id)) continue
        n.zIndex = z++
      }
    } else if (mode === 'back') {
      let z = 1
      for (const n of sorted) {
        if (!selectedSet.has(n.id)) continue
        n.zIndex = z++
      }
      let restZ = z
      for (const n of sorted) {
        if (selectedSet.has(n.id)) continue
        n.zIndex = restZ++
      }
    } else if (mode === 'forward') {
      const order = [...sorted].sort((a, b) => (b.zIndex || 0) - (a.zIndex || 0))
      for (const n of order) {
        if (!selectedSet.has(n.id)) continue
        const current = n.zIndex || 0
        const nextNode = sorted.find((item) => (item.zIndex || 0) > current && !selectedSet.has(item.id))
        if (nextNode) {
          const temp = nextNode.zIndex || 0
          nextNode.zIndex = current
          n.zIndex = temp
        }
      }
    } else {
      for (const n of sorted) {
        if (!selectedSet.has(n.id)) continue
        const current = n.zIndex || 0
        const prevNode = [...sorted].reverse().find((item) => (item.zIndex || 0) < current && !selectedSet.has(item.id))
        if (prevNode) {
          const temp = prevNode.zIndex || 0
          prevNode.zIndex = current
          n.zIndex = temp
        }
      }
    }

    const now = new Date().toISOString()
    for (const n of nodes.value) {
      if (selectedSet.has(n.id)) n.updatedAt = now
    }
    scheduleSave()
  }

  function updatePromptState(patch: {
    mode?: 'image' | 'video'
    promptText?: string
    negativePromptText?: string
    model?: string
    params?: { size?: string; style?: string }
  }) {
    if (patch.mode) promptMode.value = patch.mode
    if (patch.promptText !== undefined) promptText.value = patch.promptText
    if (patch.negativePromptText !== undefined) negativePromptText.value = patch.negativePromptText
    if (patch.model) selectedModel.value = patch.model
    if (patch.params) paramSettings.value = { ...paramSettings.value, ...patch.params }
  }

  function createNodeFromPrompt() {
    const now = new Date().toISOString()
    // 计算新节点位置：在现有节点右侧或从中心开始
    const lastNode = nodes.value[nodes.value.length - 1]
    const baseX = lastNode ? lastNode.x + (lastNode.width || 280) + 40 : 100
    const baseY = lastNode ? lastNode.y : 100
    
    return createNode({
      title: promptMode.value === 'video' ? '视频生成' : '图像生成',
      prompt: promptText.value || '补充画面主体、光线与镜头语言',
      negativePrompt: negativePromptText.value || undefined,
      tag: promptMode.value === 'video' ? '视频' : '图像',
      size: paramSettings.value.size,
      style: paramSettings.value.style,
      provider: selectedModel.value,
      model: selectedModel.value,
      taskType: promptMode.value === 'video' ? 'text2video' : 'text2img',
      mode: promptMode.value,
      params: { ...paramSettings.value },
      createdAt: now,
      updatedAt: now,
      x: baseX,
      y: baseY,
      width: 320,
      height: 320,
    })
  }

  async function generateFromPrompt() {
    const node = createNodeFromPrompt()
    await createTaskForNode(node.id)
    return node
  }

  function normalizeEditProvider(rawProvider?: string) {
    const provider = String(rawProvider || '').trim()
    if (!provider) return selectedModel.value
    if (provider === 'qwen' || provider === 'qwen/text-to-image') return 'qwen/image-to-image'
    if (provider === 'flux') return 'flux-2-pro'
    return provider
  }

  function assertImageEditModelSupported(rawModel?: string) {
    const model = normalizeEditProvider(rawModel)
    if (!model) {
      throw new Error('请先在右侧选择图像模型')
    }

    const videoModels = new Set([
      'veo3.1-fast',
      'veo3.1-pro',
      'sora-2',
      'sora-2-pro',
      'kling-3.0',
      'kling-2.6',
      'kling-2.6/text-to-video',
      'bytedance/seedance-1.5-pro',
    ])
    if (videoModels.has(model)) {
      throw new Error('当前模型不支持图生图，请在右侧切换到图像模型后重试')
    }

    const supported = new Set([
      'gpt-image-1.5',
      'sora-image',
      'doubao-seedance-4-5',
      'flux-2-pro',
      'flux-kontext-pro',
      'flux-kontext-max',
      'midjourney',
      'qwen/image-to-image',
      'qwen/image-edit',
    ])

    if (model.startsWith('nano-banana')) return
    if (supported.has(model)) return
    throw new Error(`当前模型 ${model} 不支持图生图，请切换支持图生图的模型`)
  }

  function isApimartProvider(provider: string) {
    const p = provider.toLowerCase()
    return p.includes('flux') || p.includes('seedream') || p.includes('imagen') || p.includes('recraft')
  }

  function isGrsAiProvider(provider: string) {
    const p = provider.toLowerCase()
    return p.startsWith('nano-banana') || p === 'gpt-image-1.5' || p.startsWith('sora-image')
  }

  function isLikelyImageUrl(url?: string) {
    if (!url) return false
    const lower = url.toLowerCase()
    if (lower.includes('.mp4') || lower.includes('.webm') || lower.includes('.mov') || lower.includes('.m3u8')) return false
    return true
  }

  function pickEditableImageUrl(node: CanvasNode) {
    const params = (node.params || {}) as Record<string, unknown>
    const candidates = [
      node.previewUrl,
      node.resultUrl,
      typeof params.imageUrl === 'string' ? params.imageUrl : '',
    ].filter((v): v is string => !!v && typeof v === 'string')
    return candidates.find(url => isLikelyImageUrl(url)) || ''
  }

  function isVideoTaskType(taskType?: string, mode?: string) {
    const task = String(taskType || '').toLowerCase()
    return mode === 'video' || task === 'text2video' || task === 'img2video'
  }

  function resolveEditModelForNode(sourceNode: CanvasNode) {
    const preferred = normalizeEditProvider(selectedModel.value)
    const fallbackByNode = normalizeEditProvider(sourceNode.model || sourceNode.provider || '')
    const fallback = fallbackByNode || 'gpt-image-1.5'

    const tryPick = (model: string) => {
      assertImageEditModelSupported(model)
      return model
    }

    try {
      return tryPick(preferred)
    } catch {
      return tryPick(fallback)
    }
  }

  async function editImageWithPrompt(sourceNodeId: string, newPrompt: string) {
    const sourceNode = nodes.value.find(n => n.id === sourceNodeId)
    if (!sourceNode) {
      throw new Error('未找到要编辑的节点')
    }
    if (isVideoTaskType(sourceNode.taskType, sourceNode.mode)) {
      throw new Error('当前节点是视频任务，暂不支持通过图片气泡进行二次编辑')
    }

    const now = new Date().toISOString()
    const sourceUrl = pickEditableImageUrl(sourceNode)
    if (!sourceUrl) {
      throw new Error('未找到可用的图片地址，无法执行图生图编辑')
    }
    const normalizedProvider = resolveEditModelForNode(sourceNode)
    const newNode = createNode({
      title: '图片编辑',
      prompt: newPrompt,
      tag: '编辑',
      provider: normalizedProvider,
      model: normalizedProvider,
      taskType: 'img2img',
      mode: 'image',
      size: sourceNode.size,
      style: sourceNode.style,
      params: {
        ...(sourceNode.params || {}),
        imageUrl: sourceUrl,
        imageUrls: sourceUrl ? [sourceUrl] : [],
        urls: sourceUrl ? [sourceUrl] : [],
        fileUrl: sourceUrl,
        fileUrls: sourceUrl ? [sourceUrl] : [],
      },
      x: sourceNode.x + (sourceNode.width || 320) + 60,
      y: sourceNode.y,
      width: sourceNode.width || 320,
      height: sourceNode.height || 320,
      createdAt: now,
      updatedAt: now,
    })
    await createTaskForNode(newNode.id)
    return newNode
  }

  async function createTaskForNode(id: string) {
    const node = nodes.value.find(n => n.id === id)
    if (!node) throw new Error('节点不存在')
    const taskType = node.taskType || (node.mode === 'video' ? 'text2video' : 'text2img')
    const provider = node.provider || node.model || 'gpt-image-1.5'

    node.taskType = taskType
    node.provider = provider
    node.errorMessage = undefined
    node.updatedAt = new Date().toISOString()
    node.status = 'running'
    node.progress = 0

    try {
      if (taskType === 'text2video' || taskType === 'img2video') {
        const payload: CreateVideoTaskData = {
          provider,
          taskType,
          prompt: node.prompt,
          imageUrl: node.previewUrl,
          params: { size: node.size, style: node.style }
        }
        const { data } = await createVideoTask(payload)
        const task = data as VideoTask
        node.taskId = task.id
        node.progress = task.progress || 0
        node.resultUrl = task.resultUrl || task.videoUrl
        node.previewUrl = task.thumbnailUrl || node.previewUrl
      } else {
        const sourceUrlFromNode = (node.resultUrl || node.previewUrl || '') as string
        const mergedParams: Record<string, unknown> = {
          ...(node.params || {}),
          size: node.size || '1024x1024',
          style: node.style,
          aspectRatio: (node.params as Record<string, unknown> | undefined)?.ratio ?? (node.params as Record<string, unknown> | undefined)?.aspectRatio,
        }
        const paramImageUrl = typeof mergedParams.imageUrl === 'string' ? mergedParams.imageUrl.trim() : ''
        const sourceUrl = paramImageUrl || sourceUrlFromNode

        if ((taskType === 'img2img' || taskType === 'variation') && !sourceUrl) {
          throw new Error('图生图缺少参考图片 URL，请先选择一张可用图片')
        }

        if ((taskType === 'img2img' || taskType === 'variation') && sourceUrl) {
          // 对齐 DrawLayout 的图生图参数命名，兼容不同 provider
          mergedParams.imageUrl = mergedParams.imageUrl || sourceUrl
          mergedParams.imageUrls = Array.isArray(mergedParams.imageUrls) ? mergedParams.imageUrls : [sourceUrl]
          mergedParams.urls = Array.isArray(mergedParams.urls) ? mergedParams.urls : [sourceUrl]
          mergedParams.fileUrl = mergedParams.fileUrl || sourceUrl
          mergedParams.fileUrls = Array.isArray(mergedParams.fileUrls) ? mergedParams.fileUrls : [sourceUrl]
        }

        if ((taskType === 'img2img' || taskType === 'variation') && isGrsAiProvider(provider)) {
          mergedParams.urls = Array.isArray(mergedParams.urls) && mergedParams.urls.length > 0
            ? mergedParams.urls
            : [sourceUrl]
        }

        if ((taskType === 'img2img' || taskType === 'variation') && isApimartProvider(provider)) {
          mergedParams.imageUrls = Array.isArray(mergedParams.imageUrls) && mergedParams.imageUrls.length > 0
            ? mergedParams.imageUrls
            : [sourceUrl]
        }

        if ((provider === 'midjourney') && (taskType === 'img2img' || taskType === 'variation')) {
          mergedParams.taskType = (mergedParams.taskType as string) || 'mj_img2img'
          mergedParams.fileUrls = Array.isArray(mergedParams.fileUrls)
            ? mergedParams.fileUrls
            : (sourceUrl ? [sourceUrl] : [])
          mergedParams.fileUrl = (mergedParams.fileUrl as string) || sourceUrl
        }

        if ((provider === 'qwen/image-to-image' || provider === 'qwen/image-edit') && taskType === 'img2img') {
          mergedParams.imageUrl = (mergedParams.imageUrl as string) || sourceUrl
        }

        const payload: CreateDrawTaskData = {
          source: 'canvas',
          provider,
          taskType,
          prompt: node.prompt,
          negativePrompt: node.negativePrompt,
          sourceImageUrl: typeof mergedParams.imageUrl === 'string' ? mergedParams.imageUrl : undefined,
          params: mergedParams,
        }
        const { data } = await createDrawTask(payload)
        const task = data as DrawTask
        node.taskId = task.id
        node.progress = task.progress || 0
        node.resultUrl = task.resultUrl || task.imageUrl
        node.previewUrl = task.thumbnailUrl || node.previewUrl
      }
    } catch (e: any) {
      node.status = 'failed'
      const msg = e?.response?.data?.message || e?.message || '创建任务失败'
      node.errorMessage = msg
      node.params = { ...(node.params || {}), errorMessage: msg }
      node.updatedAt = new Date().toISOString()
      scheduleSave()
      throw new Error(msg)
    }

    node.updatedAt = new Date().toISOString()
    saveLocal()
  }

  function applyTaskSnapshot(task: DrawTask | VideoTask) {
    const node = nodes.value.find(n => n.taskId === task.id)
    if (!node) return
    const status = task.status === 'failed' ? 'failed' : task.status === 'completed' || task.status === 'done' ? 'done' : 'running'
    node.status = status
    node.progress = task.progress || node.progress
    node.resultUrl = task.resultUrl || (task as DrawTask).imageUrl || (task as VideoTask).videoUrl || node.resultUrl
    node.previewUrl = task.thumbnailUrl || node.previewUrl
    const errMsg = task.errorMessage || task.error
    if (typeof errMsg === 'string' && errMsg.trim()) {
      node.errorMessage = errMsg
      node.params = { ...(node.params || {}), errorMessage: errMsg }
    } else if (status !== 'failed') {
      node.errorMessage = undefined
    }
    node.updatedAt = new Date().toISOString()
    scheduleSave()
  }

  function applyTaskEvent(payload: TaskEventPayload) {
    if (payload.module !== 'draw' && payload.module !== 'video') return
    const node = nodes.value.find(n => n.taskId === payload.taskId)
    if (!node) return
    if (payload.type === 'task.failed') node.status = 'failed'
    if (payload.type === 'task.completed') node.status = 'done'
    if (payload.type === 'task.updated' || payload.type === 'task.created') node.status = 'running'
    if (payload.progress !== undefined) node.progress = payload.progress
    if (payload.errorMessage && payload.errorMessage.trim()) {
      node.errorMessage = payload.errorMessage
      node.params = { ...(node.params || {}), errorMessage: payload.errorMessage }
    } else if (payload.type === 'task.completed') {
      node.errorMessage = undefined
    }
    node.resultUrl = payload.videoUrl || payload.imageUrl || payload.resultPreviewUrl || node.resultUrl
    node.previewUrl = payload.thumbnailUrl || payload.imageUrl || node.previewUrl
    node.updatedAt = new Date().toISOString()
    scheduleSave()
  }

  async function syncTaskStatus() {
    const ids = nodes.value.filter(n => n.taskId).map(n => n.taskId as string)
    if (ids.length === 0) return
    // Simple way: Fetch both draw and video since we don't track module explicitly in `nodes` easily here
    // But since IDs are unique UUIDs, we can just hit both APIs
    try {
      const { data: drawData } = await getDrawTasksStatusBatch(ids)
      const drawList = drawData as DrawTask[]
      drawList.forEach(task => applyTaskSnapshot(task))
    } catch {}

    try {
      const { data: videoData } = await getVideoTasksStatusBatch(ids)
      const videoList = videoData as VideoTask[]
      videoList.forEach(task => applyTaskSnapshot(task))
    } catch {}
  }

  function bindRealtime() {
    connectRealtime()
    return onTaskEvent((payload) => applyTaskEvent(payload))
  }

  function unbindRealtime() {
    disconnectRealtime()
  }

  function buildProject(): CanvasProject {
    return {
      id: 'default',
      name: '默认画布',
      nodes: nodes.value,
      edges: edges.value,
      viewport: viewport.value,
      updatedAt: new Date().toISOString(),
    }
  }

  function saveLocal() {
    const project = buildProject()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project))
    lastSavedAt.value = new Date(project.updatedAt).toLocaleTimeString()
  }

  function scheduleSave(delay = 900) {
    if (saveTimer !== null) window.clearTimeout(saveTimer)
    saveTimer = window.setTimeout(() => {
      saveLocal()
      saveTimer = null
    }, delay)
  }

  function exportSnapshot() {
    const project = buildProject()
    const blob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `canvas-${Date.now()}.json`
    link.click()
    URL.revokeObjectURL(url)
  }

  return {
    nodes,
    edges,
    viewport,
    selectedNodeId,
    selectedNodeIds,
    selectedNode,
    lastSavedAt,
    runningCount,
    queuedCount,
    canUndo,
    canRedo,
    promptMode,
    promptText,
    negativePromptText,
    selectedModel,
    paramSettings,
    historyNodes,
    ensureLoaded,
    setViewport,
    selectNode,
    addToSelection,
    removeFromSelection,
    setSelectedNodes,
    clearSelection,
    selectAll,
    createNode,
    duplicateNode,
    deleteNode,
    deleteSelectedNodes,
    updateNode,
    moveNodesBatch,
    setSelectionZOrder,
    updatePromptState,
    createNodeFromPrompt,
    generateFromPrompt,
    editImageWithPrompt,
    createTaskForNode,
    syncTaskStatus,
    bindRealtime,
    unbindRealtime,
    saveLocal,
    scheduleSave,
    exportSnapshot,
    undo,
    redo,
  }

})
