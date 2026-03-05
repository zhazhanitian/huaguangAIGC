<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import {
  IconPlus,
  IconEdit,
  IconDelete,
  IconApps,
  IconCopy,
  IconList,
  IconRefresh,
  IconSearch,
} from '@arco-design/web-vue/es/icon'
import {
  getModels,
  createModel,
  updateModel,
  deleteModel,
  createModelKey,
  updateModelKey,
  deleteModelKey,
  syncPresetModels,
  type Model,
  type ModelKey,
  type CreateModelData,
  type ModelType,
} from '../api/model'
import { getActiveApiKeys, type ApiKey } from '../api/apikey'

interface TypeMeta { label: string; color: string; icon: string }

const typeMetaMap: Record<ModelType, TypeMeta> = {
  text: { label: '文字', color: '#4080FF', icon: 'T' },
  image: { label: '图像', color: '#00B42A', icon: 'I' },
  video: { label: '视频', color: '#f97316', icon: 'V' },
  music: { label: '音乐', color: '#f472b6', icon: 'M' },
  '3d': { label: '3D', color: '#38bdf8', icon: '3' },
}

// 兼容旧数据：若后端未返回 type，则根据名称猜测类型
const imageModelNames = new Set([
  'nano-banana-pro', 'nano-banana-fast', 'nano-banana', 'nano-banana-pro-vt',
  'nano-banana-pro-cl', 'nano-banana-pro-vip', 'nano-banana-pro-4k-vip',
  'gpt-image-1.5', 'sora-image', 'doubao-seedance-4-5',
  'flux-2-pro', 'flux-kontext-pro', 'flux-kontext-max',
  'kie-market',
  'z-image', 'qwen/text-to-image', 'qwen/image-to-image', 'qwen/image-edit',
  'grok-imagine/text-to-image',
  'midjourney', 'dalle',
])
const videoModelNames = new Set([
  'veo3.1-fast', 'veo3.1-pro',
  'sora-2', 'sora-2-pro', 'sora-2-preview', 'sora-2-pro-preview',
  'kling-3.0',
  'kling-2.6/text-to-video', 'kling-2.6/image-to-video', 'kling-2.6/motion-control',
  'bytedance/seedance-1.5-pro',
])
const musicModelNames = new Set(['suno-v3', 'suno-v3.5', 'suno-v4', 'suno-v4.5plus', 'udio'])
const threeDModelNames = new Set(['tencent-hunyuan-3d-pro', 'tencent-hunyuan-3d-rapid', 'hunyuan-3d-pro', 'hunyuan-3d-rapid'])

function inferModelTypeByName(name: string): ModelType {
  if (imageModelNames.has(name)) return 'image'
  if (videoModelNames.has(name)) return 'video'
  if (musicModelNames.has(name)) return 'music'
  if (threeDModelNames.has(name)) return '3d'
  return 'text'
}

function getModelTypeFor(model: Model): ModelType {
  return model.type ?? inferModelTypeByName(model.modelName)
}

function getTypeMetaByModel(model: Model): TypeMeta {
  return typeMetaMap[getModelTypeFor(model)]
}

const loading = ref(false)
const modelList = ref<Model[]>([])
const viewMode = ref<'grid' | 'table'>('grid')
const expandedCardId = ref<string | null>(null)
const expandedRowKeys = ref<string[]>([])
const addDialogVisible = ref(false)
const editDialogVisible = ref(false)
const keyDialogVisible = ref(false)
const keyDialogMode = ref<'add' | 'edit'>('add')
const currentModelId = ref<string | null>(null)
const currentKeyId = ref<string | null>(null)
const formRef = ref<FormInstance>()
const keyFormRef = ref<FormInstance>()
const submitLoading = ref(false)

const filterType = ref<ModelType | 'all'>('all')
const filterStatus = ref<'all' | 'active' | 'inactive'>('all')
const searchKeyword = ref('')

const typeTabs: { key: ModelType | 'all'; label: string; color: string }[] = [
  { key: 'all', label: '全部', color: 'var(--text-2)' },
  { key: 'text', label: '文字', color: '#4080FF' },
  { key: 'image', label: '图像', color: '#00B42A' },
  { key: 'video', label: '视频', color: '#f97316' },
  { key: 'music', label: '音乐', color: '#f472b6' },
  { key: '3d', label: '3D', color: '#38bdf8' },
]

const filteredModels = computed(() => {
  return modelList.value.filter(m => {
    if (filterType.value !== 'all' && getModelTypeFor(m) !== filterType.value) return false
    if (filterStatus.value === 'active' && !m.isActive) return false
    if (filterStatus.value === 'inactive' && m.isActive) return false
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      if (!m.modelName.toLowerCase().includes(kw) && !m.provider?.toLowerCase().includes(kw)) return false
    }
    return true
  })
})

