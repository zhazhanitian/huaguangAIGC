<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconLoading, IconCopy, IconDownload, IconHeart, IconDelete,
} from '@arco-design/web-vue/es/icon'
import {
  createMusicTask, getMyTasks, getGallery, getTasksStatusBatch,
  runKieOperation, queryKieOperation, retryMusicTask, deleteMusicTask,
  type MusicTask, type MusicGalleryItem, type CreateMusicTaskData, type KieMusicOperation,
} from '../../api/music'
import { getModels } from '../../api/model'
import EmptyState from '../../components/EmptyState.vue'
import WorkCardActionButton from '../../components/WorkCardActionButton.vue'
import GenerateButton from '../../components/GenerateButton.vue'
import { onTaskEvent, realtimeConnected } from '../../realtime/socket'

/* === 状态 === */
const activeTab = ref('create')
const generating = ref(false)
const myTasks = ref<MusicTask[]>([])
const myPage = ref(1)
const myTotal = ref(0)
const myLoading = ref(false)
const gallery = ref<MusicGalleryItem[]>([])
const galPage = ref(1)
const galTotal = ref(0)
const galLoading = ref(false)
const toolkitLoading = ref(false)
const toolkitResult = ref('')
const toolkitTaskId = ref('')
const selectedOperation = ref<KieMusicOperation>('generate')
const payloadText = ref('')
const retryingIds = ref<Set<string>>(new Set())
const creatorToolLoading = ref(false)
const creatorToolResult = ref('')
const remixOperation = ref<'' | 'uploadCover' | 'uploadExtend' | 'addVocals' | 'addInstrumental'>('')
const remixSourceTaskId = ref('')
const remixPrompt = ref('')
const remixTitle = ref('')
const remixStyle = ref('pop')
const remixNegativeTags = ref('')
let kiePoll: ReturnType<typeof setInterval> | null = null

const musicPointsMap = ref<Record<string, number>>({})
const musicDescMap = ref<Record<string, string>>({})
const activeMusicModelNames = ref<Set<string>>(new Set())
/** 前端选项 value -> 后端 modelName */
const musicOptionToBackend: Record<string, string> = {
  V4: 'suno-v4',
  V4_5: 'suno-v4',
  V4_5PLUS: 'suno-v4.5plus',
  V4_5ALL: 'suno-v4.5plus',
  V5: 'suno-v4.5plus',
}
const modelOptionsDef = [
  { value: 'V4', label: 'V4（经典）', ptsKey: 'suno-v4', descKey: 'suno-v4' },
  { value: 'V4_5', label: 'V4（增强）', ptsKey: 'suno-v4', descKey: 'suno-v4' },
  { value: 'V4_5PLUS', label: 'V4 Plus（推荐）', ptsKey: 'suno-v4.5plus', descKey: 'suno-v4.5plus' },
  { value: 'V4_5ALL', label: 'V4 All（全能）', ptsKey: 'suno-v4.5plus', descKey: 'suno-v4.5plus' },
  { value: 'V5', label: 'V5（旗舰）', ptsKey: 'suno-v4.5plus', descKey: 'suno-v4.5plus' },
]
const modelOptions = computed(() => {
  const set = activeMusicModelNames.value
  const list = set.size === 0
    ? modelOptionsDef
    : modelOptionsDef.filter(opt => set.has(musicOptionToBackend[opt.value] ?? opt.value))
  return list.map(m => ({
    value: m.value,
    label: m.label,
    pts: musicPointsMap.value[m.ptsKey] ?? 0,
    desc: musicDescMap.value[m.descKey] || (m.value === 'V4' || m.value === 'V4_5' ? '兼顾质量与速度，适合大部分创作场景' : '平台默认推荐，质量/耗时平衡最佳'),
  }))
})

async function fetchMusicModelPoints() {
  try {
    const all = await getModels({ type: 'music' })
    if (Array.isArray(all)) {
      activeMusicModelNames.value = new Set(
        all.map((m: { modelName?: string }) => m.modelName).filter((x): x is string => Boolean(x))
      )
      for (const m of all) {
        if (!m) continue
        if (m.deductPoints) musicPointsMap.value[m.modelName] = m.deductPoints
        if (typeof (m as any).description === 'string' && (m as any).description.trim()) {
          musicDescMap.value[m.modelName] = (m as any).description.trim()
        }
      }
    }
  } catch { /* ignore */ }
}

watch(modelOptions, (opts) => {
  const first = opts[0]
  if (opts.length && first && !opts.some(o => o.value === form.value.model)) {
    form.value.model = first.value
  }
}, { immediate: true })

const operationOptions: Array<{ value: KieMusicOperation; label: string; hint: string }> = [
  { value: 'generate', label: '生成音乐', hint: '/api/v1/generate' },
  { value: 'extend', label: '扩展音乐', hint: '/api/v1/generate/extend' },
  { value: 'lyrics', label: '生成歌词', hint: '/api/v1/lyrics' },
  { value: 'timestampLyrics', label: '时间戳歌词', hint: '/api/v1/generate/get-timestamped-lyrics' },
  { value: 'replaceSection', label: '替换片段', hint: '/api/v1/generate/replace-section' },
  { value: 'mashup', label: '混音生成', hint: '/api/v1/generate/mashup' },
  { value: 'createVideo', label: '生成音乐视频', hint: '/api/v1/mp4/generate' },
  { value: 'separateVocals', label: '人声/伴奏分离', hint: '/api/v1/vocal-removal/generate' },
  { value: 'convertWav', label: '转换 WAV', hint: '/api/v1/wav/generate' },
  { value: 'generateMidi', label: '转换 MIDI', hint: '/api/v1/midi/generate' },
  { value: 'uploadExtend', label: '上传并扩展', hint: '/api/v1/generate/upload-extend' },
  { value: 'uploadCover', label: '上传并翻唱', hint: '/api/v1/generate/upload-cover' },
  { value: 'addVocals', label: '添加人声', hint: '/api/v1/generate/add-vocals' },
  { value: 'addInstrumental', label: '添加伴奏', hint: '/api/v1/generate/add-instrumental' },
  { value: 'generatePersona', label: '生成人设 Persona', hint: '/api/v1/generate/generate-persona' },
]

