<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconVideoCamera, IconDelete, IconRefresh, IconPlayArrowFill, IconCopy,
} from '@arco-design/web-vue/es/icon'
import {
  createVideoTask, getMyTasks, getGallery, getTasksStatusBatch, retryTask as retryVideoTask, deleteTask as deleteVideoTask,
  type VideoTask, type VideoGalleryItem, type CreateVideoTaskData,
} from '../../api/video'
import { uploadFile } from '../../api/upload'
import { checkText } from '../../api/content-moderation'
import { getModels } from '../../api/model'
import EmptyState from '../../components/EmptyState.vue'
import WorkCardActionButton from '../../components/WorkCardActionButton.vue'
import GenerateButton from '../../components/GenerateButton.vue'
import { onTaskEvent, realtimeConnected } from '../../realtime/socket'
import {
  estimateVideoPrice,
  extractPriceList,
} from '../draw/mapi-pricing-client'
import VideoAssetInputPanel from './VideoAssetInputPanel.vue'
import VideoParamForm from './VideoParamForm.vue'
import {
  buildDefaultVideoSchemaValue,
  buildVideoCardSummary,
  resolveVideoSchema,
} from './video-schemas'
import type { VideoAssetFile, VideoRefImage } from './video-asset-types'

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
const schemaForm = ref<Record<string, unknown>>({})

/* 表单 */
const inputMode = ref<'text' | 'frame' | 'ref' | 'motion'>('text')
const form = ref<CreateVideoTaskData>({ provider: 'veo3.1-fast', prompt: '', duration: 5 })
const uploading = ref(false)
const previewMode = ref(false)
const selectedResolution = ref<'standard' | 'high'>('standard')
const selectedKling26SubModel = ref<'kling-2/text-to-video' | 'kling-2/image-to-video' | 'kling-2/motion-control'>('kling-2/text-to-video')
const klingV26NegativePrompt = computed({
  get: () => String(schemaForm.value.negative_prompt || ''),
  set: (value: string) => { schemaForm.value = { ...schemaForm.value, negative_prompt: value } },
})

