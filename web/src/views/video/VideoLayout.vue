<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconClose, IconPlus, IconVideoCamera, IconDelete, IconRefresh, IconPlayArrowFill, IconCopy,
} from '@arco-design/web-vue/es/icon'
import {
  createVideoTask, getMyTasks, getGallery, getTasksStatusBatch, retryTask as retryVideoTask, deleteTask as deleteVideoTask,
  type VideoTask, type VideoGalleryItem, type CreateVideoTaskData,
} from '../../api/video'
import { uploadFile } from '../../api/upload'
import { getModels } from '../../api/model'
import EmptyState from '../../components/EmptyState.vue'
import WorkCardActionButton from '../../components/WorkCardActionButton.vue'
import GenerateButton from '../../components/GenerateButton.vue'
import { onTaskEvent, realtimeConnected } from '../../realtime/socket'

/* === 状态 === */
const activeTab = ref('create')
const generating = ref(false)
const myTasks = ref<VideoTask[]>([])
const myPage = ref(1)
const myTotal = ref(0)
const myLoading = ref(false)
const gallery = ref<VideoGalleryItem[]>([])
const galPage = ref(1)
const galTotal = ref(0)
const galLoading = ref(false)
const previewUrl = ref<string | null>(null)
const previewOpen = ref(false)
const previewTask = ref<VideoTask | null>(null)
const previewVideoRef = ref<HTMLVideoElement>()
const retryingId = ref<string | null>(null)

/* 表单 */
const inputMode = ref<'text' | 'frame' | 'ref' | 'motion'>('text')
const form = ref<CreateVideoTaskData>({ provider: 'veo3.1-fast', prompt: '', duration: 5 })
const uploading = ref(false)
const previewMode = ref(false)
const selectedResolution = ref<'standard' | 'high'>('standard')
const seedanceResolution = ref<'720p' | '1080p'>('720p')
const seedanceFixedLens = ref(false)
const seedanceGenerateAudio = ref(false)
const selectedKling26SubModel = ref<'kling-2/text-to-video' | 'kling-2/image-to-video' | 'kling-2/motion-control'>('kling-2/text-to-video')
const kling26Sound = ref(false)
const motionResolution = ref<'480p' | '720p' | '1080p'>('720p')
const motionOrientation = ref<'image' | 'video' | 'auto'>('image')

/* Vidu Q2 CTV 专属 */
// 分辨率
const viduq2Resolution = ref<'540p' | '720p' | '1080p'>('720p')
// 生成音频
const viduq2Audio = ref(false)
// 添加水印
const viduq2Watermark = ref(false)
// 随机种子
const viduq2Seed = ref<number>(0)

/* Vidu Q2 Pro 专属 */
const viduq2ProBgm = ref(false)
/* 动态幅度 */
const viduq2ProMovementAmplitude = ref<'auto' | 'small' | 'medium' | 'large'>('auto')
/* 水印位置 */
const viduq2ProWmPosition = ref<1 | 2 | 3 | 4>(3)
/* 水印 URL */
const viduq2ProWmUrl = ref('')

/* Kling v2.6 文生视频（DMX，与 kling-2 无关） */
/* 生成音效 */
const klingV26Sound = ref<'on' | 'off'>('off')
/* 负向提示词 */
const klingV26NegativePrompt = ref('')

/* Kling v2.6 图生视频：尾帧图（可选，单独上传入口） */
const klingV26TailFrameFile = ref<{ url: string; file: File } | null>(null)
const klingV26TailFrameInputRef = ref<HTMLInputElement>()
function pickKlingV26TailFrame(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (klingV26TailFrameFile.value) URL.revokeObjectURL(klingV26TailFrameFile.value.url)
  klingV26TailFrameFile.value = { url, file }
  ;(e.target as HTMLInputElement).value = ''
}
function clearKlingV26TailFrame() {
  if (klingV26TailFrameFile.value) {
    URL.revokeObjectURL(klingV26TailFrameFile.value.url)
    klingV26TailFrameFile.value = null
  }
}

/* 首帧/尾帧图 */
const firstFrameFile = ref<{ url: string; file: File } | null>(null)
const lastFrameFile = ref<{ url: string; file: File } | null>(null)
/* 首帧输入框 */
const firstFrameInputRef = ref<HTMLInputElement>()
/* 尾帧输入框 */
const lastFrameInputRef = ref<HTMLInputElement>()

/* Motion Control 素材 */
const motionRoleImage = ref<{ url: string; file: File } | null>(null)
const motionVideoFile = ref<{ url: string; file: File } | null>(null)
/* 角色图输入框 */
const motionRoleInputRef = ref<HTMLInputElement>()
/* 动作视频输入框 */
const motionVideoInputRef = ref<HTMLInputElement>()

function pickFrame(type: 'first' | 'last', e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (type === 'first') { if (firstFrameFile.value) URL.revokeObjectURL(firstFrameFile.value.url); firstFrameFile.value = { url, file } }
  else { if (lastFrameFile.value) URL.revokeObjectURL(lastFrameFile.value.url); lastFrameFile.value = { url, file } }
  ; (e.target as HTMLInputElement).value = ''
}
function clearFrame(type: 'first' | 'last') {
  if (type === 'first' && firstFrameFile.value) { URL.revokeObjectURL(firstFrameFile.value.url); firstFrameFile.value = null }
  if (type === 'last' && lastFrameFile.value) { URL.revokeObjectURL(lastFrameFile.value.url); lastFrameFile.value = null }
}

function pickMotionImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (motionRoleImage.value) URL.revokeObjectURL(motionRoleImage.value.url)
  motionRoleImage.value = { url, file }
    ; (e.target as HTMLInputElement).value = ''
}
function clearMotionImage() {
  if (motionRoleImage.value) {
    URL.revokeObjectURL(motionRoleImage.value.url)
    motionRoleImage.value = null
  }
}
function pickMotionVideo(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('video/')) return
  const url = URL.createObjectURL(file)
  if (motionVideoFile.value) URL.revokeObjectURL(motionVideoFile.value.url)
  motionVideoFile.value = { url, file }
    ; (e.target as HTMLInputElement).value = ''
}
function clearMotionVideo() {
  if (motionVideoFile.value) {
    URL.revokeObjectURL(motionVideoFile.value.url)
    motionVideoFile.value = null
  }
}

/* 参考图（最多3张，不能和首尾帧同时用）*/
const refImages = ref<{ id: string; file: File; url: string }[]>([])
const refInputRef = ref<HTMLInputElement>()
const refInputRefKlingV26 = ref<HTMLInputElement>()
const FALLBACK_MAX_REF = 3

function addRefImages(files: File[]) {
  const maxRef = modelConfig.value.maxRefImages ?? FALLBACK_MAX_REF
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) { Message.warning('请选择图片'); return }
  const left = maxRef - refImages.value.length
  if (left <= 0) { Message.warning(`最多 ${maxRef} 张参考图`); return }
  for (const f of imgs.slice(0, left)) {
    refImages.value.push({ id: `r${Date.now()}${Math.random().toString(36).slice(2, 5)}`, file: f, url: URL.createObjectURL(f) })
  }
}
function removeRef(id: string) {
  const i = refImages.value.findIndex(r => r.id === id)
  if (i >= 0) {
    const target = refImages.value[i]
    if (target) URL.revokeObjectURL(target.url)
    refImages.value.splice(i, 1)
  }
}
function handleRefSelect(e: Event) { const f = (e.target as HTMLInputElement).files; if (f) addRefImages(Array.from(f)); (e.target as HTMLInputElement).value = '' }
function handleRefDrop(e: DragEvent) { e.preventDefault(); if (e.dataTransfer?.files) addRefImages(Array.from(e.dataTransfer.files)) }

/** 统一上传区拖放：首帧 / 尾帧 / Kling 首帧·尾帧 / 角色图 / 动作视频 */
function handleFirstFrameDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file?.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (firstFrameFile.value) URL.revokeObjectURL(firstFrameFile.value.url)
  firstFrameFile.value = { url, file }
}
function handleLastFrameDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file?.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (lastFrameFile.value) URL.revokeObjectURL(lastFrameFile.value.url)
  lastFrameFile.value = { url, file }
}
function handleKlingV26FirstDrop(e: DragEvent) {
  e.preventDefault()
  if (e.dataTransfer?.files) addRefImages(Array.from(e.dataTransfer.files))
}
function handleKlingV26TailDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file?.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (klingV26TailFrameFile.value) URL.revokeObjectURL(klingV26TailFrameFile.value.url)
  klingV26TailFrameFile.value = { url, file }
}
function handleMotionRoleDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file?.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (motionRoleImage.value) URL.revokeObjectURL(motionRoleImage.value.url)
  motionRoleImage.value = { url, file }
}
function handleMotionVideoDrop(e: DragEvent) {
  e.preventDefault()
  const file = e.dataTransfer?.files?.[0]
  if (!file?.type.startsWith('video/')) return
  const url = URL.createObjectURL(file)
  if (motionVideoFile.value) URL.revokeObjectURL(motionVideoFile.value.url)
  motionVideoFile.value = { url, file }
}

