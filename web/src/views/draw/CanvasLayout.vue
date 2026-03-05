<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch, computed, h, resolveComponent } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { ArrowUpRight, ImagePlus, MousePointer2, Square, Type as TypeIcon } from 'lucide-vue-next'

import { storeToRefs } from 'pinia'
import { useCanvasStore } from '../../stores/canvas'
import CanvasToolbar from './canvas/CanvasToolbar.vue'
import CanvasStage from './canvas/CanvasStage.vue'
import CanvasSidebar from './canvas/CanvasSidebar.vue'
import { getModels } from '../../api/model'
import { checkContent, type CheckContentResult } from '../../api/badwords'
import { uploadFile } from '../../api/upload'

const canvasStore = useCanvasStore()
const {
  nodes,
  viewport,
  selectedNodeId,
  selectedNodeIds,
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
} = storeToRefs(canvasStore)


let stopRealtime: (() => void) | null = null
const activeTool = ref<'select' | 'upload' | 'shape' | 'text' | 'arrow'>('select')
const shapeKind = ref<'square' | 'circle'>('square')
const shapeColor = ref('#165DFF')
const uploadInputRef = ref<HTMLInputElement | null>(null)
const SNAP_ENABLED = true
const SNAP_THRESHOLD = 12
const SNAP_GRID_SIZE = 24

/* === 敏感词检测结果 === */
const lastCheckResult = ref<CheckContentResult | null>(null)
const notifiedFailedNodeKeys = ref<Set<string>>(new Set())

// 转义正则特殊字符
function escapeRegExp(str: string) {
  // 匹配所有正则特殊字符并转义
  return str.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&')
}

// 从文本中移除敏感词
function removeBadWordsFromText(text: string, words: string[]) {
  if (!text) return text
  let result = text
  for (const w of words) {
    if (!w) continue
    const reg = new RegExp(escapeRegExp(w), 'gi')
    result = result.replace(reg, '')
  }
  return result.replace(/\s{2,}/g, ' ').trim()
}

const imageProvidersDef = [
  { value: 'nano-banana-pro', label: 'Nano Banana Pro', desc: 'Google 高质量绘画', color: '#FF7D00' },
  { value: 'gpt-image-1', label: 'GPT Image 1', desc: 'OpenAI 图像生成/编辑', color: '#00B42A' },
  { value: 'doubao-seedance-4-5', label: 'Seedream 4', desc: '豆包高质量生成', color: '#165DFF' },
  { value: 'flux', label: 'Flux', desc: 'Flux 系列（文生图/图片编辑）', color: '#14C9C9' },
  { value: 'z-image', label: 'Z-Image', desc: '极速文生图，画质清晰', color: '#22c55e' },
  { value: 'grok-imagine/text-to-image', label: 'Grok Imagine', desc: 'xAI 文生图，支持多种比例', color: '#f472b6' },
  { value: 'qwen', label: '通义万相', desc: '阿里通义系列（文生图/图生图/编辑）', color: '#38bdf8' },
  { value: 'midjourney', label: 'Midjourney', desc: 'MJ 艺术级绘画，风格多样', color: '#a78bfa' },
]

const videoProvidersDef = [
  { value: 'veo3.1-fast', label: 'Veo 3.1 Fast', desc: '快速生成', color: '#FF7D00' },
  { value: 'veo3.1-pro', label: 'Veo 3.1 Pro', desc: '高质量生成', color: '#4080FF' },
  { value: 'sora-2', label: 'Sora 2', desc: 'APIMart 标准版', color: '#14C9C9' },
  { value: 'sora-2-pro', label: 'Sora 2 Pro', desc: 'APIMart 专业版', color: '#22c55e' },
  { value: 'kling-3.0', label: 'Kling 3.0', desc: '可灵3.0', color: '#e11d48' },
  { value: 'kling-2', label: 'Kling 2', desc: '可灵2系列', color: '#0ea5e9' },
  { value: 'bytedance/seedance-1-pro', label: 'Seedance 1 Pro', desc: '字节视频', color: '#14b8a6' },
]

const modelPointsMap = ref<Record<string, number>>({})

