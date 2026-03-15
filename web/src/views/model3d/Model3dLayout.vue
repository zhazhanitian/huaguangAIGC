<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconApps,
  IconCheckCircle,
  IconCopy,
  IconDelete,
  IconDownload,
  IconEye,
  IconLoading,
  IconPlus,
  IconRefresh,
} from '@arco-design/web-vue/es/icon'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import type { GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import {
  createModel3dTask,
  deleteModel3dTask,
  getModel3dGallery,
  getModel3dTaskStatus,
  getModel3dTasksStatusBatch,
  getMyModel3dPrintOrders,
  getMyModel3dTasks,
  payModel3dPrintOrder,
  retryModel3dTask,
  toggleModel3dPublic,
  createModel3dPrintOrder,
  type CreateModel3dTaskData,
  type CreateModel3dPrintOrderData,
  type Model3dGalleryItem,
  type Model3dPrintOrder,
  type Model3dPrintMaterial,
  type Model3dTask,
} from '../../api/model3d'
import { uploadFile } from '../../api/upload'
import { checkText } from '../../api/content-moderation'
import { getModels } from '../../api/model'
import EmptyState from '../../components/EmptyState.vue'
import WorkCardActionButton from '../../components/WorkCardActionButton.vue'
import GenerateButton from '../../components/GenerateButton.vue'
import { onTaskEvent, realtimeConnected } from '../../realtime/socket'

const activeTab = ref<'create' | 'gallery'>('create')
const generating = ref(false)
const uploading = ref(false)
const myTasks = ref<Model3dTask[]>([])
const myPage = ref(1)
const myTotal = ref(0)
const myLoading = ref(false)
const gallery = ref<Model3dGalleryItem[]>([])
const galPage = ref(1)
const galTotal = ref(0)
const galLoading = ref(false)
const previewOpen = ref(false)
const previewTask = ref<Model3dTask | null>(null)
const previewModelUrl = ref('')
const modelLoading = ref(false)
const modelLoadError = ref('')
// 预览内临时切换（不回写任务）：null 表示跟随任务 params
const previewWhiteModel = ref<boolean | null>(null)
const retryingId = ref<string | null>(null)
const printOrderOpen = ref(false)
const printOrderStep = ref(0)
const printSubmitting = ref(false)
const printPaying = ref(false)
const selectedPrintableTask = ref<{
  id: string
  prompt?: string
  previewUrl?: string
} | null>(null)
const createdPrintOrder = ref<Model3dPrintOrder | null>(null)
const printOrdersOpen = ref(false)
const printOrders = ref<Model3dPrintOrder[]>([])
const printOrdersLoading = ref(false)
const printOrdersPage = ref(1)
const printOrdersTotal = ref(0)

const printForm = ref({
  material: 'pla' as Model3dPrintMaterial,
  receiverName: '',
  receiverPhone: '',
  receiverAddress: '',
  remark: '',
})

const form = ref({
  taskType: 'text2model',
  provider: 'tencent-hunyuan-3d-pro',
  modelVersion: '3.1',
  prompt: '',
  whiteModel: false,
  textureStyle: 'general',
  lightingPreset: 'studio',
  exportFormat: '',
})

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024 // 10MB，与后端一致

function normalizeUploadUrl(rawUrl: string) {
  if (!rawUrl) return rawUrl
  if (rawUrl.startsWith('http')) return rawUrl
  return `${window.location.origin}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`
}

const sourceImage = ref<{ file: File; url: string } | null>(null)
const sourceInputRef = ref<HTMLInputElement>()
const sourceUploading = ref(false)

const providersDef = [
  { value: 'tencent-hunyuan-3d-pro', label: '腾讯混元3D-专业版', desc: '高质量，支持更多细节参数' },
  { value: 'tencent-hunyuan-3d-rapid', label: '腾讯混元3D-极速版', desc: '生成更快，适合快速迭代' },
]
/** GET /model/list?type=3d 返回的 modelName 与前端 value 一致（来自 model.service 预设），无需映射 */
const active3dModelNames = ref<Set<string>>(new Set())
const providers = computed(() => {
  const set = active3dModelNames.value
  if (set.size === 0) return providersDef
  return providersDef.filter(p => set.has(p.value))
})

async function fetch3dModels() {
  try {
    const list = await getModels({ type: '3d' })
    if (Array.isArray(list)) {
      active3dModelNames.value = new Set(
        list.map((m: { modelName?: string }) => m.modelName).filter((x): x is string => Boolean(x))
      )
    }
  } catch { /* ignore */ }
}

watch(providers, (list) => {
  const first = list[0]
  if (list.length && first && !list.some(p => p.value === form.value.provider)) {
    form.value.provider = first.value
  }
}, { immediate: true })

const textureStyles = [
  { value: 'general', label: '通用' },
  { value: 'stone', label: '石雕' },
  { value: 'porcelain', label: '青花瓷' },
  { value: 'cartoon', label: '卡通' },
  { value: 'cyberpunk', label: '赛博朋克' },
]

const lightingPresets = [
  { value: 'studio', label: '工作室光' },
  { value: 'outdoor', label: '户外天光' },
  { value: 'dramatic', label: '戏剧光影' },
]

const printMaterials = [
  { value: 'pla' as Model3dPrintMaterial, label: 'PLA材质', desc: '轻量耐用，适合摆件与原型', price: 59 },
  { value: 'white_clay' as Model3dPrintMaterial, label: '高白泥材质', desc: '细节清晰，质感温润，适合礼品', price: 99 },
  { value: 'purple_clay' as Model3dPrintMaterial, label: '紫砂泥材质', desc: '质感厚重，工艺感更强', price: 139 },
]

const hasPending = computed(() =>
  myTasks.value.some((t) => t.status === 'pending' || t.status === 'processing'),
)
const isProMode = computed(() => form.value.provider.includes('pro'))
const promptMaxLength = computed(() => (isProMode.value ? 1024 : 200))
const exportFormatOptions = computed(() =>
  isProMode.value
    ? [
      { value: '', label: '默认（返回 OBJ + GLB）' },
      { value: 'stl', label: 'STL' },
      { value: 'usdz', label: 'USDZ' },
      { value: 'fbx', label: 'FBX' },
    ]
    : [
      { value: '', label: '默认（返回 OBJ）' },
      { value: 'obj', label: 'OBJ' },
      { value: 'glb', label: 'GLB' },
      { value: 'stl', label: 'STL' },
      { value: 'usdz', label: 'USDZ' },
      { value: 'fbx', label: 'FBX' },
      { value: 'mp4', label: 'MP4' },
    ],
)

watch(
  () => form.value.provider,
  (provider) => {
    if (provider.includes('pro')) {
      form.value.modelVersion = form.value.modelVersion === '3.0' ? '3.0' : '3.1'
      if (['obj', 'glb', 'mp4'].includes(form.value.exportFormat)) {
        form.value.exportFormat = ''
      }
      return
    }
    form.value.modelVersion = '3.1'
  },
)

let pollTimer: ReturnType<typeof setInterval> | null = null
let unsubRealtime: (() => void) | null = null
function startPoll() {
  if (pollTimer) return
  if (realtimeConnected.value) return
  if (document.visibilityState === 'hidden') return
  pollTimer = setInterval(async () => {
    if (!hasPending.value) {
      stopPoll()
      return
    }
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length === 0) return
    try {
      const { data } = await getModel3dTasksStatusBatch(ids)
      const list = Array.isArray(data) ? data : []
      for (const u of list) {
        const idx = myTasks.value.findIndex((x) => x.id === u.id)
        if (idx >= 0) myTasks.value[idx] = { ...myTasks.value[idx], ...u }
      }
    } catch {
      // ignore batch polling errors
    }
  }, 10000)
}
function stopPoll() {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

watch(hasPending, (v) => (v ? startPoll() : stopPoll()))
watch(activeTab, (tab) => (tab === 'create' ? fetchMyTasks() : fetchGallery()))

watch(realtimeConnected, (connected) => {
  if (connected) {
    stopPoll()
    const ids = myTasks.value
      .filter((t) => t.status === 'pending' || t.status === 'processing')
      .map((t) => t.id)
    if (ids.length) {
      getModel3dTasksStatusBatch(ids)
        .then(({ data }) => {
          const list = Array.isArray(data) ? data : []
          for (const u of list) {
            const idx = myTasks.value.findIndex((x) => x.id === u.id)
            if (idx >= 0) myTasks.value[idx] = { ...myTasks.value[idx], ...u }
          }
        })
        .catch(() => { })
    }
  } else if (hasPending.value) startPoll()
})

async function fetchMyTasks() {
  myLoading.value = true
  try {
    const { data } = await getMyModel3dTasks(myPage.value, 12)
    myTasks.value = data?.list ?? []
    myTotal.value = data?.total ?? 0
  } catch {
    myTasks.value = []
  } finally {
    myLoading.value = false
  }
}

async function fetchGallery() {
  galLoading.value = true
  try {
    const { data } = await getModel3dGallery(galPage.value, 20)
    gallery.value = data?.list ?? []
    galTotal.value = data?.total ?? 0
  } catch {
    gallery.value = []
  } finally {
    galLoading.value = false
  }
}

function resetPrintFlowState() {
  printOrderStep.value = 0
  printSubmitting.value = false
  printPaying.value = false
  createdPrintOrder.value = null
  printForm.value = {
    material: 'pla',
    receiverName: '',
    receiverPhone: '',
    receiverAddress: '',
    remark: '',
  }
}

function openPrintFlow(task: { id: string; prompt?: string; resultPreviewUrl?: string | null }) {
  selectedPrintableTask.value = {
    id: task.id,
    prompt: task.prompt,
    previewUrl: task.resultPreviewUrl || undefined,
  }
  resetPrintFlowState()
  printOrderOpen.value = true
}

function materialLabel(material: string) {
  return (
    printMaterials.find((x) => x.value === material)?.label ||
    material
  )
}

function printStatusText(status: string) {
  return (
    {
      pending: '待支付',
      paid: '已支付',
      failed: '支付失败',
    } as Record<string, string>
  )[status] || status
}

function printStatusColor(status: string) {
  return (
    {
      pending: 'orange',
      paid: 'green',
      failed: 'red',
    } as Record<string, string>
  )[status] || 'gray'
}

async function fetchPrintOrders() {
  printOrdersLoading.value = true
  try {
    const { data } = await getMyModel3dPrintOrders(printOrdersPage.value, 10)
    printOrders.value = data?.list ?? []
    printOrdersTotal.value = data?.total ?? 0
  } catch {
    printOrders.value = []
    printOrdersTotal.value = 0
  } finally {
    printOrdersLoading.value = false
  }
}

function openPrintOrders() {
  printOrdersOpen.value = true
  fetchPrintOrders()
}

async function pickSourceImage(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file || !file.type.startsWith('image/')) return
  ;(e.target as HTMLInputElement).value = ''
  if (file.size > MAX_UPLOAD_SIZE) {
    Message.error({ content: '图片超过 10MB 限制', duration: 4000 })
    return
  }
  sourceUploading.value = true
  try {
    const { data } = await uploadFile(file)
    const url = data?.url || ''
    if (!url) throw new Error('未返回地址')
    const serverUrl = normalizeUploadUrl(url)
    if (sourceImage.value?.url.startsWith('blob:')) URL.revokeObjectURL(sourceImage.value.url)
    sourceImage.value = { file, url: serverUrl }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    const status = err?.response?.status
    if (status === 400) Modal.error({ title: '⚠️ 图片不合规', content: msg || '请更换图片后重试', okText: '我知道了' })
    else Message.error({ content: msg || '上传失败', duration: 4000 })
  } finally {
    sourceUploading.value = false
  }
}