const providersDef = [
  { value: 'veo3.1-fast', label: 'Veo 3.1 Fast', desc: '快速生成，支持首尾帧+参考图', color: '#FF7D00' },
  { value: 'veo3.1-pro', label: 'Veo 3.1 Pro', desc: '高质量生成，支持首尾帧', color: '#4080FF' },
  { value: 'sora-2', label: 'Sora 2', desc: 'APIMart 标准版，支持文本/参考图', color: '#14C9C9' },
  { value: 'sora-2-pro', label: 'Sora 2 Pro', desc: 'APIMart 专业版，支持更长时长', color: '#22c55e' },
  { value: 'kling-3.0', label: 'Kling 3.0', desc: '可灵3.0，3-15秒，支持1:1/音效', color: '#e11d48' },
  { value: 'kling-2', label: 'Kling 2', desc: '文生/图生/动作控制子模型', color: '#0ea5e9' },
  { value: 'bytedance/seedance-1-pro', label: 'Seedance 1 Pro', desc: '字节视频，支持参考图/首尾帧', color: '#14b8a6' },
  { value: 'viduq2-ctv', label: 'Vidu Q2 CTV', desc: '多图参考生视频，1-10秒，540p/720p/1080p', color: '#7c3aed' },
  { value: 'viduq2-pro', label: 'Vidu Q2 Pro', desc: '首尾帧生成视频，1-8秒，动态幅度大', color: '#6366f1' },
  { value: 'kling-v2-6-text2video', label: 'Kling v2.6 文生视频', desc: 'DMX 可灵文生视频，5/10秒，16:9/9:16/1:1', color: '#f59e0b' },
  { value: 'kling-v2-6-image2video', label: 'Kling v2.6 图生视频', desc: 'DMX 可灵图生视频，1-2张图，5/10秒', color: '#d97706' },
  { value: 'hailuo-2.3', label: 'MiniMax Hailuo 2.3', desc: 'DMX MiniMax Hailuo 文/图生视频，6/10秒', color: '#22d3ee' },
  { value: 'doubao-seedance-text', label: 'Doubao Seedance 文生视频', desc: '豆包文生视频，4-12秒，支持音频', color: '#0ea5e9' },
  { value: 'doubao-seedance-image', label: 'Doubao Seedance 图生视频', desc: '豆包图生视频，首帧参考图 + 文本', color: '#38bdf8' },
]
/** 前端 provider value -> 后端 modelName（或多个），用于按后台启用列表过滤 */
const providerToBackendNames: Record<string, string | string[]> = {
  'kling-2': ['kling-2.6/text-to-video', 'kling-2.6/image-to-video', 'kling-2.6/motion-control'],
  'bytedance/seedance-1-pro': 'bytedance/seedance-1.5-pro',
  'hailuo-2.3': 'MiniMax-Hailuo-2.3',
  'doubao-seedance-text': 'doubao-seedance-1-5-pro-responses',
  'doubao-seedance-image': 'doubao-seedance-1-5-pro-responses',
}
const activeVideoModelNames = ref<Set<string>>(new Set())
const videoOrderMap = ref<Record<string, number>>({})
const kling26SubModels = [
  { value: 'kling-2/text-to-video', label: '文生视频', desc: '5/10 秒，多比例，支持音效' },
  { value: 'kling-2/image-to-video', label: '图生视频', desc: '5/10 秒，参考图驱动' },
  { value: 'kling-2/motion-control', label: '动作控制', desc: '角色图 + 动作视频控制' },
]
const videoPointsMap = ref<Record<string, number>>({})
const visibleProviders = computed(() => {
  const set = activeVideoModelNames.value
  const baseList = set.size === 0
    ? providersDef
    : providersDef.filter(p => {
      const backends = providerToBackendNames[p.value]
      const names = Array.isArray(backends) ? backends : [backends ?? p.value]
      return names.some(b => set.has(b))
    })

  // 按后台配置的 order 排序（同 order 时保持原先顺序）
  const getOrderForProvider = (p: { value: string }) => {
    const backends = providerToBackendNames[p.value]
    const names = Array.isArray(backends) ? backends : [backends ?? p.value]
    let minOrder: number | null = null
    for (const name of names) {
      const ord = videoOrderMap.value[name]
      if (typeof ord === 'number') {
        if (minOrder === null || ord < minOrder) minOrder = ord
      }
    }
    return minOrder ?? Number.MAX_SAFE_INTEGER
  }

  return baseList
    .slice()
    .sort((a, b) => getOrderForProvider(a) - getOrderForProvider(b))
})
const providers = computed(() => visibleProviders.value.map(p => {
  // 1）Kling 2 子模型特殊处理：使用选中的子模型名找积分
  let modelNameForPoints: string
  if (p.value === 'kling-2') {
    modelNameForPoints = selectedKling26SubModel.value
  } else if (p.value === 'kling-v2-6-text2video') {
    modelNameForPoints = 'kling-v2-6-text2video'
  } else if (p.value === 'kling-v2-6-image2video') {
    modelNameForPoints = 'kling-v2-6-image2video'
  } else {
    // 2）其余模型优先使用 providerToBackendNames 中配置的后端真实模型名
    const backends = providerToBackendNames[p.value]
    if (Array.isArray(backends)) {
      modelNameForPoints = backends[0] ?? p.value
    } else if (typeof backends === 'string' && backends) {
      modelNameForPoints = backends
    } else {
      modelNameForPoints = p.value
    }
  }

  let points = videoPointsMap.value[modelNameForPoints] ?? 0

  // 如果后端没有数据，使用默认积分（仅兼容旧的 Seedance 1 Pro）
  if (points === 0 && p.value === 'bytedance/seedance-1-pro') {
    points = 60
  }

  return { ...p, points }
}))

async function fetchVideoModelPoints() {
  try {
    const res = await getModels({ type: 'video' })
    const all = (res as any).data || res // 兼容两种返回格式
    if (Array.isArray(all)) {
      activeVideoModelNames.value = new Set(
        all.map((m: { modelName?: string }) => m.modelName).filter((x): x is string => Boolean(x))
      )
      const orderMap: Record<string, number> = {}
      const pointsMap: Record<string, number> = {}
      for (const m of all) {
        if (!m || !m.modelName) continue
        if (typeof m.order === 'number') orderMap[m.modelName] = m.order
        if (m.deductPoints) pointsMap[m.modelName] = m.deductPoints
      }
      videoOrderMap.value = orderMap
      videoPointsMap.value = pointsMap
    }
  } catch { /* ignore */ }
}

const selectedModel = ref('veo3.1-fast')
watch(visibleProviders, (list) => {
  if (list.length) {
    const first = list[0]
    if (first && !list.some(p => p.value === selectedModel.value)) {
      selectedModel.value = first.value
    }
  }
}, { immediate: true })
const actualModel = computed(() => selectedModel.value === 'kling-2' ? selectedKling26SubModel.value : selectedModel.value)
const isKlingV26Text2VideoModel = computed(() => actualModel.value === 'kling-v2-6-text2video')
const isKlingV26Image2VideoModel = computed(() => actualModel.value === 'kling-v2-6-image2video')
const defaultRatioOptions = [
  { value: '16:9', label: '16:9 横屏', icon: '▬' },
  { value: '9:16', label: '9:16 竖屏', icon: '▮' },
]
const klingRatioOptions = [
  { value: '16:9', label: '16:9 横屏', icon: '▬' },
  { value: '9:16', label: '9:16 竖屏', icon: '▮' },
  { value: '1:1', label: '1:1 方形', icon: '■' },
]
const kling26RatioOptions = [
  { value: '1:1', label: '1:1 方形', icon: '■' },
  { value: '16:9', label: '16:9 横屏', icon: '▬' },
  { value: '9:16', label: '9:16 竖屏', icon: '▮' },
  { value: '4:3', label: '4:3 标准', icon: '▭' },
]
const selectedRatio = ref('16:9')
const isKling26Text = computed(() => actualModel.value === 'kling-2/text-to-video')
const isKling26Image = computed(() => actualModel.value === 'kling-2/image-to-video')
const isKling26Motion = computed(() => actualModel.value === 'kling-2/motion-control')
const ratioOptions = computed(() => {
  if (isKling26Text.value) return kling26RatioOptions
  if (actualModel.value === 'kling-3.0') return klingRatioOptions
  if (isKlingV26Text2VideoModel.value) return klingRatioOptions
  if (isKlingV26Image2VideoModel.value) return klingRatioOptions
  return defaultRatioOptions
})
const seedanceResolutionOptions: Array<{ value: '720p' | '1080p'; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

/* Hailuo 2.3 专属（MiniMax-Hailuo-2.3 只支持 768P/1080P；10s 仅 768P） */
const hailuoResolution = ref<'768P' | '1080P'>('768P')
const hailuoResolutionOptions = computed<Array<'768P' | '1080P'>>(() => {
  if (!isHailuoModel.value) return []
  // 10 秒只允许 768P；6 秒可选 768P / 1080P
  return form.value.duration === 10 ? ['768P'] : ['768P', '1080P']
})
const hailuoPromptOptimizer = ref(true)
const hailuoFastPretreatment = ref(false)
const hailuoAigcWatermark = ref(false)

/* Kling 3.0 专属 */
const klingMode = ref<'std' | 'pro'>('pro')
const klingSound = ref(false)
const isKlingModel = computed(() => actualModel.value === 'kling-3.0')
const isSeedanceModel = computed(() => actualModel.value === 'bytedance/seedance-1-pro')
const isViduq2CtvModel = computed(() => actualModel.value === 'viduq2-ctv')
const isViduq2ProModel = computed(() => actualModel.value === 'viduq2-pro')
const isHailuoModel = computed(() => actualModel.value === 'hailuo-2.3')
const isDoubaoSeedanceModel = computed(
  () =>
    actualModel.value === 'doubao-seedance-text' ||
    actualModel.value === 'doubao-seedance-image',
)
/* Doubao Seedance 1.5 Pro 专属 */
const doubaoResolution = ref<'480p' | '720p' | '1080p'>('720p')
const doubaoGenerateAudio = ref(true)
const doubaoCameraFixed = ref(false)
const doubaoWatermark = ref(false)
const doubaoSeed = ref<number>(-1)
const showRatio = computed(() => !isKling26Image.value && !isKling26Motion.value)
const showDuration = computed(() => !isKling26Motion.value)
const showKling26Sound = computed(() => isKling26Text.value || isKling26Image.value)
const showKling26SubSelect = computed(() => selectedModel.value === 'kling-2')

function ratioPreviewStyle(value: string) {
  const m = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/)
  const wNum = m?.[1] ? Math.max(0.1, Number(m[1])) : 4
  const hNum = m?.[2] ? Math.max(0.1, Number(m[2])) : 3
  const ratio = wNum / hNum
  if (ratio >= 1) {
    const w = 16
    const h = Math.max(7, Math.round(w / ratio))
    return { width: `${w}px`, height: `${h}px` }
  }
  const h = 14
  const w = Math.max(7, Math.round(h * ratio))
  return { width: `${w}px`, height: `${h}px` }
}

const missingHints = computed(() => {
  const hints: string[] = []
  if (!form.value.prompt?.trim()) hints.push('请输入提示词')
  if (inputMode.value === 'frame' && !firstFrameFile.value) hints.push('需要首帧图片')
  if (actualModel.value === 'viduq2-pro' && inputMode.value === 'frame' && !lastFrameFile.value) hints.push('需要尾帧图片')
  if (inputMode.value === 'ref' && refImages.value.length === 0) hints.push('需要参考图')
  if (inputMode.value === 'motion') {
    if (!motionRoleImage.value) hints.push('需要角色图')
    if (!motionVideoFile.value) hints.push('需要动作视频')
  }
  return hints
})