// 图像模型参数配置（与 DrawLayout.vue 对齐）
const imageModelConfigs: Record<string, any> = {
  'nano-banana-pro': {
    ratios: [
      { value: 'auto', label: 'auto', icon: '⬜' },
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
      { value: '4:3', label: '4:3', icon: '▭' },
      { value: '3:4', label: '3:4', icon: '▯' },
    ],
    sizes: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K' },
    ],
    maxRefImages: 4,
  },
  'doubao-seedance-4-5': {
    ratios: [
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '4:3', label: '4:3', icon: '▭' },
      { value: '3:4', label: '3:4', icon: '▯' },
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    resolutions: [
      { value: '2K', label: '2K' },
      { value: '4K', label: '4K' },
    ],
    maxRefImages: 10,
  },
  'flux': {
    ratios: [
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '4:3', label: '4:3', icon: '▭' },
      { value: '3:4', label: '3:4', icon: '▯' },
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    resolutions: [
      { value: '1K', label: '1K' },
      { value: '2K', label: '2K' },
    ],
    maxRefImages: 8,
  },
  'gpt-image-1': {
    ratios: [
      { value: 'auto', label: 'auto', icon: '⬜' },
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '3:2', label: '3:2', icon: '▬' },
      { value: '2:3', label: '2:3', icon: '▯' },
    ],
    maxRefImages: 1,
  },
  'z-image': {
    ratios: [
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '4:3', label: '4:3', icon: '▭' },
      { value: '3:4', label: '3:4', icon: '▯' },
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    maxRefImages: 0,
  },
  'grok-imagine/text-to-image': {
    ratios: [
      { value: '1:1', label: '1:1', icon: '■' },
      { value: '4:3', label: '4:3', icon: '▭' },
      { value: '3:4', label: '3:4', icon: '▯' },
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    maxRefImages: 0,
  },
}

// 视频模型参数配置
const videoModelConfigs: Record<string, any> = {
  'veo3.1-fast': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    durations: [
      { value: '5s', label: '5秒' },
      { value: '10s', label: '10秒' },
    ],
  },
  'veo3.1-pro': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    durations: [
      { value: '5s', label: '5秒' },
      { value: '10s', label: '10秒' },
    ],
  },
  'sora-2': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    durations: [
      { value: '10s', label: '10秒' },
      { value: '15s', label: '15秒' },
    ],
  },
  'sora-2-pro': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    durations: [
      { value: '10s', label: '10秒' },
      { value: '15s', label: '15秒' },
      { value: '25s', label: '25秒' },
    ],
  },
  'kling-3.0': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    durations: [
      { value: '5s', label: '5秒' },
      { value: '10s', label: '10秒' },
    ],
  },
  'bytedance/seedance-1-pro': {
    ratios: [
      { value: '16:9', label: '16:9', icon: '▬' },
      { value: '9:16', label: '9:16', icon: '▮' },
    ],
    resolutions: [
      { value: '720p', label: '720p' },
      { value: '1080p', label: '1080p' },
    ],
    durations: [
      { value: '4s', label: '4秒' },
      { value: '6s', label: '6秒' },
      { value: '8s', label: '8秒' },
      { value: '10s', label: '10秒' },
    ],
    maxRefImages: 3,
  },
}

// 合并的模型配置
const modelConfigs = computed(() => {
  return promptMode.value === 'video' ? videoModelConfigs : imageModelConfigs
})

const modelOptions = computed(() => {
  const defs = promptMode.value === 'video' ? videoProvidersDef : imageProvidersDef
  return defs.map(p => {
    // 尝试多种匹配方式
    let points = modelPointsMap.value[p.value] ?? 0

    // 如果直接匹配失败，尝试匹配子模型
    if (points === 0) {
      if (p.value === 'qwen') {
        points = modelPointsMap.value['qwen/text-to-image'] ?? 0
      } else if (p.value === 'flux') {
        points = modelPointsMap.value['flux-2-pro'] ?? 0
      } else if (p.value === 'kling-2') {
        points = modelPointsMap.value['kling-2/text-to-video'] ?? 0
      } else if (p.value === 'bytedance/seedance-1-pro') {
        points = 60 // 默认积分
      }
    }

    return {
      id: p.value,
      name: p.label,
      tag: `${points}积分`,
      color: p.color
    }
  })
})

async function fetchModelPoints() {
  try {
    const res = await getModels({ type: 'image' })
    const all = (res as any).data || res // 兼容两种返回格式
    if (Array.isArray(all)) {
      for (const m of all) {
        if (m.deductPoints) {
          modelPointsMap.value[m.modelName] = m.deductPoints
        }
      }
    }
  } catch { /* ignore */ }
}