const operationTemplates: Record<KieMusicOperation, Record<string, unknown>> = {
  generate: { customMode: false, instrumental: false, model: 'V4_5PLUS', prompt: '一首适合夜晚聆听的轻松 LoFi 歌曲', callBackUrl: 'https://example.com/kie-callback' },
  extend: { defaultParamFlag: false, model: 'V4_5PLUS', audioId: '', prompt: '加入更有情绪起伏的副歌段落', callBackUrl: 'https://example.com/kie-callback' },
  lyrics: { prompt: '写一首关于未来城市的流行歌词', callBackUrl: 'https://example.com/kie-callback' },
  timestampLyrics: { taskId: '', audioId: '' },
  replaceSection: { taskId: '', audioId: '', prompt: '替换成更温暖的桥段', tags: 'pop', title: '新版本歌曲', infillStartS: 12, infillEndS: 24, callBackUrl: 'https://example.com/kie-callback' },
  mashup: { uploadUrlList: ['https://example.com/a.mp3', 'https://example.com/b.mp3'], customMode: false, model: 'V4_5PLUS', prompt: '融合两段素材，保持节奏统一', instrumental: false, callBackUrl: 'https://example.com/kie-callback' },
  createVideo: { taskId: '', audioId: '', author: '', domainName: '', callBackUrl: 'https://example.com/kie-callback' },
  separateVocals: { taskId: '', audioId: '', type: 'separate_vocal', callBackUrl: 'https://example.com/kie-callback' },
  convertWav: { taskId: '', audioId: '', callBackUrl: 'https://example.com/kie-callback' },
  generateMidi: { taskId: '', audioId: '', callBackUrl: 'https://example.com/kie-callback' },
  uploadExtend: { uploadUrl: 'https://example.com/input.mp3', defaultParamFlag: true, model: 'V4_5PLUS', instrumental: false, continueAt: 30, prompt: '在后半段加入弦乐和空间感', style: 'cinematic', title: '扩展版歌曲', callBackUrl: 'https://example.com/kie-callback' },
  uploadCover: { uploadUrl: 'https://example.com/input.mp3', customMode: false, model: 'V4_5PLUS', instrumental: false, prompt: '改编为流行风格并增强律动', callBackUrl: 'https://example.com/kie-callback' },
  addVocals: { uploadUrl: 'https://example.com/input.mp3', model: 'V4_5PLUS', prompt: '温柔男声演唱，情绪渐进', title: '加人声版本', style: 'pop', negativeTags: 'metal', callBackUrl: 'https://example.com/kie-callback' },
  addInstrumental: { uploadUrl: 'https://example.com/input.mp3', model: 'V4_5PLUS', title: '伴奏版音轨', tags: 'cinematic, piano', negativeTags: 'metal', callBackUrl: 'https://example.com/kie-callback' },
  generatePersona: { taskId: '', audioId: '', name: '未来之声', description: '未来感电音流行人设，节奏鲜明', vocalStart: 0, vocalEnd: 20, style: 'electro pop' },
}

const customMode = ref(true)
const isInstrumental = ref(false)
const showAdvanced = ref(false)

const form = ref<CreateMusicTaskData>({
  provider: 'suno',
  model: 'V4_5PLUS',
  customMode: true,
  instrumental: false,
  title: '',
  prompt: '',
  style: '',
  negativeTags: '',
  vocalGender: undefined,
  styleWeight: 0.5,
  weirdnessConstraint: 0.5,
  audioWeight: 0.5,
  personaId: '',
  personaModel: 'style_persona',
})

const styles = [
  { value: 'pop', label: '流行', emoji: '🎵', color: '#165DFF' },
  { value: 'rock', label: '摇滚', emoji: '🎸', color: '#F53F3F' },
  { value: 'electronic', label: '电子', emoji: '🎹', color: '#14C9C9' },
  { value: 'classical', label: '古典', emoji: '🎻', color: '#FF7D00' },
  { value: 'rap', label: '说唱', emoji: '🎤', color: '#F759AB' },
  { value: 'jazz', label: '爵士', emoji: '🎷', color: '#a78bfa' },
  { value: 'folk', label: '民谣', emoji: '🪕', color: '#00B42A' },
  { value: 'rnb', label: 'R&B', emoji: '💜', color: '#4080FF' },
  { value: 'country', label: '乡村', emoji: '🤠', color: '#d97706' },
  { value: 'ambient', label: '氛围', emoji: '🌌', color: '#0ea5e9' },
]
const promptLimit = computed(() => (customMode.value ? 5000 : 500))
const promptLen = computed(() => (form.value.prompt || '').length)
const completedTasks = computed(() =>
  myTasks.value.filter((t) => isDone(t.status) && !!t.audioUrl)
)

function styleLabel(v: string) { return styles.find(s => s.value === v)?.label ?? v }
function styleColor(v: string) { return styles.find(s => s.value === v)?.color ?? '#165DFF' }
function styleEmoji(v: string) { return styles.find(s => s.value === v)?.emoji ?? '🎵' }

watch(customMode, (v) => {
  form.value.customMode = v
})
watch(isInstrumental, (v) => {
  form.value.instrumental = v
})

/* 播放器 */
const currentAudio = ref<HTMLAudioElement | null>(null)
const playingId = ref<string | null>(null)
const playProgress = ref(0)
const playDuration = ref(0)
const playCurrentTime = ref(0)
let progressTimer: ReturnType<typeof setInterval> | null = null

function togglePlay(id: string, url: string) {
  if (playingId.value === id) {
    currentAudio.value?.pause()
    playingId.value = null
    stopProgressTimer()
    return
  }
  if (currentAudio.value) { currentAudio.value.pause(); currentAudio.value = null }
  const audio = new Audio(url)
  currentAudio.value = audio
  playingId.value = id
  audio.addEventListener('loadedmetadata', () => { playDuration.value = audio.duration })
  audio.addEventListener('ended', () => { playingId.value = null; playProgress.value = 0; stopProgressTimer() })
  audio.play()
  startProgressTimer()
}

function startProgressTimer() {
  stopProgressTimer()
  progressTimer = setInterval(() => {
    if (currentAudio.value) {
      playCurrentTime.value = currentAudio.value.currentTime
      playDuration.value = currentAudio.value.duration || 0
      playProgress.value = playDuration.value > 0 ? (playCurrentTime.value / playDuration.value) * 100 : 0
    }
  }, 200)
}
function stopProgressTimer() { if (progressTimer) { clearInterval(progressTimer); progressTimer = null } }

function seekAudio(e: MouseEvent) {
  if (!currentAudio.value || !playDuration.value) return
  const bar = e.currentTarget as HTMLElement
  const rect = bar.getBoundingClientRect()
  const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
  currentAudio.value.currentTime = pct * playDuration.value
}

function fmtTime(s: number) {
  if (!s || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/* 轮询 */
let poll: ReturnType<typeof setInterval> | null = null
let unsubRealtime: (() => void) | null = null
const hasPending = computed(() => myTasks.value.some(t => t.status === 'pending' || t.status === 'processing'))
function startPoll() {
  if (poll) return; poll = setInterval(async () => {
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
    } catch { }
  }, 10000)
}
function stopPoll() { if (poll) { clearInterval(poll); poll = null } }
watch(hasPending, v => v ? startPoll() : stopPoll())
watch(activeTab, (t) => {
  if (t === 'create') fetchMy()
  else if (t === 'gallery') fetchGal()
})
onMounted(() => {
  fetchMy()
  fetchMusicModelPoints()
  unsubRealtime = onTaskEvent((e) => {
    if (e.module !== 'music') return
    const idx = myTasks.value.findIndex((t) => t.id === e.taskId)
    if (idx < 0) return
    const prev = myTasks.value[idx]!
    myTasks.value[idx] = {
      ...prev,
      status: (e.status as MusicTask['status']) || prev.status,
      progress: typeof e.progress === 'number' ? e.progress : prev.progress,
      errorMessage: e.errorMessage ?? prev.errorMessage,
      audioUrl: e.audioUrl ?? prev.audioUrl,
      coverUrl: e.coverUrl ?? prev.coverUrl,
      updatedAt: e.updatedAt ?? prev.updatedAt,
    }
  })
})
onUnmounted(() => {
  stopPoll()
  unsubRealtime?.()
  unsubRealtime = null
  stopProgressTimer()
  currentAudio.value?.pause()
  stopKiePoll()
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
        .catch(() => { })
    }
  } else if (hasPending.value) startPoll()
})
watch(selectedOperation, () => loadOperationTemplate(), { immediate: true })