const inputModeLabels: Record<'text' | 'frame' | 'ref' | 'motion', string> = {
  text: '纯文字',
  frame: '首尾帧',
  ref: '参考图',
  motion: '动作控制',
}
const taskMode = computed<'text2video' | 'img2video'>(() => inputMode.value === 'text' ? 'text2video' : 'img2video')

type ModelConfig = {
  inputModes: Array<'text' | 'frame' | 'ref' | 'motion'>
  maxRefImages: number
  durations: number[]
  previewDurations?: number[]
  supportsPreview: boolean
  supportsPreviewResolution: boolean
  hint: string
}

const modelConfigs: Record<string, ModelConfig> = {
  'veo3.1-fast': {
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 3,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: '支持首尾帧 + 参考图（最多3张），快速生成',
  },
  'veo3.1-pro': {
    inputModes: ['text', 'frame'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: '支持首尾帧，高质量生成',
  },
  'sora-2': {
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [10, 15],
    previewDurations: [4, 8, 12],
    supportsPreview: true,
    supportsPreviewResolution: false,
    hint: '支持文本/参考图，预览模式支持 4/8/12 秒',
  },
  'sora-2-pro': {
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [10, 15, 25],
    previewDurations: [4, 8, 12],
    supportsPreview: true,
    supportsPreviewResolution: true,
    hint: '支持更长时长，预览模式支持高分辨率',
  },
  'kling-3.0': {
    inputModes: ['text', 'frame'],
    maxRefImages: 0,
    durations: [5, 8, 10, 15],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: '可灵3.0，支持首尾帧/1:1方形/音效，3-15秒',
  },
  'kling-2/text-to-video': {
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Kling 2 文生视频，支持多比例与音效',
  },
  'kling-2/image-to-video': {
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Kling 2 图生视频，1 张参考图驱动',
  },
  'kling-2/motion-control': {
    inputModes: ['motion'],
    maxRefImages: 0,
    durations: [5],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Kling 2 动作控制：角色图 + 动作视频',
  },
  'bytedance/seedance-1-pro': {
    inputModes: ['text', 'frame', 'ref'],
    maxRefImages: 2,
    durations: [4, 6, 8, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: '字节 Seedance 1 Pro，支持文本/参考图/首尾帧',
  },
  'viduq2-ctv': {
    inputModes: ['ref'],
    maxRefImages: 10,
    durations: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
    supportsPreview: false,
    supportsPreviewResolution: false, // 不支持预览分辨率
    hint: 'Vidu Q2 CTV 多图参考生视频，需至少 1 张参考图，支持 1-10 秒、540p/720p/1080p',
  },
  'viduq2-pro': {
    inputModes: ['frame'],
    maxRefImages: 0,
    durations: [1, 2, 3, 4, 5, 6, 7, 8],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Vidu Q2 Pro 首尾帧生成视频，需首帧+尾帧两张图，1-8 秒，540p/720p/1080p，动态幅度大',
  },
  'kling-v2-6-text2video': {
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'DMX 可灵 v2.6 文生视频，5/10 秒，16:9/9:16/1:1，高品质模式，支持音效',
  },
  'kling-v2-6-image2video': {
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [5, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'DMX 可灵 v2.6 图生视频：上传 1 张首帧图，可选项上传尾帧图，5/10 秒，16:9/9:16/1:1',
  },
  'hailuo-2.3': {
    inputModes: ['text', 'ref'],
    maxRefImages: 1,
    durations: [6, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'MiniMax Hailuo 2.3：支持纯文字文生视频与“参考图”图生视频（单张首帧图），6/10 秒，512P/720P/768P/1080P',
  },
  'doubao-seedance-text': {
    inputModes: ['text'],
    maxRefImages: 0,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Doubao Seedance 1.5 Pro 文生视频：4-12 秒，支持生成音频/固定镜头/水印/随机种子',
  },
  'doubao-seedance-image': {
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Doubao Seedance 1.5 Pro 图生视频：参考图 + 文本，4-12 秒，支持音画同步生成',
  },
}

const defaultModelConfig: ModelConfig = {
  inputModes: ['text', 'frame', 'ref'],
  maxRefImages: 3,
  durations: [5, 10],
  supportsPreview: false,
  supportsPreviewResolution: false,
  hint: '支持首尾帧 + 参考图（最多3张），快速生成',
}

const modelConfig = computed<ModelConfig>(() => modelConfigs[actualModel.value] ?? defaultModelConfig)
const availableInputModes = computed(() => modelConfig.value.inputModes)
const durationOptions = computed(() => (
  previewMode.value && modelConfig.value.previewDurations?.length
    ? modelConfig.value.previewDurations
    : modelConfig.value.durations
))
const canUseRefMode = computed(() => availableInputModes.value.includes('ref'))
const canUseFrameMode = computed(() => availableInputModes.value.includes('frame'))
const maxRef = computed(() => modelConfig.value.maxRefImages || FALLBACK_MAX_REF)
const isSoraModel = computed(() => actualModel.value.startsWith('sora-2'))

/** 前端展示用 actualModel → 后端接口 / 枚举值（provider、params.model 均需使用） */
function providerForApi(): string {
  const m = actualModel.value
  if (m === 'bytedance/seedance-1-pro') return 'bytedance/seedance-1.5-pro'
  if (m === 'kling-2/text-to-video') return 'kling-2.6/text-to-video'
  if (m === 'kling-2/image-to-video') return 'kling-2.6/image-to-video'
  if (m === 'kling-2/motion-control') return 'kling-2.6/motion-control'
  if (m === 'viduq2-ctv') return 'viduq2-ctv'
  if (m === 'viduq2-pro') return 'viduq2-pro'
  if (m === 'kling-v2-6-text2video') return 'kling-v2-6-text2video'
  if (m === 'kling-v2-6-image2video') return 'kling-v2-6-image2video'
  if (m === 'hailuo-2.3') return 'MiniMax-Hailuo-2.3'
  if (m === 'doubao-seedance-text' || m === 'doubao-seedance-image') return 'doubao-seedance-1-5-pro-responses'
  return m
}

function modelForApi() {
  const backendModel = providerForApi()
  if (previewMode.value && isSoraModel.value) {
    return `${backendModel}-preview`
  }
  return backendModel
}

watch(actualModel, () => {
  const cfg = modelConfig.value
  // 切换模型时重置表单模式和模型专属参数，避免携带上一模型的脏数据
  inputMode.value = cfg.inputModes[0] ?? 'text'
  if (!cfg.supportsPreview) {
    previewMode.value = false
    selectedResolution.value = 'standard'
  }
  const validRatios = ratioOptions.value.map(r => r.value)
  if (showRatio.value && validRatios.length) {
    selectedRatio.value = validRatios[0] ?? '16:9'
  }
  const allowedDurations = previewMode.value && cfg.previewDurations?.length ? cfg.previewDurations : cfg.durations
  if (showDuration.value && allowedDurations.length) {
    form.value.duration = allowedDurations[0]
  }
  while (refImages.value.length > (cfg.maxRefImages || 0)) {
    const target = refImages.value.pop()
    if (target) URL.revokeObjectURL(target.url)
  }
  if (actualModel.value !== 'kling-v2-6-image2video') clearKlingV26TailFrame()
  // 重置各模型专属选项
  klingMode.value = 'pro'
  klingSound.value = false
  kling26Sound.value = false
  motionResolution.value = '720p'
  motionOrientation.value = 'image'
  seedanceResolution.value = '720p'
  seedanceFixedLens.value = false
  seedanceGenerateAudio.value = false
  viduq2Resolution.value = '720p'
  viduq2Audio.value = false
  viduq2Watermark.value = false
  viduq2Seed.value = 0
  viduq2ProMovementAmplitude.value = 'auto'
  viduq2ProBgm.value = false
  viduq2ProWmPosition.value = 3
  viduq2ProWmUrl.value = ''
  klingV26Sound.value = 'off'
  klingV26NegativePrompt.value = ''
  hailuoResolution.value = '768P'
  hailuoPromptOptimizer.value = true
  hailuoFastPretreatment.value = false
  hailuoAigcWatermark.value = false
  doubaoResolution.value = '720p'
  doubaoGenerateAudio.value = true
  doubaoCameraFixed.value = false
  doubaoWatermark.value = false
  doubaoSeed.value = -1
}, { immediate: true })

watch(
  () => form.value.duration,
  (d) => {
    if (!isHailuoModel.value) return
    // 10 秒时只允许 768P，自动矫正分辨率
    if (d === 10 && hailuoResolution.value === '1080P') {
      hailuoResolution.value = '768P'
    }
  },
)

watch(selectedKling26SubModel, (next, prev) => {
  if (!next || next === prev) return
  if (next === 'kling-2/text-to-video') {
    inputMode.value = 'text'
    selectedRatio.value = '16:9'
    form.value.duration = 5
    kling26Sound.value = false
  } else if (next === 'kling-2/image-to-video') {
    inputMode.value = 'ref'
    form.value.duration = 5
    kling26Sound.value = false
  } else if (next === 'kling-2/motion-control') {
    inputMode.value = 'motion'
    motionResolution.value = '720p'
    motionOrientation.value = 'image'
  }
})

watch(previewMode, () => {
  const allowedDurations = durationOptions.value
  form.value.duration = allowedDurations[0]
  if (!previewMode.value) {
    selectedResolution.value = 'standard'
  }
})

/* === 轮询 === */
let poll: ReturnType<typeof setInterval> | null = null
let pollIntervalMs = 3000
let unsubRealtime: (() => void) | null = null
const hasPending = computed(() => myTasks.value.some(t => t.status === 'pending' || t.status === 'processing'))
async function pollOnce() {
  if (!hasPending.value) return
  const ids = myTasks.value
    .filter((x) => x.status === 'pending' || x.status === 'processing')
    .map((x) => x.id)
  if (ids.length === 0) return
  try {
    const { data } = await getTasksStatusBatch(ids)
    const list = Array.isArray(data) ? data : []
    for (const u of list) {
      const i = myTasks.value.findIndex((x) => x.id === u.id)
      if (i < 0) continue
      const cur = myTasks.value[i]!
      const curTerminal = cur.status === 'failed' || cur.status === 'completed' || cur.status === 'done'
      const serverTerminal = u.status === 'failed' || u.status === 'completed' || u.status === 'done'
      if (!curTerminal || serverTerminal) myTasks.value[i] = { ...cur, ...u }
    }
  } catch { }
}
function startPoll() {
  if (poll) return
  pollIntervalMs = realtimeConnected.value ? 5000 : 3000
  poll = setInterval(() => {
    if (document.visibilityState === 'hidden') return
    if (!hasPending.value) { stopPoll(); return }
    pollOnce()
  }, pollIntervalMs)
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null } }
watch(hasPending, v => v ? startPoll() : stopPoll())
watch(activeTab, t => t === 'create' ? fetchMy() : fetchGal())
onMounted(() => {
  fetchMy()
  fetchVideoModelPoints()
  unsubRealtime = onTaskEvent((e) => {
    if (e.module !== 'video') return
    const idx = myTasks.value.findIndex((t) => t.id === e.taskId)
    if (idx < 0) return
    const prev = myTasks.value[idx]!
    const curTerminal = prev.status === 'failed' || prev.status === 'completed' || prev.status === 'done'
    const incomingTerminal = e.status === 'failed' || e.status === 'completed' || e.status === 'done'
    if (curTerminal && !incomingTerminal && e.type === 'task.updated') {
      return
    }
    const nextStatus = (curTerminal && !incomingTerminal) ? prev.status : ((e.status as VideoTask['status']) || prev.status)
    myTasks.value[idx] = {
      ...prev,
      status: nextStatus,
      progress: typeof e.progress === 'number' ? e.progress : prev.progress,
      errorMessage: (e.errorMessage ?? prev.errorMessage ?? undefined) as VideoTask['errorMessage'],
      videoUrl: e.videoUrl ?? prev.videoUrl,
      resultUrl: e.videoUrl ?? prev.resultUrl,
    }
    if (e.type === 'task.failed' || e.type === 'task.completed') {
      getTasksStatusBatch([e.taskId]).then(({ data }) => {
        const list = Array.isArray(data) ? data : []
        const u = list.find((x: VideoTask) => x.id === e.taskId)
        if (u && (u.status === 'failed' || u.status === 'completed' || u.status === 'done')) {
          const i = myTasks.value.findIndex((t) => t.id === e.taskId)
          if (i >= 0) myTasks.value[i] = { ...myTasks.value[i], ...u }
        }
      }).catch(() => { })
    }
  })
})
onUnmounted(() => {
  stopPoll()
  unsubRealtime?.()
  unsubRealtime = null
})

watch(realtimeConnected, (connected) => {
  if (connected) {
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length) {
      getTasksStatusBatch(ids)
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : []
          for (const u of list) {
            const i = myTasks.value.findIndex((x) => x.id === u.id)
            if (i < 0) continue
            const cur = myTasks.value[i]!
            const curTerminal = cur.status === 'failed' || cur.status === 'completed' || cur.status === 'done'
            const serverTerminal = u.status === 'failed' || u.status === 'completed' || u.status === 'done'
            if (!curTerminal || serverTerminal) myTasks.value[i] = { ...cur, ...u }
          }
        })
        .catch(() => { })
    }
    if (hasPending.value) startPoll()
  } else if (hasPending.value) startPoll()
})