const firstFrameFile = ref<VideoAssetFile | null>(null)
const lastFrameFile = ref<VideoAssetFile | null>(null)
const motionRoleImage = ref<VideoAssetFile | null>(null)
const motionVideoFile = ref<VideoAssetFile | null>(null)
const refImages = ref<VideoRefImage[]>([])
const klingV26TailFrameFile = ref<VideoAssetFile | null>(null)

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
const videoModelsFromApi = ref<Array<{
  modelName: string
  displayName?: string | null
  description?: string
  source?: string | null
  provider?: string
  rawMetadata?: string | null
}>>([])
const activeVideoModelNames = ref<Set<string>>(new Set())
const videoOrderMap = ref<Record<string, number>>({})
/** 后端 source=mapi 的视频模型名集合，用于按 MAPI 协议提交任务 */
const mapiVideoModelSet = computed(() => {
  const s = new Set<string>()
  for (const m of videoModelsFromApi.value) {
    if (m?.modelName && (m.source === 'mapi' || m.provider === 'mapi')) {
      s.add(m.modelName)
    }
  }
  return s
})
const kling26SubModels = [
  { value: 'kling-2/text-to-video', label: '文生视频', desc: '5/10 秒，多比例，支持音效' },
  { value: 'kling-2/image-to-video', label: '图生视频', desc: '5/10 秒，参考图驱动' },
  { value: 'kling-2/motion-control', label: '动作控制', desc: '角色图 + 动作视频控制' },
]
const videoPointsMap = ref<Record<string, number>>({})
const visibleProviders = computed(() => {
  const set = activeVideoModelNames.value
  const knownBackendNames = new Set<string>()
  for (const p of providersDef) {
    const backends = providerToBackendNames[p.value]
    const names = Array.isArray(backends) ? backends : [backends ?? p.value]
    names.forEach((name) => knownBackendNames.add(name))
  }
  const dynamicProviders = videoModelsFromApi.value
    .filter((m) => !knownBackendNames.has(m.modelName))
    .map((m, idx) => ({
      value: m.modelName,
      label: m.displayName || m.modelName,
      desc: m.description || `动态同步模型：${m.modelName}`,
      color: ['#7c3aed', '#0ea5e9', '#14b8a6', '#f59e0b'][idx % 4] || '#7c3aed',
    }))
  const baseList = set.size === 0
    ? [...providersDef, ...dynamicProviders]
    : [...providersDef.filter(p => {
      const backends = providerToBackendNames[p.value]
      const names = Array.isArray(backends) ? backends : [backends ?? p.value]
      return names.some(b => set.has(b))
    }), ...dynamicProviders.filter(p => set.has(p.value))]

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
      videoModelsFromApi.value = all
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

/** 当前所选模型是否走 MAPI 聚合协议（source=mapi） */
const isMapiProvider = computed(() => mapiVideoModelSet.value.has(actualModel.value))

/** MAPI 视频专属参数（按 MAPI 视频文档收敛）：ratio / duration / generate_audio / cameraFixed / watermark */
const mapiRatio = computed({
  get: () => (schemaForm.value.ratio as '16:9' | '9:16' | '4:3' | '1:1' | 'adaptive') || '16:9',
  set: (value) => { schemaForm.value = { ...schemaForm.value, ratio: value } },
})
const mapiDuration = computed({
  get: () => Number(schemaForm.value.duration || 5) as 5 | 10,
  set: (value) => { schemaForm.value = { ...schemaForm.value, duration: value } },
})
const mapiGenerateAudio = computed({
  get: () => schemaForm.value.generate_audio !== false,
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, generate_audio: value } },
})
const mapiCameraFixed = computed({
  get: () => Boolean(schemaForm.value.camera_fixed ?? schemaForm.value.cameraFixed ?? false),
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, camera_fixed: value } },
})
const mapiWatermark = computed({
  get: () => Boolean(schemaForm.value.watermark ?? false),
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, watermark: value } },
})
const mapiResolution = computed({
  get: () => (String(schemaForm.value.resolution || '720p') as '720p' | '1080p'),
  set: (value: '720p' | '1080p') => { schemaForm.value = { ...schemaForm.value, resolution: value } },
})
const mapiWithVoice = computed({
  get: () => Boolean(schemaForm.value.withVoice ?? false),
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, withVoice: value } },
})
const mapiWithInputVideo = computed({
  get: () => Boolean(schemaForm.value.withInputVideo ?? false),
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, withInputVideo: value } },
})
const mapiIsBatchInference = computed({
  get: () => Boolean(schemaForm.value.isBatchInference ?? false),
  set: (value: boolean) => { schemaForm.value = { ...schemaForm.value, isBatchInference: value } },
})

/** 当前 MAPI 模型是否属于某类 */
const isMapiKling = computed(() => /kling/i.test(actualModel.value))
const isMapiHailuo = computed(() => /hailuo/i.test(actualModel.value))
const isMapiSeedance15Pro = computed(() =>
  /seedance-1-5-pro/i.test(actualModel.value),
)
const isMapiSeedance20 = computed(() =>
  /seedance-2-0(-fast)?/i.test(actualModel.value),
)
/** 该模型是否有"分辨率档"价差（Kling / Hailuo / Seedance 系列均按分辨率参与 TOKEN 估算） */
const hasMapiResolutionTier = computed(
  () => isMapiKling.value || isMapiHailuo.value || isMapiSeedance20.value || isMapiSeedance15Pro.value,
)