function clearSourceImage() {
  if (sourceImage.value) {
    if (sourceImage.value.url.startsWith('blob:')) URL.revokeObjectURL(sourceImage.value.url)
    sourceImage.value = null
  }
}

async function handleGenerate() {
  const prompt = form.value.prompt.trim()
  if (!form.value.prompt.trim()) {
    Message.warning('请输入 3D 生成描述')
    return
  }
  if (prompt.length > promptMaxLength.value) {
    Message.warning(`当前模型提示词最多 ${promptMaxLength.value} 字`)
    return
  }
  if (form.value.taskType === 'img2model' && !sourceImage.value) {
    Message.warning('图生3D需要先上传参考图')
    return
  }

  try {
    const { data: checkResult } = await checkText(prompt)
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

  generating.value = true
  try {
    const inputImageUrl =
      form.value.taskType === 'img2model' && sourceImage.value ? sourceImage.value.url : undefined

    const payload: CreateModel3dTaskData = {
      taskType: form.value.taskType as 'text2model' | 'img2model',
      provider: form.value.provider,
      prompt,
      inputImageUrl,
      params: {
        model: form.value.modelVersion,
        mode: isProMode.value ? 'pro' : 'rapid',
        whiteModel: form.value.whiteModel,
        textureStyle: form.value.textureStyle,
        lightingPreset: form.value.lightingPreset,
        exportFormat: form.value.exportFormat || undefined,
      },
    }
    const { data } = await createModel3dTask(payload)
    if (data) {
      myTasks.value.unshift(data)
      Message.success('3D任务已提交')
      startPoll()
      activeTab.value = 'create'
    }
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的描述包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '创建失败')
    }
  } finally {
    generating.value = false
    uploading.value = false
  }
}

function goPrintStepNext() {
  if (printOrderStep.value === 0) {
    printOrderStep.value = 1
    return
  }
  if (printOrderStep.value === 1) {
    if (!printForm.value.receiverName.trim()) {
      Message.warning('请填写收货人姓名')
      return
    }
    if (!printForm.value.receiverPhone.trim()) {
      Message.warning('请填写收货手机号')
      return
    }
    if (!printForm.value.receiverAddress.trim()) {
      Message.warning('请填写收货地址')
      return
    }
    void createPrintOrder()
  }
}

function goPrintStepBack() {
  if (printOrderStep.value > 0) {
    printOrderStep.value -= 1
  }
}

