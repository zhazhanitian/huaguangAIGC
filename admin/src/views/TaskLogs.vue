<script setup lang="ts">
import { ref, reactive, computed, watch } from 'vue'
import {
  IconSearch,
  IconRefresh,
  IconImage,
  IconVideoCamera,
  IconMusic,
  IconApps,
  IconMessage,
  IconEdit,
} from '@arco-design/web-vue/es/icon'
import {
  getDrawTaskLogs,
  getCanvasTaskLogs,
  getVideoTaskLogs,
  getMusicTaskLogs,
  getModel3dTaskLogs,
  getChatTaskLogs,
  type DrawTaskLog,
  type VideoTaskLog,
  type MusicTaskLog,
  type Model3dTaskLog,
  type ChatTaskLog,
  type TaskLogQuery,
} from '../api/taskLogs'

// ===== Tab 配置 =====
const tabs = [
  { key: 'draw', label: '生图记录', icon: IconImage },
  { key: 'canvas', label: '画布记录', icon: IconEdit },
  { key: 'video', label: '生视频', icon: IconVideoCamera },
  { key: 'music', label: '生音乐', icon: IconMusic },
  { key: 'model3d', label: '生3D', icon: IconApps },
  { key: 'chat', label: '对话记录', icon: IconMessage },
]

const activeTab = ref('draw')

// ===== 筛选条件 =====
const filter = reactive<TaskLogQuery>({
  page: 1,
  pageSize: 10,
  userKeyword: '',
  status: '',
  taskType: '',
  provider: '',
  startDate: '',
  endDate: '',
})

const dateRange = ref<string[]>([])

watch(dateRange, (val) => {
  filter.startDate = val?.[0] ?? ''
  filter.endDate = val?.[1] ?? ''
})

// ===== 状态枚举 =====
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '等待中', value: 'pending' },
  { label: '处理中', value: 'processing' },
  { label: '已完成', value: 'completed' },
  { label: '已失败', value: 'failed' },
]

const drawTaskTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '文生图', value: 'text2img' },
  { label: '图生图', value: 'img2img' },
  { label: '超分放大', value: 'upscale' },
  { label: '变体', value: 'variation' },
  { label: '混合', value: 'blend' },
  { label: '描述', value: 'describe' },
]

const videoTaskTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '文生视频', value: 'text2video' },
  { label: '图生视频', value: 'img2video' },
]

const model3dTaskTypeOptions = [
  { label: '全部类型', value: '' },
  { label: '文生3D', value: 'text2model' },
  { label: '图生3D', value: 'img2model' },
]

const taskTypeOptions = computed(() => {
  if (activeTab.value === 'draw' || activeTab.value === 'canvas') return drawTaskTypeOptions
  if (activeTab.value === 'video') return videoTaskTypeOptions
  if (activeTab.value === 'model3d') return model3dTaskTypeOptions
  return []
})

const showTaskType = computed(() => ['draw', 'canvas', 'video', 'model3d'].includes(activeTab.value))
const showProvider = computed(() => activeTab.value !== 'chat')

// ===== 数据 =====
const loading = ref(false)
const total = ref(0)

const drawList = ref<DrawTaskLog[]>([])
const videoList = ref<VideoTaskLog[]>([])
const musicList = ref<MusicTaskLog[]>([])
const model3dList = ref<Model3dTaskLog[]>([])
const chatList = ref<ChatTaskLog[]>([])