/** 当前 MAPI 视频模型的 rawMetadata + 实时价格预估 */
const currentMapiVideoRawMetadata = computed<string | null>(() => {
  const hit = videoModelsFromApi.value.find(
    (m) => (m as { modelName?: string }).modelName === actualModel.value,
  ) as { rawMetadata?: string | null } | undefined
  return hit?.rawMetadata ?? null
})
const mapiVideoPriceEstimate = computed<{ points: number; breakdown: string } | null>(() => {
  if (!isMapiProvider.value) return null
  const raw = currentMapiVideoRawMetadata.value
  if (!raw) return null
  const list = extractPriceList(raw)
  if (list.length === 0) return null

  // Kling 3.0 特殊映射：klingMode(std/pro) → resolution，sound → withAudio
  const isKling30 = actualModel.value === 'kling-3.0'
  let resolution: string
  let withAudio: boolean
  if (isKling30) {
    resolution = schemaForm.value.klingMode === 'pro' ? '1080p' : '720p'
    withAudio = Boolean(schemaForm.value.sound ?? false)
  } else {
    // 分辨率：Hailuo/Kling 有档位，取用户选择；其他模型默认 1080p 估算
    resolution = hasMapiResolutionTier.value ? mapiResolution.value : '1080p'
    withAudio = mapiGenerateAudio.value
  }

  // 含输入：图生视频默认 true；其他模型默认取用户切换
  const withInputVideo =
    taskMode.value === 'img2video' ||
    !!form.value?.imageUrl ||
    mapiWithInputVideo.value
  return estimateVideoPrice(list, {
    resolution,
    duration: Number(mapiDuration.value),
    withAudio,
    withVoice: mapiWithVoice.value,
    withInputVideo,
    isBatchInference: mapiIsBatchInference.value,
  })
})
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
/* Kling 3.0 专属 */
const isHailuoModel = computed(() => actualModel.value === 'hailuo-2.3')
const showRatio = computed(() => !isKling26Image.value && !isKling26Motion.value)
const showDuration = computed(() => !isKling26Motion.value)
const showKling26SubSelect = computed(() => selectedModel.value === 'kling-2')

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

const modelConfig = computed(() => resolveVideoSchema(actualModel.value) ?? resolveVideoSchema('veo3.1-fast')!)
const availableInputModes = computed(() => modelConfig.value.inputModes)
const durationOptions = computed(() => (
  previewMode.value && modelConfig.value.previewDurations?.length
    ? modelConfig.value.previewDurations
    : modelConfig.value.durations
))
const canUseRefMode = computed(() => availableInputModes.value.includes('ref'))
const canUseFrameMode = computed(() => availableInputModes.value.includes('frame'))
const maxRef = computed(() => modelConfig.value.maxRefImages || 3)
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
  schemaForm.value = buildDefaultVideoSchemaValue(actualModel.value)
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
  if (actualModel.value !== 'kling-v2-6-image2video') klingV26TailFrameFile.value = null
}, { immediate: true })

watch(
  () => form.value.duration,
  (d) => {
    if (!isHailuoModel.value) return
    if (d === 10 && schemaForm.value.resolution === '1080P') {
      schemaForm.value = { ...schemaForm.value, resolution: '768P' }
    }
  },
)

