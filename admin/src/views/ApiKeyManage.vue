<template>
  <div class="apikey-manage">
    <!-- 工具栏 -->
    <div class="glow-card toolbar-card">
      <div class="toolbar">
        <a-button type="primary" class="add-btn" @click="openCreateModal">
          <template #icon><IconPlus /></template>
          添加 API Key
        </a-button>
        <div class="toolbar-right">
          <a-input
            v-model="searchKeyword"
            placeholder="搜索名称/备注..."
            allow-clear
            class="search-input"
            @press-enter="handleSearch"
            @clear="handleSearch"
          >
            <template #prefix><IconSearch /></template>
          </a-input>
          <a-select
            v-model="filterProvider"
            placeholder="平台筛选"
            allow-clear
            style="width: 130px"
            @change="handleSearch"
          >
            <a-option v-for="p in providerList" :key="p" :value="p">{{ p }}</a-option>
          </a-select>
          <a-select
            v-model="filterStatus"
            placeholder="状态筛选"
            allow-clear
            style="width: 120px"
            @change="handleSearch"
          >
            <a-option :value="true">启用</a-option>
            <a-option :value="false">禁用</a-option>
          </a-select>
          <a-button @click="handleSearch">
            <template #icon><IconSearch /></template>
            搜索
          </a-button>
          <a-button @click="handleReset">重置</a-button>
        </div>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="glow-card stat-card">
        <div class="stat-badge tone-indigo"><IconLock /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.total }}</div>
          <div class="stat-label">总 Key 数</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-green"><IconCheck /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.active }}</div>
          <div class="stat-label">已启用</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-amber"><IconClose /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.inactive }}</div>
          <div class="stat-label">已禁用</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-cyan"><IconStorage /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.totalUsage.toLocaleString() }}</div>
          <div class="stat-label">总使用次数</div>
        </div>
      </div>
    </div>

    <!-- API Key 列表 -->
    <div class="glow-card table-card">
      <a-table
        :data="filteredApiKeys"
        :loading="loading"
        :pagination="pagination"
        @page-change="onPageChange"
        class="data-table"
        row-key="id"
      >
        <template #columns>
          <a-table-column title="名称" data-index="name" :width="160">
            <template #cell="{ record }">
              <div class="name-cell">
                <span class="name-text">{{ record.name }}</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="平台" data-index="provider" :width="120">
            <template #cell="{ record }">
              <span
                class="provider-pill"
                :style="{ borderColor: getProviderColor(record.provider), color: getProviderColor(record.provider) }"
              >
                {{ getProviderLabel(record.provider) }}
              </span>
            </template>
          </a-table-column>
          <a-table-column title="API Key" data-index="apiKey" :width="180">
            <template #cell="{ record }">
              <div class="apikey-cell">
                <span class="apikey-mask">{{ maskApiKey(record.apiKey) }}</span>
                <a-button type="text" size="mini" @click="copyApiKey(record.apiKey)">
                  <template #icon><IconCopy /></template>
                </a-button>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="Base URL" data-index="baseUrl" :width="200">
            <template #cell="{ record }">
              <span class="baseurl-text">{{ record.baseUrl || '-' }}</span>
            </template>
          </a-table-column>
          <a-table-column title="权重" data-index="weight" :width="80" />
          <a-table-column title="使用次数" data-index="usageCount" :width="100" />
          <a-table-column title="状态" data-index="isActive" :width="100">
            <template #cell="{ record }">
              <div class="status-cell">
                <span class="status-dot" :class="{ active: record.isActive }" />
                <span>{{ record.isActive ? '启用' : '禁用' }}</span>
              </div>
            </template>
          </a-table-column>
          <a-table-column title="备注" data-index="remark" :width="150">
            <template #cell="{ record }">
              <span class="remark-text">{{ record.remark || '-' }}</span>
            </template>
          </a-table-column>
          <a-table-column title="操作" :width="140" fixed="right">
            <template #cell="{ record }">
              <a-tooltip content="编辑">
                <a-button type="text" size="small" class="action-btn" @click="openEditModal(record)">
                  <template #icon><IconEdit /></template>
                </a-button>
              </a-tooltip>
              <a-popconfirm
                content="确定删除这个 API Key 吗？"
                type="warning"
                @ok="handleDelete(record.id)"
              >
                <a-tooltip content="删除">
                  <a-button type="text" status="danger" size="small" class="action-btn">
                    <template #icon><IconDelete /></template>
                  </a-button>
                </a-tooltip>
              </a-popconfirm>
            </template>
          </a-table-column>
        </template>
      </a-table>
    </div>

    <!-- 创建/编辑弹窗 -->
    <a-modal
      v-model:visible="modalVisible"
      :title="isEdit ? '编辑 API Key' : '添加 API Key'"
      width="520px"
      unmount-on-close
      class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }"
    >
      <a-form
        ref="formRef"
        :model="formData"
        :rules="formRules"
        layout="horizontal"
        :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }"
      >
        <a-form-item field="name" label="名称" required>
          <a-input v-model="formData.name" placeholder="请输入名称" />
        </a-form-item>
        <a-form-item field="provider" label="平台" required>
          <a-select v-model="formData.provider" placeholder="请选择平台">
            <a-option value="kie">KIE</a-option>
            <a-option value="apimart">Apimart</a-option>
            <a-option value="grsai">GrsAI</a-option>
            <a-option value="openai">OpenAI</a-option>
            <a-option value="custom">自定义</a-option>
          </a-select>
        </a-form-item>
        <a-form-item field="apiKey" label="API Key" required>
          <a-textarea v-model="formData.apiKey" :rows="2" placeholder="请输入 API Key" />
        </a-form-item>
        <a-form-item field="baseUrl" label="Base URL">
          <a-input v-model="formData.baseUrl" placeholder="可选，如：https://api.example.com" />
        </a-form-item>
        <a-form-item field="weight" label="权重">
          <a-input-number v-model="formData.weight" :min="1" :max="100" style="width: 100%" />
        </a-form-item>
        <a-form-item field="isActive" label="状态">
          <a-switch v-model="formData.isActive" checked-color="#00B42A" unchecked-color="rgba(255,255,255,0.12)">
            <template #checked>启用</template>
            <template #unchecked>禁用</template>
          </a-switch>
        </a-form-item>
        <a-form-item field="remark" label="备注">
          <a-textarea v-model="formData.remark" placeholder="可选" :auto-size="{ minRows: 2, maxRows: 4 }" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="modalVisible = false">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="handleSubmit">
          {{ isEdit ? '保存' : '创建' }}
        </a-button>
      </template>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import {
  IconPlus,
  IconSearch,
  IconEdit,
  IconDelete,
  IconCopy,
  IconCheck,
  IconClose,
  IconStorage,
  IconLock,
} from '@arco-design/web-vue/es/icon'
import request from '../api/index'