function handleUndo() {
  canvasStore.undo()
}

function handleRedo() {
  canvasStore.redo()
}

function handleLayerAction(mode: 'front' | 'back' | 'forward' | 'backward') {
  canvasStore.setSelectionZOrder(mode)
}

function handleMoveNodes(moves: Array<{ id: string; x: number; y: number }>) {
  canvasStore.moveNodesBatch(moves)
}

onMounted(() => {
  fetchModelPoints()
  canvasStore.ensureLoaded()
  stopRealtime = canvasStore.bindRealtime()
  void canvasStore.syncTaskStatus()
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  if (stopRealtime) stopRealtime()
  canvasStore.unbindRealtime()
  window.removeEventListener('keydown', handleKeyDown)
})

watch(viewport, () => canvasStore.scheduleSave(1400), { deep: true })

watch(
  nodes,
  (list) => {
    for (const n of list) {
      if (n.status !== 'failed') continue
      if (!n.taskId) continue
      const msg = (n as any).errorMessage
        || (n.params as Record<string, unknown> | undefined)?.errorMessage
      const key = `${n.id}:${n.taskId || ''}:${String(msg || '')}`
      if (notifiedFailedNodeKeys.value.has(key)) continue
      notifiedFailedNodeKeys.value.add(key)
      Message.error({
        content: `${n.title || '任务'}失败：${String(msg || '未知错误')}`,
        duration: 3500,
      })
    }
  },
  { deep: true },
)

function handleCreateNode() {
  canvasStore.createNode()
  Message.success({ content: '已新增节点，可继续编辑并生成', duration: 1600 })
}

function handleSave() {
  canvasStore.saveLocal()
  Message.success({ content: '画布已保存到本地草稿', duration: 1600 })
}

function handleExport() {
  canvasStore.exportSnapshot()
  Message.info({ content: '已导出画布快照到本地文件', duration: 1800 })
}

// 缩放控制
const ZOOM_STEP = 0.1 // 每次缩放10%
const ZOOM_MIN = 0.02 // 最小2%
const ZOOM_MAX = 2 // 最大200%

function handleZoomIn() {
  const nextZoom = Math.min(ZOOM_MAX, viewport.value.zoom + ZOOM_STEP)
  canvasStore.setViewport({ ...viewport.value, zoom: nextZoom })
}

function handleZoomOut() {
  const nextZoom = Math.max(ZOOM_MIN, viewport.value.zoom - ZOOM_STEP)
  canvasStore.setViewport({ ...viewport.value, zoom: nextZoom })
}

function handleZoomReset() {
  canvasStore.setViewport({ ...viewport.value, zoom: 1 })
}

function handleSelectNode(id: string) {
  canvasStore.selectNode(id)
}

// 多选节点
function handleSelectMultiple(ids: string[]) {
  canvasStore.setSelectedNodes(ids)
}

// 键盘事件处理
function handleKeyDown(e: KeyboardEvent) {
  const target = e.target as HTMLElement
  const inInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
    if (inInput) return
    e.preventDefault()
    if (e.shiftKey) handleRedo()
    else handleUndo()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
    if (inInput) return
    e.preventDefault()
    handleRedo()
    return
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=')) {
    if (inInput) return
    e.preventDefault()
    handleZoomIn()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === '-') {
    if (inInput) return
    e.preventDefault()
    handleZoomOut()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === '0') {
    if (inInput) return
    e.preventDefault()
    handleZoomReset()
    return
  }

  // Delete/Backspace 删除选中的节点
  if (e.key === 'Delete' || e.key === 'Backspace') {
    // 如果正在输入文字，不处理
    if (inInput) {
      return
    }

    if (selectedNodeIds.value.size > 0) {
      e.preventDefault()
      const count = selectedNodeIds.value.size
      Modal.confirm({
        title: '确认删除',
        content: '确定要删除选中的 ' + count + ' 个节点吗？',
        okText: '删除',
        cancelText: '取消',
        onOk: () => {
          canvasStore.deleteSelectedNodes()
          Message.success({ content: '已删除 ' + count + ' 个节点', duration: 2000 })
        }
      })
    }
  }

  // Escape 取消选择
  if (e.key === 'Escape') {
    canvasStore.clearSelection()
  }

  // Ctrl+A 全选
  if (e.key === 'a' && (e.ctrlKey || e.metaKey)) {
    if (inInput) {
      return
    }
    e.preventDefault()
    canvasStore.selectAll()
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === ']') {
    if (inInput) return
    e.preventDefault()
    handleLayerAction('forward')
    return
  }

  if ((e.ctrlKey || e.metaKey) && e.key === '[') {
    if (inInput) return
    e.preventDefault()
    handleLayerAction('backward')
  }
}

