<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick, h, resolveComponent } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconCopy,
  IconImage,
  IconDownload,
  IconDelete,
  IconSwap,
  IconPlus,
  IconClose,
  IconRefresh,
  IconSettings,
} from '@arco-design/web-vue/es/icon'
import {
  createDrawTask,
  getMyTasks,
  getGallery,
  getTasksStatusBatch,
  togglePublic,
  deleteTask,
  retryTask,
  retryAllFailedTasks,
  type DrawTask,
  type GalleryItem,
  type CreateDrawTaskData,
} from '../../api/draw'
import { uploadFile } from '../../api/upload'
import { getModels } from '../../api/model'
import { checkContent, type CheckContentResult } from '../../api/badwords'
import EmptyState from '../../components/EmptyState.vue'
import WorkCardActionButton from '../../components/WorkCardActionButton.vue'
import GenerateButton from '../../components/GenerateButton.vue'
import { onTaskEvent, realtimeConnected } from '../../realtime/socket'

/* === 敏感词检测结果 === */
const lastCheckResult = ref<CheckContentResult | null>(null)

/* === 状态 === */
const activeTab = ref('create')
const generating = ref(false)
const selectedWorkIds = ref<Set<string>>(new Set())
const batchMode = ref(false)

function toggleBatchMode() {
  batchMode.value = !batchMode.value
  selectedWorkIds.value.clear()
}

function toggleWorkSelection(id: string) {
  if (selectedWorkIds.value.has(id)) {
    selectedWorkIds.value.delete(id)
  } else {
    selectedWorkIds.value.add(id)
  }
}

function toggleSelectAll() {
  if (selectedWorkIds.value.size === myTasks.value.length) {
    selectedWorkIds.value.clear()
  } else {
    selectedWorkIds.value = new Set(myTasks.value.map(t => t.id))
  }
}

function escapeRegExp(str: string) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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

function handleRemoveBadWords(words: string[]) {
  const list = words.filter(Boolean)
  if (!list.length) return
  form.value.prompt = removeBadWordsFromText(form.value.prompt || '', list)
  form.value.negativePrompt = removeBadWordsFromText(form.value.negativePrompt || '', list)
  Message.success({ content: '已删除违禁词', duration: 3000 })
}

async function handleBatchDelete() {
  if (selectedWorkIds.value.size === 0) return
  const count = selectedWorkIds.value.size
  Modal.confirm({
    title: `批量删除 ${count} 幅作品`,
    content: '确定要删除选中的作品吗？删除后无法恢复。',
    okText: '确认删除',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onOk: async () => {
      try {
        await Promise.all(Array.from(selectedWorkIds.value).map(id => deleteTask(id)))
        myTasks.value = myTasks.value.filter(t => !selectedWorkIds.value.has(t.id))
        selectedWorkIds.value.clear()
        batchMode.value = false
        Message.success({ content: `成功删除 ${count} 幅作品`, duration: 3000 })
      } catch {
        Message.error({ content: '批量删除失败，请稍后重试', duration: 3000 })
      }
    }
  })
}

async function handleBatchDownload() {
  const selected = myTasks.value.filter(t => selectedWorkIds.value.has(t.id) && t.resultUrl)
  if (selected.length === 0) {
    Message.warning('选中的作品中没有可下载的文件')
    return
  }

  try {
    Message.info({ content: `开始下载 ${selected.length} 个文件，请稍候...`, duration: 2000 })
    for (let i = 0; i < selected.length; i++) {
      const task = selected[i]
      if (!task?.resultUrl) continue
      await new Promise(resolve => setTimeout(resolve, 300))
      handleDownload(task.resultUrl)
    }
    Message.success({ content: `已完成 ${selected.length} 个文件的下载`, duration: 3000 })
  } catch {
    Message.error({ content: '批量下载过程中出现错误', duration: 3000 })
  }
}
const myTasks = ref<DrawTask[]>([])
const myTasksPage = ref(1)
const myTasksTotal = ref(0)
const myTasksLoading = ref(false)
const myTasksLoadingMore = ref(false)
const myTasksHasMore = computed(() => myTasks.value.length < myTasksTotal.value)
const retryAllLoading = ref(false)
const galleryItems = ref<GalleryItem[]>([])
const galleryPage = ref(1)
const galleryTotal = ref(0)
const galleryLoading = ref(false)
const galleryLoadingMore = ref(false)
const galleryHasMore = computed(() => galleryItems.value.length < galleryTotal.value)
const worksScrollRef = ref<HTMLElement>()
const galleryScrollRef = ref<HTMLElement>()
const worksSentinelRef = ref<HTMLElement>()
const gallerySentinelRef = ref<HTMLElement>()
const brokenImageIds = ref<Set<string>>(new Set())
const previewImage = ref<string | null>(null)
const previewPrompt = ref('')
const previewVisible = ref(false)
const previewTask = ref<DrawTask | null>(null)
const PARAM_LABEL_MAP: Record<string, string> = {
  aspectRatio: '画幅比例',
  size: '尺寸',
  imageSize: '图像尺寸',
  style: '风格',
  quality: '质量',
  responseFormat: '响应格式',
  model: '子模型',
  n: '生成数量',
  numImages: '生成数量',
  seed: '随机种子',
  strength: '重绘强度',
  guidanceScale: '引导强度',
  steps: '采样步数',
  numInferenceSteps: '推理步数',
  outputFormat: '输出格式',
  enableSafetyChecker: '安全检查',
  acceleration: '加速模式',
  resolution: '分辨率',
  version: '模型版本',
  taskType: '任务类型',
  speed: '速度模式',
  stylization: '风格化',
  weirdness: '怪异度',
  variety: '多样性',
  waterMark: '水印文本',
  syncMode: '同步模式',
  imageUrl: '参考图',
  imageUrls: '参考图列表',
  urls: '参考图列表',
  fileUrl: '文件链接',
  fileUrls: '文件链接列表',
  ow: '角色权重',
}
const PARAM_KEY_ORDER = [
  'model',
  'taskType',
  'aspectRatio',
  'size',
  'imageSize',
  'resolution',
  'style',
  'quality',
  'responseFormat',
  'outputFormat',
  'n',
  'numImages',
  'numInferenceSteps',
  'seed',
  'strength',
  'guidanceScale',
  'enableSafetyChecker',
  'acceleration',
  'speed',
  'version',
  'stylization',
  'weirdness',
  'variety',
  'syncMode',
  'waterMark',
  'ow',
  'imageUrl',
  'imageUrls',
  'fileUrl',
  'fileUrls',
  'urls',
]

function normalizeParams(params: unknown): Record<string, unknown> {
  if (!params) return {}
  if (typeof params === 'object' && !Array.isArray(params)) return params as Record<string, unknown>
  return { value: params }
}

function isEmptyParamValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0
  return false
}

function formatParamLabel(key: string): string {
  if (PARAM_LABEL_MAP[key]) return PARAM_LABEL_MAP[key]
  return key.replace(/([a-z])([A-Z])/g, '$1 $2')
}