async function createPrintOrder() {
  if (!selectedPrintableTask.value) {
    Message.error('未找到可下单模型')
    return
  }
  printSubmitting.value = true
  try {
    const payload: CreateModel3dPrintOrderData = {
      taskId: selectedPrintableTask.value.id,
      material: printForm.value.material,
      receiverName: printForm.value.receiverName.trim(),
      receiverPhone: printForm.value.receiverPhone.trim(),
      receiverAddress: printForm.value.receiverAddress.trim(),
      remark: printForm.value.remark.trim() || undefined,
    }
    const { data } = await createModel3dPrintOrder(payload)
    createdPrintOrder.value = data
    printOrderStep.value = 2
    Message.success('打印订单创建成功，请扫码支付')
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '创建打印订单失败'
    Message.error(msg)
  } finally {
    printSubmitting.value = false
  }
}

async function confirmPrintPaid() {
  if (!createdPrintOrder.value) return
  printPaying.value = true
  try {
    const { data } = await payModel3dPrintOrder(createdPrintOrder.value.id)
    createdPrintOrder.value = data
    Message.success('支付成功，已进入订单系统')
    printOrderOpen.value = false
    openPrintOrders()
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || '支付确认失败'
    Message.error(msg)
  } finally {
    printPaying.value = false
  }
}

function sText(s: string) {
  return ({ pending: '排队中', processing: '建模中', completed: '已完成', done: '已完成', failed: '失败' } as Record<string, string>)[s] ?? s
}
function sColor(s: string) {
  return ({ pending: '#6B7785', processing: '#FF7D00', completed: '#00B42A', done: '#00B42A', failed: '#F53F3F' } as Record<string, string>)[s] ?? '#6B7785'
}
function progressStage(task: Model3dTask) {
  const params = (task.params || {}) as Record<string, unknown>
  const upstream = String(params.tencentStatus || '').toUpperCase()
  if (upstream === 'WAIT') return '腾讯云任务排队中（WAIT）'
  if (upstream === 'RUN') return '腾讯云任务处理中（RUN）'
  if (task.status === 'pending') return '正在初始化任务'
  return '等待腾讯云返回结果'
}

function previewImage(task: Model3dTask) {
  return task.resultPreviewUrl || ''
}
function galleryPreview(item: Model3dGalleryItem) {
  return item.resultPreviewUrl || ''
}

async function openPreview(task: Model3dTask) {
  try {
    const { data } = await getModel3dTaskStatus(task.id)
    const latest = (data || task) as Model3dTask
    const idx = myTasks.value.findIndex((x) => x.id === latest.id)
    if (idx >= 0) myTasks.value[idx] = { ...myTasks.value[idx], ...latest }
    previewTask.value = latest
    previewModelUrl.value = pickBestModelUrl(latest)
  } catch {
    previewTask.value = task
    previewModelUrl.value = pickBestModelUrl(task)
  }
  previewOpen.value = true
}

async function handleDelete(task: Model3dTask) {
  Modal.confirm({
    title: '删除任务',
    content: '确定删除这个 3D 任务吗？',
    onOk: async () => {
      try {
        await deleteModel3dTask(task.id)
        myTasks.value = myTasks.value.filter((x) => x.id !== task.id)
        Message.success('已删除')
      } catch {
        Message.error('删除失败')
      }
    },
  })
}

async function handleRetry(task: Model3dTask) {
  if (task.status !== 'failed' || retryingId.value) return
  retryingId.value = task.id
  try {
    const { data } = await retryModel3dTask(task.id)
    if (data) {
      myTasks.value = myTasks.value.filter((x) => x.id !== task.id)
      myTasks.value.unshift(data)
      Message.success('已重新提交任务')
      startPoll()
    }
  } catch {
    Message.error('重试失败')
  } finally {
    retryingId.value = null
  }
}

async function handleTogglePublic(task: Model3dTask) {
  try {
    await toggleModel3dPublic(task.id)
    Message.success('可见性已更新')
    fetchMyTasks()
  } catch {
    Message.error('更新失败')
  }
}

function handleExport(task?: Model3dTask | null) {
  const params = ((task?.params || {}) as Record<string, unknown>) || {}
  const url = String(params.tencentOriginalResultUrl || task?.resultModelUrl || '')
  if (!url) {
    Message.warning('暂无可导出模型')
    return
  }
  const ext = (() => {
    try {
      const clear = url.split('?')[0] ?? ''
      const last = clear.split('.').pop()?.toLowerCase()
      return last || 'glb'
    } catch {
      return 'glb'
    }
  })()
  const a = document.createElement('a')
  a.href = url
  a.download = `model3d-${task?.id || 'export'}.${ext}`
  a.click()
}

// ===== Three.js Viewer =====
const viewerRef = ref<HTMLElement | null>(null)
let renderer: THREE.WebGLRenderer | null = null
let scene: THREE.Scene | null = null
let camera: THREE.PerspectiveCamera | null = null
let controls: OrbitControls | null = null
let gltfLoader: GLTFLoader | null = null
let objLoader: OBJLoader | null = null
let stlLoader: STLLoader | null = null
let fbxLoader: FBXLoader | null = null
let frameId: number | null = null
let rootObject: THREE.Object3D | null = null
let ambientLight: THREE.AmbientLight | null = null
let dirLightA: THREE.DirectionalLight | null = null
let dirLightB: THREE.DirectionalLight | null = null
let loadSeq = 0
const originalMaterials = new Map<string, THREE.Material | THREE.Material[]>()
const overrideMaterials = new Map<string, THREE.Material | THREE.Material[]>()

function isGlbLike(url?: string) {
  const clean = (url || '').split('?')[0]?.toLowerCase() || ''
  return clean.endsWith('.glb') || clean.endsWith('.gltf')
}
function pickBestModelUrl(task?: Model3dTask | null) {
  if (!task) return ''
  const params = ((task.params as Record<string, unknown>) || {}) as Record<string, unknown>
  const preview = String(params.tencentPreviewModelUrl || '').trim()
  if (isGlbLike(preview)) return preview
  const direct = String(task.resultModelUrl || '').trim()
  if (direct) return direct
  return String(params.tencentOriginalResultUrl || '').trim()
}

function toViewerUrl(url: string) {
  const raw = (url || '').trim()
  if (!raw) return ''
  if (raw.startsWith('blob:') || raw.startsWith('data:')) return raw
  // 跨域模型文件经常缺 CORS 头，Three.js 会直接加载失败；走后端代理更稳。
  if (/^https?:\/\//i.test(raw)) {
    try {
      const u = new URL(raw)
      if (u.origin !== window.location.origin) {
        return `/api/model3d/proxy?url=${encodeURIComponent(raw)}`
      }
    } catch {
      // ignore
    }
  }
  return raw
}

function guessExt(url: string) {
  const clean = (url || '').split('?')[0] || ''
  const ext = clean.split('.').pop()?.toLowerCase() || ''
  return ext
}
function ensureNormals(object: THREE.Object3D) {
  object.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    const geom = mesh.geometry
    // 一些 OBJ/STL 会没有 normal，光照下会全黑
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hasNormal = Boolean((geom as any)?.attributes?.normal)
    if (!hasNormal && geom && 'computeVertexNormals' in geom) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ; (geom as any).computeVertexNormals?.()
    }
    geom?.computeBoundingSphere?.()
  })
}