async function fetchMy() { myLoading.value = true; try { const { data } = await getMyTasks(myPage.value, 20); myTasks.value = data?.list ?? []; myTotal.value = data?.total ?? 0 } catch { myTasks.value = [] } finally { myLoading.value = false } }
async function fetchGal() { galLoading.value = true; try { const { data } = await getGallery(galPage.value, 20); gallery.value = data?.list ?? []; galTotal.value = data?.total ?? 0 } catch { gallery.value = [] } finally { galLoading.value = false } }

async function handleGenerate() {
  const prompt = form.value.prompt.trim()
  if (!prompt) { Message.warning('请输入提示词 / 歌词'); return }
  if (!customMode.value && prompt.length > 500) { Message.warning('简易模式下提示词最多 500 字'); return }
  if (customMode.value) {
    if (!form.value.style?.trim()) { Message.warning('自定义模式下 style 必填'); return }
    if (!form.value.title?.trim()) { Message.warning('自定义模式下 title 必填'); return }
    if ((form.value.title?.trim().length || 0) > 80) { Message.warning('title 最长 80 字符'); return }
  }

  generating.value = true
  try {
    const payload: CreateMusicTaskData = {
      provider: 'suno',
      model: form.value.model,
      customMode: customMode.value,
      instrumental: isInstrumental.value,
      prompt,
      ...(customMode.value ? {
        style: form.value.style?.trim(),
        title: form.value.title?.trim(),
      } : {}),
      ...(customMode.value && form.value.negativeTags?.trim() ? { negativeTags: form.value.negativeTags.trim() } : {}),
      ...(customMode.value && form.value.vocalGender ? { vocalGender: form.value.vocalGender } : {}),
      ...(customMode.value ? { styleWeight: Number(form.value.styleWeight ?? 0.5) } : {}),
      ...(customMode.value ? { weirdnessConstraint: Number(form.value.weirdnessConstraint ?? 0.5) } : {}),
      ...(customMode.value ? { audioWeight: Number(form.value.audioWeight ?? 0.5) } : {}),
      ...(customMode.value && form.value.personaId?.trim() ? { personaId: form.value.personaId.trim() } : {}),
      ...(customMode.value && form.value.personaModel ? { personaModel: form.value.personaModel } : {}),
    }
    const { data } = await createMusicTask(payload)
    if (data) { myTasks.value.unshift(data); Message.success('创作任务已提交'); startPoll() }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的描述包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '创建失败')
    }
  } finally { generating.value = false }
}

function buildRemixPayload() {
  if (!remixOperation.value) {
    throw new Error('请选择二次创作动作')
  }
  const source = completedTasks.value.find((t) => t.id === remixSourceTaskId.value)
  if (!source?.audioUrl) {
    throw new Error('请先选择一首已完成作品')
  }
  const model = form.value.model || 'V4_5PLUS'
  const title = remixTitle.value.trim() || source.title || '二次创作'
  const prompt = remixPrompt.value.trim() || source.prompt || '在原曲基础上进行优化创作'
  const style = remixStyle.value || 'pop'
  const negativeTags = remixNegativeTags.value.trim()

  if (remixOperation.value === 'uploadCover') {
    return {
      customMode: false,
      model,
      instrumental: false,
      uploadUrl: source.audioUrl,
      prompt,
    }
  }
  if (remixOperation.value === 'uploadExtend') {
    return {
      defaultParamFlag: true,
      model,
      instrumental: false,
      uploadUrl: source.audioUrl,
      continueAt: 30,
      prompt,
      style,
      title,
    }
  }
  if (remixOperation.value === 'addVocals') {
    return {
      uploadUrl: source.audioUrl,
      model,
      prompt,
      title,
      style,
      ...(negativeTags ? { negativeTags } : {}),
    }
  }
  return {
    uploadUrl: source.audioUrl,
    model,
    title,
    tags: style,
    ...(negativeTags ? { negativeTags } : {}),
  }
}

async function handleCreatorToolRun() {
  creatorToolLoading.value = true
  try {
    if (!remixOperation.value) {
      throw new Error('请选择二次创作动作')
    }
    const operation = remixOperation.value
    const payload = buildRemixPayload()
    const { data } = await runKieOperation(operation, payload)
    creatorToolResult.value = JSON.stringify(data ?? {}, null, 2)
    const taskId = (data?.data as Record<string, unknown> | undefined)?.taskId
    if (typeof taskId === 'string' && taskId) {
      toolkitTaskId.value = taskId
      Message.success(`二次创作任务已提交：${taskId}`)
      startKiePoll()
    } else {
      Message.success('二次创作已提交')
    }
  } catch (err) {
    Message.error(err instanceof Error ? err.message : '二次创作提交失败')
  } finally {
    creatorToolLoading.value = false
  }
}

async function handleRetryTask(task: MusicTask) {
  if (task.status !== 'failed') return
  if (retryingIds.value.has(task.id)) return
  retryingIds.value.add(task.id)
  try {
    const { data } = await retryMusicTask(task.id)
    const idx = myTasks.value.findIndex(x => x.id === task.id)
    if (idx >= 0 && data) {
      myTasks.value[idx] = { ...myTasks.value[idx], ...data }
    }
    Message.success('已重新提交，正在排队生成')
    startPoll()
  } catch (err) {
    Message.error(err instanceof Error ? err.message : '重试失败')
  } finally {
    retryingIds.value.delete(task.id)
  }
}

function handleDeleteTask(task: MusicTask) {
  Modal.confirm({
    title: '删除任务',
    content: '确定删除这个音乐任务吗？',
    onOk: async () => {
      try {
        await deleteMusicTask(task.id)
        myTasks.value = myTasks.value.filter((t) => t.id !== task.id)
        if (playingId.value === task.id) {
          currentAudio.value?.pause()
          currentAudio.value = null
          playingId.value = null
          playProgress.value = 0
          stopProgressTimer()
        }
        Message.success('已删除')
      } catch {
        Message.error('删除失败')
      }
    },
  })
}

function isDone(s: string) { return s === 'done' || s === 'completed' }
function sText(s: string) { return ({ pending: '排队中', processing: '生成中', done: '已完成', completed: '已完成', failed: '失败' } as Record<string, string>)[s] ?? s }
function musicStageText(task: MusicTask) {
  if (task.status === 'pending') return '正在初始化音乐任务'
  const p = task.progress ?? 0
  if (p < 35) return '正在生成旋律结构'
  if (p < 75) return '正在融合音色层次'
  return '正在输出高质量音频'
}