async function fetchData() {
  loading.value = true
  try {
    const params: TaskLogQuery = {
      page: filter.page,
      pageSize: filter.pageSize,
      userKeyword: filter.userKeyword || undefined,
      status: filter.status || undefined,
      taskType: filter.taskType || undefined,
      provider: filter.provider || undefined,
      startDate: filter.startDate || undefined,
      endDate: filter.endDate || undefined,
    }
    switch (activeTab.value) {
      case 'draw': {
        const res = await getDrawTaskLogs(params)
        drawList.value = res.list
        total.value = res.total
        break
      }
      case 'canvas': {
        const res = await getCanvasTaskLogs(params)
        drawList.value = res.list
        total.value = res.total
        break
      }
      case 'video': {
        const res = await getVideoTaskLogs(params)
        videoList.value = res.list
        total.value = res.total
        break
      }
      case 'music': {
        const res = await getMusicTaskLogs(params)
        musicList.value = res.list
        total.value = res.total
        break
      }
      case 'model3d': {
        const res = await getModel3dTaskLogs(params)
        model3dList.value = res.list
        total.value = res.total
        break
      }
      case 'chat': {
        const res = await getChatTaskLogs(params)
        chatList.value = res.list
        total.value = res.total
        break
      }
    }
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filter.page = 1
  fetchData()
}

function handleReset() {
  filter.userKeyword = ''
  filter.status = ''
  filter.taskType = ''
  filter.provider = ''
  filter.startDate = ''
  filter.endDate = ''
  dateRange.value = []
  filter.page = 1
  fetchData()
}

function handleTabChange(key: string) {
  activeTab.value = key
  filter.page = 1
  filter.taskType = ''
  filter.provider = ''
  fetchData()
}

function handlePageChange(page: number) {
  filter.page = page
  fetchData()
}

function handlePageSizeChange(pageSize: number) {
  filter.pageSize = pageSize
  filter.page = 1
  fetchData()
}

// ===== 状态显示 =====

function getStatusLabel(status: string) {
  const map: Record<string, string> = {
    pending: '等待中',
    processing: '处理中',
    completed: '已完成',
    failed: '已失败',
    success: '成功',
    error: '失败',
  }
  return map[status] ?? status
}

function truncate(text: string, max = 60) {
  if (!text) return '-'
  return text.length > max ? text.slice(0, max) + '…' : text
}

function formatPoints(val: number | string | null) {
  if (val === null || val === undefined) return '0'
  const n = Number(val)
  return n % 1 === 0 ? String(n) : n.toFixed(2)
}

function formatDate(dateStr: string) {
  if (!dateStr) return { date: '-', time: '' }
  const d = new Date(dateStr)
  const date = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' })
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  return { date, time }
}

function formatDateStr(dateStr: string) {
  const { date, time } = formatDate(dateStr)
  return date === '-' ? '-' : `${date} ${time}`
}

function formatDuration(sec: number | null) {
  if (sec === null || sec === undefined) return '-'
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return m > 0 ? `${m}m${s}s` : `${s}s`
}

// ===== 预览弹窗 =====
const previewVisible = ref(false)
const previewItem = ref<any>(null)
const previewTab = ref('')

function openPreview(item: any) {
  previewItem.value = item
  previewTab.value = activeTab.value
  previewVisible.value = true
}

// 初始加载
fetchData()
</script>

<template>
  <div class="task-logs-page">
    <!-- 页头 -->
    <div class="page-header">
      <div class="page-header-left">
        <h2 class="page-title">任务日志</h2>
        <span class="page-subtitle">查看所有用户的 AI 生成任务记录（仅超级管理员可见）</span>
      </div>
      <a-tag color="orangered" class="super-badge">超级管理员专属</a-tag>
    </div>

    <!-- Tab 切换 -->
    <div class="tab-bar">
      <div v-for="tab in tabs" :key="tab.key" class="tab-item" :class="{ active: activeTab === tab.key }"
        @click="handleTabChange(tab.key)">
        <span class="tab-icon">
          <component :is="tab.icon" />
        </span>
        <span class="tab-label">{{ tab.label }}</span>
      </div>
    </div>

    <!-- 筛选栏 -->
    <div class="filter-bar card">
      <div class="filter-row">
        <a-input v-model="filter.userKeyword" placeholder="搜索用户名 / 手机号 / 邮箱" :style="{ width: '220px' }" allow-clear
          @press-enter="handleSearch">
          <template #prefix>
            <IconSearch />
          </template>
        </a-input>

        <a-select v-model="filter.status" :options="statusOptions" placeholder="任务状态" :style="{ width: '140px' }"
          allow-clear />

        <a-select v-if="showTaskType" v-model="filter.taskType" :options="taskTypeOptions" placeholder="任务类型"
          :style="{ width: '140px' }" allow-clear />

        <a-input v-if="showProvider" v-model="filter.provider" placeholder="服务商/模型" :style="{ width: '160px' }"
          allow-clear />

        <a-range-picker v-model="dateRange" :style="{ width: '240px' }" show-time format="YYYY-MM-DD HH:mm"
          :placeholder="['开始时间', '结束时间']" />

        <a-button type="primary" @click="handleSearch">
          <template #icon>
            <IconSearch />
          </template>
          查询
        </a-button>
        <a-button @click="handleReset">
          <template #icon>
            <IconRefresh />
          </template>
          重置
        </a-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-wrap card">
      <div class="table-header">
        <span class="table-total">共 <strong>{{ total }}</strong> 条记录</span>
      </div>

      <!-- 生图 / 画布 -->
      <template v-if="activeTab === 'draw' || activeTab === 'canvas'">
        <a-table :data="drawList as any[]" :loading="loading" :pagination="false" row-key="id" class="log-table">
          <template #columns>
            <a-table-column title="用户" :width="150">
              <template #cell="{ record }">
                <div class="user-cell">
                  <a-avatar :size="28" class="user-avatar">{{ (record.username || '?').charAt(0) }}</a-avatar>
                  <div class="user-info">
                    <div class="user-name">{{ record.username || '未知用户' }}</div>
                    <div class="user-sub">{{ record.userEmail || record.userPhone || record.userId.slice(0, 8) }}</div>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="服务商" :width="180">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.provider }}</span></template>
            </a-table-column>
            <a-table-column title="提示词" :width="200">
              <template #cell="{ record }">
                <a-tooltip :content="record.prompt" position="top">
                  <span class="prompt-text">{{ truncate(record.prompt, 40) }}</span>
                </a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="状态" :width="92">
              <template #cell="{ record }"><span class="status-cell" :class="`status-${record.status}`">{{
                getStatusLabel(record.status) }}</span></template>
            </a-table-column>
            <a-table-column title="积分" :width="68" align="right">
              <template #cell="{ record }"><span class="points">{{ formatPoints(record.deductPoints)
                  }}</span></template>
            </a-table-column>
            <a-table-column title="预览" :width="76" align="center">
              <template #cell="{ record }">
                <a-image v-if="record.imageUrl" :src="record.imageUrl" :preview="true" :width="48" :height="48"
                  fit="cover" class="preview-img" />
                <span v-else class="no-result">—</span>
              </template>
            </a-table-column>
            <a-table-column title="创建时间" :width="130">
              <template #cell="{ record }">
                <div class="date-cell"><span>{{ formatDate(record.createdAt).date }}</span><span class="date-time">{{
                  formatDate(record.createdAt).time }}</span></div>
              </template>
            </a-table-column>
            <a-table-column title="操作" :width="64" fixed="right" align="center">
              <template #cell="{ record }"><a-button type="text" size="mini"
                  @click="openPreview(record)">详情</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </template>

      <!-- 生视频 -->
      <template v-else-if="activeTab === 'video'">
        <a-table :data="videoList as any[]" :loading="loading" :pagination="false" row-key="id" class="log-table">
          <template #columns>
            <a-table-column title="用户" :width="150">
              <template #cell="{ record }">
                <div class="user-cell">
                  <a-avatar :size="28" class="user-avatar">{{ (record.username || '?').charAt(0) }}</a-avatar>
                  <div class="user-info">
                    <div class="user-name">{{ record.username || '未知用户' }}</div>
                    <div class="user-sub">{{ record.userEmail || record.userPhone || record.userId.slice(0, 8) }}</div>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="服务商" :width="180">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.provider }}</span></template>
            </a-table-column>
            <a-table-column title="提示词" :width="200">
              <template #cell="{ record }">
                <a-tooltip :content="record.prompt"><span class="prompt-text">{{ truncate(record.prompt, 40)
                    }}</span></a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="时长" :width="64" align="center">
              <template #cell="{ record }"><span class="nowrap">{{ formatDuration(record.duration) }}</span></template>
            </a-table-column>
            <a-table-column title="状态" :width="92">
              <template #cell="{ record }"><span class="status-cell" :class="`status-${record.status}`">{{
                getStatusLabel(record.status) }}</span></template>
            </a-table-column>
            <a-table-column title="积分" :width="68" align="right">
              <template #cell="{ record }"><span class="points">{{ formatPoints(record.deductPoints)
                  }}</span></template>
            </a-table-column>
            <a-table-column title="视频" :width="64" align="center">
              <template #cell="{ record }">
                <a-button v-if="record.videoUrl" type="text" size="mini" @click="openPreview(record)">播放</a-button>
                <span v-else class="no-result">—</span>
              </template>
            </a-table-column>
            <a-table-column title="创建时间" :width="130">
              <template #cell="{ record }">
                <div class="date-cell"><span>{{ formatDate(record.createdAt).date }}</span><span class="date-time">{{
                  formatDate(record.createdAt).time }}</span></div>
              </template>
            </a-table-column>
            <a-table-column title="操作" :width="64" fixed="right" align="center">
              <template #cell="{ record }"><a-button type="text" size="mini"
                  @click="openPreview(record)">详情</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </template>

      <!-- 生音乐 -->
      <template v-else-if="activeTab === 'music'">
        <a-table :data="musicList as any[]" :loading="loading" :pagination="false" row-key="id" class="log-table">
          <template #columns>
            <a-table-column title="用户" :width="150">
              <template #cell="{ record }">
                <div class="user-cell">
                  <a-avatar :size="28" class="user-avatar">{{ (record.username || '?').charAt(0) }}</a-avatar>
                  <div class="user-info">
                    <div class="user-name">{{ record.username || '未知用户' }}</div>
                    <div class="user-sub">{{ record.userEmail || record.userPhone || record.userId.slice(0, 8) }}</div>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="标题" :width="130">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.title || '—' }}</span></template>
            </a-table-column>
            <a-table-column title="风格" :width="100">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.style || '—' }}</span></template>
            </a-table-column>
            <a-table-column title="描述" :width="200">
              <template #cell="{ record }">
                <a-tooltip :content="record.prompt"><span class="prompt-text">{{ truncate(record.prompt, 40)
                    }}</span></a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="时长" :width="64" align="center">
              <template #cell="{ record }"><span class="nowrap">{{ formatDuration(record.duration) }}</span></template>
            </a-table-column>
            <a-table-column title="状态" :width="92">
              <template #cell="{ record }"><span class="status-cell" :class="`status-${record.status}`">{{
                getStatusLabel(record.status) }}</span></template>
            </a-table-column>
            <a-table-column title="积分" :width="68" align="right">
              <template #cell="{ record }"><span class="points">{{ formatPoints(record.deductPoints)
                  }}</span></template>
            </a-table-column>
            <a-table-column title="音频" :width="64" align="center">
              <template #cell="{ record }">
                <a-button v-if="record.audioUrl" type="text" size="mini" @click="openPreview(record)">播放</a-button>
                <span v-else class="no-result">—</span>
              </template>
            </a-table-column>
            <a-table-column title="创建时间" :width="130">
              <template #cell="{ record }">
                <div class="date-cell"><span>{{ formatDate(record.createdAt).date }}</span><span class="date-time">{{
                  formatDate(record.createdAt).time }}</span></div>
              </template>
            </a-table-column>
            <a-table-column title="操作" :width="64" fixed="right" align="center">
              <template #cell="{ record }"><a-button type="text" size="mini"
                  @click="openPreview(record)">详情</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </template>

      <!-- 生3D -->
      <template v-else-if="activeTab === 'model3d'">
        <a-table :data="model3dList as any[]" :loading="loading" :pagination="false" row-key="id" class="log-table">
          <template #columns>
            <a-table-column title="用户" :width="150">
              <template #cell="{ record }">
                <div class="user-cell">
                  <a-avatar :size="28" class="user-avatar">{{ (record.username || '?').charAt(0) }}</a-avatar>
                  <div class="user-info">
                    <div class="user-name">{{ record.username || '未知用户' }}</div>
                    <div class="user-sub">{{ record.userEmail || record.userPhone || record.userId.slice(0, 8) }}</div>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="服务商" :width="160">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.provider }}</span></template>
            </a-table-column>
            <a-table-column title="提示词" :width="200">
              <template #cell="{ record }">
                <a-tooltip :content="record.prompt"><span class="prompt-text">{{ truncate(record.prompt, 40)
                    }}</span></a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="状态" :width="92">
              <template #cell="{ record }"><span class="status-cell" :class="`status-${record.status}`">{{
                getStatusLabel(record.status) }}</span></template>
            </a-table-column>
            <a-table-column title="积分" :width="68" align="right">
              <template #cell="{ record }"><span class="points">{{ formatPoints(record.deductPoints)
                  }}</span></template>
            </a-table-column>
            <a-table-column title="预览图" :width="76" align="center">
              <template #cell="{ record }">
                <a-image v-if="record.resultPreviewUrl" :src="record.resultPreviewUrl" :preview="true" :width="48"
                  :height="48" fit="cover" class="preview-img" />
                <span v-else class="no-result">—</span>
              </template>
            </a-table-column>
            <a-table-column title="模型" :width="64" align="center">
              <template #cell="{ record }">
                <a v-if="record.resultModelUrl" :href="record.resultModelUrl" target="_blank" class="link-btn">下载</a>
                <span v-else class="no-result">—</span>
              </template>
            </a-table-column>
            <a-table-column title="创建时间" :width="130">
              <template #cell="{ record }">
                <div class="date-cell"><span>{{ formatDate(record.createdAt).date }}</span><span class="date-time">{{
                  formatDate(record.createdAt).time }}</span></div>
              </template>
            </a-table-column>
            <a-table-column title="操作" :width="64" fixed="right" align="center">
              <template #cell="{ record }"><a-button type="text" size="mini"
                  @click="openPreview(record)">详情</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </template>

      <!-- 对话记录 -->
      <template v-else-if="activeTab === 'chat'">
        <a-table :data="chatList as any[]" :loading="loading" :pagination="false" row-key="id" class="log-table">
          <template #columns>
            <a-table-column title="用户" :width="150">
              <template #cell="{ record }">
                <div class="user-cell">
                  <a-avatar :size="28" class="user-avatar">{{ (record.username || '?').charAt(0) }}</a-avatar>
                  <div class="user-info">
                    <div class="user-name">{{ record.username || '未知用户' }}</div>
                    <div class="user-sub">{{ record.userEmail || record.userPhone || record.userId.slice(0, 8) }}</div>
                  </div>
                </div>
              </template>
            </a-table-column>
            <a-table-column title="模型" :width="170">
              <template #cell="{ record }"><span class="cell-ellipsis">{{ record.model }}</span></template>
            </a-table-column>
            <a-table-column title="回复内容" :width="220">
              <template #cell="{ record }">
                <a-tooltip :content="record.content"><span class="prompt-text">{{ truncate(record.content, 50)
                    }}</span></a-tooltip>
              </template>
            </a-table-column>
            <a-table-column title="Tokens" :width="80" align="right">
              <template #cell="{ record }"><span class="points">{{ record.tokens }}</span></template>
            </a-table-column>
            <a-table-column title="输入/输出" :width="108" align="center">
              <template #cell="{ record }"><span class="token-detail nowrap">{{ record.promptTokens }}/{{
                record.completionTokens }}</span></template>
            </a-table-column>
            <a-table-column title="状态" :width="92">
              <template #cell="{ record }"><span class="status-cell" :class="`status-${record.status}`">{{
                getStatusLabel(record.status) }}</span></template>
            </a-table-column>
            <a-table-column title="时间" :width="130">
              <template #cell="{ record }">
                <div class="date-cell"><span>{{ formatDate(record.createdAt).date }}</span><span class="date-time">{{
                  formatDate(record.createdAt).time }}</span></div>
              </template>
            </a-table-column>
            <a-table-column title="操作" :width="64" fixed="right" align="center">
              <template #cell="{ record }"><a-button type="text" size="mini"
                  @click="openPreview(record)">详情</a-button></template>
            </a-table-column>
          </template>
        </a-table>
      </template>

      <!-- 分页 -->
      <div class="pagination-wrap">
        <a-pagination :total="total" :current="filter.page" :page-size="filter.pageSize"
          :page-size-options="[10, 20, 50, 100]" show-total show-jumper show-page-size @change="handlePageChange"
          @page-size-change="handlePageSizeChange" />
      </div>
    </div>

    <!-- 详情弹窗 -->
    <a-modal v-model:visible="previewVisible" title="任务详情" :width="1100" :footer="false"
      :body-style="{ padding: 0, height: '76vh', overflow: 'hidden' }" class="detail-modal">
      <div v-if="previewItem" class="detail-layout">

        <!-- ===== 左侧：媒体预览 ===== -->
        <div class="detail-left">
          <!-- 生图/画布 -->
          <template v-if="(previewTab === 'draw' || previewTab === 'canvas') && previewItem.imageUrl">
            <a-image :src="previewItem.imageUrl" :preview="true" class="detail-media-img" />
          </template>
          <!-- 无图占位 -->
          <template v-else-if="previewTab === 'draw' || previewTab === 'canvas'">
            <div class="detail-no-media">暂无生成结果</div>
          </template>

          <!-- 生视频 -->
          <template v-else-if="previewTab === 'video' && previewItem.videoUrl">
            <video :src="previewItem.videoUrl" controls class="detail-media-video" />
          </template>
          <template v-else-if="previewTab === 'video'">
            <div class="detail-no-media">暂无生成结果</div>
          </template>

          <!-- 生音乐 -->
          <template v-else-if="previewTab === 'music'">
            <div class="detail-music-left">
              <a-image v-if="previewItem.coverUrl" :src="previewItem.coverUrl" :preview="false"
                class="detail-music-cover" fit="cover" />
              <div v-else class="detail-music-cover-placeholder">
                <IconMusic style="font-size:40px;color:var(--text-4)" />
              </div>
              <audio v-if="previewItem.audioUrl" :src="previewItem.audioUrl" controls class="detail-music-audio" />
              <div v-else class="detail-no-media">暂无音频</div>
            </div>
          </template>

          <!-- 生3D -->
          <template v-else-if="previewTab === 'model3d'">
            <div class="detail-3d-left">
              <a-image v-if="previewItem.resultPreviewUrl" :src="previewItem.resultPreviewUrl" :preview="true"
                class="detail-media-img" fit="cover" />
              <div v-else class="detail-no-media">暂无预览图</div>
              <a v-if="previewItem.resultModelUrl" :href="previewItem.resultModelUrl" target="_blank"
                class="download-link" style="margin-top:12px">
                下载 3D 模型文件
              </a>
            </div>
          </template>

          <!-- 对话（无媒体，左侧显示统计） -->
          <template v-else-if="previewTab === 'chat'">
            <div class="detail-chat-stats">
              <div class="chat-stat-item">
                <span class="chat-stat-label">总 Tokens</span>
                <span class="chat-stat-value">{{ previewItem.tokens }}</span>
              </div>
              <div class="chat-stat-item">
                <span class="chat-stat-label">输入</span>
                <span class="chat-stat-value">{{ previewItem.promptTokens }}</span>
              </div>
              <div class="chat-stat-item">
                <span class="chat-stat-label">输出</span>
                <span class="chat-stat-value">{{ previewItem.completionTokens }}</span>
              </div>
              <div class="chat-stat-item">
                <span class="chat-stat-label">状态</span>
                <span class="status-cell" :class="`status-${previewItem.status}`">{{ getStatusLabel(previewItem.status)
                  }}</span>
              </div>
            </div>
          </template>
        </div>

        <!-- ===== 右侧：字段信息 ===== -->
        <div class="detail-right">
          <!-- 生图/画布 -->
          <template v-if="previewTab === 'draw' || previewTab === 'canvas'">
            <div class="dfield"><span class="dlabel">用户</span><span class="dvalue">{{ previewItem.username ||
              previewItem.userId }}</span></div>
            <div class="dfield"><span class="dlabel">任务类型</span><a-tag size="small">{{ previewItem.taskType }}</a-tag>
            </div>
            <div class="dfield"><span class="dlabel">服务商</span><span class="dvalue">{{ previewItem.provider }}</span>
            </div>
            <div class="dfield"><span class="dlabel">状态</span><span class="status-cell"
                :class="`status-${previewItem.status}`">{{ getStatusLabel(previewItem.status) }}</span></div>
            <div class="dfield"><span class="dlabel">扣除积分</span><span class="dvalue points">{{
              formatPoints(previewItem.deductPoints) }}</span></div>
            <div class="dfield"><span class="dlabel">创建时间</span><span class="dvalue">{{
              formatDateStr(previewItem.createdAt) }}</span></div>
            <div class="dfield"><span class="dlabel">任务 ID</span><span class="dvalue mono">{{ previewItem.id }}</span>
            </div>
            <div class="dfield full"><span class="dlabel">提示词</span>
              <div class="dvalue prompt-block">{{ previewItem.prompt || '-' }}</div>
            </div>
            <div v-if="previewItem.negativePrompt" class="dfield full"><span class="dlabel">负向提示词</span>
              <div class="dvalue prompt-block">{{ previewItem.negativePrompt }}</div>
            </div>
            <div v-if="previewItem.errorMessage" class="dfield full"><span class="dlabel">错误信息</span>
              <div class="dvalue error-block">{{ previewItem.errorMessage }}</div>
            </div>
          </template>

          <!-- 生视频 -->
          <template v-else-if="previewTab === 'video'">
            <div class="dfield"><span class="dlabel">用户</span><span class="dvalue">{{ previewItem.username ||
              previewItem.userId }}</span></div>
            <div class="dfield"><span class="dlabel">任务类型</span><a-tag size="small">{{ previewItem.taskType }}</a-tag>
            </div>
            <div class="dfield"><span class="dlabel">服务商</span><span class="dvalue">{{ previewItem.provider }}</span>
            </div>
            <div class="dfield"><span class="dlabel">状态</span><span class="status-cell"
                :class="`status-${previewItem.status}`">{{ getStatusLabel(previewItem.status) }}</span></div>
            <div class="dfield"><span class="dlabel">时长</span><span class="dvalue">{{
              formatDuration(previewItem.duration) }}</span></div>
            <div class="dfield"><span class="dlabel">扣除积分</span><span class="dvalue points">{{
              formatPoints(previewItem.deductPoints) }}</span></div>
            <div class="dfield"><span class="dlabel">创建时间</span><span class="dvalue">{{
              formatDateStr(previewItem.createdAt) }}</span></div>
            <div class="dfield"><span class="dlabel">任务 ID</span><span class="dvalue mono">{{ previewItem.id }}</span>
            </div>
            <div class="dfield full"><span class="dlabel">提示词</span>
              <div class="dvalue prompt-block">{{ previewItem.prompt || '-' }}</div>
            </div>
            <div v-if="previewItem.errorMessage" class="dfield full"><span class="dlabel">错误信息</span>
              <div class="dvalue error-block">{{ previewItem.errorMessage }}</div>
            </div>
          </template>

          <!-- 生音乐 -->
          <template v-else-if="previewTab === 'music'">
            <div class="dfield"><span class="dlabel">用户</span><span class="dvalue">{{ previewItem.username ||
              previewItem.userId }}</span></div>
            <div class="dfield"><span class="dlabel">标题</span><span class="dvalue">{{ previewItem.title || '-' }}</span>
            </div>
            <div class="dfield"><span class="dlabel">风格</span><span class="dvalue">{{ previewItem.style || '-' }}</span>
            </div>
            <div class="dfield"><span class="dlabel">服务商</span><span class="dvalue">{{ previewItem.provider }}</span>
            </div>
            <div class="dfield"><span class="dlabel">状态</span><span class="status-cell"
                :class="`status-${previewItem.status}`">{{ getStatusLabel(previewItem.status) }}</span></div>
            <div class="dfield"><span class="dlabel">时长</span><span class="dvalue">{{
              formatDuration(previewItem.duration) }}</span></div>
            <div class="dfield"><span class="dlabel">扣除积分</span><span class="dvalue points">{{
              formatPoints(previewItem.deductPoints) }}</span></div>
            <div class="dfield"><span class="dlabel">创建时间</span><span class="dvalue">{{
              formatDateStr(previewItem.createdAt) }}</span></div>
            <div class="dfield"><span class="dlabel">任务 ID</span><span class="dvalue mono">{{ previewItem.id }}</span>
            </div>
            <div class="dfield full"><span class="dlabel">描述/歌词</span>
              <div class="dvalue prompt-block">{{ previewItem.prompt || '-' }}</div>
            </div>
            <div v-if="previewItem.errorMessage" class="dfield full"><span class="dlabel">错误信息</span>
              <div class="dvalue error-block">{{ previewItem.errorMessage }}</div>
            </div>
          </template>

          <!-- 生3D -->
          <template v-else-if="previewTab === 'model3d'">
            <div class="dfield"><span class="dlabel">用户</span><span class="dvalue">{{ previewItem.username ||
              previewItem.userId }}</span></div>
            <div class="dfield"><span class="dlabel">任务类型</span><a-tag size="small">{{ previewItem.taskType }}</a-tag>
            </div>
            <div class="dfield"><span class="dlabel">服务商</span><span class="dvalue">{{ previewItem.provider }}</span>
            </div>
            <div class="dfield"><span class="dlabel">状态</span><span class="status-cell"
                :class="`status-${previewItem.status}`">{{ getStatusLabel(previewItem.status) }}</span></div>
            <div class="dfield"><span class="dlabel">扣除积分</span><span class="dvalue points">{{
              formatPoints(previewItem.deductPoints) }}</span></div>
            <div class="dfield"><span class="dlabel">创建时间</span><span class="dvalue">{{
              formatDateStr(previewItem.createdAt) }}</span></div>
            <div class="dfield"><span class="dlabel">任务 ID</span><span class="dvalue mono">{{ previewItem.id }}</span>
            </div>
            <div class="dfield full"><span class="dlabel">提示词</span>
              <div class="dvalue prompt-block">{{ previewItem.prompt || '-' }}</div>
            </div>
            <div v-if="previewItem.errorMessage" class="dfield full"><span class="dlabel">错误信息</span>
              <div class="dvalue error-block">{{ previewItem.errorMessage }}</div>
            </div>
          </template>

          <!-- 对话 -->
          <template v-else-if="previewTab === 'chat'">
            <div class="dfield"><span class="dlabel">用户</span><span class="dvalue">{{ previewItem.username ||
              previewItem.userId }}</span></div>
            <div class="dfield"><span class="dlabel">使用模型</span><span class="dvalue">{{ previewItem.model }}</span>
            </div>
            <div class="dfield"><span class="dlabel">会话 ID</span><span class="dvalue mono">{{ previewItem.groupId
                }}</span></div>
            <div class="dfield"><span class="dlabel">消息 ID</span><span class="dvalue mono">{{ previewItem.id }}</span>
            </div>
            <div class="dfield"><span class="dlabel">时间</span><span class="dvalue">{{
              formatDateStr(previewItem.createdAt) }}</span></div>
            <div class="dfield full"><span class="dlabel">回复内容</span>
              <div class="dvalue prompt-block chat-content">{{ previewItem.content }}</div>
            </div>
          </template>
        </div>

      </div>
    </a-modal>
  </div>