interface ApiKey {
  id: string
  name: string
  provider: string
  apiKey: string
  baseUrl: string | null
  weight: number
  isActive: boolean
  usageCount: number
  remark: string | null
  createdAt: string
  updatedAt: string
}

const loading = ref(false)
const submitLoading = ref(false)
const modalVisible = ref(false)
const isEdit = ref(false)
const apiKeyList = ref<ApiKey[]>([])
const formRef = ref<FormInstance>()

// 筛选
const searchKeyword = ref('')
const filterProvider = ref<string | undefined>()
const filterStatus = ref<boolean | undefined>()

const pagination = reactive({
  total: 0,
  current: 1,
  pageSize: 10,
})

const formData = reactive({
  id: '',
  name: '',
  provider: 'kie',
  apiKey: '',
  baseUrl: '',
  weight: 1,
  isActive: true,
  remark: '',
})

const formRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
  provider: [{ required: true, message: '请选择平台', trigger: 'change' }],
  apiKey: [{ required: true, message: '请输入 API Key', trigger: 'blur' }],
}

const providerMap: Record<string, { label: string; color: string }> = {
  kie: { label: 'KIE', color: '#4080FF' },
  apimart: { label: 'Apimart', color: '#00B42A' },
  grsai: { label: 'GrsAI', color: '#FF7D00' },
  openai: { label: 'OpenAI', color: '#14C9C9' },
  custom: { label: '自定义', color: '#86909C' },
}

const providerList = computed(() => {
  const set = new Set(apiKeyList.value.map(k => k.provider))
  return Array.from(set)
})

const filteredApiKeys = computed(() => {
  return apiKeyList.value.filter(k => {
    if (searchKeyword.value) {
      const kw = searchKeyword.value.toLowerCase()
      if (!k.name.toLowerCase().includes(kw) && !(k.remark || '').toLowerCase().includes(kw)) return false
    }
    if (filterProvider.value && k.provider !== filterProvider.value) return false
    if (filterStatus.value !== undefined && k.isActive !== filterStatus.value) return false
    return true
  })
})

const stats = computed(() => ({
  total: apiKeyList.value.length,
  active: apiKeyList.value.filter(k => k.isActive).length,
  inactive: apiKeyList.value.filter(k => !k.isActive).length,
  totalUsage: apiKeyList.value.reduce((a, k) => a + (k.usageCount || 0), 0),
}))