function copyPrompt(p: string) { navigator.clipboard.writeText(p).then(() => Message.success('已复制')) }
function downloadAudio(url: string, title: string) { const a = document.createElement('a'); a.href = url; a.download = `${title || 'music'}.mp3`; a.click() }
function taskParam(task: MusicTask, key: string) {
  return (task.params && typeof task.params === 'object') ? (task.params as Record<string, unknown>)[key] : undefined
}

function loadOperationTemplate() {
  payloadText.value = JSON.stringify(operationTemplates[selectedOperation.value], null, 2)
  toolkitTaskId.value = ''
}

function stopKiePoll() {
  if (kiePoll) {
    clearInterval(kiePoll)
    kiePoll = null
  }
}

function startKiePoll() {
  stopKiePoll()
  if (!toolkitTaskId.value) return
  kiePoll = setInterval(async () => {
    try {
      await handleKieQuery()
    } catch {
      // ignore poll failures
    }
  }, 6000)
}

async function handleKieRun() {
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(payloadText.value || '{}')
  } catch {
    Message.error('JSON 格式错误')
    return
  }
  toolkitLoading.value = true
  try {
    const { data } = await runKieOperation(selectedOperation.value, payload)
    toolkitResult.value = JSON.stringify(data ?? {}, null, 2)
    const taskId = (data?.data as Record<string, unknown> | undefined)?.taskId
    if (typeof taskId === 'string' && taskId) {
      toolkitTaskId.value = taskId
      Message.success(`任务已提交: ${taskId}`)
      startKiePoll()
    } else {
      Message.success('已执行')
    }
  } catch (err) {
    Message.error(`执行失败: ${err instanceof Error ? err.message : '未知错误'}`)
  } finally {
    toolkitLoading.value = false
  }
}

async function handleKieQuery() {
  if (!toolkitTaskId.value.trim()) {
    Message.warning('请填写 taskId')
    return
  }
  const { data } = await queryKieOperation(selectedOperation.value, toolkitTaskId.value.trim())
  toolkitResult.value = JSON.stringify(data ?? {}, null, 2)
}
</script>