</template>

<style scoped>
/* ===== 页面整体 ===== */
.task-logs-page {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ===== 页头 ===== */
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 12px;
}

.page-header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
  margin: 0;
}

.page-subtitle {
  font-size: 13px;
  color: var(--text-4);
}

.super-badge {
  font-size: 12px;
  font-weight: 600;
  border-radius: 8px;
}

/* ===== Tab 栏 ===== */
.tab-bar {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-3);
  font-size: 14px;
  font-weight: 500;
  background: var(--bg-surface-1);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.2s ease;
  user-select: none;
}

.tab-item:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-1);
}

.tab-item.active {
  background: rgba(22, 93, 255, 0.14);
  border-color: rgba(22, 93, 255, 0.3);
  color: #B2D4FF;
}

.tab-icon {
  font-size: 16px;
  display: flex;
  align-items: center;
}

/* ===== 卡片基础 ===== */
.card {
  background: var(--bg-surface-1);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
  padding: 20px;
}

/* ===== 筛选栏 ===== */
.filter-bar {
  padding: 16px 20px;
}

.filter-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

/* ===== 表格区 ===== */
.table-wrap {
  padding: 0;
  overflow: hidden;
}

/* 时间两行 */
.date-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-2);
  line-height: 1.4;
  white-space: nowrap;
}