async function fetchMy() { myLoading.value = true; try { const { data } = await getMyTasks(myPage.value, 12); myTasks.value = data?.list ?? []; myTotal.value = data?.total ?? 0 } catch { myTasks.value = [] } finally { myLoading.value = false } }
async function fetchGal() { galLoading.value = true; try { const { data } = await getGallery(galPage.value, 20); gallery.value = data?.list ?? []; galTotal.value = data?.total ?? 0 } catch { gallery.value = [] } finally { galLoading.value = false } }

async function uploadImageAndGetUrl(file: File) {
  const { data } = await uploadFile(file)
  return data.url.startsWith('http')
    ? data.url
    : `${window.location.origin}${data.url.startsWith('/') ? data.url : `/${data.url}`}`
}

async function uploadVideoAndGetUrl(file: File) {
  const { data } = await uploadFile(file)
  return data.url.startsWith('http')
    ? data.url
    : `${window.location.origin}${data.url.startsWith('/') ? data.url : `/${data.url}`}`
}

async function handleGenerate() {
  if (!form.value.prompt?.trim()) { Message.warning('请输入提示词'); return }
  if (inputMode.value === 'frame' && !canUseFrameMode.value) { Message.warning('当前模型不支持首尾帧模式'); return }
  if (inputMode.value === 'ref' && !canUseRefMode.value) { Message.warning('当前模型不支持参考图模式'); return }
  if (inputMode.value === 'frame' && !firstFrameFile.value) { Message.warning('请先上传首帧图片'); return }
  if (inputMode.value === 'ref' && refImages.value.length === 0) { Message.warning('请至少上传一张参考图'); return }
  if (inputMode.value === 'motion') {
    if (!motionRoleImage.value) { Message.warning('请先上传角色图'); return }
    if (!motionVideoFile.value) { Message.warning('请先上传动作视频'); return }
  }
  generating.value = true
  uploading.value = true
  try {
    const currentModel = modelForApi()
    const params: Record<string, unknown> = {
      // 模型
      model: currentModel,
      // 输入模式
      inputMode: inputMode.value,
    }
    // 时长
    if (showDuration.value) {
      params.duration = form.value.duration ?? durationOptions.value[0]
    }
    // 比例
    if (showRatio.value) {
      params.aspectRatio = selectedRatio.value
    }
    // 提供者
    const payload: CreateVideoTaskData = {
      // 提供者
      provider: providerForApi(),
      // 任务类型
      taskType: taskMode.value,
      // 提示词
      prompt: form.value.prompt.trim(),
      // 参数
      params,
    }
    if (previewMode.value && currentModel === 'sora-2-pro-preview') {
      ; (payload.params as Record<string, unknown>).resolution = selectedResolution.value
    }
    if (isKlingModel.value) {
      ; (payload.params as Record<string, unknown>).klingMode = klingMode.value
        ; (payload.params as Record<string, unknown>).sound = klingSound.value
    }
    if (showKling26Sound.value) {
      ; (payload.params as Record<string, unknown>).sound = kling26Sound.value
    }
    if (isKling26Motion.value) {
      ; (payload.params as Record<string, unknown>).mode = motionResolution.value
        ; (payload.params as Record<string, unknown>).character_orientation = motionOrientation.value
    }
    if (isSeedanceModel.value) {
      ; (payload.params as Record<string, unknown>).resolution = seedanceResolution.value
        ; (payload.params as Record<string, unknown>).fixed_lens = seedanceFixedLens.value
        ; (payload.params as Record<string, unknown>).generate_audio = seedanceGenerateAudio.value
    }
    if (isHailuoModel.value) {
      const p = payload.params as Record<string, unknown>
      p.resolution = hailuoResolution.value
      p.prompt_optimizer = hailuoPromptOptimizer.value
      p.fast_pretreatment = hailuoFastPretreatment.value
      p.aigc_watermark = hailuoAigcWatermark.value
    }
    if (isDoubaoSeedanceModel.value) {
      const p = payload.params as Record<string, unknown>
      p.resolution = doubaoResolution.value
      p.generate_audio = doubaoGenerateAudio.value
      p.camera_fixed = doubaoCameraFixed.value
      p.watermark = doubaoWatermark.value
      p.seed = doubaoSeed.value
      // ratio 直接使用当前 selectedRatio，符合文档中 ratio 可选值的一部分
      p.ratio = selectedRatio.value
    }
    // Vidu Q2 CTV 专属
    if (isViduq2CtvModel.value) {
      const p = payload.params as Record<string, unknown>
      // 分辨率
      p.resolution = viduq2Resolution.value
      // 生成音频
      p.audio = viduq2Audio.value
      // 添加水印
      p.watermark = viduq2Watermark.value
      // 随机种子
      p.seed = viduq2Seed.value || 0
    }
    // Vidu Q2 Pro 专属（首尾帧）
    if (isViduq2ProModel.value) {
      const p = payload.params as Record<string, unknown>
      p.resolution = viduq2Resolution.value
      p.watermark = viduq2Watermark.value
      p.seed = viduq2Seed.value || 0
      p.movement_amplitude = viduq2ProMovementAmplitude.value
      p.bgm = viduq2ProBgm.value
      p.wm_position = viduq2ProWmPosition.value
      if (viduq2ProWmUrl.value?.trim()) p.wm_url = viduq2ProWmUrl.value.trim()
    }
    if (isKlingV26Text2VideoModel.value) {
      const p = payload.params as Record<string, unknown>
      p.mode = 'pro'
      p.sound = klingV26Sound.value
      p.aspectRatio = selectedRatio.value
      p.duration = form.value.duration ?? 5
      if (klingV26NegativePrompt.value?.trim()) p.negative_prompt = klingV26NegativePrompt.value.trim()
    }
    if (isKlingV26Image2VideoModel.value) {
      const p = payload.params as Record<string, unknown>
      p.sound = klingV26Sound.value
      p.aspectRatio = selectedRatio.value
      p.duration = form.value.duration ?? 5
      if (klingV26NegativePrompt.value?.trim()) p.negative_prompt = klingV26NegativePrompt.value.trim()
    }
    if (taskMode.value === 'img2video') {
      if (inputMode.value === 'frame') {
        payload.imageUrl = await uploadImageAndGetUrl(firstFrameFile.value!.file)
        if (lastFrameFile.value) {
          ; (payload.params as Record<string, unknown>).lastFrameUrl = await uploadImageAndGetUrl(lastFrameFile.value.file)
        }
      } else if (inputMode.value === 'ref') {
        const urls = await Promise.all(refImages.value.map((r) => uploadImageAndGetUrl(r.file)))
        payload.imageUrl = urls[0]
        ;(payload.params as Record<string, unknown>).urls = urls.slice(0, maxRef.value)
        if (isKlingV26Image2VideoModel.value && klingV26TailFrameFile.value) {
          ;(payload.params as Record<string, unknown>).image_tail = await uploadImageAndGetUrl(klingV26TailFrameFile.value.file)
        }
      } else if (inputMode.value === 'motion') {
        payload.imageUrl = await uploadImageAndGetUrl(motionRoleImage.value!.file)
          ; (payload.params as Record<string, unknown>).motionVideoUrl = await uploadVideoAndGetUrl(motionVideoFile.value!.file)
      }
    }

    uploading.value = false
    const { data } = await createVideoTask(payload)
    if (data) { myTasks.value.unshift(data); Message.success('任务已提交'); startPoll() }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的描述包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '创建失败')
    }
  } finally { generating.value = false; uploading.value = false }
}