function ensureViewer() {
  if (!viewerRef.value || renderer) return
  const container = viewerRef.value
  scene = new THREE.Scene()
  scene.background = new THREE.Color('#090d1a')
  camera = new THREE.PerspectiveCamera(45, container.clientWidth / Math.max(container.clientHeight, 1), 0.01, 100)
  camera.position.set(1, 1, 2)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(container.clientWidth, container.clientHeight)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  container.appendChild(renderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.minDistance = 0.3
  controls.maxDistance = 10

  ambientLight = new THREE.AmbientLight(0xffffff, 1.0)
  dirLightA = new THREE.DirectionalLight(0xffffff, 1)
  dirLightA.position.set(2, 3, 2)
  dirLightB = new THREE.DirectionalLight(0x8cb4ff, 0.7)
  dirLightB.position.set(-2, 1, -2)
  scene.add(ambientLight, dirLightA, dirLightB)

  gltfLoader = new GLTFLoader()
  objLoader = new OBJLoader()
  stlLoader = new STLLoader()
  fbxLoader = new FBXLoader()
  const loop = () => {
    if (controls) controls.update()
    if (renderer && scene && camera) renderer.render(scene, camera)
    frameId = window.requestAnimationFrame(loop)
  }
  loop()
}

function clearModel() {
  if (!scene || !rootObject) return
  scene.remove(rootObject)
  rootObject.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    mesh.geometry?.dispose?.()
    // 避免误 dispose GLB 的原始贴图材质：只释放我们自己创建的覆盖材质
    const over = overrideMaterials.get(mesh.uuid)
    if (over) {
      if (Array.isArray(over)) over.forEach((m) => m.dispose?.())
      else over.dispose?.()
    }
  })
  rootObject = null
  originalMaterials.clear()
  overrideMaterials.clear()
}

function textureColor(style: string) {
  return (
    {
      general: '#B2D4FF',
      stone: '#b1a89d',
      porcelain: '#8eb4d8',
      cartoon: '#ffce73',
      cyberpunk: '#63f3ff',
    } as Record<string, string>
  )[style] || '#B2D4FF'
}

function applyAppearance() {
  if (!rootObject || !previewTask.value) return
  const params = (previewTask.value.params || {}) as Record<string, unknown>
  const whiteModel = previewWhiteModel.value ?? Boolean(params.whiteModel)
  const style = String(params.textureStyle || 'general')
  const color = new THREE.Color(whiteModel ? '#f2f4f8' : textureColor(style))
  rootObject.traverse((obj: THREE.Object3D) => {
    const mesh = obj as THREE.Mesh
    if (!mesh.isMesh) return
    // 贴图模式：恢复模型自带材质（GLB 的贴图/PBR 都在这里）
    if (!whiteModel) {
      const orig = originalMaterials.get(mesh.uuid)
      if (orig) mesh.material = orig
      return
    }

    // 白模模式：覆盖材质（并记住覆盖材质，便于后续切回贴图时释放）
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.78,
      metalness: 0.02,
    })
    overrideMaterials.set(mesh.uuid, m)
    mesh.material = m
  })
}

function applyLighting() {
  if (!scene || !ambientLight || !dirLightA || !dirLightB || !previewTask.value) return
  const params = (previewTask.value.params || {}) as Record<string, unknown>
  const preset = String(params.lightingPreset || 'studio')
  if (preset === 'outdoor') {
    scene.background = new THREE.Color('#0f1e2f')
    ambientLight.intensity = 1
    dirLightA.intensity = 1.0
    dirLightB.intensity = 0.5
  } else if (preset === 'dramatic') {
    scene.background = new THREE.Color('#070a12')
    ambientLight.intensity = 0.5
    dirLightA.intensity = 1.5
    dirLightB.intensity = 0.32
  } else {
    scene.background = new THREE.Color('#090d1a')
    ambientLight.intensity = 1.0
    dirLightA.intensity = 1
    dirLightB.intensity = 0.7
  }
}

function fitCameraToObject(object: THREE.Object3D) {
  if (!camera || !controls) return
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z, 0.3)
  const fov = (camera.fov * Math.PI) / 180
  const dist = maxDim / (2 * Math.tan(fov / 2))
  camera.position.set(center.x + dist * 1.5, center.y + dist * 0.5, center.z + dist * 1.5)
  camera.lookAt(center)
  controls.target.copy(center)
  controls.update()
}

function loadModel(url: string) {
  ensureViewer()
  if (!scene) return
  clearModel()
  modelLoadError.value = ''
  modelLoading.value = false
  if (!url) {
    modelLoadError.value = '暂无可预览的模型文件'
    return
  }

  const seq = ++loadSeq
  const viewerUrl = toViewerUrl(url)
  let ext = guessExt(url)
  if (!ext && previewTask.value) {
    const params = ((previewTask.value.params as Record<string, unknown>) || {}) as Record<string, unknown>
    const t = String(params.tencentResultType || '').toLowerCase()
    if (t) ext = t
  }
  modelLoading.value = true

  const done = (obj: THREE.Object3D) => {
    if (seq !== loadSeq || !scene) return
    rootObject = obj
    // 记录原始材质，用于“白模/贴图”切换时恢复贴图
    originalMaterials.clear()
    overrideMaterials.clear()
    rootObject.traverse((o: THREE.Object3D) => {
      const mesh = o as THREE.Mesh
      if (!mesh.isMesh) return
      if (!originalMaterials.has(mesh.uuid)) {
        originalMaterials.set(mesh.uuid, mesh.material as THREE.Material | THREE.Material[])
      }
    })
    ensureNormals(rootObject)
    scene.add(rootObject)
    fitCameraToObject(rootObject)
    applyAppearance()
    applyLighting()
    modelLoading.value = false
  }
  const fail = (msg: string) => {
    if (seq !== loadSeq) return
    modelLoading.value = false
    modelLoadError.value = msg
  }

  const loaders = {
    gltf: () => {
      if (!gltfLoader) return false
      gltfLoader.load(
        viewerUrl,
        (gltf: GLTF) => done(gltf.scene),
        undefined,
        () => tryNext('模型加载失败（GLB/GLTF）'),
      )
      return true
    },
    obj: () => {
      if (!objLoader) return false
      objLoader.load(
        viewerUrl,
        (obj: THREE.Group) => done(obj),
        undefined,
        () => tryNext('模型加载失败（OBJ）'),
      )
      return true
    },
    stl: () => {
      if (!stlLoader) return false
      stlLoader.load(
        viewerUrl,
        (geometry: THREE.BufferGeometry) => {
          const mesh = new THREE.Mesh(
            geometry,
            new THREE.MeshStandardMaterial({ color: 0xc7d2fe, roughness: 0, metalness: 0 }),
          )
          done(mesh)
        },
        undefined,
        () => tryNext('模型加载失败（STL）'),
      )
      return true
    },
    fbx: () => {
      if (!fbxLoader) return false
      fbxLoader.load(
        viewerUrl,
        (obj: THREE.Group) => done(obj),
        undefined,
        () => tryNext('模型加载失败（FBX）'),
      )
      return true
    },
  } as const

  // 当 URL 没后缀/签名链接难判断类型时，依次尝试多个加载器，提高“能看见模型”的成功率
  const order =
    ext === 'obj'
      ? (['obj', 'gltf', 'stl', 'fbx'] as const)
      : ext === 'stl'
        ? (['stl', 'gltf', 'obj', 'fbx'] as const)
        : ext === 'fbx'
          ? (['fbx', 'gltf', 'obj', 'stl'] as const)
          : ext === 'glb' || ext === 'gltf'
            ? (['gltf', 'obj', 'stl', 'fbx'] as const)
            : (['gltf', 'obj', 'stl', 'fbx'] as const)

  let attempt = 0
  const errors: string[] = []
  const tryNext = (errMsg?: string) => {
    if (seq !== loadSeq) return
    if (errMsg) errors.push(errMsg)
    const key = order[attempt++]
    if (!key) {
      const hint = errors.length ? `：${errors.join('；')}` : ''
      fail(`模型加载失败${hint}，可尝试导出后本地查看`)
      return
    }
    const ok = loaders[key]?.()
    if (!ok) {
      tryNext('预览器初始化失败')
    }
  }

  if (ext === 'usdz') {
    return fail('USDZ 暂不支持网页端预览，请导出后在 iOS/Reality Composer 查看')
  }
  if (ext === 'mp4') {
    return fail('当前结果是视频（MP4），不属于 3D 模型文件，无法在此处预览')
  }
  // ext 未知时也会走 tryNext 的 fallback
  tryNext()
}