.date-time {
  font-size: 11px;
  color: var(--text-4);
  white-space: nowrap;
}

/* 单行截断 */
.cell-ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}

.table-header {
  padding: 16px 20px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.table-total {
  font-size: 13px;
  color: var(--text-3);
}

.table-total strong {
  color: var(--text-1);
  font-weight: 700;
}

.log-table {
  width: 100%;
}

.log-table :deep(.arco-table-th) {
  background: rgba(255, 255, 255, 0.02) !important;
  font-size: 11px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
  padding: 10px 12px !important;
  white-space: nowrap;
}

.log-table :deep(.arco-table-tr) {
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s;
}

.log-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: #2a2d35 !important;
}

.log-table :deep(.arco-table-td) {
  border-bottom: none !important;
  font-size: 13px;
  color: var(--text-2);
  padding: 9px 12px !important;
  vertical-align: middle;
}

.log-table :deep(.arco-table-body)::-webkit-scrollbar {
  width: 0;
  height: 0;
}

.log-table :deep(.arco-scrollbar-track-direction-vertical),
.log-table :deep(.arco-scrollbar-track-direction-horizontal) {
  display: none !important;
}

/* ===== 用户单元格 ===== */
.user-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.user-avatar {
  background: var(--gradient-primary) !important;
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  flex-shrink: 0;
}