function getProviderLabel(provider: string) {
  return providerMap[provider]?.label || provider
}

function getProviderColor(provider: string) {
  return providerMap[provider]?.color || '#86909C'
}

function maskApiKey(key: string) {
  if (!key || key.length <= 8) return key
  return key.slice(0, 4) + '****' + key.slice(-4)
}

function copyApiKey(key: string) {
  navigator.clipboard?.writeText(key)
  Message.success('已复制')
}

async function fetchApiKeys() {
  loading.value = true
  try {
    const data = await request.get<ApiKey[]>('/apikeys')
    apiKeyList.value = data || []
    pagination.total = apiKeyList.value.length
  } catch (error) {
    Message.error('获取 API Key 列表失败')
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  pagination.current = 1
}

function handleReset() {
  searchKeyword.value = ''
  filterProvider.value = undefined
  filterStatus.value = undefined
  pagination.current = 1
}

function onPageChange(current: number) {
  pagination.current = current
}

function openCreateModal() {
  isEdit.value = false
  Object.assign(formData, {
    id: '',
    name: '',
    provider: 'kie',
    apiKey: '',
    baseUrl: '',
    weight: 1,
    isActive: true,
    remark: '',
  })
  modalVisible.value = true
}

function openEditModal(record: ApiKey) {
  isEdit.value = true
  Object.assign(formData, {
    id: record.id,
    name: record.name,
    provider: record.provider,
    apiKey: record.apiKey,
    baseUrl: record.baseUrl || '',
    weight: record.weight,
    isActive: record.isActive,
    remark: record.remark || '',
  })
  modalVisible.value = true
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return

  submitLoading.value = true
  try {
    if (isEdit.value) {
      await request.put(`/apikeys/${formData.id}`, {
        name: formData.name,
        provider: formData.provider,
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl || null,
        weight: formData.weight,
        isActive: formData.isActive,
        remark: formData.remark || null,
      })
      Message.success('更新成功')
    } else {
      await request.post('/apikeys', {
        name: formData.name,
        provider: formData.provider,
        apiKey: formData.apiKey,
        baseUrl: formData.baseUrl || null,
        weight: formData.weight,
        remark: formData.remark || null,
      })
      Message.success('创建成功')
    }
    modalVisible.value = false
    fetchApiKeys()
  } catch (error) {
    Message.error(isEdit.value ? '更新失败' : '创建失败')
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(id: string) {
  try {
    await request.delete(`/apikeys/${id}`)
    Message.success('删除成功')
    fetchApiKeys()
  } catch (error) {
    Message.error('删除失败')
  }
}

onMounted(() => {
  fetchApiKeys()
})
</script>

<style scoped>
.apikey-manage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

/* 工具栏 */
.toolbar-card {
  padding: var(--sp-4);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
}

.toolbar-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-3);
}

.add-btn {
  background: var(--gradient-primary) !important;
  border: none;
}

.search-input {
  width: 200px;
}

/* 统计卡片 */
.stats-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
}

.stat-card {
  padding: var(--sp-4);
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.stat-badge {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  flex-shrink: 0;
}

.tone-indigo { background: rgba(22, 93, 255, 0.16); color: #B2D4FF; }
.tone-green { background: rgba(0, 180, 42, 0.16); color: #6EE7B7; }
.tone-amber { background: rgba(255, 125, 0, 0.16); color: #FBBF24; }
.tone-cyan { background: rgba(20, 201, 201, 0.16); color: #67E8F9; }

.stat-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-value {
  font-size: 24px;
  font-weight: 800;
  color: var(--text-1);
}

.stat-label {
  font-size: 12px;
  color: var(--text-3);
}

/* 表格卡片 */
.table-card {
  padding: var(--sp-6);
  overflow: hidden;
}

.data-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: rgba(22, 93, 255, 0.06) !important;
}

.name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.name-text {
  font-weight: 500;
  color: var(--text-1);
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

.apikey-cell {
  display: flex;
  align-items: center;
  gap: 4px;
}

.apikey-mask {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  color: var(--text-3);
}

.baseurl-text,
.remark-text {
  color: var(--text-2);
  font-size: 13px;
}

.status-cell {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-red);
}

.status-dot.active {
  background: var(--accent-green);
}

.action-btn {
  margin: 0 2px;
}

/* 弹窗 */
.edit-modal :deep(.arco-modal) {
  background: var(--bg-surface-2);
  border: 1px solid var(--glass-border);
}

/* 响应式 */
@media (max-width: 1200px) {
  .stats-row {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 768px) {
  .stats-row {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .toolbar-right {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    width: 100%;
  }
}
</style>