const typeCounts = computed(() => {
  const counts: Record<string, number> = { all: modelList.value.length }
  for (const m of modelList.value) {
    const t = getModelTypeFor(m)
    counts[t] = (counts[t] || 0) + 1
  }
  return counts
})

const addForm = reactive<CreateModelData>({
  modelName: '',
  provider: 'openai',
  type: 'text',
  apiKey: '',
  baseUrl: '',
  isActive: true,
  description: '',
  deductPoints: 0,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 1,
  order: 0,
})

const editForm = reactive<CreateModelData & { id?: string }>({
  modelName: '',
  provider: 'openai',
  type: 'text',
  apiKey: '',
  baseUrl: '',
  isActive: true,
  description: '',
  deductPoints: 0,
  maxTokens: 4096,
  temperature: 0.7,
  topP: 1,
  order: 0,
})

const apiKeyList = ref<ApiKey[]>([])

const keyForm = reactive<{
  apiKey: string
  baseUrl?: string
  weight: number
  isActive: boolean
  apiKeyId?: string
  useSelect: boolean
}>({
  apiKey: '',
  baseUrl: '',
  weight: 1,
  isActive: true,
  apiKeyId: '',
  useSelect: true,
})

const addRules = {
  modelName: [{ required: true, message: '请输入模型名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请选择提供商', trigger: 'change' }],
  type: [{ required: true, message: '请选择模型类型', trigger: 'change' }],
}

const keyRules = {
  apiKey: [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
  apiKeyId: [{ required: true, message: '请选择 API Key', trigger: 'change' }],
}

const providerOptions = [
  { label: 'OpenAI', value: 'openai' },
  { label: 'Claude', value: 'claude' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'Custom', value: 'custom' },
] as const

function providerText(provider: string) {
  const hit = providerOptions.find((x) => x.value === provider)
  return hit?.label || provider
}

const columns = [
  { title: '模型名称', dataIndex: 'modelName', minWidth: 140, slotName: 'modelName' },
  { title: '类型', width: 90, slotName: 'type' },
  { title: '提供方', dataIndex: 'provider', width: 120, slotName: 'provider' },
  { title: '状态', dataIndex: 'isActive', width: 100, slotName: 'status' },
  { title: 'Keys', width: 80, slotName: 'keyCount' },
  { title: '消耗积分', dataIndex: 'deductPoints', width: 100 },
  { title: '操作', slotName: 'action', width: 160, fixed: 'right' as const },
]

function providerColor(provider: string) {
  if (provider === 'openai') return '#00B42A'
  if (provider === 'claude') return '#FF7D00'
  if (provider === 'deepseek') return '#3b82f6'
  return 'var(--primary)'
}

function maskKey(key: string) {
  if (!key || key.length < 12) return 'sk-****'
  return `sk-****${key.slice(-4)}`
}

function toBool(v: unknown) {
  return v === true || v === 1 || v === '1' || v === 'true'
}

async function fetchModels() {
  loading.value = true
  try {
    const res = await getModels()
    const list = Array.isArray(res) ? res : []
    modelList.value = list.map((m: any) => ({
      ...m,
      isActive: toBool(m?.isActive),
      keys: Array.isArray(m?.keys)
        ? m.keys.map((k: any) => ({ ...k, isActive: toBool(k?.isActive) }))
        : m?.keys,
    }))
  } catch {
    modelList.value = []
  } finally {
    loading.value = false
  }
}

onMounted(fetchModels)

async function handleSyncPresets() {
  Modal.confirm({
    title: '同步预设模型',
    content: '将把系统已支持的常见模型名同步到数据库模型库（不会覆盖你已配置的 Key/BaseURL/参数）。是否继续？',
    okText: '开始同步',
    cancelText: '取消',
    onOk: async () => {
      submitLoading.value = true
      try {
        const res = await syncPresetModels()
        Message.success(`同步完成：新增 ${res.created}，更新 ${res.updated}，当前共 ${res.total} 个模型`)
        await fetchModels()
      } finally {
        submitLoading.value = false
      }
    },
  })
}

function openAdd() {
  addForm.modelName = ''
  addForm.provider = 'openai'
  addForm.type = 'text'
  addForm.apiKey = ''
  addForm.baseUrl = ''
  addForm.isActive = true
  addForm.description = ''
  addForm.deductPoints = 0
  addForm.maxTokens = 4096
  addForm.temperature = 0.7
  addForm.topP = 1
  addForm.order = 0
  addDialogVisible.value = true
}

function openEdit(row: Model) {
  editForm.id = row.id
  editForm.modelName = row.modelName
  editForm.provider = row.provider
  editForm.type = row.type ?? getModelTypeFor(row)
  editForm.apiKey = row.apiKey || ''
  editForm.baseUrl = row.baseUrl || ''
  editForm.isActive = row.isActive ?? true
  editForm.description = row.description || ''
  editForm.deductPoints = row.deductPoints ?? 0
  editForm.maxTokens = row.maxTokens ?? 4096
  editForm.temperature = Number(row.temperature ?? 0.7)
  editForm.topP = row.topP ?? 1
  editForm.order = row.order ?? 0
  editDialogVisible.value = true
}

async function submitAdd() {
  const errors = await formRef.value?.validate()
  if (errors) return
  submitLoading.value = true
  try {
    await createModel(addForm)
    Message.success('添加成功')
    addDialogVisible.value = false
    fetchModels()
  } finally {
    submitLoading.value = false
  }
}

async function submitEdit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  if (!editForm.id) return
  submitLoading.value = true
  try {
    await updateModel(editForm.id, {
      modelName: editForm.modelName,
      provider: editForm.provider,
      type: editForm.type,
      apiKey: editForm.apiKey || undefined,
      baseUrl: editForm.baseUrl || undefined,
      isActive: editForm.isActive,
      description: editForm.description || undefined,
      deductPoints: editForm.deductPoints,
      maxTokens: editForm.maxTokens,
      temperature: editForm.temperature,
      topP: editForm.topP,
      order: editForm.order,
    })
    Message.success('更新成功')
    editDialogVisible.value = false
    fetchModels()
  } finally {
    submitLoading.value = false
  }
}