.user-info {
  min-width: 0;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.user-sub {
  font-size: 11px;
  color: var(--text-4);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== 提示词 ===== */
.prompt-text {
  color: var(--text-2);
  font-size: 12px;
  line-height: 1.5;
  cursor: default;
}

/* ===== nowrap 通用 ===== */
.nowrap {
  white-space: nowrap;
}

/* ===== 状态标签 ===== */
.status-cell {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 20px;
}

.status-cell::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-pending {
  color: #4080FF;
  background: rgba(64, 128, 255, 0.12);
}

.status-pending::before {
  background: #4080FF;
}

.status-processing {
  color: #FF7D00;
  background: rgba(255, 125, 0, 0.12);
}

.status-processing::before {
  background: #FF7D00;
  box-shadow: 0 0 0 3px rgba(255, 125, 0, 0.2);
  animation: pulse 1.2s ease-in-out infinite;
}

.status-completed,
.status-success {
  color: #00B42A;
  background: rgba(0, 180, 42, 0.10);
}

.status-completed::before,
.status-success::before {
  background: #00B42A;
}

.status-failed,
.status-error {
  color: #F53F3F;
  background: rgba(245, 63, 63, 0.10);
}

.status-failed::before,
.status-error::before {
  background: #F53F3F;
}

@keyframes pulse {

  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(255, 125, 0, 0.4);
  }

  50% {
    box-shadow: 0 0 0 4px rgba(255, 125, 0, 0);
  }
}

/* ===== 积分 ===== */
.points {
  font-weight: 700;
  color: #FF7D00;
  white-space: nowrap;
}

/* ===== Token 统计 ===== */
.token-detail {
  font-size: 12px;
  color: var(--text-4);
  white-space: nowrap;
}

/* ===== 类型标签 ===== */
.type-tag {
  font-size: 11px;
  border-radius: 6px;
  white-space: nowrap;
}

/* ===== 预览图 ===== */
.preview-img {
  border-radius: 6px;
  object-fit: cover;
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: block;
}

.no-result {
  color: var(--text-4);
  font-size: 13px;
}

/* ===== 链接按钮 ===== */
.link-btn {
  color: var(--primary-light, #4080FF);
  font-size: 12px;
  text-decoration: none;
}

.link-btn:hover {
  text-decoration: underline;
}

/* ===== 分页 ===== */
.pagination-wrap {
  padding: 16px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* ===== 详情弹窗 ===== */
.detail-modal :deep(.arco-modal-body) {
  padding: 0 !important;
  height: 76vh;
  overflow: hidden;
}

/* 左右布局容器 */
.detail-layout {
  display: flex;
  height: 100%;
}

/* 左侧：媒体预览 */
.detail-left {
  width: 50%;
  min-width: 50%;
  border-right: 1px solid rgba(255, 255, 255, 0.07);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 20px 16px;
  gap: 12px;
  background: rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.detail-media-img {
  width: 100%;
  max-height: 100%;
  border-radius: 10px;
  object-fit: contain;
}

.detail-media-img :deep(img) {
  width: 100%;
  height: auto;
  max-height: calc(76vh - 48px);
  object-fit: contain;
  border-radius: 10px;
}

.detail-media-video {
  width: 100%;
  border-radius: 10px;
  background: #000;
  max-height: calc(76vh - 48px);
}

.detail-no-media {
  color: var(--text-4);
  font-size: 13px;
  text-align: center;
}

/* 音乐左侧 */
.detail-music-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 100%;
}

.detail-music-cover {
  width: 180px;
  height: 180px;
  border-radius: 16px;
  object-fit: cover;
}

.detail-music-cover :deep(img) {
  width: 180px;
  height: 180px;
  object-fit: cover;
  border-radius: 16px;
}

.detail-music-cover-placeholder {
  width: 180px;
  height: 180px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
}

.detail-music-audio {
  width: 100%;
}

/* 3D左侧 */
.detail-3d-left {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  width: 100%;
}

/* 对话左侧统计 */
.detail-chat-stats {
  display: flex;
  flex-direction: column;
  gap: 20px;
  width: 100%;
  padding: 8px 4px;
}

.chat-stat-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-stat-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.chat-stat-value {
  font-size: 22px;
  font-weight: 700;
  color: var(--text-1);
}

/* 右侧：字段列表 */
.detail-right {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.10) transparent;
}

.detail-right::-webkit-scrollbar {
  width: 4px;
}

.detail-right::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.10);
  border-radius: 4px;
}