function isDone(s: string) { return s === 'done' || s === 'completed' }
function sText(s: string) { return ({ pending: '排队中', processing: '生成中', done: '已完成', completed: '已完成', failed: '失败' } as Record<string, string>)[s] ?? s }
function sColor(s: string) { return ({ pending: '#6B7785', processing: '#FF7D00', done: '#00B42A', completed: '#00B42A', failed: '#F53F3F' } as Record<string, string>)[s] ?? '#6B7785' }
function thumb(t: VideoTask) { return t.thumbnailUrl || t.videoUrl || t.resultUrl || '' }
function stepIdx(t: VideoTask) { if (isDone(t.status)) return 3; if (t.status === 'failed') return -1; const p = t.progress ?? 0; return p < 30 ? 1 : 2 }
function videoStageText(t: VideoTask) {
  if (t.status === 'pending') return '正在初始化视频任务'
  const p = t.progress ?? 0
  if (p < 30) return '正在生成关键帧'
  if (p < 75) return '正在渲染视频画面'
  return '正在编码导出结果'
}
function openPreview(url: string, task?: VideoTask | null) {
  previewUrl.value = url
  previewTask.value = task ?? null
  previewOpen.value = true
  nextTick(() => {
    const el = previewVideoRef.value
    if (el) {
      el.muted = false
      el.play().catch(() => { })
    }
  })
}
function copyPrompt(p: string) { navigator.clipboard.writeText(p).then(() => Message.success('已复制')) }
function formatTaskParams(task?: VideoTask | null) {
  return JSON.stringify(((task as any)?.params ?? {}), null, 2)
}

async function handleRetry(task: VideoTask) {
  if (task.status !== 'failed' || retryingId.value) return
  retryingId.value = task.id
  try {
    const { data } = await retryVideoTask(task.id)
    if (data) {
      myTasks.value = myTasks.value.filter((t) => t.id !== task.id)
      myTasks.value.unshift(data)
      Message.success('已重新生成')
      startPoll()
    }
  } catch {
    Message.error('重试失败')
  } finally {
    retryingId.value = null
  }
}