function shortenUrl(url: string): string {
  if (url.length <= 96) return url
  return `${url.slice(0, 56)}...${url.slice(-24)}`
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return '-'
  if (typeof value === 'boolean') return value ? '开启' : '关闭'
  if (typeof value === 'string') {
    const val = value.trim()
    if (!val) return '-'
    if (/^https?:\/\//.test(val)) return shortenUrl(val)
    return val
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) {
    if (!value.length) return '-'
    return value
      .map((item) => {
        if (typeof item === 'string' && /^https?:\/\//.test(item)) return shortenUrl(item)
        if (typeof item === 'string') return item
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .join('\n')
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const previewParamItems = computed(() => {
  const params = normalizeParams(previewTask.value?.params)
  const keys = Object.keys(params).filter((key) => !isEmptyParamValue(params[key]))
  const sortedKeys = [...keys].sort((a, b) => {
    const ai = PARAM_KEY_ORDER.indexOf(a)
    const bi = PARAM_KEY_ORDER.indexOf(b)
    if (ai >= 0 && bi >= 0) return ai - bi
    if (ai >= 0) return -1
    if (bi >= 0) return 1
    return a.localeCompare(b)
  })
  return sortedKeys.map((key) => {
    const value = formatParamValue(params[key])
    return {
      key,
      label: formatParamLabel(key),
      value,
      long: value.length > 64 || value.includes('\n'),
    }
  })
})

const previewParamsJson = computed(() => JSON.stringify(normalizeParams(previewTask.value?.params), null, 2))

// Infinite scroll observers (mature/robust way, works even when first screen isn't scrollable)
let worksIo: IntersectionObserver | null = null
let galleryIo: IntersectionObserver | null = null

function setupWorksInfiniteObserver() {
  if (typeof IntersectionObserver === 'undefined') return
  worksIo?.disconnect()
  worksIo = null
  const root = worksScrollRef.value
  const target = worksSentinelRef.value
  if (!root || !target) return
  worksIo = new IntersectionObserver(
    (entries) => {
      if (activeTab.value !== 'create') return
      if (entries.some((e) => e.isIntersecting)) void loadMoreMyTasks()
    },
    { root, rootMargin: '600px 0px', threshold: 0.01 },
  )
  worksIo.observe(target)
}

function setupGalleryInfiniteObserver() {
  if (typeof IntersectionObserver === 'undefined') return
  galleryIo?.disconnect()
  galleryIo = null
  const root = galleryScrollRef.value
  const target = gallerySentinelRef.value
  if (!root || !target) return
  galleryIo = new IntersectionObserver(
    (entries) => {
      if (activeTab.value !== 'gallery') return
      if (entries.some((e) => e.isIntersecting)) void loadMoreGallery()
    },
    { root, rootMargin: '600px 0px', threshold: 0.01 },
  )
  galleryIo.observe(target)
}

const form = ref<CreateDrawTaskData>({
  provider: 'nano-banana-pro',
  taskType: 'text2img',
  prompt: '',
  negativePrompt: '',
  size: '1024x1024',
  style: '',
})

const showNegative = ref(false)

/* === 参考图（图生图）=== */
const FALLBACK_MAX_REF_IMAGES = 20
const refImages = ref<{ id: string; file: File; url: string }[]>([])
const refDragOver = ref(false)
const refInputRef = ref<HTMLInputElement>()

function handleRefSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  addRefFiles(Array.from(files))
  if (refInputRef.value) refInputRef.value.value = ''
}

function handleRefDrop(e: DragEvent) {
  e.preventDefault()
  refDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  addRefFiles(Array.from(files))
}

function addRefFiles(files: File[]) {
  if (currentConfig.value.maxRefImages === 0) {
    Message.warning('当前模型不支持参考图')
    return
  }
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  if (!imageFiles.length) { Message.warning('请选择图片文件'); return }
  const maxRef = currentConfig.value.maxRefImages ?? FALLBACK_MAX_REF_IMAGES
  const remaining = maxRef - refImages.value.length
  if (remaining <= 0) { Message.warning(`最多上传 ${maxRef} 张参考图`); return }
  const toAdd = imageFiles.slice(0, remaining)
  for (const file of toAdd) {
    const url = URL.createObjectURL(file)
    refImages.value.push({ id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file, url })
  }
  if (imageFiles.length > remaining) {
    Message.info(`已达上限，仅添加了 ${remaining} 张`)
  }
  if (refImages.value.length > 0) {
    form.value.taskType = 'img2img'
  }
}

function removeRefImage(id: string) {
  const idx = refImages.value.findIndex(r => r.id === id)
  if (idx >= 0) {
    const target = refImages.value[idx]
    if (target) URL.revokeObjectURL(target.url)
    refImages.value.splice(idx, 1)
  }
  if (refImages.value.length === 0) {
    form.value.taskType = 'text2img'
  }
}

function clearAllRef() {
  refImages.value.forEach(r => URL.revokeObjectURL(r.url))
  refImages.value = []
  form.value.taskType = 'text2img'
}

const providersDef = [
  { value: 'nano-banana-pro', label: 'Nano Banana Pro', desc: 'Google 高质量绘画', color: '#FF7D00' },
  { value: 'gpt-image-1', label: 'GPT Image 1', desc: 'OpenAI 图像生成/编辑', color: '#00B42A' },
  { value: 'doubao-seedance-4-5', label: 'Seedream 4', desc: '豆包高质量生成，支持图生图', color: '#165DFF' },
  { value: 'flux', label: 'Flux', desc: 'Flux 系列（文生图/图片编辑）', color: '#14C9C9' },
  { value: 'z-image', label: 'Z-Image', desc: '极速文生图，画质清晰', color: '#22c55e' },
  { value: 'grok-imagine/text-to-image', label: 'Grok Imagine', desc: 'xAI 文生图，支持多种比例', color: '#f472b6' },
  { value: 'qwen', label: '通义万相', desc: '阿里通义系列（文生图/图生图/编辑）', color: '#38bdf8' },
  { value: 'midjourney', label: 'Midjourney', desc: 'MJ 艺术级绘画，风格多样', color: '#a78bfa' },
]
/** 前端 provider value -> 后端 modelName（或多个），用于按后台启用列表过滤 */
const imageProviderToBackendNames: Record<string, string | string[]> = {
  'gpt-image-1': 'gpt-image-1.5',
  'flux': ['flux-2-pro', 'flux-kontext-pro', 'flux-kontext-max'],
  'qwen': ['qwen/text-to-image', 'qwen/image-to-image', 'qwen/image-edit'],
}
const activeImageModelNames = ref<Set<string>>(new Set())
const selectedFluxSubModel = ref<'flux-2-pro' | 'flux-kontext-pro' | 'flux-kontext-max'>('flux-2-pro')
const selectedQwenSubModel = ref<'qwen/text-to-image' | 'qwen/image-to-image' | 'qwen/image-edit'>('qwen/text-to-image')

const actualProvider = computed(() => {
  const p = String(form.value.provider || '').trim()
  if (p === 'flux') return selectedFluxSubModel.value
  if (p === 'qwen') return selectedQwenSubModel.value
  return p || 'nano-banana-pro'
})

const modelPointsMap = ref<Record<string, number>>({})
const visibleProviders = computed(() => {
  const set = activeImageModelNames.value
  if (set.size === 0) return providersDef
  return providersDef.filter(p => {
    const backends = imageProviderToBackendNames[p.value]
    const names = Array.isArray(backends) ? backends : [backends ?? p.value]
    return names.some(b => set.has(b))
  })
})
const providers = computed(() =>
  visibleProviders.value.map(p => {
    const modelNameForPoints =
      p.value === 'flux' ? selectedFluxSubModel.value :
        p.value === 'qwen' ? selectedQwenSubModel.value :
          p.value
    return {
      ...p,
      points: modelPointsMap.value[modelNameForPoints] ?? 0,
    }
  })
)

async function fetchDrawModelPoints() {
  try {
    const res = await getModels({ type: 'image' })
    const all = (res as any).data || res // 兼容两种返回格式
    if (Array.isArray(all)) {
      activeImageModelNames.value = new Set(
        all.map((m: { modelName?: string }) => m.modelName).filter((x): x is string => Boolean(x))
      )
      for (const m of all) {
        if (m.deductPoints) modelPointsMap.value[m.modelName] = m.deductPoints
      }
    }
  } catch { /* ignore */ }
}

watch(visibleProviders, (list) => {
  const first = list[0]
  if (list.length && first && !list.some(p => p.value === form.value.provider)) {
    form.value.provider = first.value
  }
}, { immediate: true })

type ModelConfig = {
  ratios: { value: string; label: string; icon: string }[];
  sizes?: { value: string; label: string }[];
  resolutions?: { value: string; label: string }[];
  subModels?: { value: string; label: string }[];
  variants?: number[];
  responseFormats?: { value: string; label: string }[];
  maxRefImages?: number;
  supportEdit?: boolean;
  hint?: string;
}

/* 每个模型的参数配置 */
const modelConfigs: Record<string, ModelConfig> = {
  'nano-banana-pro': {
    ratios: [
      { value: 'auto', label: '自动', icon: '⬜' },
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '5:4', label: '横屏 5:4', icon: '▭' },
      { value: '4:5', label: '竖屏 4:5', icon: '▯' },
      { value: '21:9', label: '超宽 21:9', icon: '━' },
    ],
    sizes: [
      { value: '1K', label: '1K 标清' },
      { value: '2K', label: '2K 高清' },
      { value: '4K', label: '4K 超清' },
    ],
    subModels: [
      { value: 'nano-banana-fast', label: '极速模式' },
      { value: 'nano-banana', label: '标准模式' },
      { value: 'nano-banana-pro', label: '专业模式' },
      { value: 'nano-banana-pro-vt', label: '专业 VT' },
      { value: 'nano-banana-pro-cl', label: '专业 CL' },
    ],
    hint: '11 种比例 · 最高 4K 超清 · 支持参考图 · 多种模式可选',
  },
  'gpt-image-1': {
    ratios: [
      { value: 'auto', label: '自动', icon: '⬜' },
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
    ],
    variants: [1, 2],
    subModels: [
      { value: 'gpt-image-1', label: 'GPT Image 1' },
      { value: 'sora-image', label: 'Sora Image' },
    ],
    supportEdit: true,
    hint: '4 种比例 · 支持批量生成 · 上传图片可编辑 · 2 种子模型',
  },
  'doubao-seedance-4-5': {
    ratios: [
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '21:9', label: '超宽 21:9', icon: '━' },
      { value: '9:21', label: '超长 9:21', icon: '┃' },
      { value: 'auto', label: '自动', icon: '⬚' },
    ],
    resolutions: [
      { value: '2K', label: '2K 高清' },
      { value: '4K', label: '4K 超清' },
    ],
    variants: [1, 2, 3, 4],
    maxRefImages: 10,
    hint: '支持文生图/图生图 · 比例丰富 · 最高 4K 超清',
  },
  'flux-2-pro': {
    ratios: [
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
    ],
    resolutions: [
      { value: '1K', label: '1K 标清' },
      { value: '2K', label: '2K 高清' },
    ],
    maxRefImages: 8,
    hint: '7 种比例 · 支持文生图 / 图生图',
  },
  'flux-kontext-pro': {
    ratios: [
      { value: 'match_input_image', label: '跟随原图', icon: '⬚' },
      { value: 'auto', label: '自动', icon: '⬚' },
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '21:9', label: '超宽 21:9', icon: '━' },
      { value: '9:21', label: '超长 9:21', icon: '┃' },
    ],
    responseFormats: [
      { value: 'png', label: 'PNG（无损）' },
      { value: 'jpg', label: 'JPG（较小体积）' },
    ],
    maxRefImages: 1,
    hint: 'Flux 图片编辑 · 最多上传 1 张参考图 · 可选输出格式',
  },
  'flux-kontext-max': {
    ratios: [
      { value: 'match_input_image', label: '跟随原图', icon: '⬚' },
      { value: 'auto', label: '自动', icon: '⬚' },
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '21:9', label: '超宽 21:9', icon: '━' },
      { value: '9:21', label: '超长 9:21', icon: '┃' },
    ],
    responseFormats: [
      { value: 'png', label: 'PNG（无损）' },
      { value: 'jpg', label: 'JPG（较小体积）' },
    ],
    maxRefImages: 1,
    hint: 'Flux 高清编辑 · 最多上传 1 张参考图 · 可选输出格式',
  },
  'z-image': {
    ratios: [
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
    ],
    maxRefImages: 0,
    hint: '极速生成 · 仅支持文字描述生图 · 5 种画面比例可选',
  },
  'grok-imagine/text-to-image': {
    ratios: [
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '3:2', label: '横屏 3:2', icon: '▬' },
    ],
    maxRefImages: 0,
    hint: 'xAI Grok Imagine · 文字生成图片 · 多种画面比例可选',
  },
  'qwen/text-to-image': {
    ratios: [
      { value: 'square_hd', label: '正方形 高清', icon: '■' },
      { value: 'square', label: '正方形 标准', icon: '■' },
      { value: 'portrait_4_3', label: '竖屏 4:3', icon: '▮' },
      { value: 'portrait_16_9', label: '竖屏 16:9', icon: '▮' },
      { value: 'landscape_4_3', label: '横屏 4:3', icon: '▬' },
      { value: 'landscape_16_9', label: '宽屏 16:9', icon: '▬' },
    ],
    maxRefImages: 0,
    hint: '通义万相 · 文字生成图片 · 支持推理步数、引导强度、随机种子等高级参数',
  },
  'qwen/image-to-image': {
    ratios: [
      { value: 'square_hd', label: '正方形 高清', icon: '■' },
      { value: 'square', label: '正方形 标准', icon: '■' },
      { value: 'portrait_4_3', label: '竖屏 4:3', icon: '▮' },
      { value: 'portrait_16_9', label: '竖屏 16:9', icon: '▮' },
      { value: 'landscape_4_3', label: '横屏 4:3', icon: '▬' },
      { value: 'landscape_16_9', label: '宽屏 16:9', icon: '▬' },
    ],
    maxRefImages: 1,
    hint: '通义万相 · 图片风格转换 · 需上传 1 张参考图 · 可调节转换强度',
  },
  'qwen/image-edit': {
    ratios: [
      { value: 'landscape_4_3', label: '横屏 4:3', icon: '▬' },
      { value: 'square_hd', label: '正方形 高清', icon: '■' },
      { value: 'square', label: '正方形 标准', icon: '■' },
      { value: 'portrait_4_3', label: '竖屏 4:3', icon: '▮' },
      { value: 'portrait_16_9', label: '竖屏 16:9', icon: '▮' },
      { value: 'landscape_16_9', label: '宽屏 16:9', icon: '▬' },
    ],
    maxRefImages: 1,
    hint: '通义万相 · 智能编辑 · 需上传 1 张待编辑图片 · 可一次生成多张',
  },
  'midjourney': {
    ratios: [
      { value: '1:1', label: '正方形 1:1', icon: '■' },
      { value: '4:3', label: '横屏 4:3', icon: '▭' },
      { value: '3:4', label: '竖屏 3:4', icon: '▯' },
      { value: '16:9', label: '宽屏 16:9', icon: '▬' },
      { value: '9:16', label: '手机屏 9:16', icon: '▮' },
      { value: '1:2', label: '长竖屏 1:2', icon: '▮' },
      { value: '2:1', label: '超宽 2:1', icon: '▬' },
      { value: '2:3', label: '竖屏 2:3', icon: '▯' },
      { value: '3:2', label: '横屏 3:2', icon: '▭' },
    ],
    maxRefImages: 1,
    hint: 'Midjourney · 艺术级画质 · 支持文生图/图生图/视频/风格参考等多种模式',
  },
}

const defaultModelConfig: ModelConfig = modelConfigs['gpt-image-1']!
const selectedProvider = computed(() => actualProvider.value || 'gpt-image-1')
const currentConfig = computed<ModelConfig>(() => modelConfigs[selectedProvider.value] || defaultModelConfig)
const maxRefImages = computed(() => currentConfig.value.maxRefImages ?? FALLBACK_MAX_REF_IMAGES)

/* 参数状态 */
const selectedRatio = ref('auto')
const selectedImageSize = ref('1K')
const selectedResolution = ref('2K')
const selectedSubModel = ref('')
const selectedVariants = ref(1)
const selectedResponseFormat = ref('png')

const isQwen = computed(() => (selectedProvider.value || '').startsWith('qwen/'))
const isQwenTextToImage = computed(() => selectedProvider.value === 'qwen/text-to-image')
const isQwenImageToImage = computed(() => selectedProvider.value === 'qwen/image-to-image')
const isQwenImageEdit = computed(() => selectedProvider.value === 'qwen/image-edit')