function resizeViewer() {
  if (!viewerRef.value || !renderer || !camera) return
  const w = viewerRef.value.clientWidth
  const h = Math.max(viewerRef.value.clientHeight, 1)
  renderer.setSize(w, h)
  camera.aspect = w / h
  camera.updateProjectionMatrix()
}

function destroyViewer() {
  loadSeq++
  if (frameId) {
    window.cancelAnimationFrame(frameId)
    frameId = null
  }
  clearModel()
  controls?.dispose()
  controls = null
  if (renderer) {
    renderer.dispose()
    renderer.domElement.remove()
  }
  renderer = null
  camera = null
  scene = null
  gltfLoader = null
  objLoader = null
  stlLoader = null
  fbxLoader = null
  ambientLight = null
  dirLightA = null
  dirLightB = null
}

watch(previewOpen, async (open) => {
  if (!open) {
    window.removeEventListener('resize', resizeViewer)
    return
  }
  // Modal 打开带过渡，拿到正确尺寸需要等 DOM 渲染完成
  await nextTick()
  ensureViewer()
  resizeViewer()
  // 再等一帧，避免首次打开时 clientHeight=0 导致画布为 0
  await new Promise<void>((r) => requestAnimationFrame(() => r()))
  resizeViewer()
  loadModel(previewModelUrl.value)
  window.addEventListener('resize', resizeViewer)
})

watch(previewModelUrl, (url) => {
  if (!previewOpen.value) return
  loadModel(url)
})

watch(previewTask, () => {
  if (!previewOpen.value) return
  previewWhiteModel.value = null
  applyAppearance()
  applyLighting()
})

onMounted(() => {
  fetch3dModels()
  fetchMyTasks()
  unsubRealtime = onTaskEvent((e) => {
    if (e.module !== 'model3d') return
    const idx = myTasks.value.findIndex((t) => t.id === e.taskId)
    if (idx < 0) return
    const prev = myTasks.value[idx]!
    myTasks.value[idx] = {
      ...prev,
      status: (e.status as Model3dTask['status']) || prev.status,
      progress: typeof e.progress === 'number' ? e.progress : prev.progress,
      errorMessage: e.errorMessage ?? prev.errorMessage,
      resultModelUrl: e.resultModelUrl ?? prev.resultModelUrl,
      resultPreviewUrl: e.resultPreviewUrl ?? prev.resultPreviewUrl,
    }
  })
})

onUnmounted(() => {
  stopPoll()
  unsubRealtime?.()
  unsubRealtime = null
  clearSourceImage()
  destroyViewer()
  window.removeEventListener('resize', resizeViewer)
})
</script>