async function handleDeleteModel(row: Model) {
  Modal.confirm({
    title: '删除确认',
    content: `确定要删除模型 "${row.modelName}" 吗？`,
    okText: '确定',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onOk: async () => {
      await deleteModel(row.id)
      Message.success('删除成功')
      fetchModels()
    },
  })
}

function toggleCardExpand(id: string) {
  expandedCardId.value = expandedCardId.value === id ? null : id
}

async function openAddKey(modelId: string) {
  currentModelId.value = modelId
  currentKeyId.value = null
  keyDialogMode.value = 'add'
  keyForm.apiKey = ''
  keyForm.baseUrl = ''
  keyForm.weight = 1
  keyForm.isActive = true
  keyForm.apiKeyId = ''
  keyForm.useSelect = true
  keyDialogVisible.value = true
  // 加载 API Key 列表
  try {
    apiKeyList.value = await getActiveApiKeys()
  } catch {
    apiKeyList.value = []
  }
}

async function openEditKey(modelId: string, key: ModelKey) {
  currentModelId.value = modelId
  currentKeyId.value = key.id
  keyDialogMode.value = 'edit'
  keyForm.apiKey = key.apiKey ?? ''
  keyForm.baseUrl = key.baseUrl ?? ''
  keyForm.weight = key.weight ?? 1
  keyForm.isActive = key.isActive ?? true
  keyForm.apiKeyId = ''
  keyForm.useSelect = false // 编辑模式下默认手动输入
  keyDialogVisible.value = true
  // 加载 API Key 列表
  try {
    apiKeyList.value = await getActiveApiKeys()
  } catch {
    apiKeyList.value = []
  }
}

async function submitKey() {
  // 根据选择模式决定验证规则
  const fieldsToValidate = keyForm.useSelect ? ['apiKeyId'] : ['apiKey']
  const errors = await keyFormRef.value?.validate(fieldsToValidate)
  if (errors) return
  if (!currentModelId.value) return

  // 如果是选择模式，从选中的 API Key 获取值
  let finalApiKey = keyForm.apiKey
  let finalBaseUrl = keyForm.baseUrl
  if (keyForm.useSelect && keyForm.apiKeyId) {
    const selected = apiKeyList.value.find(k => k.id === keyForm.apiKeyId)
    if (selected) {
      finalApiKey = selected.apiKey
      finalBaseUrl = selected.baseUrl || ''
    }
  }

  submitLoading.value = true
  try {
    if (keyDialogMode.value === 'add') {
      await createModelKey({
        modelId: currentModelId.value,
        apiKey: finalApiKey,
        baseUrl: finalBaseUrl || undefined,
        isActive: keyForm.isActive,
        weight: keyForm.weight,
      })
      Message.success('添加成功')
    } else if (currentKeyId.value) {
      await updateModelKey(currentKeyId.value, {
        apiKey: finalApiKey,
        baseUrl: finalBaseUrl || undefined,
        isActive: keyForm.isActive,
        weight: keyForm.weight,
      })
      Message.success('更新成功')
    }
    keyDialogVisible.value = false
    fetchModels()
  } finally {
    submitLoading.value = false
  }
}