/* 根据 provider 获取标签（用于卡片展示） */
const modelTagInfo: Record<string, { color: string; label: string }> = {
  'nano-banana-pro': { color: 'orangered', label: 'Nano Banana' },
  'gpt-image-1': { color: 'green', label: 'GPT Image' },
  'doubao-seedance-4-5': { color: 'arcoblue', label: 'Seedream' },
  'flux-2-pro': { color: 'cyan', label: 'Flux Pro' },
  'flux-kontext-pro': { color: 'cyan', label: 'Flux 编辑' },
  'flux-kontext-max': { color: 'cyan', label: 'Flux 高清' },
  'z-image': { color: 'lime', label: 'Z-Image' },
  'grok-imagine/text-to-image': { color: 'magenta', label: 'Grok Imagine' },
  'qwen/text-to-image': { color: 'purple', label: '通义·文生图' },
  'qwen/image-to-image': { color: 'purple', label: '通义·图转图' },
  'qwen/image-edit': { color: 'purple', label: '通义·编辑' },
  'midjourney': { color: 'magenta', label: 'Midjourney' },
}
function getModelTag(t: DrawTask | GalleryItem): { color: string; label: string } | null {
  const p = (t as { provider?: string }).provider
  if (!p) return null
  return modelTagInfo[p] ?? { color: '#6B7785', label: String(p) }
}

const providerDisplayName = computed(() => {
  const map: Record<string, string> = {
    'nano-banana-pro': 'Nano Banana',
    'gpt-image-1': 'GPT Image',
    'doubao-seedance-4-5': 'Seedream',
    'flux-2-pro': 'Flux Pro',
    'flux-kontext-pro': 'Flux 编辑',
    'flux-kontext-max': 'Flux 高清编辑',
    'z-image': 'Z-Image',
    'grok-imagine/text-to-image': 'Grok Imagine',
    'qwen/text-to-image': '通义·文生图',
    'qwen/image-to-image': '通义·图转图',
    'qwen/image-edit': '通义·编辑',
    'midjourney': 'Midjourney',
  }
  return map[actualProvider.value] || actualProvider.value
})

const ratioLabel = computed(() => {
  if (isQwenTextToImage.value || isQwenImageEdit.value) return '画面尺寸'
  if (selectedProvider.value === 'midjourney') return '画面比例'
  if (selectedProvider.value === 'z-image') return '画面比例'
  return '画面比例'
})
const showRatioSelect = computed(() => {
  // qwen/image-to-image 没有 image_size / aspect_ratio 参数（按文档），隐藏该选择器避免误导
  if (isQwenImageToImage.value) return false
  return true
})

function ratioPreviewStyle(value: string) {
  const alias: Record<string, [number, number]> = {
    auto: [4, 3],
    match_input_image: [4, 3],
    square_hd: [1, 1],
    square: [1, 1],
    'landscape_16_9': [16, 9],
    'portrait_16_9': [9, 16],
    'landscape_4_3': [4, 3],
    'portrait_4_3': [3, 4],
  }
  let ratio = alias[value]
  if (!ratio) {
    const m = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
    if (m?.[1] && m?.[2]) {
      ratio = [Math.max(0.1, Number(m[1])), Math.max(0.1, Number(m[2]))]
    } else {
      ratio = [4, 3]
    }
  }
  const r = ratio[0] / ratio[1]
  if (r >= 1) {
    const w = 16
    const h = Math.max(7, Math.round(w / r))
    return { width: `${w}px`, height: `${h}px` }
  }
  const h = 14
  const w = Math.max(7, Math.round(h * r))
  return { width: `${w}px`, height: `${h}px` }
}

/* Qwen/KIE 高级参数 */
const qwenOutputFormat = ref<'png' | 'jpeg'>('png')
const qwenAcceleration = ref<'none' | 'regular' | 'high'>('none')
const qwenEnableSafetyChecker = ref(true)
const qwenNumInferenceSteps = ref<number>(30)
const qwenGuidanceScale = ref<number>(2)
const qwenSeed = ref<number | null>(null)
const qwenNegativePrompt = ref<string>('')
const qwenStrength = ref<number>(0) // image-to-image
const qwenNumImages = ref<'1' | '2' | '3' | '4'>('1') // image-edit
const qwenNumImageOptions = ['1', '2', '3', '4'] as const
const qwenSyncMode = ref(false) // image-edit

/* Midjourney（按 Playground 参数透传） */
const mjTaskType = ref<'mj_txt2img' | 'mj_img2img' | 'mj_video' | 'mj_style_reference' | 'mj_omni_reference'>('mj_txt2img')
const mjSpeed = ref<'relaxed' | 'fast' | 'turbo'>('fast')
const mjVersion = ref<'7' | '6.1' | '6' | '5' | '5.1' | 'niji6' | 'niji7'>('7')
const mjStylization = ref<number>(100)
const mjWeirdness = ref<number>(0)
const mjVariety = ref<number>(0)
const mjWaterMark = ref<string>('')
const mjOw = ref<number>(500)

/* 当模型切换时重置参数 */
import { watch as vueWatch } from 'vue'
vueWatch(actualProvider, () => {
  const cfg = modelConfigs[actualProvider.value || 'nano-banana-pro']
  if (cfg) {
    selectedRatio.value = cfg.ratios[0]?.value ?? 'auto'
    selectedImageSize.value = cfg.sizes?.[0]?.value ?? '1K'
    selectedResolution.value = cfg.resolutions?.[0]?.value ?? '2K'
    selectedSubModel.value = cfg.subModels?.[0]?.value ?? ''
    selectedVariants.value = 1
    selectedResponseFormat.value = cfg.responseFormats?.[0]?.value ?? 'png'
    const maxRef = cfg.maxRefImages ?? FALLBACK_MAX_REF_IMAGES
    while (refImages.value.length > maxRef) {
      const target = refImages.value.pop()
      if (target) URL.revokeObjectURL(target.url)
    }
  }

  // Qwen defaults（按文档推荐）
  qwenOutputFormat.value = 'png'
  qwenAcceleration.value = 'none'
  qwenEnableSafetyChecker.value = true
  qwenNegativePrompt.value = ''
  qwenSeed.value = null
  qwenStrength.value = 0
  qwenSyncMode.value = false
  qwenNumImages.value = '1'
  if (form.value.provider === 'qwen/image-edit') {
    qwenGuidanceScale.value = 4
    qwenNumInferenceSteps.value = 25
  } else {
    qwenGuidanceScale.value = 2
    qwenNumInferenceSteps.value = 30
  }

  // Midjourney defaults
  mjTaskType.value = 'mj_txt2img'
  mjSpeed.value = 'fast'
  mjVersion.value = '7'
  mjStylization.value = 100
  mjWeirdness.value = 0
  mjVariety.value = 0
  mjWaterMark.value = ''
  mjOw.value = 500
}, { immediate: true })

async function uploadImageAndGetUrl(file: File) {
  const { data } = await uploadFile(file)
  return data.url.startsWith('http')
    ? data.url
    : `${window.location.origin}${data.url.startsWith('/') ? data.url : `/${data.url}`}`
}

/* === 轮询 === */
let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubRealtime: (() => void) | null = null
const hasPending = computed(() =>
  myTasks.value.some((t) => t.status === 'pending' || t.status === 'processing')
)
const failedCount = computed(() => myTasks.value.filter((t) => t.status === 'failed').length)

function startPolling() {
  if (pollTimer) return
  if (realtimeConnected.value) return
  if (document.visibilityState === 'hidden') return
  pollTimer = setInterval(async () => {
    if (!hasPending.value) { stopPolling(); return }
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length === 0) return
    try {
      const { data } = await getTasksStatusBatch(ids)
      const list = Array.isArray(data) ? data : []
      for (const u of list) {
        const idx = myTasks.value.findIndex((x) => x.id === u.id)
        if (idx >= 0) myTasks.value[idx] = { ...myTasks.value[idx], ...u }
      }
    } catch { /* skip */ }
  }, 10000)
}

function stopPolling() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
}

watch(hasPending, v => v ? startPolling() : stopPolling())
watch(activeTab, tab => tab === 'create' ? fetchMyTasks(true) : fetchGallery(true))
onMounted(() => {
  fetchMyTasks()
  fetchDrawModelPoints()
  unsubRealtime = onTaskEvent((e) => {
    if (e.module !== 'draw') return
    const idx = myTasks.value.findIndex((t) => t.id === e.taskId)
    if (idx < 0) return
    const prev = myTasks.value[idx]!
    myTasks.value[idx] = {
      ...prev,
      status: (e.status as DrawTask['status']) || prev.status,
      progress: typeof e.progress === 'number' ? e.progress : prev.progress,
      errorMessage: (e.errorMessage ?? prev.errorMessage ?? undefined) as DrawTask['errorMessage'],
      imageUrl: e.imageUrl ?? prev.imageUrl,
      resultUrl: e.imageUrl ?? prev.resultUrl,
    }
  })
})
onUnmounted(() => {
  stopPolling()
  unsubRealtime?.()
  unsubRealtime = null
  worksIo?.disconnect()
  galleryIo?.disconnect()
  worksIo = null
  galleryIo = null
})

// 绑定/重绑 observer：切 Tab、首屏渲染、数据 reset 时都能继续无限滚动
watch(
  [() => worksScrollRef.value, () => worksSentinelRef.value, () => activeTab.value],
  () => nextTick(() => setupWorksInfiniteObserver()),
  { flush: 'post' },
)
watch(
  [() => galleryScrollRef.value, () => gallerySentinelRef.value, () => activeTab.value],
  () => nextTick(() => setupGalleryInfiniteObserver()),
  { flush: 'post' },
)

watch(realtimeConnected, (connected) => {
  if (connected) {
    stopPolling()
    // Reconnect safety: immediately re-sync pending tasks once.
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length) {
      getTasksStatusBatch(ids)
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : []
          for (const u of list) {
            const idx = myTasks.value.findIndex((x) => x.id === u.id)
            if (idx >= 0) myTasks.value[idx] = { ...myTasks.value[idx], ...u }
          }
        })
        .catch(() => { })
    }
  } else if (hasPending.value) startPolling()
})

/* === 数据 === */
const MY_PAGE_SIZE = 24
const GAL_PAGE_SIZE = 30

async function fetchMyTasks(reset = false) {
  if (reset) { myTasksPage.value = 1; myTasks.value = [] }
  const isFirst = myTasksPage.value === 1
  if (isFirst) myTasksLoading.value = true
  else myTasksLoadingMore.value = true
  try {
    const { data } = await getMyTasks(myTasksPage.value, MY_PAGE_SIZE, 'draw')
    const list = data?.list ?? []
    myTasksTotal.value = data?.total ?? 0
    if (isFirst) myTasks.value = list
    else {
      const ids = new Set(myTasks.value.map(t => t.id))
      myTasks.value.push(...list.filter(t => !ids.has(t.id)))
    }
  } catch { if (isFirst) myTasks.value = [] }
  finally { myTasksLoading.value = false; myTasksLoadingMore.value = false }
}

async function loadMoreMyTasks() {
  if (myTasksLoadingMore.value || !myTasksHasMore.value) return
  myTasksPage.value += 1
  await fetchMyTasks()
}

async function fetchGallery(reset = false) {
  if (reset) { galleryPage.value = 1; galleryItems.value = [] }
  const isFirst = galleryPage.value === 1
  if (isFirst) galleryLoading.value = true
  else galleryLoadingMore.value = true
  try {
    const { data } = await getGallery(galleryPage.value, GAL_PAGE_SIZE)
    const list = data?.list ?? []
    galleryTotal.value = data?.total ?? 0
    if (isFirst) galleryItems.value = list
    else {
      const ids = new Set(galleryItems.value.map(t => t.id))
      galleryItems.value.push(...list.filter(t => !ids.has(t.id)))
    }
  } catch { if (isFirst) galleryItems.value = [] }
  finally { galleryLoading.value = false; galleryLoadingMore.value = false }
}

async function loadMoreGallery() {
  if (galleryLoadingMore.value || !galleryHasMore.value) return
  galleryPage.value += 1
  await fetchGallery()
}

function onWorksScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMoreMyTasks()
}
function onGalleryScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 200) loadMoreGallery()
}


/* === 操作 === */
async function handleGenerate(forceGenerate = false) {
  if (!form.value.prompt?.trim()) { Message.warning('请输入提示词'); return }
  generating.value = true
  try {
    const provider = actualProvider.value
    if ((provider === 'qwen/image-to-image' || provider === 'qwen/image-edit') && refImages.value.length === 0) {
      Message.warning('当前模型需要上传 1 张图片作为输入')
      return
    }
    if (provider === 'midjourney' && mjTaskType.value !== 'mj_txt2img' && refImages.value.length === 0) {
      Message.warning('Midjourney 当前 taskType 需要上传 1 张图片作为输入')
      return
    }

    // === 敏感词预检 ===
    if (!forceGenerate) {
      const textToCheck = [form.value.prompt, form.value.negativePrompt].filter(Boolean).join(' ')
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
            onCancel: () => handleRemoveBadWords(words),
          })
          generating.value = false
          return
        }

        // MEDIUM级别：弹窗确认
        if (checkResult.needConfirm && checkResult.mediumWords && checkResult.mediumWords.length > 0) {
          generating.value = false
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
            onOk: () => handleGenerate(true), // 强制生成
            onCancel: () => handleRemoveBadWords(words),
          })
          return
        }
      } catch {
        // 检测接口失败不影响流程
      }
    }

    const uploadedImageUrls = refImages.value.length
      ? await Promise.all(refImages.value.map((item) => uploadImageAndGetUrl(item.file)))
      : []

    const payload: CreateDrawTaskData = {
      source: 'draw',
      provider,
      taskType: uploadedImageUrls.length > 0 ? 'img2img' : 'text2img',
      prompt: form.value.prompt.trim(),
      negativePrompt: form.value.negativePrompt,
      params: {},
    }

    if (provider === 'z-image') {
      payload.params = {
        aspectRatio: selectedRatio.value, // -> input.aspect_ratio
      }
    } else if (provider === 'grok-imagine/text-to-image') {
      payload.params = {
        aspectRatio: selectedRatio.value, // -> input.aspect_ratio
      }
    } else if (provider === 'qwen/text-to-image') {
      payload.params = {
        imageSize: selectedRatio.value, // -> input.image_size
        numInferenceSteps: qwenNumInferenceSteps.value,
        seed: qwenSeed.value ?? undefined,
        guidanceScale: qwenGuidanceScale.value,
        enableSafetyChecker: qwenEnableSafetyChecker.value,
        outputFormat: qwenOutputFormat.value,
        negativePrompt: qwenNegativePrompt.value,
        acceleration: qwenAcceleration.value,
      }
    } else if (provider === 'qwen/image-to-image') {
      payload.params = {
        imageUrl: uploadedImageUrls[0],
        strength: qwenStrength.value,
        numInferenceSteps: qwenNumInferenceSteps.value,
        seed: qwenSeed.value ?? undefined,
        guidanceScale: qwenGuidanceScale.value,
        enableSafetyChecker: qwenEnableSafetyChecker.value,
        outputFormat: qwenOutputFormat.value,
        negativePrompt: qwenNegativePrompt.value,
        acceleration: qwenAcceleration.value,
      }
    } else if (provider === 'qwen/image-edit') {
      payload.params = {
        imageUrl: uploadedImageUrls[0],
        imageSize: selectedRatio.value, // -> input.image_size
        numInferenceSteps: qwenNumInferenceSteps.value,
        seed: qwenSeed.value ?? undefined,
        guidanceScale: qwenGuidanceScale.value,
        syncMode: qwenSyncMode.value,
        numImages: qwenNumImages.value,
        enableSafetyChecker: qwenEnableSafetyChecker.value,
        outputFormat: qwenOutputFormat.value,
        negativePrompt: qwenNegativePrompt.value,
        acceleration: qwenAcceleration.value,
      }
    } else if (provider === 'midjourney') {
      // 按你提供的 Midjourney API 字段透传给后端（后端会调用 /api/v1/mj/generate）
      payload.params = {
        taskType: mjTaskType.value,
        speed: mjSpeed.value,
        version: mjVersion.value,
        stylization: mjStylization.value,
        weirdness: mjWeirdness.value,
        variety: mjVariety.value,
        waterMark: mjWaterMark.value?.trim() || undefined,
        aspectRatio: selectedRatio.value,
        fileUrls: uploadedImageUrls.length ? [uploadedImageUrls[0]] : [],
        fileUrl: uploadedImageUrls[0],
        ow: mjTaskType.value === 'mj_omni_reference' ? mjOw.value : undefined,
      }
    } else
      if (provider === 'doubao-seedance-4-5') {
        payload.params = {
          model: 'doubao-seedance-4-5',
          size: selectedRatio.value,
          resolution: selectedResolution.value,
          n: selectedVariants.value,
          imageUrls: uploadedImageUrls,
        }
      } else if (provider === 'flux-2-pro') {
        payload.params = {
          model: 'flux-2-pro',
          size: selectedRatio.value,
          resolution: selectedResolution.value,
          imageUrls: uploadedImageUrls,
        }
      } else if (provider === 'flux-kontext-pro' || provider === 'flux-kontext-max') {
        payload.params = {
          model: provider,
          size: selectedRatio.value,
          responseFormat: selectedResponseFormat.value,
          imageUrls: uploadedImageUrls.slice(0, 1),
        }
      } else {
        payload.params = {
          model: selectedSubModel.value || provider,
          aspectRatio: selectedRatio.value,
          imageSize: selectedImageSize.value,
          variants: selectedVariants.value,
          urls: uploadedImageUrls,
        }
      }

    const { data } = await createDrawTask(payload)
    if (data) {
      // 如果有 LOW 级别敏感词，显示提示
      if (lastCheckResult.value?.hasWarning && lastCheckResult.value?.lowWords?.length > 0) {
        Message.info({
          content: `📝 提示：您的描述包含轻微敏感词「${lastCheckResult.value.lowWords.slice(0, 3).join('、')}」，已标记`,
          duration: 5000,
        })
      }
      myTasks.value.unshift(data)
      Message.success('任务已提交')
      startPolling()
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
  } finally { generating.value = false }
}

function isCompleted(s: string) { return s === 'done' || s === 'completed' }
function statusText(s: string) { return ({ pending: '排队中', processing: '生成中', done: '已完成', completed: '已完成', failed: '失败' } as Record<string, string>)[s] ?? s }
function statusColor(s: string) { return ({ pending: '#6B7785', processing: '#FF7D00', done: '#00B42A', completed: '#00B42A', failed: '#F53F3F' } as Record<string, string>)[s] ?? '#6B7785' }
function drawStageText(task: { status: string; progress?: number }) {
  if (task.status === 'pending') return '正在排队中...'
  const p = task.progress ?? 0
  if (p < 20) return '正在初始化画布'
  if (p < 50) return '正在构建构图'
  if (p < 80) return '正在细化细节'
  return '正在渲染高清结果'
}
function thumb(t: DrawTask) { return t.imageUrl || t.thumbnailUrl || t.resultUrl || '' }
function isImageBroken(id: string) { return brokenImageIds.value.has(id) }
function markImageBroken(id: string) { brokenImageIds.value.add(id) }

function showFullError(msg: string) {
  Modal.error({ title: '错误详情', content: msg, okText: '关闭', maskClosable: true, closable: true })
}

function openPreview(url: string, prompt?: string, task?: DrawTask | null) {
  previewImage.value = url
  // 兼容：有些入口只传 url，prompt/详情从 task 兜底
  previewPrompt.value = prompt ?? task?.prompt ?? ''
  previewTask.value = task ?? null
  previewVisible.value = true
}
function copyPrompt(prompt: string) {
  navigator.clipboard.writeText(prompt).then(() => Message.success('已复制'))
}

function applySameAsTask(task: DrawTask) {
  if (!task) return
  activeTab.value = 'create'

  form.value.prompt = task.prompt ?? ''
  form.value.negativePrompt = task.negativePrompt ?? ''

  const p = String(task.provider || '').trim()
  if (p.startsWith('flux-')) {
    form.value.provider = 'flux'
    if (p === 'flux-2-pro' || p === 'flux-kontext-pro' || p === 'flux-kontext-max') {
      selectedFluxSubModel.value = p as any
    }
  } else if (p.startsWith('qwen/')) {
    form.value.provider = 'qwen'
    if (p === 'qwen/text-to-image' || p === 'qwen/image-to-image' || p === 'qwen/image-edit') {
      selectedQwenSubModel.value = p as any
    }
  } else if (p) {
    form.value.provider = p
  }

  const params = (task.params ?? {}) as Record<string, any>
  const ratio = params.aspectRatio ?? params.size
  if (typeof ratio === 'string' && ratio) selectedRatio.value = ratio
  if (typeof params.imageSize === 'string' && params.imageSize) selectedImageSize.value = params.imageSize
  if (typeof params.responseFormat === 'string' && params.responseFormat) selectedResponseFormat.value = params.responseFormat
  if (typeof params.model === 'string' && params.model) selectedSubModel.value = params.model

  Message.success('已应用同款参数')
}
async function handleTogglePublic(task: DrawTask) {
  try { await togglePublic(task.id); Message.success('已更新'); fetchMyTasks() }
  catch { Message.error('操作失败') }
}
async function handleDelete(task: DrawTask) {
  Modal.confirm({
    title: '删除', content: '确定删除这幅作品吗？', onOk: async () => {
      try { await deleteTask(task.id); myTasks.value = myTasks.value.filter(t => t.id !== task.id); Message.success('已删除') }
      catch { Message.error('删除失败') }
    }
  })
}
async function handleRetry(task: DrawTask) {
  if (task.status !== 'failed') return
  try {
    const { data } = await retryTask(task.id)
    if (data) {
      // 删除旧任务并添加新任务到头部
      const oldIdx = myTasks.value.findIndex(t => t.id === task.id)
      if (oldIdx >= 0) myTasks.value.splice(oldIdx, 1)
      myTasks.value.unshift(data)
      Message.success('已重新提交任务')
      startPolling()
    }
  } catch {
    Message.error('重试失败，请稍后再试')
  }
}
function handleRetryAllFailed() {
  if (failedCount.value <= 0 || retryAllLoading.value) return
  Modal.confirm({
    title: '批量重试',
    content: `确定重试当前失败任务吗？共 ${failedCount.value} 条。`,
    onOk: async () => {
      retryAllLoading.value = true
      try {
        const { data } = await retryAllFailedTasks('draw')
        const retried = data?.retried ?? 0
        const totalFailed = data?.totalFailed ?? failedCount.value
        const skipped = data?.skipped ?? 0
        if (retried > 0) {
          Message.success(`批量重试已提交：${retried}/${totalFailed}`)
          await fetchMyTasks()
          startPolling()
        } else {
          Message.warning(`没有可重试任务，或重试提交失败（跳过 ${skipped}）`)
        }
      } catch {
        Message.error('批量重试失败')
      } finally {
        retryAllLoading.value = false
      }
    },
  })
}
function handleDownload(url?: string) {
  if (!url) return
  const a = document.createElement('a')
  a.href = url
  a.download = `draw-${Date.now()}.png`
  a.click()
}
</script>