<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h1 class="page-title">3D</h1>
        <p class="page-desc">输入描述或图片，生成可预览、可导出的 3D 模型</p>
      </div>
      <div class="head-actions">
        <div class="tab-group">
          <button v-for="t in [{ k: 'create', l: '资产库' }, { k: 'gallery', l: '素材库' }]" :key="t.k" class="tab-btn"
            :class="{ active: activeTab === t.k }" @click="activeTab = t.k as 'create' | 'gallery'">
            {{ t.l }}
          </button>
        </div>
        <a-button size="small" type="outline" @click="openPrintOrders">
          <IconApps />
          打印订单系统
        </a-button>
      </div>
    </header>

    <div v-show="activeTab === 'create'" class="create-area">
      <aside class="form-panel">
        <section class="fg">
          <label class="fl">任务模式</label>
          <div class="mode-row">
            <button class="mode-btn" :class="{ active: form.taskType === 'text2model' }"
              @click="form.taskType = 'text2model'">文生3D</button>
            <button class="mode-btn" :class="{ active: form.taskType === 'img2model' }"
              @click="form.taskType = 'img2model'">图生3D</button>
          </div>
        </section>

        <section class="fg" v-if="form.taskType === 'img2model'">
          <div class="fl-row">
            <label class="fl">参考图</label>
            <button v-if="sourceImage" class="mini-btn" @click="clearSourceImage">清空</button>
          </div>
          <div v-if="sourceImage" class="source-preview">
            <img :src="sourceImage.url" />
          </div>
          <div v-else class="dropzone" @click="sourceInputRef?.click()">
            <IconPlus :size="28" class="dz-plus" />
            <span>{{ sourceUploading ? '上传与安全检测中…' : '点击上传参考图' }}</span>
            <span class="dz-hint">单张 ≤10MB</span>
          </div>
          <input ref="sourceInputRef" type="file" accept="image/*" style="display:none" @change="pickSourceImage" />
        </section>

        <section class="fg">
          <div class="fl-row">
            <label class="fl">提示词</label>
            <span class="limit-tip">{{ form.prompt.length }} / {{ promptMaxLength }}</span>
          </div>
          <a-textarea v-model="form.prompt" :auto-size="{ minRows: 4, maxRows: 8 }" :max-length="promptMaxLength"
            placeholder="例如：黑色的狙击步枪，硬表面工业风，细节丰富" />
        </section>

        <section class="fg">
          <label class="fl">选择模型</label>
          <a-select v-model="form.provider" class="w-full">
            <a-option v-for="m in providers" :key="m.value" :value="m.value" :label="m.label">
              <div class="ui-option">
                <div class="ui-option-main">
                  <div class="ui-option-header">
                    <span class="ui-option-title">{{ m.label }}</span>
                  </div>
                  <span class="ui-option-desc">{{ m.desc }}</span>
                </div>
              </div>
            </a-option>
          </a-select>
        </section>

        <section class="fg" v-if="isProMode">
          <label class="fl">专业版模型版本</label>
          <a-select v-model="form.modelVersion" class="w-full">
            <a-option value="3.0">3.0</a-option>
            <a-option value="3.1">3.1</a-option>
          </a-select>
        </section>

        <section class="fg">
          <label class="fl">模型类型</label>
          <div class="mode-row">
            <button class="mode-btn" :class="{ active: form.whiteModel }" @click="form.whiteModel = true">白模</button>
            <button class="mode-btn" :class="{ active: !form.whiteModel }" @click="form.whiteModel = false">贴图</button>
          </div>
        </section>

        <section class="fg">
          <label class="fl">贴图风格</label>
          <a-select v-model="form.textureStyle" class="w-full">
            <a-option v-for="style in textureStyles" :key="style.value" :value="style.value">{{ style.label
              }}</a-option>
          </a-select>
        </section>

        <section class="fg">
          <label class="fl">光影预设</label>
          <a-select v-model="form.lightingPreset" class="w-full">
            <a-option v-for="light in lightingPresets" :key="light.value" :value="light.value">{{ light.label
              }}</a-option>
          </a-select>
        </section>

        <section class="fg">
          <label class="fl">导出格式</label>
          <a-select v-model="form.exportFormat" class="w-full">
            <a-option v-for="fmt in exportFormatOptions" :key="fmt.value || 'default'" :value="fmt.value">
              {{ fmt.label }}
            </a-option>
          </a-select>
        </section>

        <div class="form-actions">
          <GenerateButton :loading="generating || uploading" :disabled="!form.prompt.trim()"
            :loading-text="uploading ? '上传中...' : '生成中...'" text="立即生成" @click="handleGenerate" />
        </div>
      </aside>

      <section class="works">
        <div class="works-head">
          <h3 class="works-title">我的 3D 作品</h3>
          <span v-if="myTotal > 0" class="badge">{{ myTotal }}</span>
        </div>
        <a-spin :loading="myLoading" class="works-spin" style="width:100%;min-height:200px">
          <div v-if="myTasks.length > 0" class="works-grid">
            <div v-for="task in myTasks" :key="task.id" class="card"
              @click="task.status === 'completed' ? openPreview(task) : null">
              <div class="cover-box">
                <img v-if="previewImage(task)" :src="previewImage(task)" class="cover" />
                <div v-else class="cover-ph">
                  <IconApps :size="28" style="opacity: 0.8" />
                </div>
                <span class="status-badge" :style="{ background: sColor(task.status) }">{{ sText(task.status) }}</span>
                <div v-if="task.status === 'pending' || task.status === 'processing'" class="progress-ov">
                  <span class="progress-stage">{{ progressStage(task) }}</span>
                  <span class="progress-value">{{ task.progress ?? 0 }}%</span>
                  <div class="progress-track">
                    <div class="progress-fill" :style="{ width: `${task.progress ?? 0}%` }" />
                  </div>
                </div>
              </div>
              <p class="prompt">{{ task.prompt || '无描述' }}</p>
              <p v-if="task.status === 'failed' && task.errorMessage" class="task-error">{{ task.errorMessage }}</p>
              <div class="actions" @click.stop>
                <WorkCardActionButton v-if="task.status === 'completed'" title="查看详情" @click="openPreview(task)">
                  <IconEye />
                </WorkCardActionButton>
                <WorkCardActionButton v-if="task.status === 'completed'" title="导出模型" @click="handleExport(task)">
                  <IconDownload />
                </WorkCardActionButton>
                <WorkCardActionButton v-if="task.status === 'completed'" title="3D打印" @click="openPrintFlow(task)">
                  <IconApps />
                </WorkCardActionButton>
                <WorkCardActionButton v-if="task.status === 'completed'" :title="task.isPublic ? '设为私密' : '设为公开'"
                  @click="handleTogglePublic(task)">
                  <IconCopy />
                </WorkCardActionButton>
                <WorkCardActionButton v-if="task.status === 'failed'" title="重试" :disabled="retryingId === task.id"
                  @click="handleRetry(task)">
                  <IconRefresh />
                </WorkCardActionButton>
                <WorkCardActionButton danger title="删除" @click="handleDelete(task)">
                  <IconDelete />
                </WorkCardActionButton>
              </div>
            </div>
          </div>
          <div v-else class="works-empty">
            <EmptyState title="暂无 3D 作品" description="输入提示词开始创建你的第一个 3D 模型" />
          </div>
        </a-spin>
        <a-pagination v-if="myTotal > 12" v-model:current="myPage" :total="myTotal" :page-size="12" size="small"
          class="pager" @change="fetchMyTasks" />
      </section>
    </div>

    <div v-show="activeTab === 'gallery'" class="gallery-area">
      <a-spin :loading="galLoading" style="width:100%;min-height:200px">
        <div v-if="gallery.length > 0" class="gallery-grid">
          <div v-for="item in gallery" :key="item.id" class="gallery-card">
            <div class="gallery-cover">
              <img v-if="galleryPreview(item)" :src="galleryPreview(item)" />
              <div v-else class="cover-ph">
                <IconApps :size="28" style="opacity: 0.8" />
              </div>
            </div>
            <p class="gallery-prompt">{{ item.prompt || '无描述' }}</p>
            <div class="gallery-actions">
              <a-button size="small" type="outline" @click="openPrintFlow(item)">
                <IconApps />
                3D打印
              </a-button>
            </div>
          </div>
        </div>
        <div v-else class="gallery-empty">
          <EmptyState title="广场暂无 3D 作品" description="完成作品并公开后，将显示在这里" />
        </div>
      </a-spin>
      <a-pagination v-if="galTotal > 20" v-model:current="galPage" :total="galTotal" :page-size="20" size="small"
        class="pager" @change="fetchGallery" />
    </div>

    <a-modal v-model:visible="previewOpen" title="3D 详情预览" :width="980" :footer="false" unmount-on-close
      @close="destroyViewer">
      <div class="preview-wrap">
        <div class="viewer" ref="viewerRef">
          <div class="viewer-tools" v-if="previewTask">
            <button class="vt-btn"
              :class="{ active: (previewWhiteModel ?? Boolean((previewTask.params || {} as any).whiteModel)) === false }"
              @click="previewWhiteModel = false; applyAppearance()" title="使用模型自带材质/贴图">
              贴图
            </button>
            <button class="vt-btn"
              :class="{ active: (previewWhiteModel ?? Boolean((previewTask.params || {} as any).whiteModel)) === true }"
              @click="previewWhiteModel = true; applyAppearance()" title="强制白模材质（不依赖贴图）">
              白模
            </button>
          </div>
          <div v-if="modelLoading" class="viewer-overlay">
            <IconLoading class="spin" :size="18" />
            <span>模型加载中...</span>
          </div>
          <div v-else-if="modelLoadError" class="viewer-overlay">
            <span>{{ modelLoadError }}</span>
          </div>
        </div>
        <div class="detail" v-if="previewTask">
          <div class="detail-title">任务详情</div>
          <div class="detail-grid">
            <div class="item"><span class="k">任务 ID</span><span class="v mono">{{ previewTask.id }}</span></div>
            <div class="item"><span class="k">状态</span><span class="v">{{ sText(previewTask.status) }}</span></div>
            <div class="item"><span class="k">任务类型</span><span class="v">{{ previewTask.taskType || '-' }}</span></div>
            <div class="item"><span class="k">模型</span><span class="v">{{ previewTask.provider || '-' }}</span></div>
            <div class="item"><span class="k">进度</span><span class="v">{{ previewTask.progress ?? 0 }}%</span></div>
            <div class="item"><span class="k">创建时间</span><span class="v">{{ previewTask.createdAt || '-' }}</span></div>
          </div>
          <div class="detail-block">
            <div class="kb">提示词</div>
            <pre class="json">{{ previewTask.prompt || '-' }}</pre>
          </div>
          <div class="detail-block">
            <div class="kb">扩展参数（params）</div>
            <pre class="json">{{ JSON.stringify(previewTask.params ?? {}, null, 2) }}</pre>
          </div>
          <div class="detail-actions">
            <button class="print-btn" @click="openPrintFlow(previewTask)">
              <IconApps :size="16" />
              3D打印
            </button>
            <button class="export-btn" @click="handleExport(previewTask)">
              <IconDownload :size="16" />
              导出模型
            </button>
          </div>
        </div>
      </div>
    </a-modal>

    <a-modal v-model:visible="printOrderOpen" title="3D打印定制" :width="720" :footer="false" @close="resetPrintFlowState">
      <div class="print-flow">
        <a-steps :current="printOrderStep" size="small">
          <a-step title="选择工艺" />
          <a-step title="填写订单" />
          <a-step title="扫码支付" />
        </a-steps>

        <div v-if="printOrderStep === 0" class="print-step">
          <div class="print-material-list">
            <button v-for="m in printMaterials" :key="m.value" class="material-card"
              :class="{ active: printForm.material === m.value }" @click="printForm.material = m.value">
              <div class="material-title">{{ m.label }}</div>
              <div class="material-desc">{{ m.desc }}</div>
              <div class="material-price">¥{{ m.price }}</div>
            </button>
          </div>
        </div>

        <div v-if="printOrderStep === 1" class="print-step">
          <a-form layout="vertical">
            <a-form-item label="收货人姓名" required>
              <a-input v-model="printForm.receiverName" placeholder="请输入收货人姓名" />
            </a-form-item>
            <a-form-item label="收货手机号" required>
              <a-input v-model="printForm.receiverPhone" placeholder="请输入手机号" />
            </a-form-item>
            <a-form-item label="收货地址" required>
              <a-input v-model="printForm.receiverAddress" placeholder="请输入详细收货地址" />
            </a-form-item>
            <a-form-item label="订单备注">
              <a-textarea v-model="printForm.remark" :auto-size="{ minRows: 2, maxRows: 4 }"
                placeholder="选填：颜色、尺寸等特殊说明" />
            </a-form-item>
          </a-form>
        </div>

        <div v-if="printOrderStep === 2" class="print-step pay-step">
          <div v-if="createdPrintOrder" class="pay-wrap">
            <div class="pay-left">
              <div class="pay-title">请使用微信/支付宝扫码付款</div>
              <div class="pay-amount">应付金额：¥{{ Number(createdPrintOrder.amount || 0).toFixed(2) }}</div>
              <img v-if="createdPrintOrder.qrCodeUrl" :src="createdPrintOrder.qrCodeUrl" class="qr-img" />
              <div v-else class="qr-placeholder">二维码生成中...</div>
              <a-button type="primary" :loading="printPaying" @click="confirmPrintPaid">
                <IconCheckCircle />
                我已付款，进入订单系统
              </a-button>
            </div>
            <div class="pay-right">
              <div class="order-line"><span>订单号</span><b>{{ createdPrintOrder.orderNo }}</b></div>
              <div class="order-line"><span>材质</span><b>{{ materialLabel(createdPrintOrder.material) }}</b></div>
              <div class="order-line"><span>收货人</span><b>{{ createdPrintOrder.receiverName }}</b></div>
              <div class="order-line"><span>手机号</span><b>{{ createdPrintOrder.receiverPhone }}</b></div>
              <div class="order-line"><span>地址</span><b>{{ createdPrintOrder.receiverAddress }}</b></div>
            </div>
          </div>
        </div>

        <div class="print-actions">
          <a-button v-if="printOrderStep > 0 && printOrderStep < 2" @click="goPrintStepBack">上一步</a-button>
          <a-button v-if="printOrderStep < 2" type="primary" :loading="printSubmitting" @click="goPrintStepNext">
            {{ printOrderStep === 1 ? '提交订单' : '下一步' }}
          </a-button>
        </div>
      </div>
    </a-modal>

    <a-modal v-model:visible="printOrdersOpen" title="3D打印订单系统" :width="840" :footer="false">
      <a-spin :loading="printOrdersLoading" style="width: 100%">
        <div v-if="printOrders.length" class="print-order-list">
          <div v-for="order in printOrders" :key="order.id" class="print-order-item">
            <img v-if="order.previewUrl" :src="order.previewUrl" class="print-order-preview" />
            <div v-else class="print-order-preview empty">无预览</div>
            <div class="print-order-content">
              <div class="print-order-top">
                <div class="print-order-no">{{ order.orderNo }}</div>
                <a-tag :color="printStatusColor(order.status)">{{ printStatusText(order.status) }}</a-tag>
              </div>
              <div class="print-order-grid">
                <span>材质：{{ materialLabel(order.material) }}</span>
                <span>金额：¥{{ Number(order.amount || 0).toFixed(2) }}</span>
                <span>收货人：{{ order.receiverName }}</span>
                <span>电话：{{ order.receiverPhone }}</span>
                <span class="addr">地址：{{ order.receiverAddress }}</span>
              </div>
            </div>
          </div>
          <a-pagination v-if="printOrdersTotal > 10" v-model:current="printOrdersPage" :total="printOrdersTotal"
            :page-size="10" size="small" class="pager" @change="fetchPrintOrders" />
        </div>
        <div v-else class="gallery-empty">
          <EmptyState title="暂无打印订单" description="可在资产库或素材库模型卡片发起 3D打印 定制" />
        </div>
      </a-spin>
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