function handleDeleteTask(task: VideoTask) {
  Modal.confirm({
    title: '删除任务',
    content: '确定删除这个视频任务吗？',
    onOk: async () => {
      try {
        const beforeCount = myTasks.value.length
        await deleteVideoTask(task.id)
        // 如果当前页只剩这一条且不是第一页，删完后回退一页再拉取
        const wasLastOnPage = beforeCount === 1 && myPage.value > 1
        if (wasLastOnPage) {
          myPage.value = myPage.value - 1
        }
        await fetchMy()
        if (previewTask.value?.id === task.id) {
          previewOpen.value = false
          previewTask.value = null
        }
        Message.success('已删除')
      } catch {
        Message.error('删除失败')
      }
    },
  })
}
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">视频创作</h1>
        <p class="page-desc">用文字或图片生成高质量 人工智能 视频</p>
      </div>
      <div class="tab-group">
        <button v-for="t in [{ k: 'create', l: '创作' }, { k: 'gallery', l: '广场' }]" :key="t.k" class="tab-btn"
          :class="{ active: activeTab === t.k }" @click="activeTab = t.k">{{ t.l }}</button>
      </div>
    </header>

    <!-- ===== 创作 ===== -->
    <div v-show="activeTab === 'create'" class="create-area">
      <aside class="form-panel">
        <!-- 模型下拉 -->
        <section class="fg">
          <label class="fl">模型</label>
          <a-select v-model="selectedModel" class="w-full">
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

        <section v-if="showKling26SubSelect" class="fg">
          <label class="fl">子模型</label>
          <a-select v-model="selectedKling26SubModel" class="w-full">
            <a-option v-for="sm in kling26SubModels" :key="sm.value" :value="sm.value" :label="sm.label">
              <div class="ui-option">
                <span class="ui-option-dot kling-dot" />
                <div class="ui-option-main">
                  <div class="ui-option-header">
                    <span class="ui-option-title">{{ sm.label }}</span>
                  </div>
                  <span class="ui-option-desc">{{ sm.desc }}</span>
                </div>
              </div>
            </a-option>
          </a-select>
        </section>

        <!-- 输入方式切换：纯文字 / 首尾帧 / 参考图 / 动作控制 -->
        <section class="fg">
          <label class="fl">输入方式</label>
          <div class="mode-toggle">
            <button v-for="mode in availableInputModes" :key="mode" class="mode-btn"
              :class="{ active: inputMode === mode }" @click="inputMode = mode">
              {{ inputModeLabels[mode] }}
            </button>
          </div>
        </section>

        <!-- 首帧 + 尾帧（frame 模式）-->
        <section v-if="inputMode === 'frame' && canUseFrameMode" class="fg">
          <label class="fl">首帧图片 <span class="fl-hint">必选</span></label>
          <div v-if="firstFrameFile" class="frame-preview">
            <img :src="firstFrameFile.url" />
            <button class="frame-clear" aria-label="清除首帧" @click="clearFrame('first')">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleFirstFrameDrop" @click="firstFrameInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传首帧</span>
            <span class="dz-hint">视频起始画面，必填</span>
          </div>
          <input ref="firstFrameInputRef" type="file" accept="image/*" class="hidden-input"
            @change="pickFrame('first', $event)" />

          <label class="fl mt-12">尾帧图片 <span class="fl-hint">可选，需搭配首帧</span></label>
          <div v-if="lastFrameFile" class="frame-preview">
            <img :src="lastFrameFile.url" />
            <button class="frame-clear" aria-label="清除尾帧" @click="clearFrame('last')">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleLastFrameDrop" @click="lastFrameInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传尾帧</span>
            <span class="dz-hint">可选，视频结束画面</span>
          </div>
          <input ref="lastFrameInputRef" type="file" accept="image/*" class="hidden-input"
            @change="pickFrame('last', $event)" />
        </section>

        <!-- 参考图（非 Kling v2.6 图生 / 非 Hailuo / 非 Doubao 时，多图小缩略图模式） -->
        <section
          v-if="inputMode === 'ref' && canUseRefMode && !isKlingV26Image2VideoModel && !isHailuoModel && !isDoubaoSeedanceModel"
          class="fg"
        >
          <div class="fl-row">
            <label class="fl">参考图</label>
            <span class="fl-count">{{ refImages.length }}/{{ maxRef }}</span>
          </div>
          <div v-if="refImages.length > 0" class="ref-grid">
            <div v-for="r in refImages" :key="r.id" class="ref-item">
              <img :src="r.url" />
              <button class="ref-del" @click="removeRef(r.id)">
                <IconClose :size="10" />
              </button>
            </div>
            <button v-if="refImages.length < maxRef" class="ref-add" @click="refInputRef?.click()">
              <IconPlus :size="22" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleRefDrop" @click="refInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传参考图</span>
            <span class="dz-hint">最多 {{ maxRef }} 张，不可与首尾帧同时使用</span>
          </div>
          <input ref="refInputRef" type="file" accept="image/*" multiple class="hidden-input"
            @change="handleRefSelect" />
        </section>

        <!-- Kling v2.6 图生视频：首帧 + 尾帧（与上方首尾帧模式同款文案与布局） -->
        <section v-if="isKlingV26Image2VideoModel && inputMode === 'ref'" class="fg">
          <label class="fl">首帧图片 <span class="fl-hint">必选</span></label>
          <div v-if="refImages.length > 0" class="frame-preview">
            <img :src="refImages[0]!.url" />
            <button class="frame-clear" aria-label="清除首帧" @click="removeRef(refImages[0]!.id)">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleKlingV26FirstDrop" @click="refInputRefKlingV26?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传首帧</span>
            <span class="dz-hint">视频起始画面，必填</span>
          </div>
          <input ref="refInputRefKlingV26" type="file" accept="image/*" class="hidden-input"
            @change="handleRefSelect" />

          <label class="fl mt-12">尾帧图 <span class="fl-hint">可选，需搭配首帧</span></label>
          <div v-if="klingV26TailFrameFile" class="frame-preview">
            <img :src="klingV26TailFrameFile.url" />
            <button class="frame-clear" aria-label="清除尾帧" @click="clearKlingV26TailFrame">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleKlingV26TailDrop" @click="klingV26TailFrameInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传尾帧</span>
            <span class="dz-hint">可选，视频结束画面</span>
          </div>
          <input ref="klingV26TailFrameInputRef" type="file" accept="image/*" class="hidden-input"
            @change="pickKlingV26TailFrame" />
        </section>

        <!-- Hailuo 2.3 图生视频：单图大预览（首帧 / 参考图二合一，只允许 1 张） -->
        <section v-if="isHailuoModel && inputMode === 'ref'" class="fg">
          <label class="fl">参考图 <span class="fl-hint">必选</span></label>
          <div v-if="refImages.length > 0" class="frame-preview">
            <img :src="refImages[0]!.url" />
            <button class="frame-clear" aria-label="清除参考图" @click="removeRef(refImages[0]!.id)">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleRefDrop" @click="refInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传参考图</span>
            <span class="dz-hint">视频起始画面，必填，仅 1 张</span>
          </div>
          <input ref="refInputRef" type="file" accept="image/*" class="hidden-input"
            @change="handleRefSelect" />
        </section>

        <!-- Doubao Seedance 图生视频：单图大预览（首帧参考图 + 文本，仅 1 张） -->
        <section v-if="isDoubaoSeedanceModel && actualModel === 'doubao-seedance-image' && inputMode === 'ref'"
          class="fg">
          <label class="fl">参考图 <span class="fl-hint">必选</span></label>
          <div v-if="refImages.length > 0" class="frame-preview">
            <img :src="refImages[0]!.url" />
            <button class="frame-clear" aria-label="清除参考图" @click="removeRef(refImages[0]!.id)">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleRefDrop" @click="refInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传参考图</span>
            <span class="dz-hint">首帧参考图，必填，仅 1 张</span>
          </div>
          <input ref="refInputRef" type="file" accept="image/*" class="hidden-input"
            @change="handleRefSelect" />
        </section>

        <!-- 动作控制：角色图 + 动作视频 -->
        <section v-if="inputMode === 'motion'" class="fg">
          <label class="fl">角色图 <span class="fl-hint">必选</span></label>
          <div v-if="motionRoleImage" class="frame-preview">
            <img :src="motionRoleImage.url" />
            <button class="frame-clear" @click="clearMotionImage">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleMotionRoleDrop" @click="motionRoleInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传角色图</span>
            <span class="dz-hint">必选</span>
          </div>
          <input ref="motionRoleInputRef" type="file" accept="image/*" class="hidden-input"
            @change="pickMotionImage($event)" />

          <label class="fl mt-12">动作视频 <span class="fl-hint">必选</span></label>
          <div v-if="motionVideoFile" class="frame-preview">
            <video :src="motionVideoFile.url" muted preload="metadata" />
            <button class="frame-clear" aria-label="清除动作视频" @click="clearMotionVideo">
              <IconClose :size="10" />
            </button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleMotionVideoDrop" @click="motionVideoInputRef?.click()">
            <IconPlus :size="44" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传动作视频</span>
            <span class="dz-hint">必选</span>
          </div>
          <input ref="motionVideoInputRef" type="file" accept="video/*" class="hidden-input"
            @change="pickMotionVideo($event)" />
        </section>

        <!-- 提示词 -->
        <section class="fg">
          <label class="fl">提示词</label>
          <a-textarea v-model="form.prompt" :auto-size="{ minRows: 4, maxRows: 8 }" placeholder="描述你想生成的视频内容..." />
        </section>

        <!-- 画面比例 -->
        <section v-if="showRatio" class="fg">
          <label class="fl">画面比例</label>
          <div class="dur-row">
            <button v-for="r in ratioOptions" :key="r.value" class="dur-btn"
              :class="{ active: selectedRatio === r.value }" @click="selectedRatio = r.value">
              <span class="ratio-outline" :style="ratioPreviewStyle(r.value)" />
              {{ r.label }}
            </button>
          </div>
        </section>

        <section v-if="isSeedanceModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in seedanceResolutionOptions" :key="r.value" class="dur-btn"
              :class="{ active: seedanceResolution === r.value }" @click="seedanceResolution = r.value">
              {{ r.label }}
            </button>
          </div>
        </section>

        <section v-if="isHailuoModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in hailuoResolutionOptions" :key="r" class="dur-btn"
              :class="{ active: hailuoResolution === r }" @click="hailuoResolution = r">
              {{ r }}
            </button>
          </div>
        </section>
        <section v-if="isHailuoModel" class="fg">
          <label class="fl">Prompt 优化</label>
          <a-switch v-model="hailuoPromptOptimizer" />
          <span class="fl-hint state-hint">{{ hailuoPromptOptimizer ? '开启（默认）' : '关闭' }}</span>
        </section>
        <section v-if="isHailuoModel" class="fg">
          <label class="fl">快速预处理</label>
          <a-switch v-model="hailuoFastPretreatment" />
          <span class="fl-hint state-hint">{{ hailuoFastPretreatment ? '开启' : '关闭（默认）' }}</span>
        </section>
        <section v-if="isHailuoModel" class="fg">
          <label class="fl">AIGC 水印</label>
          <a-switch v-model="hailuoAigcWatermark" />
          <span class="fl-hint state-hint">{{ hailuoAigcWatermark ? '添加水印' : '不添加（默认）' }}</span>
        </section>

        <!-- Doubao Seedance 1.5 Pro 专属 -->
        <section v-if="isDoubaoSeedanceModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in ['480p', '720p', '1080p']" :key="r" class="dur-btn"
              :class="{ active: doubaoResolution === r }"
              @click="doubaoResolution = r as '480p' | '720p' | '1080p'">
              {{ r }}
            </button>
          </div>
        </section>
        <section v-if="isDoubaoSeedanceModel" class="fg">
          <label class="fl">生成音频</label>
          <a-switch v-model="doubaoGenerateAudio" />
          <span class="fl-hint state-hint">{{ doubaoGenerateAudio ? '开启（默认）' : '关闭' }}</span>
        </section>
        <section v-if="isDoubaoSeedanceModel" class="fg">
          <label class="fl">固定镜头</label>
          <a-switch v-model="doubaoCameraFixed" />
          <span class="fl-hint state-hint">{{ doubaoCameraFixed ? '固定' : '不固定（默认）' }}</span>
        </section>
        <section v-if="isDoubaoSeedanceModel" class="fg">
          <label class="fl">水印</label>
          <a-switch v-model="doubaoWatermark" />
          <span class="fl-hint state-hint">{{ doubaoWatermark ? '添加水印' : '不添加（默认）' }}</span>
        </section>
        <section v-if="isDoubaoSeedanceModel" class="fg">
          <label class="fl">随机种子</label>
          <a-input-number v-model="doubaoSeed" :min="-1" placeholder="-1 表示随机" class="w-full" />
        </section>

        <section v-if="showDuration" class="fg">
          <label class="fl">视频时长</label>
          <div class="dur-row dur-row-grid">
            <button v-for="d in durationOptions" :key="d" class="dur-btn" :class="{ active: form.duration === d }"
              @click="form.duration = d">
              {{ d }} 秒
            </button>
          </div>
        </section>

        <section v-if="isSeedanceModel" class="fg">
          <label class="fl">固定镜头</label>
          <a-switch v-model="seedanceFixedLens" />
        </section>
        <section v-if="isSeedanceModel" class="fg">
          <label class="fl">生成音频</label>
          <a-switch v-model="seedanceGenerateAudio" />
        </section>

        <section v-if="showKling26Sound" class="fg">
          <label class="fl">生成音效</label>
          <a-switch v-model="kling26Sound" />
          <span class="fl-hint state-hint">{{ kling26Sound ? '开启' : '关闭' }}</span>
        </section>

        <section v-if="isKling26Motion" class="fg">
          <label class="fl">输出分辨率</label>
          <div class="dur-row">
            <button class="dur-btn" :class="{ active: motionResolution === '480p' }"
              @click="motionResolution = '480p'">480p</button>
            <button class="dur-btn" :class="{ active: motionResolution === '720p' }"
              @click="motionResolution = '720p'">720p</button>
            <button class="dur-btn" :class="{ active: motionResolution === '1080p' }"
              @click="motionResolution = '1080p'">1080p</button>
          </div>
        </section>
        <section v-if="isKling26Motion" class="fg">
          <label class="fl">角色朝向</label>
          <div class="dur-row">
            <button class="dur-btn" :class="{ active: motionOrientation === 'image' }"
              @click="motionOrientation = 'image'">image</button>
            <button class="dur-btn" :class="{ active: motionOrientation === 'video' }"
              @click="motionOrientation = 'video'">video</button>
            <button class="dur-btn" :class="{ active: motionOrientation === 'auto' }"
              @click="motionOrientation = 'auto'">auto</button>
          </div>
        </section>

        <!-- Kling 3.0 专属选项 -->
        <section v-if="isKlingModel" class="fg">
          <label class="fl">画质模式</label>
          <div class="dur-row">
            <button class="dur-btn" :class="{ active: klingMode === 'std' }" @click="klingMode = 'std'">标准
              (std)</button>
            <button class="dur-btn" :class="{ active: klingMode === 'pro' }" @click="klingMode = 'pro'">高清
              (pro)</button>
          </div>
        </section>
        <section v-if="isKlingModel" class="fg">
          <label class="fl">音效</label>
          <a-switch v-model="klingSound" />
          <span class="fl-hint state-hint">{{ klingSound ? '开启' : '关闭' }}</span>
        </section>

        <!-- Vidu Q2 CTV 专属 -->
        <section v-if="isViduq2CtvModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in ['540p', '720p', '1080p']" :key="r" class="dur-btn"
              :class="{ active: viduq2Resolution === r }" @click="viduq2Resolution = r as '540p' | '720p' | '1080p'">
              {{ r }}
            </button>
          </div>
        </section>
        <section v-if="isViduq2CtvModel" class="fg">
          <label class="fl">生成音频</label>
          <a-switch v-model="viduq2Audio" />
          <span class="fl-hint state-hint">{{ viduq2Audio ? '开启' : '关闭' }}</span>
        </section>
        <section v-if="isViduq2CtvModel" class="fg">
          <label class="fl">添加水印</label>
          <a-switch v-model="viduq2Watermark" />
          <span class="fl-hint state-hint">{{ viduq2Watermark ? '开启' : '关闭' }}</span>
        </section>
        <section v-if="isViduq2CtvModel" class="fg">
          <label class="fl">随机种子</label>
          <a-input-number v-model="viduq2Seed" :min="0" placeholder="0 表示随机" class="w-full" />
        </section>

        <!-- Vidu Q2 Pro 专属：首尾帧 -->
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in ['540p', '720p', '1080p']" :key="r" class="dur-btn"
              :class="{ active: viduq2Resolution === r }" @click="viduq2Resolution = r as '540p' | '720p' | '1080p'">
              {{ r }}
            </button>
          </div>
        </section>
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">运动幅度</label>
          <a-select v-model="viduq2ProMovementAmplitude" class="w-full">
            <a-option value="auto">auto</a-option>
            <a-option value="small">small</a-option>
            <a-option value="medium">medium</a-option>
            <a-option value="large">large</a-option>
          </a-select>
        </section>
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">BGM</label>
          <a-switch v-model="viduq2ProBgm" />
          <span class="fl-hint state-hint">{{ viduq2ProBgm ? '开启' : '关闭' }}</span>
        </section>
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">添加水印</label>
          <a-switch v-model="viduq2Watermark" />
          <span class="fl-hint state-hint">{{ viduq2Watermark ? '开启' : '关闭' }}</span>
        </section>
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">水印位置</label>
          <a-select v-model="viduq2ProWmPosition" class="w-full">
            <a-option :value="1">左上</a-option>
            <a-option :value="2">右上</a-option>
            <a-option :value="3">左下</a-option>
            <a-option :value="4">右下</a-option>
          </a-select>
        </section>
        <section v-if="isViduq2ProModel" class="fg">
          <label class="fl">随机种子</label>
          <a-input-number v-model="viduq2Seed" :min="0" placeholder="0 表示随机" class="w-full" />
        </section>

        <!-- Kling v2.6 文生/图生视频（DMX，与 Kling 2 无关） -->
        <section v-if="isKlingV26Text2VideoModel || isKlingV26Image2VideoModel" class="fg">
          <label class="fl">音效</label>
          <a-select v-model="klingV26Sound" class="w-full">
            <a-option value="off">关闭</a-option>
            <a-option value="on">开启</a-option>
          </a-select>
        </section>
        <section v-if="isKlingV26Text2VideoModel || isKlingV26Image2VideoModel" class="fg">
          <label class="fl">负向提示词</label>
          <a-textarea v-model="klingV26NegativePrompt" placeholder="可选，不希望出现的内容" :max-length="2500" show-word-limit
            class="w-full" />
        </section>

        <section v-if="modelConfig.supportsPreview" class="fg">
          <label class="fl">预览模式</label>
          <a-switch v-model="previewMode" />
        </section>

        <section v-if="previewMode && modelConfig.supportsPreviewResolution" class="fg">
          <label class="fl">预览分辨率</label>
          <a-select v-model="selectedResolution" class="w-full">
            <a-option value="standard">standard</a-option>
            <a-option value="high">high</a-option>
          </a-select>
        </section>

        <!-- 模型提示 -->
        <div class="model-hint">
          <span class="hint-dot" />
          {{ modelConfig.hint }}
        </div>

        <div v-if="missingHints.length" class="form-warn">
          <div class="warn-title">请补充以下必填项</div>
          <ul class="warn-list">
            <li v-for="(h, idx) in missingHints" :key="idx">{{ h }}</li>
          </ul>
        </div>

        <!-- 生成按钮 -->
        <div class="form-actions">
          <GenerateButton :loading="generating || uploading" :disabled="!form.prompt?.trim()" text="开始生成"
            :loading-text="uploading ? '上传素材中...' : '生成中...'" @click="handleGenerate" />
        </div>
      </aside>

      <!-- 右侧作品 -->
      <section class="works">
        <div class="works-head">
          <h3 class="works-title">我的视频</h3><span v-if="myTotal > 0" class="badge">{{ myTotal }}</span>
        </div>
        <a-spin :loading="myLoading" class="works-spin">
          <div v-if="myTasks.length > 0" class="works-grid">
            <div
              v-for="t in myTasks"
              :key="t.id"
              class="vcard"
              @click="isDone(t.status) && (t.videoUrl || t.resultUrl) ? openPreview((t.videoUrl || t.resultUrl) as string, t) : null"
            >
              <div class="vcard-media">
                <button class="vcard-del" title="删除该视频" @click.stop="handleDeleteTask(t)">
                  <IconDelete :size="14" />
                </button>
                <video
                  v-if="(t.videoUrl || t.resultUrl) && isDone(t.status)"
                  :src="(t.videoUrl || t.resultUrl) as string"
                  muted
                  loop
                  preload="metadata"
                  class="vcard-video"
                  @mouseenter="($event.target as HTMLVideoElement)?.play()"
                  @mouseleave="($event.target as HTMLVideoElement)?.pause()"
                />
                <img v-else-if="thumb(t)" :src="thumb(t)" class="vcard-thumb" />
                <div v-else class="vcard-ph">
                  <IconVideoCamera :size="28" class="placeholder-icon" />
                </div>
                <!-- 进度步骤 -->
                <div v-if="t.status === 'processing' || t.status === 'pending'" class="step-ov">
                  <div class="step-stage">{{ videoStageText(t) }}</div>
                  <div class="steps">
                    <div class="st" :class="{ on: stepIdx(t) >= 1 }"><span class="st-dot" />生成</div>
                    <div class="st-line" :class="{ on: stepIdx(t) >= 2 }" />
                    <div class="st" :class="{ on: stepIdx(t) >= 2 }"><span class="st-dot" />渲染</div>
                    <div class="st-line" :class="{ on: stepIdx(t) >= 3 }" />
                    <div class="st" :class="{ on: stepIdx(t) >= 3 }"><span class="st-dot" />完成</div>
                  </div>
                  <span class="st-pct">{{ t.progress ?? 0 }}%</span>
                  <div class="st-progress">
                    <div class="st-progress-fill" :style="{ width: `${t.progress ?? 0}%` }" />
                  </div>
                  <div class="st-dots"><span /><span /><span /></div>
                </div>
                <span class="sbadge" :style="{ background: sColor(t.status) }">{{ sText(t.status) }}</span>
                <div v-if="isDone(t.status)" class="play-ov">
                  <IconPlayArrowFill :size="36" />
                </div>
              </div>
              <p class="vcard-prompt">{{ t.prompt || '无描述' }}</p>
              <p v-if="t.status === 'failed' && t.errorMessage" class="vcard-error" :title="t.errorMessage"
                @click.stop="Modal.error({ title: '错误详情', content: t.errorMessage, okText: '关闭', maskClosable: true, closable: true })">
                {{ t.errorMessage }}</p>
              <div class="vcard-actions">
                <WorkCardActionButton v-if="t.status === 'failed'" title="重试" :disabled="retryingId === t.id"
                  @click="handleRetry(t)">
                  <IconRefresh />
                </WorkCardActionButton>
                <WorkCardActionButton danger title="删除" @click="handleDeleteTask(t)">
                  <IconDelete />
                </WorkCardActionButton>
              </div>
            </div>
          </div>
          <div v-else-if="!myLoading" class="works-empty">
            <EmptyState title="暂无视频" description="输入提示词，生成你的第一支AI视频" />
          </div>
        </a-spin>
        <a-pagination v-if="myTotal > 12" v-model:current="myPage" :total="myTotal" :page-size="12" size="small"
          class="pager" @change="fetchMy" />
      </section>
    </div>

    <!-- ===== 广场 ===== -->
    <div v-show="activeTab === 'gallery'" class="gal-area">
      <a-spin :loading="galLoading" class="gal-spin">
        <div v-if="gallery.length > 0" class="gal-grid">
          <div v-for="item in gallery" :key="item.id" class="gcard" @click="openPreview(item.videoUrl)">
            <div class="gcard-media">
              <video :src="item.videoUrl" :poster="item.thumbnailUrl" muted loop preload="metadata" class="gcard-vid"
                @mouseenter="($event.target as HTMLVideoElement)?.play()"
                @mouseleave="($event.target as HTMLVideoElement)?.pause()" />
              <div class="gcard-hover">
                <IconPlayArrowFill :size="40" />
              </div>
            </div>
            <div class="gcard-info">
              <p class="gcard-prompt">{{ item.prompt || '无描述' }}</p>
              <div class="gcard-meta">
                <span class="author-dot">{{ item.authorName?.charAt(0) ?? '?' }}</span>
                <span>{{ item.authorName ?? '匿名' }}</span>
                <WorkCardActionButton shape="pill" title="一键同款" @click="copyPrompt(item.prompt ?? '')">
                  <IconCopy :size="12" />
                  同款
                </WorkCardActionButton>
              </div>
            </div>
          </div>
        </div>
        <div v-else-if="!galLoading" class="gal-empty">
          <EmptyState title="广场暂无视频" description="创作并公开你的视频作品" />
        </div>
      </a-spin>
      <a-pagination v-if="galTotal > 20" v-model:current="galPage" :total="galTotal" :page-size="20" size="small"
        class="pager" @change="fetchGal" />
    </div>

    <!-- 预览弹窗 -->
    <a-modal v-model:visible="previewOpen" title="视频预览" :width="800" :footer="false" unmount-on-close
      modal-class="dark-modal video-preview-modal">
      <div class="preview-modal-body">
        <video v-if="previewUrl" ref="previewVideoRef" :src="previewUrl" controls class="preview-video" />
        <div v-if="previewTask" class="detail-panel">
          <div class="detail-title">任务详情参数</div>
          <div class="detail-grid">
            <div class="detail-item"><span class="k">任务 ID</span><span class="v mono">{{ previewTask.id }}</span></div>
            <div class="detail-item"><span class="k">服务商</span><span class="v">{{ previewTask.provider || '-' }}</span>
            </div>
            <div class="detail-item"><span class="k">任务类型</span><span class="v">{{ previewTask.taskType || '-' }}</span>
            </div>
            <div class="detail-item"><span class="k">状态</span><span class="v">{{ previewTask.status || '-' }}</span>
            </div>
            <div class="detail-item"><span class="k">进度</span><span class="v">{{ previewTask.progress ?? 0 }}%</span>
            </div>
            <div class="detail-item"><span class="k">时长</span><span class="v">{{ previewTask.duration ?? '-' }}</span>
            </div>
            <div class="detail-item"><span class="k">创建时间</span><span class="v">{{ previewTask.createdAt || '-'
                }}</span>
            </div>
            <div class="detail-item"><span class="k">失败原因</span><span class="v">{{ previewTask.errorMessage || '-'
                }}</span></div>
          </div>
          <div class="detail-block">
            <div class="kb">提示词</div>
            <pre class="json-view">{{ previewTask.prompt || '-' }}</pre>
          </div>
          <div class="detail-block">
            <div class="kb">扩展参数（params）</div>
            <pre class="json-view">{{ formatTaskParams(previewTask) }}</pre>
          </div>
          <div v-if="previewTask.status === 'failed'" class="detail-actions">
            <button class="retry-btn" :disabled="retryingId === previewTask.id" @click="handleRetry(previewTask)">
              {{ retryingId === previewTask.id ? '重试中...' : '重新生成' }}
            </button>
          </div>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 顶部 */
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