<template>
  <div class="page">
    <!-- 顶部标题区 -->
    <header class="page-header">
      <div>
        <h1 class="page-title">绘画创作</h1>
        <p class="page-desc">描述你的想象，AI 为你生成画作</p>
      </div>
      <div class="tab-group">
        <button v-for="tab in [{ key: 'create', label: '创作' }, { key: 'gallery', label: '广场' }]" :key="tab.key"
          class="tab-btn" :class="{ active: activeTab === tab.key }" @click="activeTab = tab.key">{{ tab.label
          }}</button>
      </div>
    </header>

    <!-- ===== 创作 Tab ===== -->
    <div v-show="activeTab === 'create'" class="create-area">
      <!-- 左侧表单 -->
      <aside class="form-panel">
        <!-- 模型选择 -->
        <section class="form-group">
          <label class="group-label">模型</label>
          <a-select v-model="form.provider" class="model-select">
            <a-option v-for="p in providers" :key="p.value" :value="p.value" :label="p.label">
              <div class="ui-option">
                <span class="ui-option-dot" :style="{ background: p.color }" />
                <div class="ui-option-main">
                  <div class="ui-option-header">
                    <span class="ui-option-title">{{ p.label }}</span>
                    <span v-if="p.points" class="ui-option-badge">{{ p.points }}积分</span>
                  </div>
                  <span class="ui-option-desc">{{ p.desc }}</span>
                </div>
              </div>
            </a-option>
          </a-select>
        </section>

        <!-- 子模型选择（有多个子模型时显示）-->
        <section v-if="currentConfig.subModels && currentConfig.subModels.length > 1" class="form-group">
          <label class="group-label">子模型</label>
          <a-select v-model="selectedSubModel" class="model-select">
            <a-option v-for="sm in currentConfig.subModels" :key="sm.value" :value="sm.value">
              {{ sm.label }}
            </a-option>
          </a-select>
        </section>

        <!-- Flux 子模型 -->
        <section v-if="form.provider === 'flux'" class="form-group">
          <label class="group-label">功能模式</label>
          <a-select v-model="selectedFluxSubModel" class="model-select">
            <a-option value="flux-2-pro">Flux Pro · 文生图 / 图生图</a-option>
            <a-option value="flux-kontext-pro">Flux Kontext · 图片编辑</a-option>
            <a-option value="flux-kontext-max">Flux Kontext Max · 高质量编辑</a-option>
          </a-select>
        </section>

        <!-- 通义万相子模型 -->
        <section v-if="form.provider === 'qwen'" class="form-group">
          <label class="group-label">功能模式</label>
          <a-select v-model="selectedQwenSubModel" class="model-select">
            <a-option value="qwen/text-to-image">文字生成图片</a-option>
            <a-option value="qwen/image-to-image">图片风格转换</a-option>
            <a-option value="qwen/image-edit">智能图片编辑</a-option>
          </a-select>
        </section>

        <!-- 提示词 -->
        <section class="form-group">
          <label class="group-label">提示词</label>
          <a-textarea v-model="form.prompt" placeholder="描述你想生成的图像，越详细越好..." :auto-size="{ minRows: 4, maxRows: 8 }"
            class="prompt-input" />
        </section>

        <!-- 参考图（图生图） -->
        <section class="form-group">
          <div class="group-label-row">
            <label class="group-label">参考图</label>
            <span class="ref-count">{{ refImages.length }}/{{ maxRefImages }}</span>
            <button v-if="refImages.length > 0" class="clear-ref-btn" @click="clearAllRef">清空</button>
          </div>

          <!-- 已上传的缩略图列表 -->
          <div v-if="refImages.length > 0" class="ref-thumbs">
            <div v-for="img in refImages" :key="img.id" class="ref-thumb">
              <img :src="img.url" alt="" />
              <button class="ref-remove" @click="removeRefImage(img.id)">
                <IconClose :size="12" />
              </button>
            </div>
            <!-- 添加更多按钮 -->
            <button v-if="refImages.length < maxRefImages" class="ref-add-btn" @click="refInputRef?.click()">
              <IconPlus :size="20" />
            </button>
          </div>

          <!-- 拖拽上传区域（没有图片时显示大区域，有图片时隐藏） -->
          <div v-if="refImages.length === 0" class="ref-dropzone" :class="{ dragover: refDragOver }"
            @dragover.prevent="refDragOver = true" @dragleave="refDragOver = false" @drop="handleRefDrop"
            @click="refInputRef?.click()">
            <IconPlus :size="44" class="dropzone-plus" />
            <span class="dropzone-text">点击或拖拽上传参考图</span>
            <span class="dropzone-hint">支持 JPG / PNG / WebP，最多 {{ maxRefImages }} 张</span>
          </div>

          <input ref="refInputRef" type="file" accept="image/*" multiple style="display:none"
            @change="handleRefSelect" />
        </section>

        <!-- 反向提示词（可折叠）-->
        <button class="toggle-btn" @click="showNegative = !showNegative">
          {{ showNegative ? '收起' : '展开' }}反向提示词
          <span class="toggle-arrow" :class="{ open: showNegative }">▾</span>
        </button>
        <div v-show="showNegative" class="form-group">
          <a-textarea v-model="form.negativePrompt" placeholder="不想出现的元素..." :auto-size="{ minRows: 2, maxRows: 4 }"
            class="prompt-input" />
        </div>

        <!-- Midjourney 参数 -->
        <section v-if="form.provider === 'midjourney'" class="form-group">
          <label class="group-label">Midjourney 参数</label>
          <div class="mj-grid">
            <div class="mj-item">
              <div class="mj-label">生成模式</div>
              <a-select v-model="mjTaskType" class="param-select">
                <a-option value="mj_txt2img">文字生图</a-option>
                <a-option value="mj_img2img">图片生图</a-option>
                <a-option value="mj_video">图片生视频</a-option>
                <a-option value="mj_style_reference">风格参考</a-option>
                <a-option value="mj_omni_reference">万能参考</a-option>
              </a-select>
            </div>
            <div class="mj-item">
              <div class="mj-label">生成速度</div>
              <a-select v-model="mjSpeed" class="param-select">
                <a-option value="relaxed">休闲（慢速省额度）</a-option>
                <a-option value="fast">快速（推荐）</a-option>
                <a-option value="turbo">极速（最快）</a-option>
              </a-select>
            </div>
            <div class="mj-item">
              <div class="mj-label">模型版本</div>
              <a-select v-model="mjVersion" class="param-select">
                <a-option value="7">V7（最新）</a-option>
                <a-option value="6.1">V6.1</a-option>
                <a-option value="6">V6</a-option>
                <a-option value="5">V5</a-option>
                <a-option value="5.1">V5.1</a-option>
                <a-option value="niji6">Niji 6（二次元）</a-option>
                <a-option value="niji7">Niji 7（二次元）</a-option>
              </a-select>
            </div>
            <div class="mj-item">
              <div class="mj-label">风格化程度 <span class="mj-range">0~1000</span></div>
              <a-input-number v-model="mjStylization" :min="0" :max="1000" :step="50" class="param-number"
                placeholder="值越大风格越强" />
            </div>
            <div class="mj-item">
              <div class="mj-label">奇异度 <span class="mj-range">0~3000</span></div>
              <a-input-number v-model="mjWeirdness" :min="0" :max="3000" :step="100" class="param-number"
                placeholder="值越大越天马行空" />
            </div>
            <div class="mj-item">
              <div class="mj-label">多样性 <span class="mj-range">0~100</span></div>
              <a-input-number v-model="mjVariety" :min="0" :max="100" :step="5" class="param-number"
                placeholder="值越大结果差异越大" />
            </div>
            <div class="mj-item mj-wide">
              <div class="mj-label">水印文字</div>
              <a-input v-model="mjWaterMark" placeholder="留空则不添加水印" allow-clear />
            </div>
            <div v-if="mjTaskType === 'mj_omni_reference'" class="mj-item">
              <div class="mj-label">参考强度 <span class="mj-range">1~1000</span></div>
              <a-input-number v-model="mjOw" :min="1" :max="1000" :step="50" class="param-number"
                placeholder="值越大越贴近参考图" />
            </div>
          </div>
          <div class="mj-tip">提示：图片生图、视频、风格/万能参考模式需要先上传参考图；风格化和奇异度建议用推荐步长调整。</div>
        </section>

        <!-- 比例/尺寸选择（部分模型隐藏）-->
        <section v-if="showRatioSelect" class="form-group">
          <label class="group-label">{{ ratioLabel }} <span class="label-badge">{{ providerDisplayName }}</span></label>
          <a-select v-model="selectedRatio" class="param-select" :placeholder="`选择${ratioLabel}`">
            <a-option v-for="r in currentConfig.ratios" :key="r.value" :value="r.value">
              <div class="ui-option" style="align-items: center;">
                <span class="ratio-outline" :style="ratioPreviewStyle(r.value)" />
                <span class="ui-option-title">{{ r.label }}</span>
              </div>
            </a-option>
          </a-select>
        </section>

        <!-- 通义万相高级参数 -->
        <section v-if="isQwen" class="form-group">
          <label class="group-label">高级参数</label>
          <div class="qwen-grid">
            <div class="qwen-item">
              <div class="qwen-label">输出格式</div>
              <a-select v-model="qwenOutputFormat" class="param-select">
                <a-option value="png">PNG（无损）</a-option>
                <a-option value="jpeg">JPEG（较小体积）</a-option>
              </a-select>
            </div>
            <div class="qwen-item">
              <div class="qwen-label">生成加速</div>
              <a-select v-model="qwenAcceleration" class="param-select">
                <a-option value="none">不加速（质量优先）</a-option>
                <a-option value="regular">普通加速</a-option>
                <a-option value="high">高速（质量略降）</a-option>
              </a-select>
            </div>
            <div class="qwen-item">
              <div class="qwen-label">内容安全检测</div>
              <a-switch v-model="qwenEnableSafetyChecker" />
            </div>
            <div class="qwen-item">
              <div class="qwen-label">推理步数 <span class="qwen-range">{{ isQwenImageEdit ? '2~49' : '2~250' }}</span>
              </div>
              <a-input-number v-model="qwenNumInferenceSteps" :min="2" :max="isQwenImageEdit ? 49 : 250" :step="1"
                class="param-number" placeholder="步数越多细节越丰富" />
            </div>
            <div class="qwen-item">
              <div class="qwen-label">引导强度 <span class="qwen-range">0~20</span></div>
              <a-input-number v-model="qwenGuidanceScale" :min="0" :max="20" :step="0.1" class="param-number"
                placeholder="越大越贴合描述" />
            </div>
            <div class="qwen-item">
              <div class="qwen-label">随机种子</div>
              <a-input-number v-model="qwenSeed" :min="0" :step="1" placeholder="不填则随机" class="param-number" />
            </div>
            <div class="qwen-item qwen-wide">
              <div class="qwen-label">排除元素</div>
              <a-input v-model="qwenNegativePrompt" placeholder="不想出现的内容，如：模糊、低质量、水印" allow-clear />
            </div>
            <div v-if="isQwenImageToImage" class="qwen-item">
              <div class="qwen-label">转换强度 <span class="qwen-range">0~1</span></div>
              <a-input-number v-model="qwenStrength" :min="0" :max="1" :step="0.05" class="param-number"
                placeholder="越大改动越大" />
            </div>
            <div v-if="isQwenImageEdit" class="qwen-item qwen-wide">
              <div class="qwen-label">生成数量</div>
              <div class="size-group">
                <button v-for="n in qwenNumImageOptions" :key="n" class="size-btn"
                  :class="{ active: qwenNumImages === n }" @click="qwenNumImages = n">
                  <span class="size-label">{{ n }} 张</span>
                </button>
              </div>
            </div>
            <div v-if="isQwenImageEdit" class="qwen-item">
              <div class="qwen-label">同步等待结果</div>
              <a-switch v-model="qwenSyncMode" />
            </div>
          </div>
          <div class="qwen-tip">提示：图片风格转换和智能编辑需先上传 1 张图片；推理步数越多生成越慢但细节更好。</div>
        </section>

        <!-- 图片尺寸（仅 nano-banana-pro，多个选项时显示按钮，单个时显示标签）-->
        <section v-if="currentConfig.sizes && currentConfig.sizes.length > 1" class="form-group">
          <label class="group-label">图片质量</label>
          <a-select v-model="selectedImageSize" class="param-select" placeholder="选择图片质量">
            <a-option v-for="s in currentConfig.sizes" :key="s.value" :value="s.value">
              {{ s.label }}
            </a-option>
          </a-select>
        </section>
        <div v-else-if="currentConfig.sizes && currentConfig.sizes.length === 1" class="param-tag">
          输出分辨率：<strong>{{ currentConfig.sizes?.[0]?.label || '-' }}</strong>
        </div>

        <section v-if="currentConfig.resolutions && currentConfig.resolutions.length > 0" class="form-group">
          <label class="group-label">分辨率</label>
          <a-select v-model="selectedResolution" class="param-select" placeholder="选择分辨率">
            <a-option v-for="r in currentConfig.resolutions" :key="r.value" :value="r.value">
              {{ r.label }}
            </a-option>
          </a-select>
        </section>

        <section v-if="currentConfig.responseFormats && currentConfig.responseFormats.length > 0" class="form-group">
          <label class="group-label">输出格式</label>
          <a-select v-model="selectedResponseFormat" class="param-select" placeholder="选择输出格式">
            <a-option v-for="f in currentConfig.responseFormats" :key="f.value" :value="f.value">
              {{ f.label }}
            </a-option>
          </a-select>
        </section>

        <!-- 批量生成（仅 gpt-image 系列支持）-->
        <section v-if="currentConfig.variants" class="form-group">
          <label class="group-label">生成数量</label>
          <div class="size-group">
            <button v-for="v in currentConfig.variants" :key="v" class="size-btn"
              :class="{ active: selectedVariants === v }" @click="selectedVariants = v">
              <span class="size-label">{{ v }} 张</span>
            </button>
          </div>
          <div v-if="selectedVariants > 1" class="variant-tip">每多生成 1 张额外消耗 50 积分</div>
        </section>

        <!-- 模型提示 -->
        <div v-if="currentConfig.hint" class="model-hint">
          <span class="hint-dot" />
          {{ currentConfig.hint }}
        </div>

        <!-- 生成按钮 -->
        <div class="form-actions">
          <GenerateButton :loading="generating" :disabled="!form.prompt?.trim()" @click="handleGenerate" />
        </div>
      </aside>

      <!-- 右侧作品区 -->
      <section ref="worksScrollRef" class="works-panel" @scroll="onWorksScroll">
        <div class="works-header">
          <div class="works-header-left">
            <h3 class="works-title">我的作品</h3>
            <span v-if="myTasksTotal > 0" class="works-count">{{ myTasksTotal }}</span>
          </div>
          <div class="works-header-right">
            <a-button v-if="myTasks.length > 0" type="text" size="small" class="batch-btn batch-toggle"
              :class="{ active: batchMode }" @click="toggleBatchMode">
              <template #icon>
                <IconSettings />
              </template>
              {{ batchMode ? '退出批量' : '批量管理' }}
            </a-button>
            <button v-if="failedCount > 0" class="retry-all-btn" :disabled="retryAllLoading"
              @click="handleRetryAllFailed">
              {{ retryAllLoading ? '重试中...' : `重试全部失败（${failedCount}）` }}
            </button>
          </div>
        </div>
        <div v-if="batchMode && myTasks.length > 0" class="batch-controls">
          <div class="batch-select">
            <a-checkbox class="batch-check" :model-value="selectedWorkIds.size === myTasks.length && myTasks.length > 0"
              :indeterminate="selectedWorkIds.size > 0 && selectedWorkIds.size < myTasks.length"
              @change="toggleSelectAll">
              全选 ({{ selectedWorkIds.size }}/{{ myTasks.length }})
            </a-checkbox>
          </div>
          <a-space size="small" class="batch-actions">
            <a-button type="text" size="small" class="batch-btn batch-download" :disabled="selectedWorkIds.size === 0"
              @click="handleBatchDownload">
              <template #icon>
                <IconDownload />
              </template>
              下载 ({{ selectedWorkIds.size }})
            </a-button>
            <a-button type="text" size="small" class="batch-btn batch-delete" :disabled="selectedWorkIds.size === 0"
              @click="handleBatchDelete">
              <template #icon>
                <IconDelete />
              </template>
              删除 ({{ selectedWorkIds.size }})
            </a-button>
          </a-space>
        </div>

        <a-spin :loading="myTasksLoading" class="works-spin">
          <div v-if="myTasks.length > 0" class="works-grid waterfall">
            <div v-for="(task, idx) in myTasks" :key="task.id" class="work-card"
              :class="{ 'batch-mode': batchMode, 'selected': selectedWorkIds.has(task.id) }"
              @click="isCompleted(task.status) && thumb(task) && !batchMode ? openPreview(thumb(task), task.prompt, task) : null">
              <!-- 批量选择复选框 -->
              <div v-if="batchMode" class="batch-checkbox" @click.stop>
                <a-checkbox class="batch-check" :model-value="selectedWorkIds.has(task.id)"
                  @change="() => toggleWorkSelection(task.id)" />
              </div>
              <!-- 图片区域（正方形封面） -->
              <div class="work-img-box">
                <img v-if="thumb(task) && !isImageBroken(`my-${task.id}`)" :src="thumb(task)" alt=""
                  :loading="idx >= 200 ? 'lazy' : 'eager'" class="work-img" @error="markImageBroken(`my-${task.id}`)" />
                <div v-else class="work-placeholder">
                  <IconImage :size="32" style="opacity:0.3" />
                </div>

                <!-- 进度环 -->
                <div v-if="task.status === 'processing' || task.status === 'pending'" class="progress-ring-overlay">
                  <div class="progress-stage">{{ drawStageText(task) }}</div>
                  <svg viewBox="0 0 48 48" class="progress-svg">
                    <circle cx="24" cy="24" r="20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="3" />
                    <circle cx="24" cy="24" r="20" fill="none" stroke="url(#grad)" stroke-width="3"
                      stroke-linecap="round" :stroke-dasharray="`${(task.progress ?? 0) * 1.56} 125`"
                      transform="rotate(-90 24 24)" />
                    <defs>
                      <linearGradient id="grad">
                        <stop offset="0%" stop-color="#165DFF" />
                        <stop offset="100%" stop-color="#4080FF" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span class="progress-text">{{ task.progress ?? 0 }}%</span>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: `${task.progress ?? 0}%` }" />
                  </div>
                </div>

                <!-- 失败状态覆盖层 -->
                <div v-if="task.status === 'failed'" class="failed-overlay">
                  <div class="failed-content">
                    <div class="failed-msg">{{ task.errorMessage || '生成失败，请重试' }}</div>
                    <button class="failed-detail-btn"
                      @click.stop="showFullError(task.errorMessage || '生成失败，请重试')">查看详情</button>
                  </div>
                </div>

                <!-- 状态标签 -->
                <span class="status-badge" :style="{ background: statusColor(task.status) }">
                  {{ statusText(task.status) }}
                </span>

                <!-- hover 操作层 -->
                <div class="hover-actions" @click.stop>
                  <template v-if="isCompleted(task.status)">
                    <WorkCardActionButton title="复制提示词" :disabled="!task.prompt" @click="copyPrompt(task.prompt ?? '')">
                      <IconCopy />
                    </WorkCardActionButton>
                    <WorkCardActionButton title="一键同款" :disabled="!task.prompt" @click="applySameAsTask(task)">
                      <IconPlus />
                    </WorkCardActionButton>
                    <WorkCardActionButton title="下载" @click="handleDownload(task.resultUrl)">
                      <IconDownload />
                    </WorkCardActionButton>
                    <WorkCardActionButton :title="task.isPublic ? '设为私密' : '设为公开'" @click="handleTogglePublic(task)">
                      <IconSwap />
                    </WorkCardActionButton>
                  </template>
                  <WorkCardActionButton v-if="task.status === 'failed'" title="重试" @click="handleRetry(task)">
                    <IconRefresh />
                  </WorkCardActionButton>
                  <WorkCardActionButton danger title="删除" @click="handleDelete(task)">
                    <IconDelete />
                  </WorkCardActionButton>
                </div>

              </div>

              <!-- 卡片信息 -->
              <div class="work-info">
                <p class="work-prompt">{{ task.prompt || '无描述' }}</p>
                <div v-if="getModelTag(task)" class="work-model-tag">
                  <a-tag :color="getModelTag(task)!.color" size="small">{{ getModelTag(task)!.label }}</a-tag>
                </div>
              </div>
            </div>
            <div v-if="myTasksLoadingMore" class="load-more-hint"><a-spin :size="18" /> 加载更多...</div>
            <div v-else-if="!myTasksHasMore && myTasks.length > MY_PAGE_SIZE" class="load-more-hint">已加载全部</div>
            <div ref="worksSentinelRef" class="infinite-sentinel"></div>
          </div>
          <div v-else-if="!myTasksLoading" class="works-empty">
            <EmptyState title="暂无作品" description="输入提示词，开始你的第一幅 人工智能 画作" />
          </div>
        </a-spin>
      </section>
    </div>

    <!-- ===== 广场 Tab ===== -->
    <div v-show="activeTab === 'gallery'" class="gallery-area" ref="galleryScrollRef" @scroll="onGalleryScroll">
      <a-spin :loading="galleryLoading" style="width:100%; min-height:200px">
        <div v-if="galleryItems.length > 0" class="gallery-grid waterfall">
          <div v-for="(item, idx) in galleryItems" :key="item.id" class="gallery-card"
            @click="openPreview(item.imageUrl || '', item.prompt, item as any)">
            <div class="gallery-img-box">
              <img v-if="item.imageUrl && !isImageBroken(`gal-${item.id}`)" :src="item.imageUrl" alt=""
                :loading="idx >= 200 ? 'lazy' : 'eager'" @error="markImageBroken(`gal-${item.id}`)" />
              <div v-else class="work-placeholder">
                <IconImage :size="32" style="opacity:0.3" />
              </div>
              <div class="gallery-hover">
                <button class="copy-prompt-btn" @click.stop="copyPrompt(item.prompt ?? '')">
                  <IconCopy /> 一键同款
                </button>
              </div>
            </div>
            <div class="gallery-info">
              <p class="gallery-prompt">{{ item.prompt || '无描述' }}</p>
              <div class="gallery-author">
                <span class="author-dot">{{ item.authorName?.charAt(0) ?? '?' }}</span>
                <span>{{ item.authorName ?? '匿名' }}</span>
              </div>
              <div v-if="getModelTag(item)" class="gallery-model-tag">
                <a-tag :color="getModelTag(item)!.color" size="small">{{ getModelTag(item)!.label }}</a-tag>
              </div>
            </div>
          </div>
        </div>
        <div v-if="galleryLoadingMore" class="load-more-hint"><a-spin :size="18" /> 加载更多...</div>
        <div v-else-if="!galleryHasMore && galleryItems.length > GAL_PAGE_SIZE" class="load-more-hint">已加载全部</div>
        <div ref="gallerySentinelRef" class="infinite-sentinel"></div>
        <div v-if="!galleryLoading && galleryItems.length === 0" class="gallery-empty">
          <EmptyState title="广场暂无作品" description="创作并公开你的作品，成为第一位分享者" />
        </div>
      </a-spin>
    </div>

    <!-- 预览弹窗 -->
    <a-modal v-model:visible="previewVisible" :width="980" :footer="false" unmount-on-close modal-class="preview-modal">
      <template #title><span style="color:var(--text-1)">预览</span></template>
      <div class="preview-body">
        <div class="preview-split">
          <!-- 左：图片 + 操作 + 提示词 -->
          <div class="preview-left">
            <div v-if="previewTask" class="preview-actions" @click.stop>
              <WorkCardActionButton shape="pill" title="复制提示词" :disabled="!(previewTask.prompt || previewPrompt)"
                @click="copyPrompt(previewTask.prompt || previewPrompt)">
                <IconCopy /><span>复制提示词</span>
              </WorkCardActionButton>
              <WorkCardActionButton shape="pill" title="一键同款" :disabled="!previewTask.prompt"
                @click="applySameAsTask(previewTask)">
                <IconPlus /><span>一键同款</span>
              </WorkCardActionButton>
              <WorkCardActionButton shape="pill" title="下载" :disabled="!previewTask.resultUrl"
                @click="handleDownload(previewTask.resultUrl)">
                <IconDownload /><span>下载</span>
              </WorkCardActionButton>
              <WorkCardActionButton shape="pill" :title="previewTask.isPublic ? '设为私密' : '设为公开'"
                @click="handleTogglePublic(previewTask)">
                <IconSwap /><span>{{ previewTask.isPublic ? '设为私密' : '设为公开' }}</span>
              </WorkCardActionButton>
              <WorkCardActionButton v-if="previewTask.status === 'failed'" shape="pill" title="重试"
                @click="handleRetry(previewTask)">
                <IconRefresh /><span>重试</span>
              </WorkCardActionButton>
              <WorkCardActionButton danger shape="pill" title="删除" @click="handleDelete(previewTask)">
                <IconDelete /><span>删除</span>
              </WorkCardActionButton>
            </div>
            <img v-if="previewImage" :src="previewImage" class="preview-img" />
            <p v-if="previewPrompt" class="preview-prompt">{{ previewPrompt }}</p>
          </div>

          <!-- 右：详情参数 -->
          <div v-if="previewTask" class="preview-right">
            <div class="detail-panel">
              <div class="detail-title">任务详情参数</div>
              <div class="detail-grid">
                <div class="detail-item"><span class="k">任务 ID</span><span class="v mono">{{ previewTask.id }}</span>
                </div>
                <div class="detail-item"><span class="k">服务商</span><span class="v">{{ getModelTag(previewTask as
                  any)?.label
                  || previewTask.provider || '-' }}</span></div>
                <div class="detail-item"><span class="k">任务类型</span><span class="v">{{ previewTask.taskType || '-'
                }}</span>
                </div>
                <div class="detail-item"><span class="k">状态</span><span class="v">{{ statusText(previewTask.status) ||
                  '-'
                    }}</span></div>
                <div class="detail-item"><span class="k">进度</span><span class="v">{{ previewTask.progress ?? 0
                }}%</span>
                </div>
                <div class="detail-item"><span class="k">公开状态</span><span class="v">{{ previewTask.isPublic ? '公开' :
                  '私密'
                    }}</span></div>
                <div class="detail-item"><span class="k">创建时间</span><span class="v">{{ previewTask.createdAt ? new
                  Date(previewTask.createdAt).toLocaleString() : '-' }}</span></div>
                <div class="detail-item" v-if="previewTask.errorMessage"><span class="k">失败原因</span><span class="v"
                    style="color: var(--accent-red)">{{ previewTask.errorMessage }}</span></div>
              </div>
              <div class="detail-block" v-if="previewTask.negativePrompt">
                <div class="kb">反向提示词</div>
                <pre class="json-view">{{ previewTask.negativePrompt }}</pre>
              </div>
              <div class="detail-block">
                <div class="kb">扩展参数（params）</div>
                <div v-if="previewParamItems.length" class="params-grid">
                  <div v-for="item in previewParamItems" :key="item.key" class="params-item"
                    :class="{ long: item.long }">
                    <span class="pk">{{ item.label }}</span>
                    <span class="pv mono">{{ item.value }}</span>
                  </div>
                </div>
                <div v-else class="params-empty">暂无扩展参数</div>
                <details class="params-raw">
                  <summary>查看原始 JSON</summary>
                  <pre class="json-view">{{ previewParamsJson }}</pre>
                </details>
              </div>
            </div>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
