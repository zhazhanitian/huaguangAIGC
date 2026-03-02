<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconClose, IconImage, IconPlus, IconVideoCamera, IconDelete, IconRefresh, IconPlayArrowFill, IconCopy,
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

/* 首帧/尾帧图 */
const firstFrameFile = ref<{ url: string; file: File } | null>(null)
const lastFrameFile = ref<{ url: string; file: File } | null>(null)
const firstFrameInputRef = ref<HTMLInputElement>()
const lastFrameInputRef = ref<HTMLInputElement>()

/* Motion Control 素材 */
const motionRoleImage = ref<{ url: string; file: File } | null>(null)
const motionVideoFile = ref<{ url: string; file: File } | null>(null)
const motionRoleInputRef = ref<HTMLInputElement>()
const motionVideoInputRef = ref<HTMLInputElement>()

function pickFrame(type: 'first' | 'last', e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  const url = URL.createObjectURL(file)
  if (type === 'first') { if (firstFrameFile.value) URL.revokeObjectURL(firstFrameFile.value.url); firstFrameFile.value = { url, file } }
  else { if (lastFrameFile.value) URL.revokeObjectURL(lastFrameFile.value.url); lastFrameFile.value = { url, file } }
  ;(e.target as HTMLInputElement).value = ''
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
  ;(e.target as HTMLInputElement).value = ''
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
  ;(e.target as HTMLInputElement).value = ''
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
const FALLBACK_MAX_REF = 3

function addRefImages(files: File[]) {
  const maxRef = modelConfig.value.maxRefImages ?? FALLBACK_MAX_REF
  const imgs = files.filter(f => f.type.startsWith('image/'))
  if (!imgs.length) { Message.warning('请选择图片'); return }
  const left = maxRef - refImages.value.length
  if (left <= 0) { Message.warning(`最多 ${maxRef} 张参考图`); return }
  for (const f of imgs.slice(0, left)) {
    refImages.value.push({ id: `r${Date.now()}${Math.random().toString(36).slice(2,5)}`, file: f, url: URL.createObjectURL(f) })
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

const providersDef = [
  { value: 'veo3.1-fast', label: 'Veo 3.1 Fast', desc: '快速生成，支持首尾帧+参考图', color: '#FF7D00' },
  { value: 'veo3.1-pro', label: 'Veo 3.1 Pro', desc: '高质量生成，支持首尾帧', color: '#4080FF' },
  { value: 'sora-2', label: 'Sora 2', desc: 'APIMart 标准版，支持文本/参考图', color: '#14C9C9' },
  { value: 'sora-2-pro', label: 'Sora 2 Pro', desc: 'APIMart 专业版，支持更长时长', color: '#22c55e' },
  { value: 'kling-3.0', label: 'Kling 3.0', desc: '可灵3.0，3-15秒，支持1:1/音效', color: '#e11d48' },
  { value: 'kling-2', label: 'Kling 2', desc: '文生/图生/动作控制子模型', color: '#0ea5e9' },
  { value: 'bytedance/seedance-1-pro', label: 'Seedance 1 Pro', desc: '字节视频，支持参考图/首尾帧', color: '#14b8a6' },
]
const kling26SubModels = [
  { value: 'kling-2/text-to-video', label: '文生视频', desc: '3-10秒，多比例，支持音效' },
  { value: 'kling-2/image-to-video', label: '图生视频', desc: '3-10秒，参考图驱动' },
  { value: 'kling-2/motion-control', label: '动作控制', desc: '角色图 + 动作视频控制' },
]
const videoPointsMap = ref<Record<string, number>>({})
const providers = computed(() => providersDef.map(p => {
  let modelNameForPoints = p.value === 'kling-2' ? selectedKling26SubModel.value : p.value
  let points = videoPointsMap.value[modelNameForPoints] ?? 0

  // 如果后端没有数据，使用默认积分
  if (points === 0 && p.value === 'bytedance/seedance-1-pro') {
    points = 60 // 默认积分
  }

  return { ...p, points }
}))

async function fetchVideoModelPoints() {
  try {
    const res = await getModels()
    const all = res.data || res // 兼容两种返回格式
    if (Array.isArray(all)) {
      for (const m of all) { if (m.deductPoints) videoPointsMap.value[m.modelName] = m.deductPoints }
    }
  } catch { /* ignore */ }
}
const selectedModel = ref('veo3.1-fast')
const actualModel = computed(() => selectedModel.value === 'kling-2' ? selectedKling26SubModel.value : selectedModel.value)
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
  return defaultRatioOptions
})
const seedanceResolutionOptions: Array<{ value: '720p' | '1080p'; label: string }> = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
]