// 删除节点中的敏感词
function handleRemoveBadWordsFromNode(nodeId: string, words: string[]) {
  const list = words.filter(Boolean)
  if (!list.length) return
  const node = nodes.value.find(n => n.id === nodeId)
  if (!node) return
  const newPrompt = removeBadWordsFromText(node.prompt || '', list)
  const newNegativePrompt = removeBadWordsFromText(node.negativePrompt || '', list)
  canvasStore.updateNode(nodeId, { prompt: newPrompt, negativePrompt: newNegativePrompt })
  Message.success({ content: '已删除违禁词', duration: 3000 })
}

// 生成节点任务（带敏感词检测）
async function handleGenerateNode(id: string, forceGenerate = false) {
  const node = nodes.value.find(n => n.id === id)
  if (!node) return

  // === 敏感词预检 ===
  if (!forceGenerate) {
    const textToCheck = [node.prompt, node.negativePrompt].filter(Boolean).join(' ')
    if (textToCheck.trim()) {
      try {
        const { data: checkResult } = await checkContent(textToCheck)
        lastCheckResult.value = checkResult

        // HIGH级别：直接拒绝
        if (checkResult.highWords && checkResult.highWords.length > 0) {
          const words = checkResult.highWords.filter(Boolean)
          const maxTags = 8
          const shown = words.slice(0, maxTags)
          const extra = words.length - shown.length
          const Tag = resolveComponent('a-tag')
          Modal.confirm({
            title: '⚠️ 严重违规警告',
            content: () => h('div', { class: 'badword-modal' }, [
              h('div', { class: 'badword-desc' }, '您的描述包含严重违规词汇，禁止生成！以下为触发词：'),
              h('div', { class: 'badword-tags' }, [
                ...shown.map((w) => h(Tag as any, { color: 'red' }, { default: () => w })),
                extra > 0 ? h('span', { class: 'badword-more' }, `+${extra}`) : null,
              ].filter(Boolean)),
              h('div', { class: 'badword-desc' }, '请立即停止此行为，违规记录已提交后台管理系统。'),
            ]),
            okText: '我知道了',
            cancelText: '删除违禁词',
            okButtonProps: { type: 'primary' },
            cancelButtonProps: { type: 'primary' },
            modalClass: 'badword-modal-wrap',
            onCancel: () => handleRemoveBadWordsFromNode(id, words),
          })
          return
        }

        // MEDIUM级别：弹窗确认
        if (checkResult.needConfirm && checkResult.mediumWords && checkResult.mediumWords.length > 0) {
          const words = checkResult.mediumWords.filter(Boolean)
          const maxTags = 8
          const shown = words.slice(0, maxTags)
          const extra = words.length - shown.length
          const Tag = resolveComponent('a-tag')
          Modal.confirm({
            title: '⚠️ 敏感内容提示',
            content: () => h('div', { class: 'badword-modal' }, [
              h('div', { class: 'badword-desc' }, '您的描述包含以下中级敏感词，请确认是否继续：'),
              h('div', { class: 'badword-tags' }, [
                ...shown.map((w) => h(Tag as any, { color: 'red' }, { default: () => w })),
                extra > 0 ? h('span', { class: 'badword-more' }, `+${extra}`) : null,
              ].filter(Boolean)),
            ]),
            okText: '确认生成',
            cancelText: '删除违禁词',
            okButtonProps: { type: 'primary' },
            cancelButtonProps: { type: 'primary' },
            modalClass: 'badword-modal-wrap',
            onOk: () => handleGenerateNode(id, true), // 强制生成
            onCancel: () => handleRemoveBadWordsFromNode(id, words),
          })
          return
        }
      } catch {
        // 检测接口失败不影响流程
      }
    }
  }

  // 执行生成
  try {
    await canvasStore.createTaskForNode(id)

    // 如果有 LOW 级别敏感词，显示提示
    if (lastCheckResult.value?.hasWarning && lastCheckResult.value?.lowWords?.length > 0) {
      Message.info({
        content: `📝 提示：您的描述包含轻微敏感词「${lastCheckResult.value.lowWords.slice(0, 3).join('、')}」，已标记`,
        duration: 5000,
      })
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('严重违规') || msg.includes('禁止生成')) {
      Modal.error({
        title: '⚠️ 严重违规警告',
        content: msg,
        okText: '我知道了',
      })
    } else if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的描述包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '创建任务失败')
    }
  }
}