/* === 页面容器 === */
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
}

/* === 顶部 === */
.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--sp-6) var(--sp-8) var(--sp-4);
}

.page-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  font-family: 'Space Grotesk', 'Outfit', -apple-system, 'PingFang SC', sans-serif;
  letter-spacing: -0.02em;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.page-desc {
  margin: 4px 0 0;
  font-size: 0.82rem;
  color: var(--text-4);
  font-family: 'Outfit', -apple-system, 'PingFang SC', sans-serif;
}

.tab-group {
  display: flex;
  gap: 4px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-md);
  padding: 3px;
}

.tab-btn {
  padding: 6px 20px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.tab-btn.active {
  background: var(--primary);
  color: #fff;
}

.tab-btn:hover:not(.active) {
  color: var(--text-1);
}

/* === 创作区 === */
.create-area {
  flex: 1;
  display: flex;
  gap: var(--sp-6);
  padding: var(--sp-4) var(--sp-6) var(--sp-6);
  min-height: 0;
}

/* 左侧表单面板 */
.form-panel {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
}

.form-actions {
  margin-top: var(--sp-2);
  padding-bottom: 12px;
}

.form-actions :deep(.gen-btn:hover) {
  transform: translateY(-1px);
}

.form-group {
  margin-bottom: var(--sp-2);
}

.group-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* 模型下拉框 */
.model-select {
  width: 100%;
}

.param-select {
  width: 100%;
}

/* Qwen 参数区 */
.qwen-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.qwen-item {
  min-width: 0;
}

.qwen-wide {
  grid-column: 1 / -1;
}

.qwen-label {
  font-size: 0.72rem;
  color: var(--text-4);
  margin-bottom: 6px;
}

.qwen-range {
  font-size: 0.78rem;
  color: var(--text-5, #888);
  margin-left: 4px;
}

.param-number {
  width: 100%;
}

.qwen-tip {
  margin-top: 8px;
  font-size: 0.72rem;
  color: var(--text-4);
  line-height: 1;
}

/* Midjourney 参数区 */
.mj-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.mj-item {
  min-width: 0;
}

.mj-wide {
  grid-column: 1 / -1;
}

.mj-label {
  font-size: 0.72rem;
  color: var(--text-4);
  margin-bottom: 6px;
}

.mj-range {
  font-size: 0.78rem;
  color: var(--text-5, #888);
  margin-left: 4px;
}

.mj-tip {
  margin-top: 8px;
  font-size: 0.72rem;
  color: var(--text-4);
  line-height: 1;
}

/* 模型提示 & 标签 */
.label-badge {
  font-size: 0.72rem;
  font-weight: 400;
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.04);
  padding: 1px 7px;
  border-radius: var(--radius-full);
  margin-left: 6px;
  text-transform: none;
  letter-spacing: 0;
}

.variant-tip {
  font-size: 0.72rem;
  color: var(--accent-amber);
  margin-top: 6px;
}

.param-tag {
  font-size: 0.78rem;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
  padding: 0 2px;
}

.param-tag strong {
  color: var(--text-1);
  font-weight: 600;
}

.model-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: rgba(22, 93, 255, 0.04);
  border: 1px solid rgba(22, 93, 255, 0.1);
  border-radius: var(--radius-md);
  font-size: 0.78rem;
  color: var(--text-3);
  line-height: 1;
  margin-bottom: var(--sp-2);
}

.hint-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--primary);
  flex-shrink: 0;
  margin-top: 5px;
}