<template>
  <div class="page">
    <!-- 标题 -->
    <header class="hd">
      <div>
        <h1 class="hd-title">音乐创作</h1>
        <p class="hd-desc">面向创作者的智能音乐平台，提供专业的生成能力、清晰的参数配置与稳定的任务处理体验。</p>
      </div>
      <div class="tab-group">
        <button v-for="t in [{ k: 'create', l: '创作' }, { k: 'gallery', l: '发现' }]" :key="t.k" class="tab-btn"
          :class="{ active: activeTab === t.k }" @click="activeTab = t.k">{{ t.l }}</button>
      </div>
    </header>

    <!-- ===== 创作 ===== -->
    <div v-show="activeTab === 'create'" class="create-area">
      <aside class="form-panel">
        <!-- 模型 -->
        <section class="fg">
          <label class="fl">模型</label>
          <div class="model-select">
            <select v-model="form.model" class="text-input">
              <option v-for="m in modelOptions" :key="m.value" :value="m.value">
                {{ m.label }}{{ m.pts ? ` (${m.pts}积分)` : '' }}
              </option>
            </select>
            <p v-if="modelOptions.find(x => x.value === form.model)?.desc" class="model-desc">
              {{ modelOptions.find(x => x.value === form.model)?.desc }}
            </p>
          </div>
        </section>

        <!-- 模式 -->
        <div class="mode-bar">
          <button class="mode-btn" :class="{ active: customMode }" @click="customMode = true">自定义模式</button>
          <button class="mode-btn" :class="{ active: !customMode }" @click="customMode = false">简易模式</button>
        </div>

        <!-- 歌曲标题 -->
        <section class="fg" v-if="customMode">
          <label class="fl">歌曲名称 <span class="fl-opt">必填（<=80）</span></label>
          <input v-model="form.title" class="text-input" maxlength="80" placeholder="例如：Midnight Neon" />
        </section>

        <!-- Prompt -->
        <section class="fg">
          <label class="fl">
            {{ customMode ? (isInstrumental ? '音乐创意描述' : '歌词 / 提示词') : '提示词（简易模式）' }}
            <span class="fl-opt">{{ customMode ? '最多5000' : '最多500' }}</span>
          </label>
          <textarea v-model="form.prompt" class="text-area lyrics-area" :maxlength="customMode ? 5000 : 500"
            :rows="customMode ? 8 : 5" :placeholder="customMode ? '[主歌]\\n写歌词或详细描述风格与情绪' : '例如：适合雨夜聆听的梦幻 LoFi 歌曲'" />
          <div class="field-counter">{{ promptLen }}/{{ promptLimit }}</div>
        </section>

        <!-- 纯音乐开关 -->
        <div class="toggle-row" @click="isInstrumental = !isInstrumental">
          <span class="toggle-label">纯音乐（无人声）</span>
          <div class="toggle-switch" :class="{ on: isInstrumental }">
            <div class="toggle-dot" />
          </div>
        </div>

        <!-- 风格 -->
        <section class="fg" v-if="customMode">
          <label class="fl">风格 <span class="fl-opt">必填</span></label>
          <div class="style-grid">
            <button v-for="s in styles" :key="s.value" class="style-chip" :class="{ active: form.style === s.value }"
              :style="{ '--sc': s.color }" @click="form.style = s.value">
              <span class="sc-emoji">{{ s.emoji }}</span>
              <span class="sc-label">{{ s.label }}</span>
            </button>
          </div>
        </section>

        <section class="fg" v-if="customMode">
          <label class="fl">负向风格（negativeTags）</label>
          <input v-model="form.negativeTags" class="text-input" placeholder="例如：重金属、过强鼓点" />
        </section>

        <section class="fg" v-if="customMode">
          <label class="fl">高级参数</label>
          <button class="mode-btn" style="width:100%" @click="showAdvanced = !showAdvanced">
            {{ showAdvanced ? '收起高级参数' : '展开高级参数' }}
          </button>
        </section>

        <template v-if="customMode && showAdvanced">
          <section class="fg">
            <label class="fl">人声性别（vocalGender）</label>
            <select v-model="form.vocalGender" class="text-input">
              <option :value="undefined">不指定</option>
              <option value="m">男声（m）</option>
              <option value="f">女声（f）</option>
            </select>
          </section>
          <section class="fg">
            <label class="fl">风格强度（styleWeight，0-1）</label>
            <input v-model.number="form.styleWeight" class="text-input" type="number" min="0" max="1" step="0.01" />
          </section>
          <section class="fg">
            <label class="fl">创意偏离（weirdnessConstraint，0-1）</label>
            <input v-model.number="form.weirdnessConstraint" class="text-input" type="number" min="0" max="1"
              step="0.01" />
          </section>
          <section class="fg">
            <label class="fl">音频权重（audioWeight，0-1）</label>
            <input v-model.number="form.audioWeight" class="text-input" type="number" min="0" max="1" step="0.01" />
          </section>
          <section class="fg">
            <label class="fl">人设 ID（personaId）</label>
            <input v-model="form.personaId" class="text-input" placeholder="可选：persona_xxx" />
          </section>
          <section class="fg">
            <label class="fl">人设模式（personaModel）</label>
            <select v-model="form.personaModel" class="text-input">
              <option value="style_persona">style_persona</option>
              <option value="voice_persona">voice_persona</option>
            </select>
          </section>
        </template>

        <!-- 生成 -->
        <GenerateButton :loading="generating" loading-text="创作中..." text="开始创作" @click="handleGenerate" />

        <!-- 二次创作工具（融入创作流程） -->
        <section class="creator-tools">
          <h4 class="ct-title">二次创作工具</h4>
          <p class="ct-desc">基于你已完成的作品做扩展、翻唱、加人声或生成伴奏，无需填写技术参数。</p>

          <label class="fl">选择作品</label>
          <select v-model="remixSourceTaskId" class="text-input">
            <option value="">不选择（请先选作品）</option>
            <option v-for="t in completedTasks" :key="t.id" :value="t.id">
              {{ t.title || (t.prompt || '').slice(0, 20) || '未命名作品' }}
            </option>
          </select>

          <label class="fl" style="margin-top:10px">二次创作动作</label>
          <select v-model="remixOperation" class="text-input">
            <option value="">不选择（请先选动作）</option>
            <option value="uploadCover">翻唱改编</option>
            <option value="uploadExtend">续写扩展</option>
            <option value="addVocals">添加人声</option>
            <option value="addInstrumental">提取伴奏</option>
          </select>

          <label class="fl" style="margin-top:10px">创作描述</label>
          <textarea v-model="remixPrompt" class="text-area" rows="3" placeholder="例如：保留旋律，节奏更轻快，更适合短视频配乐" />

          <div class="ct-grid">
            <div>
              <label class="fl">作品名</label>
              <input v-model="remixTitle" class="text-input" placeholder="可选，不填自动沿用原作品" />
            </div>
            <div>
              <label class="fl">风格标签</label>
              <input v-model="remixStyle" class="text-input" placeholder="如 pop / lofi / cinematic" />
            </div>
          </div>

          <label class="fl" style="margin-top:10px">负向风格（可选）</label>
          <input v-model="remixNegativeTags" class="text-input" placeholder="如：metal, noisy" />

          <button class="gen-btn" :disabled="creatorToolLoading || !completedTasks.length"
            @click="handleCreatorToolRun">
            <IconLoading v-if="creatorToolLoading" class="spin" />
            <span>{{ creatorToolLoading ? '提交中...' : '执行二次创作' }}</span>
          </button>

          <div v-if="!completedTasks.length" class="ct-tip">请先完成至少一首作品，再使用二次创作工具。</div>
          <pre v-if="creatorToolResult" class="ct-result">{{ creatorToolResult }}</pre>
        </section>
      </aside>

      <!-- 右侧：我的歌曲 -->
      <section class="songs">
        <div class="songs-head">
          <h3>我的音乐</h3><span v-if="myTotal > 0" class="badge">{{ myTotal }}</span>
        </div>
        <a-spin :loading="myLoading" class="songs-spin" style="width:100%;min-height:200px">
          <div v-if="myTasks.length > 0" class="song-grid">
            <div v-for="t in myTasks" :key="t.id" class="song-card" :class="{ playing: playingId === t.id }">
              <!-- 封面 -->
              <div class="song-cover"
                :style="{ background: `linear-gradient(135deg, ${styleColor(t.style ?? '')} 0%, ${styleColor(t.style ?? '')}66 100%)` }">
                <div class="vinyl-disc" :class="{ 'has-image': !!t.coverUrl }">
                  <img v-if="t.coverUrl" :src="t.coverUrl" />
                  <span v-else class="cover-emoji">{{ styleEmoji(t.style ?? '') }}</span>
                  <span class="vinyl-center-label">{{ (t.title || 'AI').slice(0, 6) }}</span>
                  <span class="vinyl-center-hole" />
                </div>
                <!-- 播放按钮 -->
                <button v-if="isDone(t.status) && t.audioUrl" class="play-circle"
                  @click.stop="togglePlay(t.id, t.audioUrl!)">
                  <svg v-if="playingId !== t.id" viewBox="0 0 24 24" width="24" height="24">
                    <polygon points="8,5 19,12 8,19" fill="#fff" />
                  </svg>
                  <svg v-else viewBox="0 0 24 24" width="24" height="24">
                    <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff" />
                    <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff" />
                  </svg>
                </button>
                <!-- 波形 -->
                <div v-if="playingId === t.id" class="wave-bars"><span /><span /><span /><span /><span /></div>
                <!-- 处理中 -->
                <div v-if="t.status === 'processing' || t.status === 'pending'" class="proc-ov">
                  <span class="proc-stage">{{ musicStageText(t) }}</span>
                  <div class="proc-ring">
                    <svg viewBox="0 0 40 40">
                      <circle cx="20" cy="20" r="16" fill="none" stroke="rgba(255,255,255,0)" stroke-width="3" />
                      <circle cx="20" cy="20" r="16" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"
                        :stroke-dasharray="`${(t.progress ?? 0) * 1.005} 100`" transform="rotate(-90 20 20)" />
                    </svg>
                  </div>
                  <span class="proc-pct">{{ t.progress ?? 0 }}%</span>
                  <div class="proc-progress">
                    <div class="proc-progress-fill" :style="{ width: `${t.progress ?? 0}%` }" />
                  </div>
                </div>
              </div>
              <!-- 信息 -->
              <div class="song-info">
                <h4 class="song-title">{{ t.title || t.prompt?.slice(0, 24) || '未命名' }}</h4>
                <div class="song-meta">
                  <span class="song-style"
                    :style="{ color: styleColor(t.style ?? ''), background: styleColor(t.style ?? '') + '1a' }">{{
                      styleLabel(t.style??'') }}</span>
                  <span class="song-status">· {{ String(taskParam(t, 'model') || 'V4_5PLUS') }}</span>
                  <span class="song-status">· {{ taskParam(t, 'customMode') ? '自定义' : '简易' }}</span>
                  <span class="song-status">· {{ taskParam(t, 'instrumental') ? '纯音乐' : '有人声' }}</span>
                  <span v-if="!isDone(t.status)" class="song-status"
                    :style="{ color: t.status === 'failed' ? 'var(--accent-red)' : 'var(--text-4)' }">{{ sText(t.status)
                    }}</span>
                  <span v-if="t.status === 'failed' && t.errorMessage" class="song-status song-error-msg"
                    style="color:var(--accent-red);cursor:pointer" :title="t.errorMessage"
                    @click.stop="Modal.error({ title: '错误详情', content: t.errorMessage, okText: '关闭', maskClosable: true, closable: true })">
                    · {{ t.errorMessage }}</span>
                </div>
              </div>
              <!-- 底部操作 -->
              <div class="song-actions">
                <WorkCardActionButton danger title="删除任务" @click="handleDeleteTask(t)">
                  <IconDelete :size="14" />
                </WorkCardActionButton>
                <template v-if="isDone(t.status) && t.audioUrl">
                  <WorkCardActionButton title="下载" @click="downloadAudio(t.audioUrl!, t.title ?? '')">
                    <IconDownload :size="14" />
                  </WorkCardActionButton>
                  <WorkCardActionButton title="复制提示词" @click="copyPrompt(t.prompt ?? '')">
                    <IconCopy :size="14" />
                  </WorkCardActionButton>
                </template>
                <template v-else-if="t.status === 'failed'">
                  <WorkCardActionButton shape="pill" :disabled="retryingIds.has(t.id)" title="重新生成"
                    @click="handleRetryTask(t)">
                    <IconLoading v-if="retryingIds.has(t.id)" class="spin" />
                    <span>{{ retryingIds.has(t.id) ? '重试中...' : '重新生成' }}</span>
                  </WorkCardActionButton>
                </template>
              </div>
            </div>
          </div>
          <div v-else-if="!myLoading" class="works-empty">
            <EmptyState title="暂无音乐" description="输入歌词或描述，开始你的第一首AI音乐创作" />
          </div>
        </a-spin>
        <a-pagination v-if="myTotal > 20" v-model:current="myPage" :total="myTotal" :page-size="20" size="small"
          class="pager" @change="fetchMy" />
      </section>
    </div>

    <!-- ===== 发现 ===== -->
    <div v-show="activeTab === 'gallery'" class="gal-area">
      <a-spin :loading="galLoading" style="width:100%;min-height:200px">
        <div v-if="gallery.length > 0" class="song-grid gal-grid">
          <div v-for="item in gallery" :key="item.id" class="song-card" :class="{ playing: playingId === item.id }">
            <div class="song-cover"
              :style="{ background: `linear-gradient(135deg, ${styleColor(item.style ?? '')} 0%, ${styleColor(item.style ?? '')}66 100%)` }">
              <div class="vinyl-disc" :class="{ 'has-image': !!item.coverUrl }">
                <img v-if="item.coverUrl" :src="item.coverUrl" />
                <span v-else class="cover-emoji">{{ styleEmoji(item.style ?? '') }}</span>
                <span class="vinyl-center-label">{{ (item.title || 'AI').slice(0, 6) }}</span>
                <span class="vinyl-center-hole" />
              </div>
              <button v-if="item.audioUrl" class="play-circle" @click.stop="togglePlay(item.id, item.audioUrl)">
                <svg v-if="playingId !== item.id" viewBox="0 0 24 24" width="24" height="24">
                  <polygon points="8,5 19,12 8,19" fill="#fff" />
                </svg>
                <svg v-else viewBox="0 0 24 24" width="24" height="24">
                  <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff" />
                  <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff" />
                </svg>
              </button>
              <div v-if="playingId === item.id" class="wave-bars"><span /><span /><span /><span /><span /></div>
            </div>
            <div class="song-info">
              <h4 class="song-title">{{ item.title || '未命名' }}</h4>
              <div class="song-meta">
                <span class="song-style"
                  :style="{ color: styleColor(item.style ?? ''), background: styleColor(item.style ?? '') + '1a' }">{{
                    styleLabel(item.style??'') }}</span>
                <span class="song-author">{{ item.authorName ?? '匿名' }}</span>
              </div>
            </div>
            <div class="song-actions">
              <WorkCardActionButton title="复制提示词" @click="copyPrompt(item.prompt ?? '')">
                <IconCopy :size="14" />
              </WorkCardActionButton>
              <WorkCardActionButton title="喜欢">
                <IconHeart :size="14" />
              </WorkCardActionButton>
            </div>
          </div>
        </div>
        <div v-else-if="!galLoading" class="gal-empty">
          <EmptyState title="暂无公开作品" description="创作并分享你的AI音乐" />
        </div>
      </a-spin>
      <a-pagination v-if="galTotal > 20" v-model:current="galPage" :total="galTotal" :page-size="20" size="small"
        class="pager" @change="fetchGal" />
    </div>

    <!-- ===== Kie 全套工具台 ===== -->
    <div v-show="activeTab === 'toolkit'" class="toolkit-area">
      <div class="toolkit-grid">
        <section class="toolkit-panel">
          <h3 class="toolkit-title">操作选择</h3>
          <select v-model="selectedOperation" class="text-input">
            <option v-for="op in operationOptions" :key="op.value" :value="op.value">
              {{ op.label }}（{{ op.hint }}）
            </option>
          </select>
          <div class="toolkit-tip">
            按 Kie 官方参数模板生成，可直接修改 JSON 后提交。若需要上传音频，请先准备“公网可访问链接”。
          </div>

          <h3 class="toolkit-title">请求参数（JSON）</h3>
          <textarea v-model="payloadText" class="toolkit-json" rows="18" spellcheck="false" />

          <div class="toolkit-actions">
            <button class="mode-btn" @click="loadOperationTemplate()">重置模板</button>
            <button class="gen-btn" :disabled="toolkitLoading" @click="handleKieRun">
              <IconLoading v-if="toolkitLoading" class="spin" />
              <span>{{ toolkitLoading ? '执行中...' : '提交执行' }}</span>
            </button>
          </div>
        </section>

        <section class="toolkit-panel">
          <h3 class="toolkit-title">任务查询</h3>
          <div class="toolkit-query">
            <input v-model="toolkitTaskId" class="text-input" placeholder="任务ID（提交后自动填充）" />
            <button class="mode-btn" @click="handleKieQuery">查询任务</button>
          </div>
          <div class="toolkit-tip">
            支持查询的操作会走对应 `record-info` 接口；不支持查询的操作将直接显示执行返回结果。
          </div>

          <h3 class="toolkit-title">返回结果</h3>
          <pre class="toolkit-result">{{ toolkitResult || '{\n "提示": "执行后将在这里显示结果"\n}' }}</pre>
        </section>
      </div>
    </div>

    <!-- ===== 底部播放器（正在播放时显示）===== -->
    <Transition name="slide-up">
      <div v-if="playingId" class="player-bar">
        <div class="player-inner">
          <div class="player-info">
            <div class="player-cover" :style="{ background: 'var(--gradient-primary)' }">
              <span style="font-size:16px">🎵</span>
            </div>
            <div class="player-text">
              <span class="player-title">{{[...myTasks, ...gallery].find(x => x.id === playingId)?.title || '播放中'}}</span>
              <span class="player-time">{{ fmtTime(playCurrentTime) }} / {{ fmtTime(playDuration) }}</span>
            </div>
          </div>
          <div class="player-controls">
            <button class="player-btn" @click="togglePlay(playingId!, '')">
              <svg viewBox="0 0 24 24" width="20" height="20">
                <rect x="6" y="5" width="4" height="14" rx="1" fill="#fff" />
                <rect x="14" y="5" width="4" height="14" rx="1" fill="#fff" />
              </svg>
            </button>
          </div>
          <div class="player-progress" @click="seekAudio">
            <div class="player-bar-bg">
              <div class="player-bar-fill" :style="{ width: playProgress + '%' }" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  position: relative;
}