function handleDuplicateNode(id: string) {
  canvasStore.duplicateNode(id)
}

function handleUpdateNode(payload: { id: string; patch: Record<string, unknown> }) {
  canvasStore.updateNode(payload.id, payload.patch)
}

function handleUpdatePrompt(patch: { mode?: 'image' | 'video'; promptText?: string; negativePromptText?: string; model?: string }) {
  canvasStore.updatePromptState(patch)
}

function handleUpdateParams(params: { size?: string; style?: string }) {
  canvasStore.updatePromptState({ params })
}

// 从提示词面板生成（带敏感词检测）
async function handleGenerateFromPrompt(forceGenerate = false) {
  // === 敏感词预检 ===
  if (!forceGenerate) {
    const textToCheck = [promptText.value, negativePromptText.value].filter(Boolean).join(' ')
    if (textToCheck.trim()) {
      try {
        const { data: checkResult } = await checkContent(textToCheck)
        lastCheckResult.value = checkResult

        // HIGH级别：直接拒绝
        if (checkResult.highWords && checkResult.highWords.length > 0) {
          const words = checkResult.highWords.filter(Boolean)
          const maxTags = 8
          const shown = words.slice(0, maxTags)
          const extra = words.length - shown.length
          const Tag = resolveComponent('a-tag')
          Modal.confirm({
            title: '⚠️ 严重违规警告',
            content: () => h('div', { class: 'badword-modal' }, [
              h('div', { class: 'badword-desc' }, '您的描述包含严重违规词汇，禁止生成！以下为触发词：'),
              h('div', { class: 'badword-tags' }, [
                ...shown.map((w) => h(Tag as any, { color: 'red' }, { default: () => w })),
                extra > 0 ? h('span', { class: 'badword-more' }, `+${extra}`) : null,
              ].filter(Boolean)),
              h('div', { class: 'badword-desc' }, '请立即停止此行为，违规记录已提交后台管理系统。'),
            ]),
            okText: '我知道了',
            cancelText: '删除违禁词',
            okButtonProps: { type: 'primary' },
            cancelButtonProps: { type: 'primary' },
            modalClass: 'badword-modal-wrap',
            onCancel: () => {
              // 从提示词中删除敏感词
              const newPrompt = removeBadWordsFromText(promptText.value || '', words)
              const newNegativePrompt = removeBadWordsFromText(negativePromptText.value || '', words)
              canvasStore.updatePromptState({ promptText: newPrompt, negativePromptText: newNegativePrompt })
              Message.success({ content: '已删除违禁词', duration: 3000 })
            },
          })
          return
        }

        // MEDIUM级别：弹窗确认
        if (checkResult.needConfirm && checkResult.mediumWords && checkResult.mediumWords.length > 0) {
          const words = checkResult.mediumWords.filter(Boolean)
          const maxTags = 8
          const shown = words.slice(0, maxTags)
          const extra = words.length - shown.length
          const Tag = resolveComponent('a-tag')
          Modal.confirm({
            title: '⚠️ 敏感内容提示',
            content: () => h('div', { class: 'badword-modal' }, [
              h('div', { class: 'badword-desc' }, '您的描述包含以下中级敏感词，请确认是否继续：'),
              h('div', { class: 'badword-tags' }, [
                ...shown.map((w) => h(Tag as any, { color: 'red' }, { default: () => w })),
                extra > 0 ? h('span', { class: 'badword-more' }, `+${extra}`) : null,
              ].filter(Boolean)),
            ]),
            okText: '确认生成',
            cancelText: '删除违禁词',
            okButtonProps: { type: 'primary' },
            cancelButtonProps: { type: 'primary' },
            modalClass: 'badword-modal-wrap',
            onOk: () => handleGenerateFromPrompt(true), // 强制生成
            onCancel: () => {
              // 从提示词中删除敏感词
              const newPrompt = removeBadWordsFromText(promptText.value || '', words)
              const newNegativePrompt = removeBadWordsFromText(negativePromptText.value || '', words)
              canvasStore.updatePromptState({ promptText: newPrompt, negativePromptText: newNegativePrompt })
              Message.success({ content: '已删除违禁词', duration: 3000 })
            },
          })
          return
        }
      } catch {
        // 检测接口失败不影响流程
      }
    }
  }

  // 执行生成
  try {
    await canvasStore.generateFromPrompt()

    // 如果有 LOW 级别敏感词，显示提示
    if (lastCheckResult.value?.hasWarning && lastCheckResult.value?.lowWords?.length > 0) {
      Message.info({
        content: `📝 提示：您的描述包含轻微敏感词「${lastCheckResult.value.lowWords.slice(0, 3).join('、')}」，已标记`,
        duration: 5000,
      })
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('严重违规') || msg.includes('禁止生成')) {
      Modal.error({
        title: '⚠️ 严重违规警告',
        content: msg,
        okText: '我知道了',
      })
    } else if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的描述包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '创建任务失败')
    }
  }
}