/* 提示词输入 */
.prompt-input :deep(.arco-textarea) {
  background: var(--bg-surface-2) !important;
  border-radius: var(--radius-md) !important;
}

/* === 参考图上传 === */
.group-label-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

.group-label-row .group-label {
  margin-bottom: 0;
}

.ref-count {
  font-size: 0.75rem;
  color: var(--text-4);
  margin-left: auto;
}

.clear-ref-btn {
  font-size: 0.75rem;
  color: var(--accent-red);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  opacity: 0;
}

.clear-ref-btn:hover {
  opacity: 1;
}

/* 缩略图网格 */
.ref-thumbs {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

.ref-thumb {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-2);
  transition: border-color var(--duration-fast);
}

.ref-thumb:hover {
  border-color: var(--border-focus);
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--duration-fast);
}

.ref-thumb:hover .ref-remove {
  opacity: 1;
}

.ref-remove:hover {
  background: var(--accent-red);
}

/* 添加更多按钮 */
.ref-add-btn {
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border-3);
  background: var(--bg-surface-2);
  color: var(--text-4);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-normal);
}

.ref-add-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(22, 93, 255, 0.06);
}

.ref-add-btn :deep(svg) {
  stroke-width: 2.4;
}

/* 拖拽上传区域 */
.ref-dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 272px;
  padding: 10px;
  border: 1px dashed var(--border-3);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  cursor: pointer;
  transition: all var(--duration-normal);
  text-align: center;
}

.ref-dropzone:hover,
.ref-dropzone.dragover {
  border-color: var(--primary);
  background: rgba(22, 93, 255, 0.06);
}

.ref-dropzone.dragover {
  box-shadow: 0 0 16px rgba(22, 93, 255, 0.1);
}

.dropzone-plus {
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.14);
  border: 1px solid rgba(22, 93, 255, 0.36);
  border-radius: 10px;
  padding: 6px;
}

.dropzone-text {
  font-size: 0.84rem;
  color: var(--text-2);
  line-height: 1.3;
}

.dropzone-hint {
  font-size: 0.84rem;
  color: var(--text-4);
  line-height: 1.25;
}

/* 折叠按钮 */
.toggle-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: var(--sp-2);
  background: none;
  border: none;
  color: var(--text-4);
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
}

.toggle-btn:hover {
  color: var(--text-2);
}

.toggle-arrow {
  transition: transform 0s;
  display: inline-block;
}

.toggle-arrow.open {
  transform: rotate(180deg);
}

/* 敏感词提示弹窗 */
.badword-modal {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.badword-desc {
  font-size: 0.82rem;
  color: var(--text-2);
}

.badword-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.badword-more {
  font-size: 0.75rem;
  color: var(--text-4);
  align-self: center;
}

.badword-modal-wrap :deep(.arco-modal) {
  border-radius: var(--radius-lg);
}

.badword-modal-wrap :deep(.arco-modal-body) {
  padding-top: 8px;
}

.badword-modal-wrap :deep(.arco-tag) {
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  padding: 2px 8px;
}

.badword-modal-wrap :deep(.arco-modal-footer .arco-btn) {
  min-width: 92px;
  border-radius: var(--radius-full);
}

.badword-modal-wrap :deep(.arco-modal-footer .arco-btn + .arco-btn) {
  margin-left: 10px;
}

/* 参数按钮组（支持 wrap） */
.size-group {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.size-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--duration-normal);
  font-size: 0.78rem;
}

.size-btn:hover {
  border-color: var(--border-3);
}

.size-btn.active {
  border-color: var(--primary);
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary-light);
}

.ratio-outline {
  display: inline-block;
  border: 1.5px solid var(--border-3);
  border-radius: 4px;
  background: transparent;
  flex-shrink: 0;
}

.size-label {
  color: var(--text-3);
}

.size-btn.active .size-label {
  color: var(--primary-light);
}

.size-btn.active .ratio-outline {
  border-color: var(--primary-light);
}

/* 生成按钮 → 使用 GenerateButton 组件 */

/* === 右侧作品区 === */
.works-panel {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-right: 4px;
}

.works-spin {
  flex: 1;
  min-height: 0;
  display: flex;
}

.works-spin :deep(.arco-spin) {
  flex: 1;
  min-height: 0;
  display: flex;
}

.works-spin :deep(.arco-spin-children) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.works-empty {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.works-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  flex-shrink: 0;
}

.works-header-left {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.works-header-right {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.batch-controls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
  padding: 10px 12px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  margin-bottom: var(--sp-3);
}

.batch-select {
  display: flex;
  align-items: center;
}

.batch-actions {
  display: flex;
  gap: var(--sp-2);
}

.batch-btn.arco-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-2);
  background: var(--bg-surface-2);
  color: var(--text-2);
  font-size: 0.75rem;
  transition: all var(--duration-fast);
}

.batch-btn.arco-btn:hover:not(.arco-btn-disabled) {
  border-color: var(--border-focus);
  color: var(--text-1);
  transform: translateY(-1px);
}

.batch-btn.arco-btn.arco-btn-disabled {
  opacity: 0.45;
}

.batch-btn.active.arco-btn {
  background: var(--primary);
  border-color: var(--primary);
  color: #fff;
}

.batch-btn.batch-download.arco-btn {
  background: var(--gradient-primary);
  color: #fff;
  border: none;
}

.batch-btn.batch-delete.arco-btn {
  background: rgba(245, 63, 63, 0.1);
  border-color: rgba(245, 63, 63, 0.1);
  color: var(--accent-red);
}