function onApiKeySelect(apiKeyId: string) {
  const selected = apiKeyList.value.find(k => k.id === apiKeyId)
  if (selected) {
    keyForm.baseUrl = selected.baseUrl || ''
  }
}

async function handleDeleteKey(keyId: string) {
  Modal.confirm({
    title: '删除确认',
    content: '确定要删除此 API Key 吗？',
    okText: '确定',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onOk: async () => {
      await deleteModelKey(keyId)
      Message.success('删除成功')
      fetchModels()
    },
  })
}

function copyKey(key: string) {
  navigator.clipboard?.writeText(key)
  Message.success('已复制')
}

const togglingModelId = ref<string | null>(null)
const togglingKeyId = ref<string | null>(null)

// Make switch feel instant: optimistic update + rollback on failure.
async function toggleModelStatus(model: Model, nextVal: boolean) {
  if (togglingModelId.value === model.id) return
  const prev = !!model.isActive
  model.isActive = nextVal
  togglingModelId.value = model.id
  try {
    await updateModel(model.id, { isActive: nextVal })
    Message.success(nextVal ? '已启用' : '已禁用')
  } catch {
    model.isActive = prev
  } finally {
    togglingModelId.value = null
  }
}

async function toggleKeyStatus(key: ModelKey, nextVal: boolean) {
  if (togglingKeyId.value === key.id) return
  const prev = !!key.isActive
  key.isActive = nextVal
  togglingKeyId.value = key.id
  try {
    await updateModelKey(key.id, { isActive: nextVal })
    Message.success(nextVal ? '已启用' : '已禁用')
  } catch {
    key.isActive = prev
  } finally {
    togglingKeyId.value = null
  }
}

function handleTableExpand(_expanded: boolean, record: Model) {
  const keys = expandedRowKeys.value
  if (keys.includes(record.id)) {
    expandedRowKeys.value = keys.filter((k: string) => k !== record.id)
  } else {
    expandedRowKeys.value = [record.id]
  }
}
</script>