.page-header {
  flex-shrink: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: var(--sp-6) var(--sp-8) var(--sp-4);
}

.head-actions {
  display: flex;
  align-items: center;
  gap: 12px;
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
}

.tab-btn.active {
  background: var(--primary);
  color: #fff;
}

.create-area {
  flex: 1;
  display: flex;
  gap: var(--sp-6);
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow: hidden;
}

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

.fl-row {
  display: flex;
  align-items: center;
}

.limit-tip {
  margin-left: auto;
  color: var(--text-4);
  font-size: 0.72rem;
}

.mini-btn {
  margin-left: auto;
  border: none;
  background: var(--bg-surface-2);
  color: var(--text-3);
  border-radius: 8px;
  padding: 4px 10px;
  cursor: pointer;
}

.mode-row {
  display: flex;
  gap: var(--sp-2);
}

.mode-btn {
  flex: 1;
  padding: var(--sp-2) var(--sp-3);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  color: var(--text-3);
  cursor: pointer;
}

.mode-btn.active {
  border-color: var(--primary);
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.1);
}

.source-preview {
  border: 1px solid var(--border-2);
  border-radius: var(--radius-md);
  overflow: hidden;
  width: 120px;
  height: 120px;
}

.source-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.dropzone {
  width: 100%;
  height: 270px;
  border: 1px dashed var(--border-3);
  border-radius: var(--radius-md);
  padding: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-3);
  cursor: pointer;
  text-align: center;
}

.dropzone:hover {
  border-color: var(--primary);
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.05);
}

.dz-plus {
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.14);
  border: 1px solid rgba(22, 93, 255, 0.36);
  border-radius: 10px;
  padding: 6px;
}

.w-full {
  width: 100%;
}

/* 生成按钮：与视频页统一，圆润、有高度、有上下间距 */
.form-actions {
  margin-top: var(--sp-2);
  padding-bottom: 12px;
}