.batch-btn.batch-delete.arco-btn:hover:not(.arco-btn-disabled) {
  background: rgba(245, 63, 63, 0.1);
  border-color: rgba(245, 63, 63, 0.1);
}

.batch-check :deep(.arco-checkbox-label) {
  color: var(--text-2);
  font-size: 0.75rem;
}

.batch-check :deep(.arco-checkbox-icon) {
  width: 18px;
  height: 18px;
  border-radius: 6px;
  border-color: var(--border-2);
  background: var(--bg-surface-2);
  box-shadow: 0 0 0 2px rgba(35, 35, 36, 0.5);
}

.batch-check :deep(.arco-checkbox-input:checked + .arco-checkbox-icon) {
  border-color: var(--primary);
  background: var(--primary);
}

.batch-check :deep(.arco-checkbox-input:indeterminate + .arco-checkbox-icon) {
  border-color: var(--primary);
  background: var(--primary);
}

.batch-check :deep(.arco-checkbox-input:indeterminate + .arco-checkbox-icon::after) {
  background: #fff;
}

.works-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-1);
}

.works-count {
  background: var(--primary);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full);
  line-height: 1;
}

.retry-all-btn {
  margin-left: auto;
  border: 1px solid rgba(22, 93, 255, 0.1);
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary-light);
  border-radius: var(--radius-full);
  padding: 4px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.retry-all-btn:hover:not(:disabled) {
  background: rgba(22, 93, 255, 0.1);
  border-color: rgba(22, 93, 255, 0.5);
}

.retry-all-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

/* 横向网格（按时间顺序从左到右） */
.waterfall {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 20px;
  padding: 0 4px 4px 0;
  align-content: start;
}

/* 单张作品卡片 */
.work-card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0s, border-color 0s, transform 0s;
  position: relative;
}

.work-card:hover {
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
  transform: translateY(-2px);
}

.work-card.batch-mode {
  cursor: default;
}

.work-card.batch-mode:hover {
  transform: none;
}

.work-card.selected {
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(22, 93, 255, 0.1);
}

.batch-checkbox {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
}

.batch-checkbox :deep(.arco-checkbox) {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

.batch-checkbox :deep(.arco-checkbox-label) {
  display: none;
}

.work-img-box {
  position: relative;
  width: 100%;
  aspect-ratio: 1 / 1;
  overflow: hidden;
  background: var(--bg-surface-3);
}

.work-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0s var(--ease-out);
}

.work-card:hover .work-img {
  transform: scale(1.05);
}

.work-placeholder {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface-3);
}

/* 进度环 (SVG) */
.progress-ring-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(7, 10, 20, 0.2);
  overflow: hidden;
}

.progress-ring-overlay::before {
  content: '';
  position: absolute;
  inset: -50% -20%;
  background: linear-gradient(120deg, transparent 35%, rgba(22, 93, 255, 0.4) 50%, transparent 65%);
  animation: scanSweep 2s linear infinite;
}

.progress-svg {
  width: 56px;
  height: 56px;
}

.progress-stage {
  position: relative;
  z-index: 1;
  margin-bottom: 8px;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

.progress-text {
  position: relative;
  z-index: 1;
  font-size: 0.75rem;
  color: #fff;
  font-weight: 600;
  margin-top: 4px;
}

.progress-track {
  position: relative;
  z-index: 1;
  width: 120px;
  height: 4px;
  border-radius: 999px;
  margin-top: 8px;
  background: rgba(255, 255, 255, 0);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #165DFF, #4080FF);
  transition: width 0s ease;
}

@keyframes scanSweep {
  from {
    transform: translateX(-30%);
  }

  to {
    transform: translateX(30%);
  }
}

/* 状态标签 */
.status-badge {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  color: #fff;
  font-weight: 500;
  z-index: 5;
}

/* Hover 操作层 */
.hover-actions {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: var(--sp-2);
  padding: var(--sp-3);
  flex-wrap: wrap;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0));
  opacity: 0;
  transform: translateY(4px);
  transition: all var(--duration-normal) var(--ease-out);
  z-index: 2;
}

.hover-actions :deep(.wca-btn) {
  background: rgba(0, 0, 0, 0.1);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.hover-actions :deep(.wca-btn:hover:not(:disabled)) {
  background: rgba(0, 0, 0, 0.1);
  border-color: rgba(255, 255, 255, 0.3);
}

.work-card:hover .hover-actions {
  opacity: 1;
  transform: translateY(0);
}

.action-icon {
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0);
  backdrop-filter: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast);
}

.action-icon:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: scale(1.1);
}

.action-icon.danger:hover {
  background: rgba(245, 63, 63, 0.1);
}

/* 卡片底部信息区 */
.work-info {
  padding: var(--sp-3);
  background: var(--bg-surface-2);
}

.work-prompt {
  margin: 0 0 6px 0;
  font-size: 0.75rem;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1;
}

.failed-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-surface-3);
  /* Dark background to cover placeholder */
  z-index: 2;
}

.failed-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  width: 100%;
  box-sizing: border-box;
}

.failed-msg {
  font-size: 0.75rem;
  color: var(--text-3);
  text-align: center;
  width: 100%;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  overflow: hidden;
  line-height: 1;
}

.failed-detail-btn {
  background: rgba(245, 63, 63, 0.1);
  border: 1px solid rgba(245, 63, 63, 0.3);
  color: var(--accent-red);
  padding: 4px 14px;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0s;
}

.failed-detail-btn:hover {
  background: rgba(245, 63, 63, 0.1);
  border-color: rgba(245, 63, 63, 0.1);
}

.work-model-tag {
  margin: 0 0 6px 0;
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.load-more-hint {
  grid-column: 1 / -1;
  text-align: center;
  padding: var(--sp-4) 0;
  color: var(--text-4);
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.infinite-sentinel {
  grid-column: 1 / -1;
  height: 1px;
}

/* === 广场 === */
.gallery-area {
  flex: 1;
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow-y: auto;
}

.gallery-empty {
  min-height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gallery-card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0s, border-color 0s;
}

.gallery-card:hover {
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
}

.gallery-img-box {
  position: relative;
  width: 100%;
  padding-bottom: 100%;
  overflow: hidden;
  background: var(--bg-surface-3);
}

.gallery-img-box img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0s;
}

.gallery-card:hover .gallery-img-box img {
  transform: scale(1.06);
}

.gallery-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity var(--duration-normal);
}

.gallery-card:hover .gallery-hover {
  opacity: 1;
}

.copy-prompt-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  background: var(--gradient-primary);
  border: none;
  border-radius: var(--radius-md);
  color: #fff;
  font-size: 0.82rem;
  cursor: pointer;
  font-weight: 500;
  transition: transform var(--duration-fast);
}

.copy-prompt-btn:hover {
  transform: scale(1.05);
}

.gallery-info {
  padding: var(--sp-3);
}

.gallery-prompt {
  margin: 0 0 var(--sp-2);
  font-size: 0.75rem;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-author {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: 0.75rem;
  color: var(--text-4);
}

.gallery-model-tag {
  margin-top: var(--sp-2);
  display: flex;
  align-items: center;
  white-space: nowrap;
}

.author-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  font-size: 0.82rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

/* 预览 */
.preview-body {
  text-align: left;
}

.preview-split {
  display: flex;
  gap: var(--sp-4);
  align-items: flex-start;
}

.preview-left {
  flex: 1;
  min-width: 0;
}

.preview-right {
  width: 340px;
  max-width: 46%;
  max-height: 72vh;
  overflow: auto;
}

.preview-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: var(--sp-3);
  justify-content: flex-start;
}

.preview-actions :deep(.wca-btn) {
  background: rgba(49, 49, 50, 0.2);
  color: var(--text-2);
}

.preview-actions :deep(.wca-btn:hover:not(:disabled)) {
  background: rgba(49, 49, 50, 0.18);
}

.preview-actions :deep(.wca-btn span) {
  font-size: 0.78rem;
}

.preview-img {
  width: 100%;
  max-height: 65vh;
  object-fit: contain;
  border-radius: var(--radius-md);
}

.preview-prompt {
  margin: var(--sp-4) 0 0;
  padding: var(--sp-4);
  background: var(--bg-surface-3);
  border-radius: var(--radius-md);
  text-align: left;
  color: var(--text-2);
  font-size: 0.9rem;
}

.detail-panel {
  margin-top: 0;
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-surface-2);
  text-align: left;
}

.detail-title {
  font-size: 0.82rem;
  color: var(--text-2);
  font-weight: 600;
  margin-bottom: var(--sp-3);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}

.detail-item {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.detail-item .k {
  color: var(--text-4);
  font-size: 0.76rem;
  white-space: nowrap;
}

.detail-item .v {
  color: var(--text-2);
  font-size: 0.76rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}

.detail-block {
  margin-top: var(--sp-3);
}

.kb {
  font-size: 0.76rem;
  color: var(--text-4);
  margin-bottom: 6px;
}

.params-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.params-item {
  display: grid;
  grid-template-columns: 96px 1fr;
  gap: 8px;
  align-items: start;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px solid var(--border-1);
  background: var(--bg-surface-3);
}

.params-item.long {
  grid-template-columns: 1fr;
}

.pk {
  color: var(--text-4);
  font-size: 0.74rem;
  line-height: 1.45;
}

.pv {
  color: var(--text-2);
  font-size: 0.74rem;
  line-height: 1.45;
  word-break: break-word;
  white-space: pre-wrap;
}

.params-empty {
  color: var(--text-4);
  font-size: 0.74rem;
  padding: 8px 10px;
  border-radius: 10px;
  border: 1px dashed var(--border-1);
  background: var(--bg-surface-3);
}

.params-raw {
  margin-top: 8px;
}

.params-raw>summary {
  cursor: pointer;
  color: var(--text-4);
  font-size: 0.74rem;
  user-select: none;
}

.json-view {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--border-1);
  background: var(--bg-surface-3);
  color: var(--text-2);
  font-size: 0.74rem;
  line-height: 1.5;
}

/* Light 模式对比度补丁（仅必要项） */
:global(body[arco-theme='light']) .model-hint {
  background: rgba(22, 93, 255, 0.08);
  border-color: rgba(22, 93, 255, 0.2);
}

:global(body[arco-theme='light']) .progress-ring-overlay {
  background: rgba(15, 23, 42, 0.62);
}

/* 响应式 */
@media(max-width:900px) {
  .create-area {
    flex-direction: column;
  }

  .form-panel {
    width: 100%;
    max-height: 45vh;
  }

  .waterfall {
    grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
    gap: 16px;
  }

  .batch-controls {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    padding: 12px;
  }

  .works-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
  }

  .batch-actions {
    width: 100%;
    justify-content: stretch;
  }

  .batch-actions .batch-btn {
    flex: 1;
    justify-content: center;
  }
}

@media(max-width:600px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
  }

  .create-area {
    padding: var(--sp-3);
  }

  .gallery-area {
    padding: var(--sp-3);
  }

  .waterfall {
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }

  .preview-split {
    flex-direction: column;
  }

  .preview-right {
    width: 100%;
    max-width: 100%;
    max-height: none;
    overflow: visible;
  }

  .batch-actions {
    flex-direction: column;
    gap: 8px;
  }

  .batch-actions .batch-btn {
    width: 100%;
    justify-content: center;
  }
}

@media(max-width:420px) {
  .waterfall {
    grid-template-columns: 1fr;
    gap: 12px;
  }

  .works-header-left,
  .works-header-right {
    flex-direction: column;
    align-items: stretch;
    gap: 6px;
    width: 100%;
  }

  .works-header-right .arco-btn {
    width: 100%;
    justify-content: center;
  }
}

/* 触屏设备没有 hover：始终提供操作入口 */
@media (hover: none) {
  .work-card .hover-actions {
    opacity: 1;
    transform: none;
  }

  .gallery-card .gallery-hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.5);
  }
}
</style>
