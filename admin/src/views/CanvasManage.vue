<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconSearch, IconRefresh, IconEye } from '@arco-design/web-vue/es/icon'
import {
  getCanvasProjects,
  getCanvasProjectDetail,
  type CanvasProject,
  type CanvasProjectDetailResponse,
} from '../api/canvas'

const loading = ref(false)
const detailLoading = ref(false)
const tableData = ref<CanvasProject[]>([])
const total = ref(0)
const searchKeyword = ref('')
const pagination = reactive({ page: 1, pageSize: 12 })

const detailVisible = ref(false)
const detailData = ref<CanvasProjectDetailResponse | null>(null)

const filteredData = computed(() => {
  if (!searchKeyword.value) return tableData.value
  const keyword = searchKeyword.value.trim().toLowerCase()
  return tableData.value.filter((item) =>
    [item.name, item.description, item.id].some((field) =>
      String(field || '').toLowerCase().includes(keyword),
    ),
  )
})

const summary = computed(() => {
  const projects = tableData.value.length
  const nodes = tableData.value.reduce((acc, cur) => acc + (cur.nodeCount || 0), 0)
  const updated = tableData.value[0]?.updatedAt || ''
  return { projects, nodes, updated }
})

const columns = [
  { title: '画布项目', dataIndex: 'name', slotName: 'name', minWidth: 260 },
  { title: '节点数', dataIndex: 'nodeCount', width: 100 },
  { title: '更新时间', dataIndex: 'updatedAt', width: 180, slotName: 'updatedAt' },
  { title: '操作', slotName: 'actions', width: 140 },
]

function formatTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function statusLabel(nodeCount?: number) {
  if (!nodeCount) return { text: '空白', color: 'gray' }
  if (nodeCount > 12) return { text: '高活跃', color: 'purple' }
  return { text: '活跃', color: 'blue' }
}

async function fetchList() {
  loading.value = true
  const res = await getCanvasProjects(pagination.page, pagination.pageSize).catch((err) => {
    console.error(err)
    Message.error('获取画布项目失败')
    return null
  })
  if (res) {
    tableData.value = res.list || []
    total.value = res.total || 0
  }
  loading.value = false
}

function openDetail(project: CanvasProject) {
  detailVisible.value = true
  detailLoading.value = true
  getCanvasProjectDetail(project.id)
    .then((res) => {
      detailData.value = res
    })
    .catch((err) => {
      console.error(err)
      Message.error('获取项目详情失败')
    })
    .finally(() => {
      detailLoading.value = false
    })
}

function handleSearch() {
  if (searchKeyword.value.trim()) {
    Message.info('已在当前列表中筛选画布项目')
  }
}

function handleRefresh() {
  void fetchList()
}

onMounted(() => {
  void fetchList()
})
</script>