async function handleEditImage(payload: { nodeId: string; prompt: string }) {
  try {
    await canvasStore.editImageWithPrompt(payload.nodeId, payload.prompt)
    Message.success({ content: '已基于图片创建编辑任务', duration: 1600 })
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '创建编辑任务失败'
    if (msg.includes('不支持图生图') || msg.includes('切换到图像模型')) {
      Message.warning({ content: msg, duration: 3500 })
      return
    }
    Message.error({ content: msg, duration: 3000 })
  }
}

// 参考图状态
const refImages = ref<{ id: string; file: File; url: string }[]>([])

function handleUpdateRefImages(images: { id: string; file: File; url: string }[]) {
  refImages.value = images
}

function handleDeleteNode(id: string) {
  canvasStore.deleteNode(id)
  Message.success({ content: '已删除', duration: 1500 })
}

function handleDownloadNode(id: string) {
  const node = nodes.value.find(n => n.id === id)
  if (node?.previewUrl) {
    const link = document.createElement('a')
    link.href = node.previewUrl
    link.download = `canvas-${id}.png`
    link.click()
  }
}

function handleCreateNodeFromStage(payload: Record<string, unknown>) {
  canvasStore.createNode(payload)
}

function handleToolChange(tool: 'select' | 'upload' | 'shape' | 'text' | 'arrow') {
  activeTool.value = tool
  if (tool === 'upload') {
    handleUploadClick()
  }
}

function handleUploadClick() {
  uploadInputRef.value?.click()
}