/* 创作区 */
.create-area {
  flex: 1;
  display: flex;
  gap: var(--sp-6);
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow: hidden;
}

/* 左侧表单 */
.form-panel {
  width: 320px;
  flex-shrink: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-5);
}

.fg {
  margin-bottom: var(--sp-1);
}

.form-actions {
  margin-top: var(--sp-2);
  padding-bottom: 12px;
}

.form-actions :deep(.gen-btn:hover) {
  transform: translateY(-1px);
}

.fl {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fl-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-2);
}

.fl-row .fl {
  margin-bottom: 0;
}

.fl-count {
  font-size: 0.72rem;
  color: var(--text-4);
  margin-left: auto;
}

.w-full {
  width: 100%;
}

.hidden-input {
  display: none;
}

.mt-12 {
  margin-top: 12px;
}

.upload-icon {
  opacity: 0.72;
  color: var(--text-4);
}

.ratio-outline {
  display: inline-block;
  margin-right: 4px;
  border: 1.5px solid var(--border-3);
  border-radius: 4px;
  background: transparent;
  flex-shrink: 0;
}

.state-hint {
  margin-left: 8px;
}

.kling-dot {
  background: #0ea5e9;
}

/* 下拉选项行 */

/* 文生/图生 切换 */
.mode-toggle {
  display: flex;
  gap: var(--sp-2);
}

.mode-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: var(--sp-2) var(--sp-3);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  color: var(--text-3);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all var(--duration-normal);
}

.mode-btn:hover {
  border-color: var(--border-3);
}

.mode-btn.active {
  border-color: var(--border-3);
  background: var(--color-fill-2);
  color: var(--text-1);
}

/* 参考图 */
.ref-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.ref-item {
  position: relative;
  width: 72px;
  height: 72px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-2);
}