watch(selectedKling26SubModel, (next, prev) => {
  if (!next || next === prev) return
  if (next === 'kling-2/text-to-video') {
    inputMode.value = 'text'
    selectedRatio.value = '16:9'
    form.value.duration = 5
  } else if (next === 'kling-2/image-to-video') {
    inputMode.value = 'ref'
    form.value.duration = 5
  } else if (next === 'kling-2/motion-control') {
    inputMode.value = 'motion'
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
  const textToCheck = [form.value.prompt, klingV26NegativePrompt.value].filter(Boolean).join(' ')
  if (textToCheck.trim()) {
    try {
      const { data: checkResult } = await checkText(textToCheck)
      if (!checkResult.passed) {
        Modal.error({
          title: '⚠️ 内容安全提示',
          content: checkResult.descriptions || checkResult.reason || '您的描述存在违规风险，请修改后重试。',
          okText: '我知道了',
        })
        return
      }
    } catch {
      // 预检接口失败不阻断
    }
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
      ...schemaForm.value,
    }
    if (showDuration.value && params.duration == null) {
      params.duration = form.value.duration ?? durationOptions.value[0]
    }
    if (showRatio.value && params.aspectRatio == null && params.ratio == null) {
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

    // === MAPI 聚合短路：按 MAPI 视频文档收敛参数 ===
    // 文档字段：model / content(text+image_url) / ratio / duration / generate_audio / cameraFixed / watermark
    if (isMapiProvider.value) {
      // Kling 3.0 特殊字段映射：klingMode(std/pro) → resolution，sound → generate_audio
      const isKling30 = actualModel.value === 'kling-3.0'
      const kling30Resolution = isKling30
        ? (schemaForm.value.klingMode === 'pro' ? '1080p' : '720p')
        : undefined
      const kling30Audio = isKling30
        ? Boolean(schemaForm.value.sound ?? false)
        : undefined

      const mapiParams: Record<string, unknown> = {
        model: actualModel.value,
        ratio: String(schemaForm.value.ratio || mapiRatio.value),
        duration: Number(schemaForm.value.duration || mapiDuration.value),
        // Kling 3.0 用 sound 字段；其他模型用 generate_audio
        generate_audio: kling30Audio !== undefined
          ? kling30Audio
          : (schemaForm.value.generate_audio ?? mapiGenerateAudio.value),
        cameraFixed: schemaForm.value.camera_fixed ?? schemaForm.value.cameraFixed ?? mapiCameraFixed.value,
        watermark: schemaForm.value.watermark ?? mapiWatermark.value,
        // 计费相关上下文（服务端精准对账用；不发给 MAPI 上游）
        resolution: kling30Resolution !== undefined
          ? kling30Resolution
          : (hasMapiResolutionTier.value ? (schemaForm.value.resolution ?? mapiResolution.value) : undefined),
        withVoice: isMapiKling.value ? (schemaForm.value.withVoice ?? mapiWithVoice.value) : undefined,
        // Kling 3.0 画质模式透传给后端（MAPI 上游需要）
        klingMode: isKling30 ? (schemaForm.value.klingMode ?? 'pro') : undefined,
        withInputVideo:
          taskMode.value === 'img2video' ||
          (isMapiSeedance20.value ? (schemaForm.value.withInputVideo ?? mapiWithInputVideo.value) : false),
        isBatchInference: isMapiSeedance15Pro.value
          ? (schemaForm.value.isBatchInference ?? mapiIsBatchInference.value)
          : undefined,
      }
      // 将 inputMode 传给后端，用于确定 MAPI content role（first_frame / reference_image）
      mapiParams.inputMode = inputMode.value
      payload.params = mapiParams
      // 图生视频：按 inputMode 分别处理
      if (taskMode.value === 'img2video') {
        if (inputMode.value === 'frame') {
          // 首帧图生：payload.imageUrl = 首帧，params.lastFrameUrl = 尾帧（可选）
          if (firstFrameFile.value) {
            payload.imageUrl = firstFrameFile.value.url
          }
          if (lastFrameFile.value) {
            mapiParams.lastFrameUrl = lastFrameFile.value.url
          }
        } else if (inputMode.value === 'ref') {
          // 参考图图生（omni_reference）：传递全部参考图 URL
          // 首图同时写入 imageUrl 供后端向下兼容（单图路径），
          // 全量 URLs 写入 params.refImageUrls 供后端多图路径使用
          if (refImages.value.length > 0) {
            payload.imageUrl = refImages.value[0]?.url
            mapiParams.refImageUrls = refImages.value.map((r) => r.url)
          }
        }
      }
      uploading.value = false
      const { data: mapiData } = await createVideoTask(payload)
      if (mapiData) {
        myTasks.value.unshift(mapiData)
        Message.success('任务已提交')
        startPoll()
      }
      return
    }

    if (taskMode.value === 'img2video') {
      if (inputMode.value === 'frame') {
        payload.imageUrl = firstFrameFile.value!.url
        if (lastFrameFile.value) {
          ;(payload.params as Record<string, unknown>).lastFrameUrl = lastFrameFile.value.url
        }
      } else if (inputMode.value === 'ref') {
        const urls = refImages.value.map((r) => r.url).slice(0, maxRef.value)
        payload.imageUrl = urls[0]
        ;(payload.params as Record<string, unknown>).urls = urls
        if (isKlingV26Image2VideoModel.value && klingV26TailFrameFile.value) {
          ;(payload.params as Record<string, unknown>).image_tail = klingV26TailFrameFile.value.url
        }
      } else if (inputMode.value === 'motion') {
        payload.imageUrl = motionRoleImage.value!.url
        ;(payload.params as Record<string, unknown>).motionVideoUrl = await uploadVideoAndGetUrl(motionVideoFile.value!.file)
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
function fmtExecMs(ms?: number | null) {
  if (ms == null || !Number.isFinite(ms)) return '-'
  const totalSeconds = ms / 1000
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`
  const m = Math.floor(totalSeconds / 60)
  const s = Math.round(totalSeconds % 60)
  return `${m}m${String(s).padStart(2, '0')}s`
}
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

function canDownloadTask(task: VideoTask) {
  return Boolean(task.videoUrl || task.resultUrl)
}

function handleDownloadTask(task: VideoTask) {
  const url = String(task.videoUrl || task.resultUrl || '').trim()
  if (!url) {
    Message.warning('暂无可下载视频')
    return
  }
  const a = document.createElement('a')
  a.href = url
  a.download = `video-${task.id || Date.now()}.mp4`
  a.click()
}

function detailDisplayItems(task?: VideoTask | null) {
  if (!task) return []
  const params = (task.params || {}) as Record<string, unknown>
  return [
    { label: '模型', value: task.provider || '-' },
    { label: '输入方式', value: task.taskType === 'img2video' ? '图生视频' : '文生视频' },
    { label: '状态', value: sText(task.status || '-') },
    { label: '进度', value: `${task.progress ?? 0}%` },
    { label: '画面比例', value: String(params.ratio || params.aspectRatio || '-') },
    { label: '视频时长', value: params.duration ? `${params.duration} 秒` : (task.duration ? `${task.duration} 秒` : '-') },
    { label: '分辨率', value: String(params.resolution || '-') },
    { label: '音频', value: params.generate_audio === true || params.generate_audio === 'true' ? '开启' : '关闭' },
    { label: '创建时间', value: task.createdAt || '-' },
    { label: '排队耗时', value: fmtExecMs(task.queueMs) },
    { label: '处理耗时', value: fmtExecMs(task.procMs) },
    { label: '总耗时', value: fmtExecMs(task.totalMs) },
    { label: '失败原因', value: task.errorMessage || '-' },
  ]
}

function applySameAsTask(task: VideoTask) {
  activeTab.value = 'create'
  const provider = String(task.provider || '').trim()
  const p = (task.params || {}) as Record<string, unknown>
  form.value.prompt = task.prompt || ''
  previewOpen.value = false

  if (provider === 'bytedance/seedance-1.5-pro') {
    selectedModel.value = 'bytedance/seedance-1-pro'
  } else if (provider === 'MiniMax-Hailuo-2.3') {
    selectedModel.value = 'hailuo-2.3'
  } else if (provider === 'doubao-seedance-1-5-pro-responses') {
    selectedModel.value = task.taskType === 'img2video' ? 'doubao-seedance-image' : 'doubao-seedance-text'
  } else {
    selectedModel.value = provider
  }

  inputMode.value = task.taskType === 'img2video' ? 'frame' : 'text'
  if (typeof p.ratio === 'string') selectedRatio.value = p.ratio
  if (typeof p.aspectRatio === 'string') selectedRatio.value = p.aspectRatio
  if (typeof p.duration === 'number') form.value.duration = p.duration

  schemaForm.value = { ...buildDefaultVideoSchemaValue(actualModel.value), ...p }

  Message.success('已应用同款参数')
}

function cardSummary(task: VideoTask) {
  return buildVideoCardSummary(task)
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
    <Transition name="tab-fade">
    <div v-show="activeTab === 'create'" class="create-area">
      <aside class="form-panel">
        <section class="panel-block panel-block-primary">
          <div class="panel-head">
            <div>
              <div class="panel-title">基础选择</div>
              <div class="panel-desc">先决定模型、子模型与输入方式</div>
            </div>
          </div>

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

          <section class="fg">
            <label class="fl">输入方式</label>
            <div class="mode-toggle">
              <button
                v-for="mode in availableInputModes"
                :key="mode"
                class="mode-btn"
                :class="{ active: inputMode === mode }"
                @click="inputMode = mode"
              >
                {{ inputModeLabels[mode] }}
              </button>
            </div>
          </section>
        </section>

        <section class="panel-block">
          <VideoAssetInputPanel
            :model="actualModel"
            :input-mode="inputMode"
            :can-use-frame-mode="canUseFrameMode"
            :can-use-ref-mode="canUseRefMode"
            :max-ref="maxRef"
            :prompt="form.prompt || ''"
            :first-frame-file="firstFrameFile"
            :last-frame-file="lastFrameFile"
            :ref-images="refImages"
            :motion-role-image="motionRoleImage"
            :motion-video-file="motionVideoFile"
            :kling-v26-tail-frame-file="klingV26TailFrameFile"
            @update:prompt="(value) => form.prompt = value"
            @update:firstFrameFile="(value) => firstFrameFile = value"
            @update:lastFrameFile="(value) => lastFrameFile = value"
            @update:refImages="(value) => refImages = value"
            @update:motionRoleImage="(value) => motionRoleImage = value"
            @update:motionVideoFile="(value) => motionVideoFile = value"
            @update:klingV26TailFrameFile="(value) => klingV26TailFrameFile = value"
          />
        </section>

        <section class="panel-block">
          <div class="panel-head">
            <div class="panel-title">参数</div>
          </div>

          <VideoParamForm
            :model="actualModel"
            :value="schemaForm"
            @update:value="(value) => schemaForm = value"
          />
        </section>

        <div class="form-actions">
          <div class="gen-wrap" :title="missingHints.length > 0 ? missingHints.join(' · ') : ''">
            <GenerateButton
              :loading="generating || uploading"
              :disabled="missingHints.length > 0"
              text="开始生成"
              :loading-text="uploading ? '上传素材中...' : '生成中...'"
              @click="handleGenerate"
            />
          </div>
          <div
            v-if="isMapiProvider && mapiVideoPriceEstimate"
            class="cost-line"
            :title="`${mapiVideoPriceEstimate.breakdown} · 按实际 duration / resolution / 有声结算`"
          >
            预计消耗 <span class="cost-num">{{ mapiVideoPriceEstimate.points }}</span> 积分
          </div>
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
              :title="cardSummary(t).modelLabel"
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
              <div v-if="cardSummary(t).metaLabel" class="vcard-meta-summary">
                <span class="vcard-meta-text">{{ cardSummary(t).metaLabel }}</span>
              </div>
              <p v-if="t.status === 'failed' && t.errorMessage" class="vcard-error" :title="t.errorMessage"
                @click.stop="Modal.error({ title: '错误详情', content: t.errorMessage, okText: '关闭', maskClosable: true, closable: true })">
                {{ cardSummary(t).errorLabel }}</p>
              <div class="vcard-actions">
                <WorkCardActionButton v-if="canDownloadTask(t)" title="下载视频" @click="handleDownloadTask(t)">
                  <IconVideoCamera />
                </WorkCardActionButton>
                <WorkCardActionButton title="一键同款" @click="applySameAsTask(t)">
                  <IconCopy />
                </WorkCardActionButton>
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
    </Transition>

    <!-- ===== 广场 ===== -->
    <Transition name="tab-fade">
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
    </Transition>

    <!-- 预览弹窗 -->
    <a-modal v-model:visible="previewOpen" title="视频预览" :width="800" :footer="false" unmount-on-close
      modal-class="dark-modal video-preview-modal">
      <div class="preview-modal-body">
        <video v-if="previewUrl" ref="previewVideoRef" :src="previewUrl" controls class="preview-video" />
        <div v-if="previewTask" class="detail-panel">
          <div class="detail-block">
            <div class="detail-block-head">
              <span class="kb">提示词</span>
              <button
                v-if="previewTask.prompt"
                class="copy-inline"
                @click="copyPrompt(previewTask.prompt)"
              >复制</button>
            </div>
            <div class="prompt-text">{{ previewTask.prompt || '-' }}</div>
          </div>
          <div class="detail-grid detail-grid-compact">
            <div v-for="item in detailDisplayItems(previewTask)" :key="item.label" class="detail-item detail-item-stack">
              <span class="k">{{ item.label }}</span>
              <span class="v" :class="{ mono: item.label === '模型' || item.label === '任务 ID' }">{{ item.value }}</span>
            </div>
          </div>
          <div class="detail-actions detail-actions-between">
            <div class="detail-actions-left">
              <button class="retry-btn" @click="applySameAsTask(previewTask)">一键同款</button>
              <button v-if="canDownloadTask(previewTask)" class="retry-btn" @click="handleDownloadTask(previewTask)">下载视频</button>
            </div>
            <button v-if="previewTask.status === 'failed'" class="retry-btn" :disabled="retryingId === previewTask.id" @click="handleRetry(previewTask)">
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

.tab-btn:active {
  transform: scale(0.96);
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

.panel-block {
  padding: 12px 0;
  border-top: 1px solid var(--border-1, rgba(255, 255, 255, 0.06));
}

.panel-block:first-of-type,
.panel-block-primary {
  border-top: none;
  padding-top: 0;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
}

.panel-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.panel-title {
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-4);
}

.panel-desc,
.panel-side-note {
  display: none;
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

/* 输入方式分段控件 */
.mode-toggle {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--color-fill-1, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-1, rgba(255, 255, 255, 0.06));
}

.mode-btn {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-3);
  font-size: 0.74rem;
  font-weight: 500;
  cursor: pointer;
  transition: color .14s ease, background .14s ease;
  text-align: center;
  white-space: nowrap;
}

.mode-btn:hover {
  color: var(--text-1);
}

.mode-btn.active {
  color: var(--text-1);
  background: var(--bg-surface-3, rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 0 0 1px var(--border-2, rgba(255, 255, 255, 0.1));
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
  transition: background var(--duration-fast), transform var(--duration-fast);
}

.frame-clear:hover {
  background: var(--accent-red);
}

.frame-clear:active {
  transform: scale(0.88);
}

.gen-wrap {
  display: block;
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
  border-color: rgba(22, 93, 255, 0.52);
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.22), rgba(64, 128, 255, 0.18));
  color: var(--primary-light);
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.08), 0 8px 20px rgba(22, 93, 255, 0.12);
}

.dur-btn:active:not(.active) {
  transform: scale(0.97);
  opacity: 0.85;
}

.adv-panel {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
}

.adv-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 0.8rem;
  font-weight: 600;
  padding: 12px 14px;
  cursor: pointer;
}

.adv-panel-body {
  padding: 0 14px 12px;
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

.vcard:active {
  transform: translateY(-1px) scale(0.99);
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
  transition: color 0.2s ease;
}

.st.on {
  color: var(--primary-light);
}

.st-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--bg-surface-3);
  transition: background 0.2s ease, box-shadow 0.2s ease;
}

.st.on .st-dot {
  background: var(--primary);
  box-shadow: 0 0 6px var(--primary);
}

.st-line {
  width: 20px;
  height: 2px;
  background: var(--bg-surface-3);
  transition: background 0.2s ease;
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
  animation-delay: 0.15s;
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

.vcard-meta-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 var(--sp-3) var(--sp-2);
  flex-wrap: wrap;
}

.vcard-meta-text {
  font-size: 0.72rem;
  color: var(--text-4);
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
  transition: all var(--duration-fast);
}

.retry-btn:hover:not(:disabled) {
  background: var(--bg-surface-3);
  border-color: var(--border-3);
  color: var(--text-1);
}

.retry-btn:active:not(:disabled) {
  transform: scale(0.96);
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

.retry-btn.danger:hover:not(:disabled) {
  background: rgba(245, 63, 63, 0.2);
  border-color: rgba(245, 63, 63, 0.3);
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

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 14px;
}

.detail-grid-compact {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.detail-item {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.detail-item-stack {
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--bg-surface-3);
  border: 1px solid var(--border-1);
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
  margin-bottom: var(--sp-3);
}

.detail-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

.kb {
  font-size: 0.7rem;
  color: var(--text-4);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.copy-inline {
  background: transparent;
  border: none;
  color: var(--text-4);
  font-size: 0.7rem;
  font-weight: 500;
  cursor: pointer;
  padding: 2px 0;
  transition: color .14s ease;
}

.copy-inline:hover {
  color: var(--text-1);
}

.prompt-text {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-1);
  background: var(--color-fill-1, rgba(255, 255, 255, 0.02));
  color: var(--text-2);
  font-size: 0.82rem;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
}

.detail-actions {
  margin-top: var(--sp-3);
  display: flex;
  justify-content: flex-end;
}

.detail-actions-between {
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.detail-actions-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
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

/* 预计消耗积分 —— 按钮下方一行小灰字 */
.cost-line {
  margin-top: 8px;
  text-align: center;
  font-size: 0.7rem;
  color: var(--text-4);
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  cursor: default;
}
.cost-line .cost-num {
  color: var(--text-2);
  font-weight: 600;
  margin: 0 2px;
}

/* Tab 切换淡入淡出 */
.tab-fade-enter-active,
.tab-fade-leave-active {
  transition: opacity var(--duration-fast);
}

.tab-fade-enter-from,
.tab-fade-leave-to {
  opacity: 0;
}
</style>