<template>
  <div class="canvas-manage">
    <section class="hero">
      <div class="hero-title">
        <h2>画布项目管理</h2>
        <p>统一管理无限画布项目、节点规模与实时生成表现。</p>
      </div>
      <div class="hero-cards">
        <div class="hero-card">
          <span>项目总数</span>
          <h3>{{ summary.projects }}</h3>
        </div>
        <div class="hero-card">
          <span>节点总量</span>
          <h3>{{ summary.nodes }}</h3>
        </div>
        <div class="hero-card">
          <span>最近更新</span>
          <h3>{{ summary.updated ? formatTime(summary.updated) : '暂无记录' }}</h3>
        </div>
      </div>
    </section>

    <section class="panel">
      <div class="panel-head">
        <div class="search">
          <a-input
            v-model="searchKeyword"
            allow-clear
            @press-enter="handleSearch"
          >

            <template #prefix>
              <IconSearch />
            </template>
          </a-input>
          <button class="ghost" @click="handleSearch">筛选</button>
          <button class="ghost" @click="handleRefresh">
            <IconRefresh />
            刷新
          </button>
        </div>
        <div class="panel-meta">
          <span>当前展示 {{ filteredData.length }} 个项目</span>
        </div>
      </div>

      <a-table
        :columns="columns"
        :data="filteredData"
        :pagination="{ current: pagination.page, pageSize: pagination.pageSize, total }"
        :loading="loading"
        class="table"
        @page-change="(page: number) => { pagination.page = page; fetchList() }"
      >
        <template #name="{ record }">
          <div class="name-cell">
            <div>
              <p class="title">{{ record.name }}</p>
              <p class="desc">{{ record.description || '画布创作流程已进入管理态' }}</p>
            </div>
            <a-tag size="small" :color="statusLabel(record.nodeCount).color">
              {{ statusLabel(record.nodeCount).text }}
            </a-tag>
          </div>
        </template>
        <template #updatedAt="{ record }">
          <span>{{ formatTime(record.updatedAt) }}</span>
        </template>
        <template #actions="{ record }">
          <a-button type="text" class="link" @click="openDetail(record)">
            <IconEye /> 查看
          </a-button>
        </template>
      </a-table>
    </section>

    <a-drawer
      :visible="detailVisible"
      :width="520"
      :footer="false"
      @cancel="detailVisible = false"
    >
      <template #title>
        画布详情
      </template>
      <div v-if="detailLoading" class="detail-loading">加载详情中...</div>
      <div v-else-if="detailData" class="detail-body">
        <div class="detail-header">
          <h3>{{ detailData.project.name }}</h3>
          <p>{{ detailData.project.description || '该画布暂无描述信息，但节点已在排布中。' }}</p>
        </div>
        <div class="detail-stats">
          <div>
            <span>节点数量</span>
            <strong>{{ detailData.nodes.length }}</strong>
          </div>
          <div>
            <span>创建时间</span>
            <strong>{{ formatTime(detailData.project.createdAt) }}</strong>
          </div>
          <div>
            <span>最近更新</span>
            <strong>{{ formatTime(detailData.project.updatedAt) }}</strong>
          </div>
        </div>
        <div class="detail-list">
          <h4>节点概览</h4>
          <div class="node-card" v-for="node in detailData.nodes" :key="node.id">
            <div>
              <p class="node-title">{{ node.title }}</p>
              <p class="node-prompt">{{ node.prompt }}</p>
            </div>
            <a-tag size="small" :color="node.status === 'failed' ? 'red' : node.status === 'done' ? 'green' : 'blue'">
              {{ node.status === 'failed' ? '失败' : node.status === 'done' ? '完成' : node.status === 'running' ? '生成中' : '待命' }}
            </a-tag>
          </div>
        </div>
      </div>
      <div v-else class="detail-empty">暂无可展示的画布详情</div>
    </a-drawer>
  </div>
</template>

<style scoped>
.canvas-manage {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.hero {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(35, 35, 36, 0.92), rgba(42, 42, 43, 0.92));
  box-shadow: 0 20px 40px rgba(35, 35, 36, 0.35);
}

.hero-title h2 {
  margin: 0 0 6px;
  font-size: 20px;
}

.hero-title p {
  margin: 0;
  color: var(--color-text-3);
}

.hero-cards {
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
}

.hero-card {
  flex: 1;
  min-width: 180px;
  padding: 16px;
  border-radius: 16px;
  background: rgba(49, 49, 50, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.15);
}

.hero-card span {
  color: var(--color-text-3);
  font-size: 12px;
}

.hero-card h3 {
  margin: 8px 0 0;
  font-size: 18px;
}

.panel {
  padding: 20px;
  border-radius: 20px;
  background: rgba(35, 35, 36, 0.6);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.search {
  display: flex;
  align-items: center;
  gap: 10px;
}

button.ghost {
  border: none;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(148, 163, 184, 0.12);
  color: var(--color-text-2);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

button.ghost:hover {
  background: rgba(148, 163, 184, 0.2);
}

.table {
  border-radius: 16px;
  overflow: hidden;
}

.name-cell {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.name-cell .title {
  margin: 0 0 4px;
  font-weight: 600;
}

.name-cell .desc {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-3);
}

.link {
  color: var(--color-primary-6);
}

.detail-loading,
.detail-empty {
  padding: 16px 0;
  color: var(--color-text-3);
}

.detail-body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.detail-header h3 {
  margin: 0 0 6px;
}

.detail-header p {
  margin: 0;
  color: var(--color-text-3);
}

.detail-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.detail-stats div {
  padding: 12px;
  border-radius: 12px;
  background: rgba(35, 35, 36, 0.65);
  border: 1px solid rgba(148, 163, 184, 0.12);
}

.detail-stats span {
  display: block;
  font-size: 12px;
  color: var(--color-text-3);
}

.detail-stats strong {
  font-size: 14px;
}

.detail-list h4 {
  margin: 0 0 12px;
}

.node-card {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid rgba(148, 163, 184, 0.12);
  background: rgba(35, 35, 36, 0.55);
}

.node-title {
  margin: 0 0 4px;
  font-size: 13px;
  font-weight: 600;
}

.node-prompt {
  margin: 0;
  font-size: 12px;
  color: var(--color-text-3);
}
</style>