<template>
  <div class="model-manage">
    <!-- Header -->
    <div class="glow-card header-card">
      <div class="header-left">
        <div class="header-icon">
          <IconRobot />
        </div>
        <div>
          <h2 class="header-title">模型管理</h2>
          <p class="header-subtitle">管理 人工智能 模型库、API Key 池与调用配置</p>
        </div>
      </div>
      <div class="header-right">
        <a-button class="sync-btn" :loading="submitLoading" @click="handleSyncPresets">
          <template #icon>
            <IconRefresh />
          </template>
          同步预设
        </a-button>
        <a-button type="primary" class="add-btn" @click="openAdd">
          <template #icon>
            <IconPlus />
          </template>
          添加模型
        </a-button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="glow-card toolbar-card">
      <div class="toolbar">
        <div class="toolbar-right">
          <a-input v-model="searchKeyword" placeholder="搜索模型名称..." :style="{ width: '200px' }" allow-clear>
            <template #prefix>
              <IconSearch />
            </template>
          </a-input>
          <a-select v-model="filterStatus" :style="{ width: '120px' }" placeholder="状态">
            <a-option value="all">全部状态</a-option>
            <a-option value="active">已启用</a-option>
            <a-option value="inactive">已禁用</a-option>
          </a-select>
          <div class="view-toggle">
            <a-tooltip content="卡片视图">
              <a-button :type="viewMode === 'grid' ? 'primary' : 'text'" shape="circle" @click="viewMode = 'grid'">
                <template #icon>
                  <IconApps />
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="表格视图">
              <a-button :type="viewMode === 'table' ? 'primary' : 'text'" shape="circle" @click="viewMode = 'table'">
                <template #icon>
                  <IconList />
                </template>
              </a-button>
            </a-tooltip>
          </div>
        </div>
      </div>

      <!-- Type filter tabs -->
      <div class="type-tabs">
        <div v-for="tab in typeTabs" :key="tab.key" class="type-tab" :class="{ active: filterType === tab.key }"
          :style="filterType === tab.key ? { '--tab-color': tab.color } as any : {}" @click="filterType = tab.key">
          <span v-if="tab.key !== 'all'" class="type-tab-dot" :style="{ background: tab.color }" />
          {{ tab.label }}
          <span class="type-tab-count">{{ typeCounts[tab.key] ?? 0 }}</span>
        </div>
      </div>
    </div>

    <a-spin :loading="loading" style="width: 100%">
      <!-- 卡片视图 -->
      <div v-if="filteredModels.length === 0 && !loading" class="empty-state">
        <a-empty description="没有匹配的模型" />
      </div>
      <div v-show="viewMode === 'grid' && filteredModels.length" class="model-grid">
        <div v-for="model in filteredModels" :key="model.id" class="glow-card model-card"
          :class="{ expanded: expandedCardId === model.id }">
          <div class="model-card-header" @click="toggleCardExpand(model.id)">
            <div class="type-avatar"
              :style="{ background: getTypeMetaByModel(model).color + '18', color: getTypeMetaByModel(model).color }">
              {{ getTypeMetaByModel(model).icon }}
            </div>
            <div class="model-card-info">
              <div class="model-name-row">
                <span class="model-name">{{ model.modelName }}</span>
                <span class="type-tag"
                  :style="{ color: getTypeMetaByModel(model).color, borderColor: getTypeMetaByModel(model).color + '44' }">
                  {{ getTypeMetaByModel(model).label }}
                </span>
              </div>
              <div class="model-meta">
                <span class="points-badge">{{ providerText(model.provider) }}</span>
                <span class="points-badge">{{ model.deductPoints ?? 0 }} 积分</span>
                <span class="key-count" :class="{ 'no-key': !(model.keys?.length) }">{{ model.keys?.length ?? 0 }}
                  Key</span>
              </div>
            </div>
            <div class="model-switch" @click.stop>
              <a-switch :model-value="model.isActive" :loading="togglingModelId === model.id" checked-color="#00B42A"
                unchecked-color="rgba(255,255,255,0.12)" @change="(val) => toggleModelStatus(model, Boolean(val))">
                <template #checked>ON</template>
                <template #unchecked>OFF</template>
              </a-switch>
              <span class="switch-label" :class="{ on: model.isActive }">
                {{ model.isActive ? '启用' : '禁用' }}
              </span>
            </div>
          </div>
          <div v-show="expandedCardId === model.id" class="model-card-expand">
            <div class="keys-header">
              <span>API Keys</span>
              <a-button type="primary" size="small" @click.stop="openAddKey(model.id)">
                <template #icon>
                  <IconPlus />
                </template>
                添加 Key
              </a-button>
            </div>
            <div v-if="model.keys?.length" class="keys-list">
              <div v-for="k in model.keys" :key="k.id" class="key-row">
                <span class="key-masked">{{ maskKey(k.apiKey) }}</span>
                <span class="key-extra">权重 {{ k.weight ?? 1 }}</span>
                <a-button type="text" size="mini" @click="copyKey(k.apiKey)">
                  <template #icon>
                    <IconCopy />
                  </template>
                </a-button>
                <a-button type="text" size="mini" @click="openEditKey(model.id, k)">
                  <template #icon>
                    <IconEdit />
                  </template>
                </a-button>
                <a-switch :model-value="k.isActive" size="small" checked-color="#00B42A"
                  unchecked-color="rgba(255,255,255,0.12)" :loading="togglingKeyId === k.id"
                  @change="(val) => toggleKeyStatus(k, Boolean(val))" />
                <a-button type="text" status="danger" size="mini" @click="handleDeleteKey(k.id)">
                  <template #icon>
                    <IconDelete />
                  </template>
                </a-button>
              </div>
            </div>
            <div v-else class="empty-keys">暂无 API Key</div>
            <a-button type="text" size="small" @click.stop="openEdit(model)">
              <template #icon>
                <IconEdit />
              </template>
              编辑模型
            </a-button>
          </div>
        </div>
      </div>

      <!-- 表格视图 -->
      <div v-show="viewMode === 'table' && filteredModels.length" class="glow-card table-card">
        <a-table :columns="columns" :data="filteredModels" :loading="loading" row-key="id" :expandable="{
          expandedRowKeys: expandedRowKeys,
          onExpand: handleTableExpand,
        }" class="data-table">
          <template #expand-row="{ record }">
            <div class="key-section">
              <div class="keys-header">
                <span>API Keys</span>
                <a-button type="primary" size="small" @click="openAddKey(record.id)">
                  <template #icon>
                    <IconPlus />
                  </template>
                  添加 Key
                </a-button>
              </div>
              <div v-if="record.keys?.length" class="keys-list">
                <div v-for="k in record.keys" :key="k.id" class="key-row">
                  <span class="key-masked">{{ maskKey(k.apiKey) }}</span>
                  <span class="key-extra">权重 {{ k.weight ?? 1 }}</span>
                  <a-button type="text" size="mini" @click="copyKey(k.apiKey)">
                    <template #icon>
                      <IconCopy />
                    </template>
                  </a-button>
                  <a-button type="text" size="mini" @click="openEditKey(record.id, k)">
                    <template #icon>
                      <IconEdit />
                    </template>
                  </a-button>
                  <a-switch :model-value="k.isActive" size="small" checked-color="#00B42A"
                    unchecked-color="rgba(255,255,255,0.12)" :loading="togglingKeyId === k.id"
                    @change="(val) => toggleKeyStatus(k, Boolean(val))" />
                  <a-button type="text" status="danger" size="mini" @click="handleDeleteKey(k.id)">
                    <template #icon>
                      <IconDelete />
                    </template>
                  </a-button>
                </div>
              </div>
              <div v-else class="empty-keys">暂无 API Key</div>
            </div>
          </template>
          <template #modelName="{ record }">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="table-type-dot" :style="{ background: getTypeMetaByModel(record).color }" />
              {{ record.modelName }}
            </div>
          </template>
          <template #type="{ record }">
            <span class="type-tag"
              :style="{ color: getTypeMetaByModel(record).color, borderColor: getTypeMetaByModel(record).color + '44' }">
              {{ getTypeMetaByModel(record).label }}
            </span>
          </template>
          <template #status="{ record }">
            <div class="table-switch-cell">
              <a-switch :model-value="record.isActive" :loading="togglingModelId === record.id" checked-color="#00B42A"
                unchecked-color="rgba(255,255,255,0.12)" @change="(val) => toggleModelStatus(record, Boolean(val))">
                <template #checked>ON</template>
                <template #unchecked>OFF</template>
              </a-switch>
              <span class="switch-label" :class="{ on: record.isActive }">
                {{ record.isActive ? '启用' : '禁用' }}
              </span>
            </div>
          </template>
          <template #keyCount="{ record }">
            <span :class="{ 'no-key': !(record.keys?.length) }">{{ record.keys?.length ?? 0 }}</span>
          </template>
          <template #provider="{ record }">
            <span class="provider-pill"
              :style="{ borderColor: providerColor(record.provider), color: providerColor(record.provider) }">
              {{ providerText(record.provider) }}
            </span>
          </template>
          <template #action="{ record }">
            <a-button type="text" size="small" @click="openEdit(record)">
              <template #icon>
                <IconEdit />
              </template>
              编辑
            </a-button>
            <a-button type="text" status="danger" size="small" @click="handleDeleteModel(record)">
              <template #icon>
                <IconDelete />
              </template>
              删除
            </a-button>
          </template>
        </a-table>
      </div>
    </a-spin>

    <a-modal v-model:visible="addDialogVisible" title="添加模型" width="480px" unmount-on-close class="model-modal">
      <a-form ref="formRef" :model="addForm" :rules="addRules" layout="horizontal" :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }">
        <a-form-item label="模型名称" field="modelName">
          <a-input v-model="addForm.modelName" placeholder="如 gpt-4" />
        </a-form-item>
        <a-form-item label="模型类型" field="type">
          <a-select v-model="addForm.type" placeholder="请选择模型类型">
            <a-option v-for="tab in typeTabs.filter(t => t.key !== 'all')" :key="tab.key" :value="tab.key"
              :label="tab.label" />
          </a-select>
        </a-form-item>
        <a-form-item label="提供方" field="provider">
          <a-select v-model="addForm.provider" placeholder="请选择提供商">
            <a-option v-for="item in providerOptions" :key="item.value" :value="item.value" :label="item.label" />
          </a-select>
        </a-form-item>
        <a-form-item label="默认 API Key" field="apiKey">
          <a-input v-model="addForm.apiKey" placeholder="可选，建议使用下方 Key 池管理" />
        </a-form-item>
        <a-form-item label="默认 BaseURL" field="baseUrl">
          <a-input v-model="addForm.baseUrl" placeholder="可选，如 https://api.openai.com/v1" />
        </a-form-item>
        <a-form-item label="模型描述" field="description">
          <a-textarea v-model="addForm.description" :rows="3" placeholder="可选，用于在前端展示模型简介" />
        </a-form-item>
        <a-form-item label="消耗积分" field="deductPoints">
          <a-input-number v-model="addForm.deductPoints" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="最大 Tokens" field="maxTokens">
          <a-input-number v-model="addForm.maxTokens" :min="1" :max="128000" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Temperature" field="temperature">
          <a-input-number v-model="addForm.temperature" :min="0" :max="2" :step="0.1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Top P" field="topP">
          <a-input-number v-model="addForm.topP" :min="0" :max="1" :step="0.1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="排序" field="order">
          <a-input-number v-model="addForm.order" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态" field="isActive">
          <a-switch v-model="addForm.isActive" checked-color="#00B42A" unchecked-color="rgba(255,255,255,0.12)">
            <template #checked>启用</template>
            <template #unchecked>禁用</template>
          </a-switch>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="addDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="submitAdd">确定</a-button>
      </template>
    </a-modal>

    <a-modal v-model:visible="editDialogVisible" title="编辑模型" width="480px" unmount-on-close class="model-modal">
      <a-form ref="formRef" :model="editForm" :rules="addRules" layout="horizontal" :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }">
        <a-form-item label="模型名称" field="modelName">
          <a-input v-model="editForm.modelName" />
        </a-form-item>
        <a-form-item label="模型类型" field="type">
          <a-select v-model="editForm.type" placeholder="请选择模型类型">
            <a-option v-for="tab in typeTabs.filter(t => t.key !== 'all')" :key="tab.key" :value="tab.key"
              :label="tab.label" />
          </a-select>
        </a-form-item>
        <a-form-item label="提供方" field="provider">
          <a-select v-model="editForm.provider" placeholder="请选择提供商">
            <a-option v-for="item in providerOptions" :key="item.value" :value="item.value" :label="item.label" />
          </a-select>
        </a-form-item>
        <a-form-item label="默认 API Key" field="apiKey">
          <a-input v-model="editForm.apiKey" placeholder="可选，建议使用下方 Key 池管理" />
        </a-form-item>
        <a-form-item label="默认 BaseURL" field="baseUrl">
          <a-input v-model="editForm.baseUrl" placeholder="可选，如 https://api.openai.com/v1" />
        </a-form-item>
        <a-form-item label="模型描述" field="description">
          <a-textarea v-model="editForm.description" :rows="3" placeholder="可选，用于在前端展示模型简介" />
        </a-form-item>
        <a-form-item label="消耗积分" field="deductPoints">
          <a-input-number v-model="editForm.deductPoints" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="最大 Tokens" field="maxTokens">
          <a-input-number v-model="editForm.maxTokens" :min="1" :max="128000" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Temperature" field="temperature">
          <a-input-number v-model="editForm.temperature" :min="0" :max="2" :step="0.1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="Top P" field="topP">
          <a-input-number v-model="editForm.topP" :min="0" :max="1" :step="0.1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="排序" field="order">
          <a-input-number v-model="editForm.order" :min="0" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态" field="isActive">
          <a-switch v-model="editForm.isActive" checked-color="#00B42A" unchecked-color="rgba(255,255,255,0.12)">
            <template #checked>启用</template>
            <template #unchecked>禁用</template>
          </a-switch>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="editDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="submitEdit">保存</a-button>
      </template>
    </a-modal>

    <a-modal v-model:visible="keyDialogVisible" :title="keyDialogMode === 'add' ? '添加 API Key' : '编辑 API Key'"
      width="520px" unmount-on-close class="model-modal">
      <a-form ref="keyFormRef" :model="keyForm" :rules="keyRules" layout="horizontal" :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }">
        <a-form-item label="选择方式">
          <a-radio-group v-model="keyForm.useSelect" type="button">
            <a-radio :value="true">从 API 库选择</a-radio>
            <a-radio :value="false">手动输入</a-radio>
          </a-radio-group>
        </a-form-item>

        <!-- 选择模式 -->
        <a-form-item v-if="keyForm.useSelect" label="选择 API Key" field="apiKeyId">
          <a-select v-model="keyForm.apiKeyId" placeholder="请选择已配置的 API Key" allow-clear @change="onApiKeySelect">
            <a-option v-for="key in apiKeyList" :key="key.id" :value="key.id">
              <div class="api-key-option">
                <span class="api-key-name">{{ key.name }}</span>
                <span class="api-key-provider">{{ key.provider }}</span>
                <span class="api-key-remark">{{ key.remark || '' }}</span>
              </div>
            </a-option>
          </a-select>
          <template #extra>
            <span v-if="apiKeyList.length === 0" style="color: var(--color-text-3); font-size: 12px;">
              暂无可用的 API Key，请先在 API Key 管理中添加
            </span>
          </template>
        </a-form-item>

        <!-- 手动输入模式 -->
        <a-form-item v-if="!keyForm.useSelect" label="API Key" field="apiKey">
          <a-textarea v-model="keyForm.apiKey" :rows="2" placeholder="sk-xxx" />
        </a-form-item>

        <a-form-item label="Base URL" field="baseUrl">
          <a-input v-model="keyForm.baseUrl" placeholder="可选，选择 API Key 后自动填充"
            :disabled="keyForm.useSelect && !!keyForm.apiKeyId" />
        </a-form-item>
        <a-form-item label="权重" field="weight">
          <a-input-number v-model="keyForm.weight" :min="1" style="width: 100%" />
        </a-form-item>
        <a-form-item label="状态" field="isActive">
          <a-switch v-model="keyForm.isActive" checked-color="#00B42A" unchecked-color="rgba(255,255,255,0.12)">
            <template #checked>启用</template>
            <template #unchecked>禁用</template>
          </a-switch>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="keyDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="submitKey">确定</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.model-manage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