.dfield {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dfield.full {
  grid-column: 1 / -1;
}

.dlabel {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.dvalue {
  font-size: 13px;
  color: var(--text-1);
  word-break: break-all;
}

.dvalue.mono {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-3);
}

.detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px 16px;
  margin-bottom: 16px;
}

.detail-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-row.full {
  grid-column: 1 / -1;
}

.detail-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.detail-value {
  font-size: 13px;
  color: var(--text-1);
  word-break: break-all;
}

.detail-value.mono {
  font-family: monospace;
  font-size: 11px;
  color: var(--text-3);
}

.prompt-block {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow-y: auto;
}

.chat-content {
  max-height: 240px;
}

.error-block {
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.2);
  border-radius: 8px;
  padding: 8px 12px;
  font-size: 12px;
  color: #F53F3F;
  line-height: 1.6;
  white-space: pre-wrap;
}

/* ===== 预览区 ===== */
.detail-preview {
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  padding-top: 16px;
}

.detail-preview-label {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 10px;
}

.detail-img {
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  max-width: 100%;
}

.detail-video {
  width: 100%;
  max-height: 320px;
  border-radius: 10px;
  background: #000;
}

.audio-wrapper {
  display: flex;
  align-items: center;
  gap: 16px;
}

.audio-cover :deep(img) {
  border-radius: 8px;
}

.detail-audio {
  flex: 1;
  width: 100%;
}

.model3d-result {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  flex-wrap: wrap;
}

.download-link {
  display: inline-flex;
  align-items: center;
  padding: 8px 16px;
  background: rgba(22, 93, 255, 0.12);
  border: 1px solid rgba(22, 93, 255, 0.24);
  border-radius: 8px;
  color: #B2D4FF;
  text-decoration: none;
  font-size: 13px;
  font-weight: 600;
  transition: all 0.2s;
}

.download-link:hover {
  background: rgba(22, 93, 255, 0.2);
}
</style>