/* 头部 */
.hd {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--sp-6) var(--sp-8) var(--sp-4);
}

.hd-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  font-family: 'Space Grotesk', 'Outfit', -apple-system, 'PingFang SC', sans-serif;
  letter-spacing: -0.02em;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.hd-desc {
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
  transition: all 0s;
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
  width: 340px;
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

.fl {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.fl-opt {
  font-weight: 400;
  color: var(--text-4);
  text-transform: none;
}

.mode-bar {
  display: flex;
  gap: 4px;
  background: var(--bg-surface-2);
  border-radius: var(--radius-md);
  padding: 3px;
  margin-bottom: var(--sp-3);
}

.mode-btn {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-3);
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0s;
}

.mode-btn.active {
  background: var(--primary);
  color: #fff;
}

/* 输入框 */
.text-input {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  color: var(--text-1);
  font-size: 14px;
  outline: none;
  transition: border-color 0s;
  font-family: inherit;
}

.text-input:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.1);
}

.text-input::placeholder {
  color: var(--text-4);
}

.text-area {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  color: var(--text-1);
  font-size: 14px;
  outline: none;
  resize: vertical;
  line-height: 1;
  font-family: inherit;
  transition: border-color 0s;
}

.text-area:focus {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.1);
}

.text-area::placeholder {
  color: var(--text-4);
}