/* Header */
.header-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
}

.header-left {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.header-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.24), rgba(64, 128, 255, 0.18));
  color: #B2D4FF;
  flex-shrink: 0;
}

.header-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
  margin: 0;
}

.header-subtitle {
  font-size: 13px;
  color: var(--text-3);
  margin: 2px 0 0;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.add-btn {
  background: var(--gradient-primary) !important;
  border: none;
}

.sync-btn {
  border: 1px solid var(--border-2);
  background: rgba(255, 255, 255, 0.02);
}

/* Toolbar */
.toolbar-card {
  padding: var(--sp-4);
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.view-toggle {
  display: flex;
  gap: 4px;
}

/* ===== Type filter tabs ===== */
.type-tabs {
  display: flex;
  gap: 6px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  flex-wrap: wrap;
}

.type-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 1px solid transparent;
  user-select: none;
}

.type-tab:hover {
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-1);
}

.type-tab.active {
  background: color-mix(in srgb, var(--tab-color, var(--text-2)) 12%, transparent);
  color: var(--tab-color, var(--text-1));
  border-color: color-mix(in srgb, var(--tab-color, var(--text-2)) 24%, transparent);
}

.type-tab-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.type-tab-count {
  font-size: 11px;
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 6px;
  border-radius: 10px;
  min-width: 20px;
  text-align: center;
}