/* Kling 3.0 专属 */
const klingMode = ref<'std' | 'pro'>('pro')
const klingSound = ref(false)
const isKlingModel = computed(() => actualModel.value === 'kling-3.0')
const isSeedanceModel = computed(() => actualModel.value === 'bytedance/seedance-1-pro')
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
    durations: [3, 4, 5, 6, 8, 10],
    supportsPreview: false,
    supportsPreviewResolution: false,
    hint: 'Kling 2 文生视频，支持多比例与音效',
  },
  'kling-2/image-to-video': {
    inputModes: ['ref'],
    maxRefImages: 1,
    durations: [3, 4, 5, 6, 8, 10],
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

function modelForApi() {
  if (previewMode.value && isSoraModel.value) {
    return `${actualModel.value}-preview`
  }
  return actualModel.value
}

watch(actualModel, () => {
  const cfg = modelConfig.value
  if (!cfg.inputModes.includes(inputMode.value)) {
    inputMode.value = cfg.inputModes[0] ?? 'text'
  }
  if (!cfg.supportsPreview) {
    previewMode.value = false
    selectedResolution.value = 'standard'
  }
  const validRatios = ratioOptions.value.map(r => r.value)
  if (showRatio.value && validRatios.length && !validRatios.includes(selectedRatio.value)) {
    selectedRatio.value = validRatios[0] ?? '16:9'
  }
  const allowedDurations = previewMode.value && cfg.previewDurations?.length ? cfg.previewDurations : cfg.durations
  if (showDuration.value && !allowedDurations.includes(form.value.duration ?? 0)) {
    form.value.duration = allowedDurations[0]
  }
  while (refImages.value.length > (cfg.maxRefImages || 0)) {
    const target = refImages.value.pop()
    if (target) URL.revokeObjectURL(target.url)
  }
}, { immediate: true })

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
let unsubRealtime: (() => void) | null = null
const hasPending = computed(() => myTasks.value.some(t => t.status === 'pending' || t.status === 'processing'))
function startPoll() { if (poll) return; poll = setInterval(async () => {
  if (realtimeConnected.value) { stopPoll(); return }
  if (document.visibilityState === 'hidden') return
  if (!hasPending.value) { stopPoll(); return }
  const ids = myTasks.value
    .filter((x) => x.status === 'pending' || x.status === 'processing')
    .map((x) => x.id)
  if (ids.length === 0) return
  try {
    const { data } = await getTasksStatusBatch(ids)
    const list = Array.isArray(data) ? data : []
    for (const u of list) {
      const i = myTasks.value.findIndex((x) => x.id === u.id)
      if (i >= 0) myTasks.value[i] = { ...myTasks.value[i], ...u }
    }
  } catch {}
}, 10000) }
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
    myTasks.value[idx] = {
      ...prev,
      status: (e.status as VideoTask['status']) || prev.status,
      progress: typeof e.progress === 'number' ? e.progress : prev.progress,
      errorMessage: (e.errorMessage ?? prev.errorMessage ?? undefined) as VideoTask['errorMessage'],
      videoUrl: e.videoUrl ?? prev.videoUrl,
      resultUrl: e.videoUrl ?? prev.resultUrl,
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
    stopPoll()
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length) {
      getTasksStatusBatch(ids)
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : []
          for (const u of list) {
            const i = myTasks.value.findIndex((x) => x.id === u.id)
            if (i >= 0) myTasks.value[i] = { ...myTasks.value[i], ...u }
          }
        })
        .catch(() => {})
    }
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
      model: currentModel,
      inputMode: inputMode.value,
    }
    if (showDuration.value) {
      params.duration = form.value.duration ?? durationOptions.value[0]
    }
    if (showRatio.value) {
      params.aspectRatio = selectedRatio.value
    }
    const payload: CreateVideoTaskData = {
      provider: actualModel.value,
      taskType: taskMode.value,
      prompt: form.value.prompt.trim(),
      params,
    }
    if (previewMode.value && currentModel === 'sora-2-pro-preview') {
      ;(payload.params as Record<string, unknown>).resolution = selectedResolution.value
    }
    if (isKlingModel.value) {
      ;(payload.params as Record<string, unknown>).klingMode = klingMode.value
      ;(payload.params as Record<string, unknown>).sound = klingSound.value
    }
    if (showKling26Sound.value) {
      ;(payload.params as Record<string, unknown>).sound = kling26Sound.value
    }
    if (isKling26Motion.value) {
      ;(payload.params as Record<string, unknown>).mode = motionResolution.value
      ;(payload.params as Record<string, unknown>).character_orientation = motionOrientation.value
    }
    if (isSeedanceModel.value) {
      ;(payload.params as Record<string, unknown>).resolution = seedanceResolution.value
      ;(payload.params as Record<string, unknown>).fixed_lens = seedanceFixedLens.value
      ;(payload.params as Record<string, unknown>).generate_audio = seedanceGenerateAudio.value
    }
    if (taskMode.value === 'img2video') {
      if (inputMode.value === 'frame') {
        payload.imageUrl = await uploadImageAndGetUrl(firstFrameFile.value!.file)
        if (lastFrameFile.value) {
          ;(payload.params as Record<string, unknown>).lastFrameUrl = await uploadImageAndGetUrl(lastFrameFile.value.file)
        }
      } else if (inputMode.value === 'ref') {
        const urls = await Promise.all(refImages.value.map((r) => uploadImageAndGetUrl(r.file)))
        payload.imageUrl = urls[0]
        ;(payload.params as Record<string, unknown>).urls = urls.slice(0, maxRef.value)
      } else if (inputMode.value === 'motion') {
        payload.imageUrl = await uploadImageAndGetUrl(motionRoleImage.value!.file)
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
function sText(s: string) { return ({ pending:'排队中', processing:'生成中', done:'已完成', completed:'已完成', failed:'失败' } as Record<string,string>)[s] ?? s }
function sColor(s: string) { return ({ pending:'#6B7785', processing:'#FF7D00', done:'#00B42A', completed:'#00B42A', failed:'#F53F3F' } as Record<string,string>)[s] ?? '#6B7785' }
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
      el.play().catch(() => {})
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
        await deleteVideoTask(task.id)
        myTasks.value = myTasks.value.filter((t) => t.id !== task.id)
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
        <h1 class="page-title">AI 视频</h1>
        <p class="page-desc">用文字或图片生成高质量 AI 视频</p>
      </div>
      <div class="tab-group">
        <button v-for="t in [{k:'create',l:'创作'},{k:'gallery',l:'广场'}]" :key="t.k" class="tab-btn" :class="{active:activeTab===t.k}" @click="activeTab=t.k">{{ t.l }}</button>
      </div>
    </header>

    <!-- ===== 创作 ===== -->
    <div v-show="activeTab==='create'" class="create-area">
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
            <button v-for="mode in availableInputModes" :key="mode" class="mode-btn" :class="{active:inputMode===mode}" @click="inputMode=mode">
              {{ inputModeLabels[mode] }}
            </button>
          </div>
        </section>

        <!-- 首帧 + 尾帧（frame 模式）-->
        <section v-if="inputMode==='frame' && canUseFrameMode" class="fg">
          <label class="fl">首帧图片 <span class="fl-hint">必选</span></label>
          <div v-if="firstFrameFile" class="frame-preview">
            <img :src="firstFrameFile.url" />
            <button class="frame-clear" aria-label="清除首帧" @click="clearFrame('first')"><IconClose :size="10" /></button>
          </div>
          <div v-else class="dropzone-sm" @click="firstFrameInputRef?.click()">
            <IconImage :size="18" class="upload-icon" /><span>点击上传首帧</span>
          </div>
          <input ref="firstFrameInputRef" type="file" accept="image/*" class="hidden-input" @change="pickFrame('first', $event)" />

          <label class="fl mt-12">尾帧图片 <span class="fl-hint">可选，需搭配首帧</span></label>
          <div v-if="lastFrameFile" class="frame-preview">
            <img :src="lastFrameFile.url" />
            <button class="frame-clear" aria-label="清除尾帧" @click="clearFrame('last')"><IconClose :size="10" /></button>
          </div>
          <div v-else class="dropzone-sm" @click="lastFrameInputRef?.click()">
            <IconImage :size="18" class="upload-icon" /><span>点击上传尾帧</span>
          </div>
          <input ref="lastFrameInputRef" type="file" accept="image/*" class="hidden-input" @change="pickFrame('last', $event)" />
        </section>

        <!-- 参考图 -->
        <section v-if="inputMode==='ref' && canUseRefMode" class="fg">
          <div class="fl-row">
            <label class="fl">参考图</label>
            <span class="fl-count">{{ refImages.length }}/{{ maxRef }}</span>
          </div>
          <div v-if="refImages.length > 0" class="ref-grid">
            <div v-for="r in refImages" :key="r.id" class="ref-item">
              <img :src="r.url" />
              <button class="ref-del" @click="removeRef(r.id)"><IconClose :size="10" /></button>
            </div>
            <button v-if="refImages.length < maxRef" class="ref-add" @click="refInputRef?.click()"><IconPlus :size="22" /></button>
          </div>
          <div v-else class="dropzone" @dragover.prevent @drop="handleRefDrop" @click="refInputRef?.click()">
            <IconPlus :size="28" class="upload-plus" />
            <span class="dz-text">点击或拖拽上传参考图</span>
            <span class="dz-hint">最多 {{ maxRef }} 张，不可与首尾帧同时使用</span>
          </div>
          <input ref="refInputRef" type="file" accept="image/*" multiple class="hidden-input" @change="handleRefSelect" />
        </section>

        <!-- 动作控制：角色图 + 动作视频 -->
        <section v-if="inputMode==='motion'" class="fg">
          <label class="fl">角色图 <span class="fl-hint">必选</span></label>
          <div v-if="motionRoleImage" class="frame-preview">
            <img :src="motionRoleImage.url" />
            <button class="frame-clear" @click="clearMotionImage"><IconClose :size="10" /></button>
          </div>
          <div v-else class="dropzone-sm" @click="motionRoleInputRef?.click()">
            <IconImage :size="18" class="upload-icon" /><span>点击上传角色图</span>
          </div>
          <input ref="motionRoleInputRef" type="file" accept="image/*" class="hidden-input" @change="pickMotionImage($event)" />

          <label class="fl mt-12">动作视频 <span class="fl-hint">必选</span></label>
          <div v-if="motionVideoFile" class="frame-preview">
            <video :src="motionVideoFile.url" muted preload="metadata" />
            <button class="frame-clear" aria-label="清除动作视频" @click="clearMotionVideo"><IconClose :size="10" /></button>
          </div>
          <div v-else class="dropzone-sm" @click="motionVideoInputRef?.click()">
            <IconVideoCamera :size="18" class="upload-icon" /><span>点击上传动作视频</span>
          </div>
          <input ref="motionVideoInputRef" type="file" accept="video/*" class="hidden-input" @change="pickMotionVideo($event)" />
        </section>

        <!-- 提示词 -->
        <section class="fg">
          <label class="fl">提示词</label>
          <a-textarea v-model="form.prompt" :auto-size="{minRows:4,maxRows:8}" placeholder="描述你想生成的视频内容..." />
        </section>

        <!-- 画面比例 -->
        <section v-if="showRatio" class="fg">
          <label class="fl">画面比例</label>
          <div class="dur-row">
            <button v-for="r in ratioOptions" :key="r.value" class="dur-btn" :class="{active:selectedRatio===r.value}" @click="selectedRatio=r.value">
              <span class="ratio-outline" :style="ratioPreviewStyle(r.value)" />
              {{ r.label }}
            </button>
          </div>
        </section>

        <section v-if="isSeedanceModel" class="fg">
          <label class="fl">分辨率</label>
          <div class="dur-row">
            <button v-for="r in seedanceResolutionOptions" :key="r.value" class="dur-btn" :class="{active:seedanceResolution===r.value}" @click="seedanceResolution=r.value">
              {{ r.label }}
            </button>
          </div>
        </section>

        <section v-if="showDuration" class="fg">
          <label class="fl">视频时长</label>
          <div class="dur-row">
            <button v-for="d in durationOptions" :key="d" class="dur-btn" :class="{active:form.duration===d}" @click="form.duration=d">
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
            <button class="dur-btn" :class="{active:motionResolution==='480p'}" @click="motionResolution='480p'">480p</button>
            <button class="dur-btn" :class="{active:motionResolution==='720p'}" @click="motionResolution='720p'">720p</button>
            <button class="dur-btn" :class="{active:motionResolution==='1080p'}" @click="motionResolution='1080p'">1080p</button>
          </div>
        </section>
        <section v-if="isKling26Motion" class="fg">
          <label class="fl">角色朝向</label>
          <div class="dur-row">
            <button class="dur-btn" :class="{active:motionOrientation==='image'}" @click="motionOrientation='image'">image</button>
            <button class="dur-btn" :class="{active:motionOrientation==='video'}" @click="motionOrientation='video'">video</button>
            <button class="dur-btn" :class="{active:motionOrientation==='auto'}" @click="motionOrientation='auto'">auto</button>
          </div>
        </section>

        <!-- Kling 3.0 专属选项 -->
        <section v-if="isKlingModel" class="fg">
          <label class="fl">画质模式</label>
          <div class="dur-row">
            <button class="dur-btn" :class="{active:klingMode==='std'}" @click="klingMode='std'">标准 (std)</button>
            <button class="dur-btn" :class="{active:klingMode==='pro'}" @click="klingMode='pro'">高清 (pro)</button>
          </div>
        </section>
        <section v-if="isKlingModel" class="fg">
          <label class="fl">音效</label>
          <a-switch v-model="klingSound" />
          <span class="fl-hint state-hint">{{ klingSound ? '开启' : '关闭' }}</span>
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
          <GenerateButton
            :loading="generating || uploading"
            :disabled="!form.prompt?.trim()"
            text="开始生成"
            :loading-text="uploading ? '上传素材中...' : '生成中...'"
            @click="handleGenerate"
          />
        </div>
      </aside>

      <!-- 右侧作品 -->
      <section class="works">
        <div class="works-head"><h3 class="works-title">我的视频</h3><span v-if="myTotal>0" class="badge">{{ myTotal }}</span></div>
        <a-spin :loading="myLoading" class="works-spin">
          <div v-if="myTasks.length>0" class="works-grid">
            <div v-for="t in myTasks" :key="t.id" class="vcard" @click="isDone(t.status)&&(t.videoUrl||t.resultUrl)?openPreview((t.videoUrl||t.resultUrl) as string, t):null">
              <div class="vcard-media">
                <video v-if="(t.videoUrl||t.resultUrl)&&isDone(t.status)" :src="(t.videoUrl||t.resultUrl) as string" muted loop preload="metadata" class="vcard-video" @mouseenter="($event.target as HTMLVideoElement)?.play()" @mouseleave="($event.target as HTMLVideoElement)?.pause()" />
                <img v-else-if="thumb(t)" :src="thumb(t)" class="vcard-thumb" />
                <div v-else class="vcard-ph"><IconVideoCamera :size="28" class="placeholder-icon" /></div>
                <!-- 进度步骤 -->
                <div v-if="t.status==='processing' || t.status==='pending'" class="step-ov">
                  <div class="step-stage">{{ videoStageText(t) }}</div>
                  <div class="steps">
                    <div class="st" :class="{on:stepIdx(t)>=1}"><span class="st-dot" />生成</div>
                    <div class="st-line" :class="{on:stepIdx(t)>=2}" />
                    <div class="st" :class="{on:stepIdx(t)>=2}"><span class="st-dot" />渲染</div>
                    <div class="st-line" :class="{on:stepIdx(t)>=3}" />
                    <div class="st" :class="{on:stepIdx(t)>=3}"><span class="st-dot" />完成</div>
                  </div>
                  <span class="st-pct">{{ t.progress??0 }}%</span>
                  <div class="st-progress">
                    <div class="st-progress-fill" :style="{ width: `${t.progress ?? 0}%` }" />
                  </div>
                  <div class="st-dots"><span /><span /><span /></div>
                </div>
                <span class="sbadge" :style="{background:sColor(t.status)}">{{ sText(t.status) }}</span>
                <div v-if="isDone(t.status)" class="play-ov"><IconPlayArrowFill :size="36" /></div>
              </div>
              <p class="vcard-prompt">{{ t.prompt||'无描述' }}</p>
              <p v-if="t.status==='failed' && t.errorMessage" class="vcard-error" :title="t.errorMessage" @click.stop="Modal.error({ title: '错误详情', content: t.errorMessage, okText: '关闭', maskClosable: true, closable: true })">{{ t.errorMessage }}</p>
              <div class="vcard-actions">
                <WorkCardActionButton
                  v-if="t.status==='failed'"
                  title="重试"
                  :disabled="retryingId===t.id"
                  @click="handleRetry(t)"
                >
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
        <a-pagination v-if="myTotal>12" v-model:current="myPage" :total="myTotal" :page-size="12" size="small" class="pager" @change="fetchMy" />
      </section>
    </div>

    <!-- ===== 广场 ===== -->
    <div v-show="activeTab==='gallery'" class="gal-area">
      <a-spin :loading="galLoading" class="gal-spin">
        <div v-if="gallery.length>0" class="gal-grid">
          <div v-for="item in gallery" :key="item.id" class="gcard" @click="openPreview(item.videoUrl)">
            <div class="gcard-media">
              <video :src="item.videoUrl" :poster="item.thumbnailUrl" muted loop preload="metadata" class="gcard-vid" @mouseenter="($event.target as HTMLVideoElement)?.play()" @mouseleave="($event.target as HTMLVideoElement)?.pause()" />
              <div class="gcard-hover"><IconPlayArrowFill :size="40" /></div>
            </div>
            <div class="gcard-info">
              <p class="gcard-prompt">{{ item.prompt||'无描述' }}</p>
              <div class="gcard-meta">
                <span class="author-dot">{{ item.authorName?.charAt(0)??'?' }}</span>
                <span>{{ item.authorName??'匿名' }}</span>
                <WorkCardActionButton shape="pill" title="一键同款" @click="copyPrompt(item.prompt??'')">
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
      <a-pagination v-if="galTotal>20" v-model:current="galPage" :total="galTotal" :page-size="20" size="small" class="pager" @change="fetchGal" />
    </div>

    <!-- 预览弹窗 -->
    <a-modal v-model:visible="previewOpen" title="视频预览" :width="800" :footer="false" unmount-on-close modal-class="dark-modal">
      <video v-if="previewUrl" ref="previewVideoRef" :src="previewUrl" controls class="preview-video" />
      <div v-if="previewTask" class="detail-panel">
        <div class="detail-title">任务详情参数</div>
        <div class="detail-grid">
          <div class="detail-item"><span class="k">任务 ID</span><span class="v mono">{{ previewTask.id }}</span></div>
          <div class="detail-item"><span class="k">服务商</span><span class="v">{{ previewTask.provider || '-' }}</span></div>
          <div class="detail-item"><span class="k">任务类型</span><span class="v">{{ previewTask.taskType || '-' }}</span></div>
          <div class="detail-item"><span class="k">状态</span><span class="v">{{ previewTask.status || '-' }}</span></div>
          <div class="detail-item"><span class="k">进度</span><span class="v">{{ previewTask.progress ?? 0 }}%</span></div>
          <div class="detail-item"><span class="k">时长</span><span class="v">{{ previewTask.duration ?? '-' }}</span></div>
          <div class="detail-item"><span class="k">创建时间</span><span class="v">{{ previewTask.createdAt || '-' }}</span></div>
          <div class="detail-item"><span class="k">失败原因</span><span class="v">{{ previewTask.errorMessage || '-' }}</span></div>
        </div>
        <div class="detail-block">
          <div class="kb">提示词</div>
          <pre class="json-view">{{ previewTask.prompt || '-' }}</pre>
        </div>
        <div class="detail-block">
          <div class="kb">扩展参数（params）</div>
          <pre class="json-view">{{ formatTaskParams(previewTask) }}</pre>
        </div>
        <div v-if="previewTask.status==='failed'" class="detail-actions">
          <button class="retry-btn" :disabled="retryingId===previewTask.id" @click="handleRetry(previewTask)">
            {{ retryingId===previewTask.id ? '重试中...' : '重新生成' }}
          </button>
        </div>
      </div>
    </a-modal>
  </div>
</template>

<style scoped>
.page { display:flex; flex-direction:column; height:100%; overflow:hidden; }

/* 顶部 */
.page-header { flex-shrink:0; display:flex; align-items:flex-end; justify-content:space-between; padding:var(--sp-6) var(--sp-8) var(--sp-4); }
.page-title { margin:0; font-size:1.25rem; font-weight:700; font-family: 'Space Grotesk', 'Outfit', -apple-system, 'PingFang SC', sans-serif; letter-spacing: -0.02em; background:var(--gradient-primary); -webkit-background-clip:text; -webkit-text-fill-color:transparent; }
.page-desc { margin:4px 0 0; font-size: 0.82rem; color:var(--text-4); font-family: 'Outfit', -apple-system, 'PingFang SC', sans-serif; }
.tab-group { display:flex; gap:4px; background:var(--bg-surface-2); border-radius:var(--radius-md); padding:3px; }
.tab-btn { padding:6px 20px; border:none; border-radius:var(--radius-sm); background:transparent; color:var(--text-3); font-size: 0.82rem; cursor:pointer; transition:all var(--duration-fast); }
.tab-btn.active { background:var(--primary); color:#fff; }

/* 创作区 */
.create-area { flex:1; display:flex; gap:var(--sp-6); padding:var(--sp-4) var(--sp-8) var(--sp-6); overflow:hidden; }

/* 左侧表单 */
.form-panel {
  width:320px; flex-shrink:0; overflow-y:auto; display:flex; flex-direction:column; gap:var(--sp-3);
  background:var(--glass-bg); backdrop-filter:var(--glass-blur); border:1px solid var(--glass-border);
  border-radius:var(--radius-lg); padding:var(--sp-5);
}
.fg { margin-bottom:var(--sp-1); }
.form-actions {
  margin-top: var(--sp-2);
  padding-bottom: 12px;
}
.form-actions :deep(.gen-btn:hover) { transform: translateY(-1px); }
.fl { display:block; font-size:0.78rem; font-weight:600; color:var(--text-3); margin-bottom:var(--sp-2); text-transform:uppercase; letter-spacing:0.05em; }
.fl-row { display:flex; align-items:center; gap:var(--sp-2); margin-bottom:var(--sp-2); }
.fl-row .fl { margin-bottom:0; }
.fl-count { font-size:0.72rem; color:var(--text-4); margin-left:auto; }
.w-full { width:100%; }
.hidden-input { display:none; }
.mt-12 { margin-top:12px; }
.upload-icon { opacity:0.72; color:var(--text-4); }
.ratio-outline {
  display: inline-block;
  margin-right: 4px;
  border: 1.5px solid var(--border-3);
  border-radius: 4px;
  background: transparent;
  flex-shrink: 0;
}
.state-hint { margin-left:8px; }
.kling-dot { background:#0ea5e9; }

/* 下拉选项行 */

/* 文生/图生 切换 */
.mode-toggle { display:flex; gap:var(--sp-2); }
.mode-btn {
  flex:1; display:flex; align-items:center; justify-content:center; gap:6px;
  padding:var(--sp-2) var(--sp-3); background:var(--bg-surface-2);
  border:1px solid var(--border-1); border-radius:var(--radius-md);
  color:var(--text-3); font-size: 0.82rem; cursor:pointer; transition:all var(--duration-normal);
}
.mode-btn:hover { border-color:var(--border-3); }
.mode-btn.active { border-color:var(--border-3); background:var(--color-fill-2); color:var(--text-1); }

/* 参考图 */
.ref-grid { display:flex; flex-wrap:wrap; gap:var(--sp-2); }
.ref-item { position:relative; width:72px; height:72px; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border-2); }
.ref-item img { width:100%; height:100%; object-fit:cover; }
.ref-del { position:absolute; top:2px; right:2px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.7); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; opacity:0; transition:opacity var(--duration-fast); }
.ref-item:hover .ref-del { opacity:1; }
.ref-add { width:72px; height:72px; border-radius:var(--radius-sm); border:1px dashed var(--border-3); background:var(--bg-surface-2); color:var(--text-4); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:all var(--duration-normal); }
.ref-add:hover { border-color:var(--primary); color:var(--primary); }
.dropzone {
  display:flex;
  flex-direction:column;
  align-items:center;
  justify-content:center;
  gap:8px;
  width:120px;
  height:120px;
  padding:10px;
  border:1px dashed var(--border-3);
  border-radius:var(--radius-md);
  background:var(--bg-surface-2);
  cursor:pointer;
  text-align:center;
  transition:all var(--duration-normal);
}
.dropzone:hover { border-color:var(--border-3); background:var(--color-fill-1); }
.upload-plus {
  color:var(--primary-light);
  background:rgba(22, 93, 255, 0.14);
  border:1px solid rgba(22, 93, 255, 0.36);
  border-radius:10px;
  padding:6px;
}
.dz-text { font-size: 0.75rem; color:var(--text-2); line-height:1.3; }
.dz-hint { font-size:0.68rem; color:var(--text-4); line-height:1.25; }
.fl-hint { font-weight:400; color:var(--text-4); text-transform:none; letter-spacing:0; font-size:0.7rem; }
.dropzone-sm { display:flex; align-items:center; gap:8px; padding:14px 16px; border:1px dashed var(--border-3); border-radius:var(--radius-md); background:var(--bg-surface-2); cursor:pointer; font-size: 0.82rem; color:var(--text-3); transition:all var(--duration-normal); }
.dropzone-sm:hover { border-color:var(--border-3); color:var(--text-1); background:var(--color-fill-1); }
.frame-preview { position:relative; width:120px; height:80px; border-radius:var(--radius-sm); overflow:hidden; border:1px solid var(--border-2); }
.frame-preview img { width:100%; height:100%; object-fit:cover; }
.frame-preview video { width:100%; height:100%; object-fit:cover; }
.frame-clear { position:absolute; top:3px; right:3px; width:18px; height:18px; border-radius:50%; background:rgba(0,0,0,0.5); border:none; color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.frame-clear:hover { background:var(--accent-red); }
.model-hint { display:flex; align-items:flex-start; gap:8px; padding:10px 14px; background:var(--color-fill-1); border:1px solid var(--border-2); border-radius:var(--radius-md); font-size:0.78rem; color:var(--text-3); line-height:1.4; margin-bottom:var(--sp-2); }
.hint-dot { width:6px; height:6px; border-radius:50%; background:var(--text-4); flex-shrink:0; margin-top:5px; }
.form-warn { padding:10px 14px; background:rgba(245, 63, 63, 0.1); border:1px solid rgba(245, 63, 63, 0.18); border-radius:var(--radius-md); margin-bottom:var(--sp-2); }
.warn-title { font-size:0.78rem; color:#fecaca; font-weight:600; margin-bottom:6px; }
.warn-list { margin:0; padding-left:16px; color:#fca5a5; font-size:0.76rem; line-height:1.4; }
.warn-list li { margin:2px 0; }
.mode-warn { font-size:0.72rem; color:var(--accent-amber); margin-top:8px; }

/* 时长 */
.dur-row { display:flex; gap:var(--sp-2); }
.dur-btn { flex:1; padding:var(--sp-2); background:var(--bg-surface-2); border:1px solid var(--border-1); border-radius:var(--radius-sm); color:var(--text-3); font-size: 0.82rem; cursor:pointer; text-align:center; transition:all var(--duration-fast); }
.dur-btn:hover { border-color:var(--border-3); }
.dur-btn.active { border-color:var(--border-3); background:var(--color-fill-2); color:var(--text-1); }

/* 生成按钮 */
/* 生成按钮 → 使用 GenerateButton 组件 */

/* 右侧作品 */
.works { flex:1; display:flex; flex-direction:column; min-width:0; overflow:hidden; }
.works-spin { flex:1; min-height:200px; display:flex; overflow:hidden; width:100%; }
.works-spin :deep(.arco-spin) { flex:1; min-height:0; display:flex; }
.works-spin :deep(.arco-spin-children) { flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; }
.works-head { display:flex; align-items:center; gap:var(--sp-2); margin-bottom:var(--sp-3); flex-shrink:0; }
.works-title { margin:0; font-size:1rem; font-weight:600; color:var(--text-1); }
.badge { background:var(--primary); color:#fff; font-size:0.7rem; font-weight:600; padding:1px 8px; border-radius:var(--radius-full); }
.works-empty { flex:1; min-height:260px; display:flex; align-items:center; justify-content:center; }
.works-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:var(--sp-4); overflow-y:auto; flex:1; padding-bottom:var(--sp-4); align-content:start; grid-auto-rows:max-content; }

/* 视频卡片 */
.vcard { background:var(--bg-surface-2); border:1px solid var(--border-1); border-radius:var(--radius-lg); overflow:hidden; cursor:pointer; transition:all var(--duration-normal) var(--ease-out); display:flex; flex-direction:column; min-height:0; align-self:start; }
.vcard:hover { transform:translateY(-3px); box-shadow:var(--shadow-glow); border-color:var(--border-3); }
.vcard-media { position:relative; overflow:hidden; background:var(--bg-surface-3); flex-shrink:0; height:196px; }
.vcard-video,.vcard-thumb { width:100%; height:100%; object-fit:cover; transition:transform var(--duration-normal) var(--ease-out); }
.vcard:hover .vcard-video,.vcard:hover .vcard-thumb { transform:scale(1.04); }
.vcard-ph { display:flex; align-items:center; justify-content:center; height:100%; }

/* 进度步骤 */
.step-ov { position:absolute; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center; background:rgba(5,10,22,0.74); gap:var(--sp-2); overflow:hidden; }
.step-ov::before {
  content:'';
  position:absolute; inset:-30%;
  background:radial-gradient(circle at 50% 50%, rgba(22, 93, 255, 0.1)), transparent 60%);
  animation:ovPulse 2s ease-in-out infinite;
}
.step-stage { position:relative; z-index:1; font-size:0.72rem; color:rgba(255,255,255,0.9); letter-spacing:0.02em; }
.steps { display:flex; align-items:center; gap:4px; }
.st { display:flex; align-items:center; gap:4px; font-size:0.7rem; color:var(--text-4); }
.st.on { color:var(--primary-light); }
.st-dot { width:8px; height:8px; border-radius:50%; background:var(--bg-surface-3); }
.st.on .st-dot { background:var(--primary); box-shadow:0 0 6px var(--primary); }
.st-line { width:20px; height:2px; background:var(--bg-surface-3); }
.st-line.on { background:var(--primary); }
.st-pct { position:relative; z-index:1; font-size: 0.78rem; font-weight:600; color:#fff; }
.st-progress { position:relative; z-index:1; width:140px; height:4px; border-radius:999px; background:rgba(255,255,255,0); overflow:hidden; }
.st-progress-fill { height:100%; border-radius:inherit; background:linear-gradient(90deg,#165DFF,#4080FF); transition:width var(--duration-normal) ease; }
.st-dots { position:relative; z-index:1; display:flex; gap:4px; margin-top:2px; }
.st-dots span { width:5px; height:5px; border-radius:50%; background:rgba(255,255,255,0.7); animation:dotPulse 1s ease-in-out infinite; }
.st-dots span:nth-child(2){ animation-delay:0s; }
.st-dots span:nth-child(3){ animation-delay:0.3s; }
@keyframes ovPulse { 0%,100%{ transform:scale(1); opacity:0.9 } 50%{ transform:scale(1.06); opacity:1 } }
@keyframes dotPulse { 0%,100%{ opacity:0; transform:translateY(0) } 50%{ opacity:1; transform:translateY(-2px) } }

.sbadge { position:absolute; top:var(--sp-2); left:var(--sp-2); padding:2px 10px; border-radius:var(--radius-full); font-size:0.7rem; color:#fff; font-weight:500; }
.play-ov { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.5); opacity:0; transition:opacity var(--duration-normal); background:rgba(0,0,0,0); }
.vcard:hover .play-ov { opacity:1; }
.vcard-prompt {
  margin:0;
  padding:var(--sp-2) var(--sp-3);
  font-size:0.78rem;
  color:var(--text-3);
  white-space:nowrap;
  overflow:hidden;
  text-overflow:ellipsis;
}

.vcard-error{
  margin:0;
  padding:0 var(--sp-3) var(--sp-2);
  font-size:0.75rem;
  color:var(--accent-red, #F53F3F);
  cursor:pointer;
  display:-webkit-box;
  -webkit-line-clamp:3;
  -webkit-box-orient:vertical;
  overflow:hidden;
  word-break:break-word;
}
.vcard-actions { display:flex; gap:8px; padding: 0 var(--sp-3) var(--sp-3); margin-top:auto; }
.retry-btn {
  border: 1px solid var(--border-2);
  background: var(--color-fill-2);
  color: var(--text-2);
  border-radius: var(--radius-full);
  padding: 4px 12px;
  font-size: 0.74rem;
  cursor: pointer;
  display:flex;
  align-items:center;
  gap:6px;
}
.retry-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.retry-btn.danger {
  border-color: rgba(245, 63, 63, 0.1);
  background: rgba(245, 63, 63, 0.1);
  color: #fecaca;
}
.pager { flex-shrink:0; margin-top:var(--sp-3); display:flex; justify-content:center; }

/* 广场 */
.gal-area { flex:1; padding:var(--sp-4) var(--sp-8) var(--sp-6); overflow-y:auto; }
.gal-spin { width:100%; min-height:200px; }
.gal-empty { min-height:340px; display:flex; align-items:center; justify-content:center; }
.gal-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); gap:var(--sp-4); align-content:start; grid-auto-rows:max-content; }
.gcard { background:var(--bg-surface-2); border:1px solid var(--border-1); border-radius:var(--radius-lg); overflow:hidden; cursor:pointer; transition:all var(--duration-normal); }
.gcard:hover { transform:translateY(-3px); box-shadow:var(--shadow-glow); border-color:var(--border-3); }
.gcard-media { position:relative; height:196px; overflow:hidden; background:var(--bg-surface-3); }
.gcard-vid { width:100%; height:100%; object-fit:cover; transition:transform var(--duration-normal) var(--ease-out); }
.gcard:hover .gcard-vid { transform:scale(1.04); }
.gcard-hover { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; color:#fff; background:rgba(0,0,0,0); opacity:0; transition:opacity var(--duration-normal); }
.gcard:hover .gcard-hover { opacity:1; }
.gcard-info { padding:var(--sp-3); }
.gcard-prompt { margin:0 0 var(--sp-2); font-size: 0.75rem; color:var(--text-2); display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.gcard-meta { display:flex; align-items:center; gap:var(--sp-2); font-size:0.72rem; color:var(--text-4); }
.author-dot { width:20px; height:20px; border-radius:50%; background:var(--gradient-primary); color:#fff; font-size: 0.75rem; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
.copy-btn { display:flex; align-items:center; gap:4px; margin-left:auto; padding:2px 8px; background:transparent; border:1px solid var(--border-2); border-radius:6px; color:var(--text-3); font-size:0.72rem; cursor:pointer; transition:all var(--duration-fast); }
.copy-btn:hover { background:var(--bg-surface-3); color:var(--text-1); border-color:var(--border-3); }

.detail-panel {
  margin-top: var(--sp-4);
  padding: var(--sp-4);
  border-radius: var(--radius-md);
  border: 1px solid var(--border-1);
  background: var(--bg-surface-2);
}
.detail-title { font-size: 0.86rem; color: var(--text-2); font-weight: 600; margin-bottom: var(--sp-3); }
.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 14px; }
.detail-item { display: flex; gap: 8px; min-width: 0; }
.detail-item .k { color: var(--text-4); font-size: 0.76rem; white-space: nowrap; }
.detail-item .v { color: var(--text-2); font-size: 0.76rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; }
.detail-block { margin-top: var(--sp-3); }
.kb { font-size: 0.76rem; color: var(--text-4); margin-bottom: 6px; }
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
.detail-actions { margin-top: var(--sp-3); display: flex; justify-content: flex-end; }
.preview-video { width:100%; border-radius:12px; }
.placeholder-icon { opacity:0.5; color:var(--text-4); }

@media(max-width:900px) { .create-area { flex-direction:column; } .form-panel { width:100%; max-height:45vh; } .works-grid { grid-template-columns:repeat(2,1fr); } }
@media(max-width:600px) { .page-header { flex-direction:column; align-items:flex-start; gap:var(--sp-3); padding:var(--sp-4); } .create-area,.gal-area { padding:var(--sp-3); } .works-grid,.gal-grid { grid-template-columns:repeat(2,1fr); gap:var(--sp-3); } }
@media(max-width:420px) { .works-grid,.gal-grid { grid-template-columns:1fr; } }
</style>