function normalizeUploadUrl(rawUrl: string) {
  if (!rawUrl) return ''
  if (/^https?:\/\//i.test(rawUrl)) return rawUrl
  if (rawUrl.startsWith('/')) return `${window.location.origin}${rawUrl}`
  return `${window.location.origin}/${rawUrl}`
}

async function handleUploadChange(event: Event) {
  const target = event.target as HTMLInputElement | null
  const file = target?.files?.[0]
  if (!file) return

  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'])
  if (!allowedTypes.has(file.type)) {
    Message.error({ content: '仅支持 jpg/png/gif/webp/svg 图片上传', duration: 2600 })
    if (target) target.value = ''
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    Message.error({ content: '图片大小不能超过 10MB', duration: 2600 })
    if (target) target.value = ''
    return
  }

  const getInsertFrame = () => {
    const stage = document.querySelector('.canvas-stage') as HTMLElement | null
    const width = stage?.clientWidth || window.innerWidth
    const height = stage?.clientHeight || window.innerHeight
    return { width, height }
  }

  const fitSize = (naturalW: number, naturalH: number) => {
    const { width: stageW, height: stageH } = getInsertFrame()
    // 控制插入尺寸，避免超大图直接铺满画布
    const maxW = Math.max(320, Math.floor(stageW * 0.5))
    const maxH = Math.max(260, Math.floor(stageH * 0.5))
    const scale = Math.min(1, maxW / Math.max(1, naturalW), maxH / Math.max(1, naturalH))
    return {
      width: Math.max(48, Math.round(naturalW * scale)),
      height: Math.max(48, Math.round(naturalH * scale)),
    }
  }

  const placeAtViewportCenter = (width: number, height: number) => {
    const { width: stageW, height: stageH } = getInsertFrame()
    const worldCenterX = (stageW / 2 - viewport.value.x) / viewport.value.zoom
    const worldCenterY = (stageH / 2 - viewport.value.y) / viewport.value.zoom
    return {
      x: Math.round(worldCenterX - width / 2),
      y: Math.round(worldCenterY - height / 2),
    }
  }

  const getLocalImageSize = async () => {
    const localUrl = URL.createObjectURL(file)
    try {
      const size = await new Promise<{ width: number; height: number }>((resolve) => {
        const img = new Image()
        img.onload = () => {
          resolve({
            width: Math.max(48, img.naturalWidth || 320),
            height: Math.max(48, img.naturalHeight || 320),
          })
        }
        img.onerror = () => resolve({ width: 320, height: 320 })
        img.src = localUrl
      })
      return size
    } finally {
      URL.revokeObjectURL(localUrl)
    }
  }

  try {
    const localSize = await getLocalImageSize()
    const res = await uploadFile(file)
    const uploadedPath = (res?.data as { url?: string } | undefined)?.url || ''
    const previewUrl = normalizeUploadUrl(uploadedPath)
    if (!previewUrl) {
      throw new Error('上传成功但未返回可用图片地址')
    }
    const fitted = fitSize(localSize.width, localSize.height)
    const pos = placeAtViewportCenter(fitted.width, fitted.height)
    const created = canvasStore.createNode({
      title: '',
      tag: '',
      prompt: '',
      previewUrl,
      resultUrl: previewUrl,
      nodeType: 'image',
      x: pos.x,
      y: pos.y,
      width: fitted.width,
      height: fitted.height,
    })
    canvasStore.updateNode(created.id, { status: 'done' })
    canvasStore.saveLocal()
    activeTool.value = 'select'
    Message.success({ content: '图片已上传并插入画布', duration: 1600 })
  } catch (err: any) {
    const status = err?.response?.status
    if (status === 401) {
      Message.error({ content: '上传失败：请先登录后再上传图片', duration: 3000 })
    } else if (status === 413) {
      Message.error({ content: '上传失败：图片超过 10MB 限制', duration: 3000 })
    } else {
      const msg = err?.response?.data?.message || err?.message || '上传失败，请稍后重试'
      Message.error({ content: `上传失败：${msg}`, duration: 3200 })
    }
  } finally {
    if (target) target.value = ''
  }
}


</script>

<template>
  <div class="canvas-shell">
    <div class="canvas-main">
      <CanvasToolbar :zoom="viewport.zoom" :running="runningCount" :queued="queuedCount" :can-undo="canUndo"
        :can-redo="canRedo" @create-node="handleCreateNode" @save="handleSave" @export="handleExport"
        @zoom-in="handleZoomIn" @zoom-out="handleZoomOut" @zoom-reset="handleZoomReset" @undo="handleUndo"
        @redo="handleRedo" />

      <div class="canvas-body">
        <CanvasStage v-model:viewport="viewport" :nodes="nodes" :selected-id="selectedNodeId || ''"
          :selected-ids="[...selectedNodeIds]" :active-tool="activeTool" :shape-kind="shapeKind"
          :shape-color="shapeColor" :snap-enabled="SNAP_ENABLED" :snap-threshold="SNAP_THRESHOLD"
          :snap-grid-size="SNAP_GRID_SIZE" @select="handleSelectNode" @select-multiple="handleSelectMultiple"
          @generate="handleGenerateNode" @duplicate="handleDuplicateNode" @update-node="handleUpdateNode"
          @move-nodes="handleMoveNodes" @create-node="handleCreateNodeFromStage" @edit-image="handleEditImage" />

        <div class="canvas-toolbox">
          <button :class="['tool-btn', { active: activeTool === 'select' }]" title="选择"
            @click="handleToolChange('select')">
            <MousePointer2 class="tool-icon" :size="18" />
          </button>
          <button :class="['tool-btn', { active: activeTool === 'upload' }]" title="添加图片"
            @click="handleToolChange('upload')">
            <ImagePlus class="tool-icon" :size="18" />
          </button>
          <button :class="['tool-btn', { active: activeTool === 'shape' }]" title="绘制色块"
            @click="handleToolChange('shape')">
            <Square class="tool-icon" :size="18" />
          </button>
          <button :class="['tool-btn', { active: activeTool === 'text' }]" title="输入文本"
            @click="handleToolChange('text')">
            <TypeIcon class="tool-icon" :size="18" />
          </button>
          <button :class="['tool-btn', { active: activeTool === 'arrow' }]" title="绘制箭头"
            @click="handleToolChange('arrow')">
            <ArrowUpRight class="tool-icon" :size="18" />
          </button>
          <div class="shape-options" v-if="activeTool === 'shape'">
            <button class="shape-btn" :class="{ active: shapeKind === 'square' }" title="方形色块"
              @click="shapeKind = 'square'">■</button>
            <button class="shape-btn" :class="{ active: shapeKind === 'circle' }" title="圆形色块"
              @click="shapeKind = 'circle'">●</button>
            <input v-model="shapeColor" class="shape-color" type="color" title="色块颜色" />
          </div>
          <div class="layer-options" v-if="selectedNodeIds.size > 0">
            <button class="layer-btn" title="置顶" @click="handleLayerAction('front')">置顶</button>
            <button class="layer-btn" title="上移一层" @click="handleLayerAction('forward')">上移</button>
            <button class="layer-btn" title="下移一层" @click="handleLayerAction('backward')">下移</button>
            <button class="layer-btn" title="置底" @click="handleLayerAction('back')">置底</button>
          </div>
          <input ref="uploadInputRef" class="file-input" type="file" accept="image/*" @change="handleUploadChange" />
        </div>

      </div>
    </div>

    <CanvasSidebar :nodes="historyNodes" :selected-id="selectedNodeId || ''" :prompt-mode="promptMode"
      :prompt-text="promptText" :selected-model="selectedModel" :param-settings="paramSettings" :models="modelOptions"
      :model-configs="modelConfigs" @select="handleSelectNode" @generate-node="handleGenerateNode"
      @delete-node="handleDeleteNode" @download-node="handleDownloadNode" @update-prompt="handleUpdatePrompt"
      @update-params="handleUpdateParams" @generate-from-prompt="handleGenerateFromPrompt"
      @update-ref-images="handleUpdateRefImages" />
  </div>
</template>

<style scoped>
.canvas-shell {
  display: flex;
  flex-direction: row;
  height: 100vh;
  background: var(--bg-body, #f8fafc);
  color: var(--text-1, #232324);
  overflow: hidden;
}

.canvas-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  position: relative;
  min-width: 0;
}

.canvas-body {
  flex: 1;
  display: flex;
  position: relative;
  overflow: hidden;
}

.canvas-toolbox {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 8px 6px;
  background: var(--glass-bg, #fff);
  border-radius: 16px;
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  box-shadow: 0 10px 24px rgba(148, 163, 184, 0.1);
  z-index: 12;
  width: 54px;
}

.tool-btn {
  width: 34px;
  height: 34px;
  border-radius: 12px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--text-2, #334155);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.2s ease, color 0.2s ease, transform 0.2s ease, border-color 0.2s ease;
}

.tool-btn:hover {
  background: var(--bg-surface-2, #F5F5F5);
  transform: translateY(-1px);
}

.tool-btn.active {
  background: var(--primary, #232324);
  color: #fff;
}

.tool-icon {
  stroke-width: 2;
}

.shape-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 4px;
  border-top: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
}

.layer-options {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
}

.layer-btn {
  width: 40px;
  min-height: 24px;
  border-radius: 8px;
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  background: var(--bg-surface-1, #fff);
  color: var(--text-2, #334155);
  cursor: pointer;
  font-size: 11px;
  padding: 3px 4px;
}

.shape-btn {
  width: 34px;
  height: 28px;
  border-radius: 10px;
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  background: var(--bg-surface-1, #fff);
  color: var(--text-2, #334155);
  cursor: pointer;
  font-size: 14px;
}

.shape-btn.active {
  background: var(--primary, #232324);
  color: #fff;
}

.shape-color {
  width: 34px;
  height: 26px;
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  border-radius: 8px;
  padding: 0;
  cursor: pointer;
  background: transparent;
}

.file-input {
  display: none;
}

.canvas-status {
  position: absolute;
  left: 12px;
  bottom: 12px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 0 16px;
  font-size: 11px;
  color: var(--text-3, #6B7785);
  background: var(--glass-bg, rgba(255, 255, 255, 0.9));
  border: 1px solid var(--border-2, rgba(226, 232, 240, 0.9));
  border-radius: 16px;
  backdrop-filter: blur(6px);
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 12px;
}
</style>