.lyrics-area {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 13px;
}

.field-counter {
  margin-top: 6px;
  text-align: right;
  font-size: 11px;
  color: var(--text-4);
}

.model-select {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-desc {
  margin: 0;
  font-size: 12px;
  color: var(--text-4);
}

/* 纯音乐开关 */
.toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 0;
  cursor: pointer;
  margin-bottom: var(--sp-2);
}

.toggle-label {
  font-size: 0.82rem;
  color: var(--text-2);
}

.toggle-switch {
  width: 40px;
  height: 22px;
  border-radius: 11px;
  background: var(--bg-elevated);
  border: 1px solid var(--border-2);
  position: relative;
  transition: all 0s;
}

.toggle-switch.on {
  background: var(--primary);
  border-color: var(--primary);
}

.toggle-dot {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #fff;
  position: absolute;
  top: 1px;
  left: 1px;
  transition: transform 0s;
}

.toggle-switch.on .toggle-dot {
  transform: translateX(18px);
}

/* 风格选择 */
.style-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.style-chip {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 14px;
  border-radius: var(--radius-full);
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  color: var(--text-3);
  font-size: 0.78rem;
  cursor: pointer;
  transition: all 0s;
}

.style-chip:hover {
  border-color: var(--sc);
  color: var(--sc);
}

.style-chip.active {
  background: color-mix(in srgb, var(--sc) 15%, transparent);
  border-color: var(--sc);
  color: var(--sc);
  box-shadow: 0 0 12px color-mix(in srgb, var(--sc) 25%, transparent);
}

.sc-emoji {
  font-size: 14px;
}

.sc-label {
  font-weight: 500;
}

/* 生成按钮 */
/* 生成按钮 → 使用 GenerateButton 组件 */

/* 融入创作流程的二次创作工具 */
.creator-tools {
  margin-top: 14px;
  padding: 12px;
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--bg-surface-2) 84%, transparent);
}

.ct-title {
  margin: 0;
  font-size: 14px;
  color: var(--text-2);
}

.ct-desc {
  margin: 6px 0 10px;
  font-size: 12px;
  color: var(--text-4);
  line-height: 1;
}

.ct-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 10px;
}

.ct-tip {
  margin-top: 8px;
  font-size: 12px;
  color: var(--text-4);
}

.ct-result {
  margin-top: 10px;
  max-height: 140px;
  overflow: auto;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  background: var(--bg-surface-3);
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.5;
  padding: 8px;
}

/* ===== 歌曲网格 ===== */
.songs {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.songs-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.songs-spin :deep(.arco-spin) {
  flex: 1;
  min-height: 0;
  display: flex;
}

.songs-spin :deep(.arco-spin-children) {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.works-empty {
  flex: 1;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.songs-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-bottom: var(--sp-3);
  flex-shrink: 0;
}

.songs-head h3 {
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

.song-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp-4);
  overflow-y: auto;
  flex: 1;
  padding-bottom: var(--sp-4);
  align-content: start;
  grid-auto-rows: max-content;
}

.gal-area {
  flex: 1;
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow-y: auto;
  padding-bottom: 80px;
}

.gal-empty {
  min-height: 340px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.gal-grid {
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
}

/* 单张歌曲卡 */
.song-card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  transition: all 0s var(--ease-out);
  display: flex;
  flex-direction: column;
  cursor: pointer;
  align-self: start;
}

.song-card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
}

.song-card.playing {
  border-color: var(--primary);
  box-shadow: 0 0 20px rgba(22, 93, 255, 0.1);
}

/* 封面 */
.song-cover {
  position: relative;
  height: 196px;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.song-card.playing .vinyl-disc {
  animation: coverSpin 6s linear infinite;
}

@keyframes coverSpin {
  to {
    transform: rotate(360deg)
  }
}

.vinyl-disc {
  position: relative;
  width: min(82%, 164px);
  height: auto;
  aspect-ratio: 1 / 1;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  background:
    repeating-radial-gradient(circle at center, rgba(255, 255, 255, 0) 0 1px, rgba(255, 255, 255, 0) 1px 6px),
    radial-gradient(circle at 30% 24%, rgba(255, 255, 255, 0.5), rgba(255, 255, 255, 0) 36%),
    radial-gradient(circle at center, #2f2f35 0 46%, #151519 68%, #0a0a0d 100%);
  box-shadow:
    inset 0 0 0 2px rgba(255, 255, 255, 0),
    inset 0 0 30px rgba(0, 0, 0, 0.5),
    0 12px 20px rgba(0, 0, 0, 0.8);
  transition: transform 0s ease;
}

@supports not (aspect-ratio: 1 / 1) {
  .vinyl-disc {
    height: min(82%, 164px);
  }
}

.vinyl-disc.has-image::after {
  content: '';
  position: absolute;
  inset: 0;
  background:
    repeating-radial-gradient(circle at center, rgba(255, 255, 255, 0.06) 0 1px, rgba(255, 255, 255, 0) 1px 7px);
  pointer-events: none;
}

.vinyl-disc img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-emoji {
  font-size: 44px;
  filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.3));
}

.vinyl-center-label {
  position: absolute;
  width: 32%;
  height: 32%;
  border-radius: 50%;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.95), rgba(168, 85, 247, 0.95));
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.5);
  z-index: 2;
}

.vinyl-center-hole {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #f8fafc;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.3);
  z-index: 3;
}

/* 播放按钮 */
.play-circle {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0);
  backdrop-filter: none;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transform: translate(-50%, -50%);
  transition: all 0s;
  z-index: 2;
}