.form-actions :deep(.gen-btn) {
  border-radius: var(--radius-md);
  min-height: 44px;
}

.form-actions :deep(.gen-btn:hover) {
  transform: translateY(-1px);
}

.works {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
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

.works-spin {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
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

.works-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 280px;
}

.card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-self: start;
}

.card:hover {
  transform: translateY(-3px);
  box-shadow: var(--shadow-glow);
  border-color: var(--border-3);
}

.cover-box {
  position: relative;
  height: 196px;
  background: var(--bg-surface-3);
  overflow: hidden;
}

.cover {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-ph {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-badge {
  position: absolute;
  top: var(--sp-2);
  left: var(--sp-2);
  padding: 2px 10px;
  border-radius: var(--radius-full);
  font-size: 0.7rem;
  color: #fff;
  font-weight: 500;
}

.progress-ov {
  position: absolute;
  inset: 0;
  background: rgba(7, 10, 20, 0.4);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.progress-stage {
  font-size: 0.74rem;
  color: var(--text-2);
}

.progress-value {
  font-size: 0.82rem;
  color: #fff;
  font-weight: 600;
}

.progress-track {
  width: 130px;
  height: 4px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #165DFF, #4080FF);
  transition: width 0s ease;
}

.prompt {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  font-size: 0.78rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-error {
  margin: 0;
  padding: 0 var(--sp-3) var(--sp-2);
  font-size: 0.75rem;
  color: var(--accent-red, #F53F3F);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.actions {
  display: flex;
  gap: 8px;
  padding: 0 var(--sp-3) var(--sp-3);
  margin-top: auto;
  flex-wrap: nowrap;
}

.icon-btn {
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
}

.icon-btn.danger:hover {
  background: rgba(245, 63, 63, 0.5);
}

.gallery-area {
  flex: 1;
  padding: var(--sp-4) var(--sp-8) var(--sp-6);
  overflow-y: auto;
}

.gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp-4);
}

.gallery-card {
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.gallery-cover {
  height: 196px;
  background: var(--bg-surface-3);
  overflow: hidden;
}

.gallery-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.gallery-prompt {
  margin: 0;
  padding: var(--sp-2) var(--sp-3);
  font-size: 0.78rem;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.gallery-actions {
  padding: 0 var(--sp-3) var(--sp-3);
  display: flex;
  justify-content: flex-end;
}

.gallery-empty {
  min-height: 360px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pager {
  flex-shrink: 0;
  margin-top: var(--sp-3);
  display: flex;
  justify-content: center;
}

.preview-wrap {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--sp-4);
  min-height: 520px;
}

.viewer {
  position: relative;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-surface-3);
  min-height: 520px;
  overflow: hidden;
}

.viewer-tools {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 2;
  display: flex;
  gap: 8px;
}

.vt-btn {
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(0, 0, 0, 0.1);
  color: var(--text-2);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 0.75rem;
  cursor: pointer;
  backdrop-filter: none;
  transition: all var(--duration-fast);
}

.vt-btn:hover {
  border-color: rgba(255, 255, 255, 0.32);
  background: rgba(0, 0, 0, 0.15);
}

.vt-btn.active {
  border-color: rgba(22, 93, 255, 0.3);
  background: rgba(22, 93, 255, 0.18);
  color: #fff;
}

.viewer-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-2);
  font-size: 0.82rem;
  background: rgba(9, 13, 26, 0.5);
  pointer-events: none;
}

.detail {
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  background: var(--bg-surface-2);
  padding: var(--sp-3);
  overflow: auto;
}

.detail-title {
  font-size: 0.82rem;
  color: var(--text-2);
  font-weight: 600;
  margin-bottom: var(--sp-3);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}

.item {
  display: flex;
  gap: 8px;
  min-width: 0;
}

.item .k {
  color: var(--text-4);
  font-size: 0.76rem;
  white-space: nowrap;
}

.item .v {
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

.json {
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

.print-btn {
  border: none;
  border-radius: 999px;
  background: rgba(22, 93, 255, 0.15);
  color: var(--primary-light);
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
  margin-right: 10px;
}

.export-btn {
  border: none;
  border-radius: 999px;
  background: var(--gradient-primary);
  color: #fff;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  cursor: pointer;
}

.print-flow {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 6px;
}

.print-step {
  min-height: 260px;
}

.print-material-list {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.material-card {
  border: 1px solid var(--border-2);
  border-radius: 12px;
  background: var(--bg-surface-2);
  color: var(--text-2);
  text-align: left;
  padding: 14px;
  cursor: pointer;
}

.material-card.active {
  border-color: var(--primary);
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.2);
}

.material-title {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--text-1);
}

.material-desc {
  margin-top: 6px;
  font-size: 0.76rem;
  color: var(--text-4);
  line-height: 1.45;
  min-height: 34px;
}

.material-price {
  margin-top: 8px;
  font-size: 1rem;
  font-weight: 700;
  color: var(--primary-light);
}

.print-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.pay-wrap {
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: 20px;
}

.pay-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pay-title {
  font-size: 0.82rem;
  color: var(--text-2);
}

.pay-amount {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--primary-light);
}

.qr-img {
  width: 220px;
  height: 220px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: #fff;
}

.qr-placeholder {
  width: 220px;
  height: 220px;
  border-radius: 10px;
  border: 1px dashed var(--border-2);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-4);
}

.pay-right {
  border: 1px solid var(--border-1);
  border-radius: 12px;
  padding: 12px;
  background: var(--bg-surface-2);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.order-line {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  font-size: 0.8rem;
  color: var(--text-3);
}

.order-line b {
  color: var(--text-1);
  font-weight: 600;
  text-align: right;
  word-break: break-all;
}

.print-order-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.print-order-item {
  display: grid;
  grid-template-columns: 88px 1fr;
  gap: 12px;
  border: 1px solid var(--border-1);
  border-radius: 12px;
  background: var(--bg-surface-2);
  padding: 10px;
}

.print-order-preview {
  width: 88px;
  height: 88px;
  object-fit: cover;
  border-radius: 10px;
  background: var(--bg-surface-3);
}

.print-order-preview.empty {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-4);
  font-size: 12px;
  border: 1px dashed var(--border-2);
}

.print-order-content {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.print-order-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.print-order-no {
  font-size: 0.84rem;
  color: var(--text-2);
  font-weight: 600;
}

.print-order-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
  font-size: 0.76rem;
  color: var(--text-3);
}

.print-order-grid .addr {
  grid-column: 1 / -1;
}

@media(max-width:1100px) {
  .preview-wrap {
    grid-template-columns: 1fr;
  }

  .viewer {
    min-height: 400px;
  }
}

@media(max-width:900px) {
  .head-actions {
    width: 100%;
    justify-content: space-between;
  }

  .create-area {
    flex-direction: column;
  }

  .form-panel {
    width: 100%;
    max-height: 48vh;
  }

  .works-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .print-material-list {
    grid-template-columns: 1fr;
  }

  .pay-wrap {
    grid-template-columns: 1fr;
  }

  .print-order-grid {
    grid-template-columns: 1fr;
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
  .gallery-area {
    padding: var(--sp-3);
  }

  .works-grid,
  .gallery-grid {
    grid-template-columns: 1fr;
  }
}
</style>