.ref-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-del {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.7);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity var(--duration-fast);
}

.ref-item:hover .ref-del {
  opacity: 1;
}

.ref-add {
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

.ref-add:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.dropzone {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 270px;
  padding: 10px;
  border: 1px dashed var(--border-3);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  cursor: pointer;
  text-align: center;
  transition: all var(--duration-normal);
}

.dropzone:hover {
  border-color: var(--border-3);
  background: var(--color-fill-1);
}

.upload-plus {
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.14);
  border: 1px solid rgba(22, 93, 255, 0.36);
  border-radius: 10px;
  padding: 6px;
}

.dz-text {
  font-size: 0.84rem;
  color: var(--text-2);
  line-height: 1.3;
}

.dz-hint {
  font-size: 0.84rem;
  color: var(--text-4);
  line-height: 1.25;
}

.fl-hint {
  font-weight: 400;
  color: var(--text-4);
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.7rem;
}

.dropzone-sm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 16px;
  border: 1px dashed var(--border-3);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  cursor: pointer;
  font-size: 0.82rem;
  color: var(--text-3);
  transition: all var(--duration-normal);
}

.dropzone-sm:hover {
  border-color: var(--border-3);
  color: var(--text-1);
  background: var(--color-fill-1);
}

.frame-preview {
  position: relative;
  width: 100%;
  height: 270px;
  border-radius: var(--radius-md);
  overflow: hidden;
  border: 1px dashed var(--border-3);
  background: var(--bg-surface-2);
}

.frame-preview img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.frame-preview video {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.frame-clear {
  position: absolute;
  top: 3px;
  right: 3px;
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
}

.frame-clear:hover {
  background: var(--accent-red);
}

.model-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 14px;
  background: var(--color-fill-1);
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  font-size: 0.78rem;
  color: var(--text-3);
  line-height: 1.4;
  margin-bottom: var(--sp-2);
}

.hint-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-4);
  flex-shrink: 0;
  margin-top: 5px;
}

.form-warn {
  padding: 10px 14px;
  background: rgba(245, 63, 63, 0.1);
  border: 1px solid rgba(245, 63, 63, 0.18);
  border-radius: var(--radius-md);
  margin-bottom: var(--sp-2);
}

.warn-title {
  font-size: 0.78rem;
  color: #fecaca;
  font-weight: 600;
  margin-bottom: 6px;
}

.warn-list {
  margin: 0;
  padding-left: 16px;
  color: #fca5a5;
  font-size: 0.76rem;
  line-height: 1.4;
}

.warn-list li {
  margin: 2px 0;
}

.mode-warn {
  font-size: 0.72rem;
  color: var(--accent-amber);
  margin-top: 8px;
}

/* 时长 */
.dur-row {
  display: flex;
  gap: var(--sp-2);
}

.dur-row-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--sp-2);
}

.dur-row-grid .dur-btn {
  flex: none;
}

.dur-btn {
  flex: 1;
  padding: var(--sp-2);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  color: var(--text-3);
  font-size: 0.82rem;
  cursor: pointer;
  text-align: center;
  transition: all var(--duration-fast);
}

.dur-btn:hover {
  border-color: var(--border-3);
}

.dur-btn.active {
  border-color: var(--border-3);
  background: var(--color-fill-2);
  color: var(--text-1);
}

/* 生成按钮 */
/* 生成按钮 → 使用 GenerateButton 组件 */

/* 右侧作品 */
.works {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.works-spin {
  flex: 1;
  min-height: 200px;
  display: flex;
  overflow: hidden;
  width: 100%;
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
  overflow: hidden;
}

.works-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  flex-shrink: 0;
}

.works-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-1);
}

.badge {
  background: var(--primary);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: var(--radius-full);
}

.works-empty {
  flex: 1;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.works-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp-4);
  overflow-y: auto;
  flex: 1;
  padding-bottom: var(--sp-4);
  align-content: start;
  grid-auto-rows: max-content;
}

/* 视频卡片 */
.vcard {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  display: flex;
  flex-direction: column;
  min-height: 0;
  align-self: start;
}

.vcard:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
}

.vcard-media {
  position: relative;
  overflow: hidden;
  background: var(--bg-surface-3);
  flex-shrink: 0;
  height: 196px;
}

.vcard-video,
.vcard-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--duration-normal) var(--ease-out);
}

.vcard:hover .vcard-video,
.vcard:hover .vcard-thumb {
  transform: scale(1.04);
}

.vcard-ph {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* 进度步骤 */
.step-ov {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(5, 10, 22, 0.74);
  gap: var(--sp-2);
  overflow: hidden;
}

.step-ov::before {
  content: '';
  position: absolute;
  inset: -30%;
  background: radial-gradient(circle at 50% 50%, rgba(22, 93, 255, 0.1), transparent 60%);
  animation: ovPulse 2s ease-in-out infinite;
}

.step-stage {
  position: relative;
  z-index: 1;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

.steps {
  display: flex;
  align-items: center;
  gap: 4px;
}

.st {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.7rem;
  color: var(--text-4);
}

.st.on {
  color: var(--primary-light);
}

.st-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-surface-3);
}

.st.on .st-dot {
  background: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.st-line {
  width: 20px;
  height: 2px;
  background: var(--bg-surface-3);
}

.st-line.on {
  background: var(--primary);
}

.st-pct {
  position: relative;
  z-index: 1;
  font-size: 0.78rem;
  font-weight: 600;
  color: #fff;
}

.st-progress {
  position: relative;
  z-index: 1;
  width: 140px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0);
  overflow: hidden;
}

.st-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #165DFF, #4080FF);
  transition: width var(--duration-normal) ease;
}

.st-dots {
  position: relative;
  z-index: 1;
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

.st-dots span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.7);
  animation: dotPulse 1s ease-in-out infinite;
}

.st-dots span:nth-child(2) {
  animation-delay: 0s;
}

.st-dots span:nth-child(3) {
  animation-delay: 0.3s;
}

@keyframes ovPulse {

  0%,
  100% {
    transform: scale(1);
    opacity: 0.9
  }

  50% {
    transform: scale(1.06);
    opacity: 1
  }
}

@keyframes dotPulse {

  0%,
  100% {
    opacity: 0;
    transform: translateY(0)
  }

  50% {
    opacity: 1;
    transform: translateY(-2px)
  }
}

.sbadge {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  color: #fff;
  font-weight: 500;
}

.play-ov {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.5);
  opacity: 0;
  transition: opacity var(--duration-normal);
  background: rgba(0, 0, 0, 0);
}

.vcard:hover .play-ov {
  opacity: 1;
}

.vcard-del {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 22px;
  height: 22px;
  border-radius: 999px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity var(--duration-fast), background var(--duration-fast), transform var(--duration-fast);
  z-index: 2;
}

.vcard-del:hover {
  background: rgba(245, 63, 63, 0.9);
  transform: translateY(-1px);
}

.vcard:hover .vcard-del {
  opacity: 1;
}

.vcard-prompt {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  font-size: 0.78rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.vcard-error {
  margin: 0;
  padding: 0 var(--sp-3) var(--sp-2);
  font-size: 0.75rem;
  color: var(--accent-red, #F53F3F);
  cursor: pointer;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-word;
}

.vcard-actions {
  display: flex;
  gap: 8px;
  padding: 0 var(--sp-3) var(--sp-3);
  margin-top: auto;
}

.retry-btn {
  border: 1px solid var(--border-2);
  background: var(--color-fill-2);
  color: var(--text-2);
  border-radius: var(--radius-full);
  padding: 4px 12px;
  font-size: 0.74rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 6px;
}

.retry-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.retry-btn.danger {
  border-color: rgba(245, 63, 63, 0.1);
  background: rgba(245, 63, 63, 0.1);
  color: #fecaca;
}

.pager {
  flex-shrink: 0;
  margin-top: var(--sp-3);
  display: flex;
  justify-content: center;
}

/* 广场 */
.gal-area {
  flex: 1;
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow-y: auto;
}

.gal-spin {
  width: 100%;
  min-height: 200px;
}

.gal-empty {
  min-height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gal-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp-4);
  align-content: start;
  grid-auto-rows: max-content;
}

.gcard {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  cursor: pointer;
  transition: all var(--duration-normal);
}

.gcard:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
}

.gcard-media {
  position: relative;
  height: 196px;
  overflow: hidden;
  background: var(--bg-surface-3);
}

.gcard-vid {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--duration-normal) var(--ease-out);
}

.gcard:hover .gcard-vid {
  transform: scale(1.04);
}

.gcard-hover {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: rgba(0, 0, 0, 0);
  opacity: 0;
  transition: opacity var(--duration-normal);
}

.gcard:hover .gcard-hover {
  opacity: 1;
}

.gcard-info {
  padding: var(--sp-3);
}

.gcard-prompt {
  margin: 0 0 var(--sp-2);
  font-size: 0.75rem;
  color: var(--text-2);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.gcard-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: 0.72rem;
  color: var(--text-4);
}

.author-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--gradient-primary);
  color: #fff;
  font-size: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.copy-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-left: auto;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid var(--border-2);
  border-radius: 6px;
  color: var(--text-3);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--duration-fast);
}

.copy-btn:hover {
  background: var(--bg-surface-3);
  color: var(--text-1);
  border-color: var(--border-3);
}

.detail-panel {
  margin-top: var(--sp-4);
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-surface-2);
}

.detail-title {
  font-size: 0.86rem;
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

.detail-actions {
  margin-top: var(--sp-3);
  display: flex;
  justify-content: flex-end;
}

.preview-video {
  width: 100%;
  max-height: min(60vh, 480px);
  object-fit: contain;
  border-radius: 12px;
  display: block;
}

/* 预览弹窗：一屏内显示，内容区可滚动 */
.preview-modal-body {
  max-height: min(85vh, 720px);
  overflow-y: auto;
  overflow-x: hidden;
}

.preview-modal-body .detail-panel {
  margin-top: var(--sp-4);
}

.placeholder-icon {
  opacity: 0.5;
  color: var(--text-4);
}

@media(max-width:900px) {
  .create-area {
    flex-direction: column;
  }

  .form-panel {
    width: 100%;
    max-height: 45vh;
  }

  .works-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media(max-width:600px) {
  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
  }

  .create-area,
  .gal-area {
    padding: var(--sp-3);
  }

  .works-grid,
  .gal-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sp-3);
  }
}

@media(max-width:420px) {

  .works-grid,
  .gal-grid {
    grid-template-columns: 1fr;
  }
}
</style>