.song-card:hover .play-circle {
  opacity: 1;
}

.song-card.playing .play-circle {
  opacity: 1;
  background: var(--primary);
}

.play-circle:hover {
  transform: translate(-50%, -50%) scale(1.06);
}

@media (hover: none) {
  .song-card .play-circle {
    opacity: 1;
  }
}

/* 波形动画 */
.wave-bars {
  position: absolute;
  bottom: 8px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 20px;
  z-index: 1;
}

.wave-bars span {
  width: 3px;
  border-radius: 2px;
  background: #fff;
  animation: wb 1s ease-in-out infinite;
}

.wave-bars span:nth-child(1) {
  --h: 16px;
  animation-delay: 0s
}

.wave-bars span:nth-child(2) {
  --h: 10px;
  animation-delay: 0.1s
}

.wave-bars span:nth-child(3) {
  --h: 20px;
  animation-delay: 0s
}

.wave-bars span:nth-child(4) {
  --h: 8px;
  animation-delay: 0.3s
}

.wave-bars span:nth-child(5) {
  --h: 14px;
  animation-delay: 0s
}

@keyframes wb {

  0%,
  100% {
    height: 3px
  }

  50% {
    height: var(--h, 12px)
  }
}

/* 处理中 */
.proc-ov {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(6, 10, 20, 0.2);
  gap: 6px;
  overflow: hidden;
}

.proc-ov::before {
  content: '';
  position: absolute;
  inset: -30%;
  background: radial-gradient(circle at 50% 50%, rgba(22, 93, 255, 0.2), transparent 62%);
  animation: musicPulse 2s ease-in-out infinite;
}

.proc-stage {
  position: relative;
  z-index: 1;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.9);
  letter-spacing: 0.02em;
}

.proc-ring svg {
  width: 44px;
  height: 44px;
}

.proc-pct {
  position: relative;
  z-index: 1;
  font-size: 0.75rem;
  color: #fff;
  font-weight: 600;
}

.proc-progress {
  position: relative;
  z-index: 1;
  width: 116px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.16);
  overflow: hidden;
}

.proc-progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #165DFF, #4080FF);
  transition: width 0s ease;
}

@keyframes musicPulse {

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

/* 歌曲信息 */
.song-info {
  padding: var(--sp-3) var(--sp-3) var(--sp-1);
  flex: 0 0 auto;
  overflow: hidden;
}

.song-title {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song-meta {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  margin-top: 4px;
  flex-wrap: nowrap;
  overflow: hidden;
  white-space: nowrap;
}

.song-status {
  white-space: nowrap;
}

.song-style {
  padding: 1px 8px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  font-weight: 500;
}

.song-status {
  font-size: 0.72rem;
}

.song-author {
  font-size: 0.72rem;
  color: var(--text-4);
}

/* 操作栏 */
.song-actions {
  display: flex;
  gap: 8px;
  padding: 0 var(--sp-3) var(--sp-3);
  margin-top: auto;
  flex-wrap: nowrap;
  align-items: center;
}

.sa-btn {
  width: 30px;
  height: 30px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.14);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all var(--duration-fast);
}

.sa-btn:hover {
  background: rgba(255, 255, 255, 0.2);
}

.sa-btn.danger {
  color: #fca5a5;
}

.sa-btn.danger:hover {
  background: rgba(245, 63, 63, 0.5);
  color: #fee2e2;
}

.retry-btn {
  width: 100%;
  border: 1px solid var(--border-2);
  border-radius: 8px;
  padding: 6px 10px;
  background: var(--bg-surface-3);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0s;
}

.retry-btn:hover:not(:disabled) {
  border-color: var(--primary);
  color: var(--primary);
}

.retry-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.pager {
  flex-shrink: 0;
  margin-top: var(--sp-3);
  display: flex;
  justify-content: center;
}

/* ===== 全套工具台 ===== */
.toolkit-area {
  flex: 1;
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow: hidden;
}

.toolkit-grid {
  height: 100%;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: var(--sp-4);
}

.toolkit-panel {
  min-height: 0;
  overflow: auto;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  padding: var(--sp-4);
}

.toolkit-title {
  margin: 0 0 var(--sp-2);
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--text-2);
}

.toolkit-tip {
  margin: 8px 0 14px;
  font-size: 12px;
  color: var(--text-4);
  line-height: 1;
}

.toolkit-json {
  width: 100%;
  border: 1px solid var(--border-2);
  border-radius: 10px;
  background: var(--bg-surface-3);
  color: var(--primary-light);
  padding: 12px;
  resize: vertical;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 12px;
  line-height: 1;
}

.toolkit-actions {
  margin-top: var(--sp-3);
  display: flex;
  gap: var(--sp-2);
  align-items: center;
}

.toolkit-query {
  display: flex;
  gap: var(--sp-2);
  align-items: center;
  margin-bottom: 8px;
}

.toolkit-result {
  margin: 0;
  border: 1px solid var(--border-2);
  border-radius: 10px;
  background: var(--bg-surface-3);
  color: var(--text-2);
  padding: 12px;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 380px;
  font-size: 12px;
  line-height: 1.5;
}

/* ===== 底部播放器 ===== */
.player-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--bg-surface-1);
  border-top: 1px solid var(--border-2);
  backdrop-filter: var(--glass-blur);
}

.player-inner {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-3) var(--sp-6);
  max-width: 100%;
}

.player-info {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-shrink: 0;
  min-width: 180px;
}

.player-cover {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.player-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.player-title {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text-1);
}

.player-time {
  font-size: 0.72rem;
  color: var(--text-4);
}

.player-controls {
  flex-shrink: 0;
}

.player-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0s;
}

.player-btn:hover {
  transform: scale(1);
}

.player-progress {
  flex: 1;
  cursor: pointer;
  padding: 8px 0;
}

.player-bar-bg {
  height: 4px;
  background: var(--bg-elevated);
  border-radius: 2px;
  overflow: hidden;
}

.player-bar-fill {
  height: 100%;
  background: var(--gradient-primary);
  border-radius: 2px;
  transition: width 0s;
}

/* 进场动画 */
.slide-up-enter-active {
  animation: slideUp 0.3s var(--ease-out);
}

.slide-up-leave-active {
  animation: slideUp 0s ease-in reverse;
}

@keyframes slideUp {
  from {
    transform: translateY(100%);
    opacity: 0
  }

  to {
    transform: translateY(0);
    opacity: 1
  }
}

@media(max-width:900px) {
  .create-area {
    flex-direction: column;
  }

  .form-panel {
    width: 100%;
    max-height: 45vh;
  }

  .song-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .toolkit-grid {
    grid-template-columns: 1fr;
  }
}

@media(max-width:600px) {
  .hd {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-4);
  }

  .create-area,
  .gal-area,
  .toolkit-area {
    padding: var(--sp-3);
  }

  .song-grid {
    grid-template-columns: repeat(2, 1fr);
    gap: var(--sp-3);
  }
}

@media(max-width:420px) {
  .song-grid {
    grid-template-columns: 1fr;
  }
}
</style>