/* ===== Type avatar ===== */
.type-avatar {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  flex-shrink: 0;
  letter-spacing: -0.02em;
}

.type-tag {
  display: inline-flex;
  align-items: center;
  height: 20px;
  padding: 0 8px;
  border-radius: 10px;
  border: 1px solid;
  font-size: 11px;
  font-weight: 600;
  background: rgba(255, 255, 255, 0.02);
  flex-shrink: 0;
}

.table-type-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ===== Card grid ===== */
.model-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

@media (max-width: 1200px) {
  .model-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 640px) {
  .model-grid {
    grid-template-columns: 1fr;
  }
}

.model-card {
  padding: 18px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.model-card-header {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.model-card-info {
  flex: 1;
  min-width: 0;
}

.model-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.model-name {
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.model-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-3);
  flex-wrap: wrap;
}

.meta-divider {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.10);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-4);
  flex-shrink: 0;
}

.status-dot.active {
  background: #00B42A;
}

.points-badge,
.key-count {
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 11px;
}

.key-count.no-key {
  color: #f87171;
}

.no-key {
  color: #f87171;
}

.model-card-expand {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

.keys-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-weight: 600;
  color: var(--text-2);
}

.keys-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 12px;
}

.key-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 10px;
}

.key-masked {
  flex: 1;
  font-family: monospace;
  font-size: 13px;
  color: var(--text-3);
}

.key-extra {
  font-size: 11px;
  color: var(--text-4);
  background: rgba(255, 255, 255, 0.04);
  padding: 2px 6px;
  border-radius: 8px;
}

.empty-keys {
  padding: 24px;
  text-align: center;
  color: var(--text-4);
  font-size: 13px;
  margin-bottom: 12px;
}

.empty-state {
  padding: 60px 0;
}

/* ===== Table ===== */
.table-card {
  padding: 20px;
  overflow: hidden;
}

.key-section {
  padding: 12px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 10px;
}

.data-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: rgba(22, 93, 255, 0.06) !important;
}

.provider-pill {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  border: 1px solid;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.02);
}

/* ===== Model status switch ===== */
.model-switch {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.table-switch-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.switch-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-4);
  transition: color 0.3s ease;
}

.switch-label.on {
  color: #00B42A;
}

/* Arco Switch global overrides for dark theme */
:deep(.arco-switch) {
  transition: background-color 0.3s ease, box-shadow 0.3s ease;
}

:deep(.arco-switch-checked) {
  box-shadow: 0 0 8px rgba(52, 211, 153, 0.3);
}

:deep(.arco-switch .arco-switch-handle) {
  transition: left 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
}

:deep(.arco-switch .arco-switch-text) {
  font-size: 10px;
  font-weight: 600;
}

/* API Key 选择框样式 */
.api-key-option {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.api-key-name {
  font-weight: 600;
  color: var(--text-1);
}

.api-key-provider {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(22, 93, 255, 0.15);
  color: #4080FF;
  text-transform: uppercase;
}

.api-key-remark {
  font-size: 11px;
  color: var(--text-3);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
