<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import {
  IconRefresh,
  IconBug,
  IconCloud,
  IconClockCircle,
  IconWifi,
  IconStorage,
  IconArrowRise,
  IconCode,
  IconFilter,
  IconCheck,
  IconClose,
  IconThunderbolt,
  IconExclamationCircle,
} from '@arco-design/web-vue/es/icon'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import { getOpsStats, type OpsStatsResponse, type OpsStatsParams, type OpsTaskSummaryRow } from '../api/ops'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const loading = ref(false)
const autoRefresh = ref(true)
const refreshSec = ref(10)
let timer: ReturnType<typeof setInterval> | null = null

const stats = ref<OpsStatsResponse | null>(null)
const lastUpdatedAt = ref('')

// --- Filters ---
const windowMin = ref(15)
const windowOptions = [
  { label: '5 分钟', value: 5 },
  { label: '15 分钟', value: 15 },
  { label: '30 分钟', value: 30 },
  { label: '60 分钟', value: 60 },
]
const filterModule = ref<string>('')
const filterProvider = ref<string>('')
const filterTaskType = ref<string>('')

const moduleOptions = computed(() => stats.value?.filterOptions?.modules ?? [])
const providerOptions = computed(() => stats.value?.filterOptions?.providers ?? [])
const taskTypeOptions = computed(() => stats.value?.filterOptions?.taskTypes ?? [])
const hasActiveFilter = computed(() => !!(filterModule.value || filterProvider.value || filterTaskType.value))

function clearFilters() {
  filterModule.value = ''
  filterProvider.value = ''
  filterTaskType.value = ''
}

// --- Charts ---
const trendChartEl = ref<HTMLDivElement | null>(null)
const trendChart = shallowRef<echarts.ECharts | null>(null)

function initChart() {
  if (!trendChartEl.value) return
  if (trendChart.value) {
    trendChart.value.dispose()
  }
  trendChart.value = echarts.init(trendChartEl.value, 'dark')
}

function updateChart() {
  const chart = trendChart.value
  const ts = stats.value?.timeSeries
  if (!chart || !ts || ts.length === 0) {
    chart?.clear()
    return
  }

  const xData = ts.map((s) => {
    const d = new Date(s.ts)
    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
  })

  chart.setOption({
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(42, 42, 43, 0.92)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#e2e8f0', fontSize: 12 },
    },
    legend: {
      data: ['队列积压', '处理中', 'WS 在线', '任务进行中', '堆内存(MB)'],
      top: 0,
      textStyle: { color: '#86909C', fontSize: 11 },
      itemWidth: 16,
      itemHeight: 8,
    },
    grid: { left: 46, right: 16, top: 36, bottom: 24, containLabel: false },
    xAxis: {
      type: 'category',
      data: xData,
      axisLabel: { color: '#6B7785', fontSize: 10 },
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      axisLabel: { color: '#6B7785', fontSize: 10 },
    },
    series: [
      {
        name: '队列积压',
        type: 'line',
        data: ts.map((s) => s.queueBacklog),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        areaStyle: { opacity: 0.08 },
        itemStyle: { color: '#FF7D00' },
      },
      {
        name: '处理中',
        type: 'line',
        data: ts.map((s) => s.queueActive),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        itemStyle: { color: '#00B42A' },
      },
      {
        name: 'WS 在线',
        type: 'line',
        data: ts.map((s) => s.wsClients),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        itemStyle: { color: '#14C9C9' },
      },
      {
        name: '任务进行中',
        type: 'line',
        data: ts.map((s) => s.inflightTasks),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 2 },
        itemStyle: { color: '#4080FF' },
      },
      {
        name: '堆内存(MB)',
        type: 'line',
        data: ts.map((s) => s.heapUsedMB),
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1, type: 'dashed' },
        itemStyle: { color: '#F759AB' },
      },
    ],
  }, true)
}

// Resize handling
let resizeOb: ResizeObserver | null = null

// --- Formatters ---
function fmtMs(v: number | null) {
  if (v == null) return '-'
  if (v < 1000) return `${v}ms`
  if (v < 60_000) return `${(v / 1000).toFixed(1)}s`
  return `${(v / 60_000).toFixed(1)}m`
}

function fmtPct(p: number) {
  return `${(p * 100).toFixed(1)}%`
}

function fmtBytes(n: number) {
  const v = Math.max(0, n || 0)
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let x = v
  while (x >= 1024 && i < units.length - 1) {
    x /= 1024
    i += 1
  }
  return `${x.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function fmtUptime(sec: number) {
  if (sec < 60) return `${sec}s`
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  return `${h}h ${m}m`
}

function fmtTime(iso: string) {
  const d = new Date(iso)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`
}

const moduleLabel: Record<string, string> = { draw: '绘画', video: '视频', music: '音乐', model3d: '3D' }

// --- Computed rows ---
const queueRows = computed(() => {
  const q = stats.value?.queues
  if (!q) return []
  return [
    { key: 'draw', label: '绘画', ...q.draw },
    { key: 'video', label: '视频', ...q.video },
    { key: 'music', label: '音乐', ...q.music },
    { key: 'model3d', label: '3D', ...q.model3d },
  ].map((r) => ({ ...r, backlog: (r.waiting || 0) + (r.delayed || 0) }))
})

const totalBacklog = computed(() => queueRows.value.reduce((a, r) => a + r.backlog, 0))
const totalActive = computed(() => queueRows.value.reduce((a, r) => a + (r.active || 0), 0))
const totalInflight = computed(() => (stats.value?.inflightAll ?? []).reduce((a, r) => a + r.count, 0))

const taskRows = computed(() => {
  const list: (OpsTaskSummaryRow & { diagnosis: string; diagLevel: 'ok' | 'warn' | 'error' })[] = []
  for (const x of stats.value?.taskSummary ?? []) {
    const diags: string[] = []
    let level: 'ok' | 'warn' | 'error' = 'ok'
    if (x.p95.queueMs != null && x.p95.queueMs >= 30_000) { diags.push('排队拥堵'); level = 'warn' }
    if (x.p95.procMs != null && x.p95.procMs >= 120_000) { diags.push('处理缓慢'); level = 'warn' }
    if (x.done >= 5 && x.failRate >= 0.3) { diags.push('高失败率'); level = 'error' }
    else if (x.done >= 5 && x.failRate >= 0.15) { diags.push('失败率偏高'); level = 'warn' }
    list.push({ ...x, diagnosis: diags.join('、') || '正常', diagLevel: level })
  }
  return list.sort((a, b) => {
    const pri = { error: 3, warn: 2, ok: 1 }
    return (pri[b.diagLevel] - pri[a.diagLevel]) || (b.inflight - a.inflight) || (b.done - a.done)
  })
})

const recentFailures = computed(() => stats.value?.recentFailures ?? [])

const globalDiagnosis = computed(() => {
  const items: { text: string; level: 'ok' | 'warn' | 'error' }[] = []
  if (totalBacklog.value > 20) items.push({ text: `队列积压 ${totalBacklog.value} 任务，考虑扩容 Worker`, level: 'error' })
  else if (totalBacklog.value > 5) items.push({ text: `队列积压 ${totalBacklog.value} 任务，关注趋势`, level: 'warn' })
  const highFail = taskRows.value.filter((r) => r.diagLevel === 'error')
  if (highFail.length) items.push({ text: `${highFail.length} 个维度失败率异常`, level: 'error' })
  const slow = taskRows.value.filter((r) => r.p95.procMs != null && r.p95.procMs >= 120_000)
  if (slow.length) items.push({ text: `${slow.length} 个维度处理缓慢（p95 > 2min）`, level: 'warn' })
  const ws = stats.value?.ws
  if (ws && ws.connectedClients === 0) items.push({ text: 'WS 无在线客户端', level: 'warn' })
  if (recentFailures.value.length > 0) {
    items.push({ text: `最近 ${recentFailures.value.length} 条失败记录`, level: recentFailures.value.length >= 10 ? 'error' : 'warn' })
  }
  if (!items.length) items.push({ text: '系统运行正常', level: 'ok' })
  return items
})

// --- Fetch ---
async function fetchOps() {
  loading.value = true
  try {
    const params: OpsStatsParams = { windowMin: windowMin.value }
    if (filterModule.value) params.module = filterModule.value
    if (filterProvider.value) params.provider = filterProvider.value
    if (filterTaskType.value) params.taskType = filterTaskType.value
    stats.value = await getOpsStats(params)
    const now = new Date()
    lastUpdatedAt.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
    await nextTick()
    updateChart()
  } catch {
    Message.error('拉取运维数据失败')
    stats.value = null
  } finally {
    loading.value = false
  }
}

function ensureTimer() {
  if (timer) return
  timer = setInterval(() => {
    if (!autoRefresh.value) return
    if (document.visibilityState === 'hidden') return
    fetchOps()
  }, Math.max(5, refreshSec.value) * 1000)
}

function stopTimer() {
  if (timer) clearInterval(timer)
  timer = null
}

watch([windowMin, filterModule, filterProvider, filterTaskType], () => { fetchOps() })

onMounted(async () => {
  await fetchOps()
  await nextTick()
  initChart()
  updateChart()
  if (trendChartEl.value) {
    resizeOb = new ResizeObserver(() => { trendChart.value?.resize() })
    resizeOb.observe(trendChartEl.value)
  }
  ensureTimer()
})

onUnmounted(() => {
  stopTimer()
  resizeOb?.disconnect()
  trendChart.value?.dispose()
})

function openMetrics() {
  window.open('/api/ops/metrics', '_blank', 'noopener,noreferrer')
}
</script>

<template>
  <div class="ops-root">
    <!-- ===== Header ===== -->
    <div class="ops-header glass-panel">
      <div class="oh-left">
        <div class="oh-icon"><IconThunderbolt /></div>
        <div>
          <div class="oh-title">运维监控</div>
          <div class="oh-sub">
            滑动窗口 · 实时趋势 · 可筛选
            <span v-if="lastUpdatedAt" class="oh-time">最后更新 {{ lastUpdatedAt }}</span>
          </div>
        </div>
      </div>
      <div class="oh-right">
        <a-space :size="8" align="center" wrap>
          <a-switch v-model="autoRefresh" size="small" />
          <span class="label-sm">自动 {{ refreshSec }}s</span>
          <a-divider direction="vertical" :margin="4" />
          <a-button size="small" type="text" @click="openMetrics">
            <template #icon><IconCode /></template>
            Prometheus
          </a-button>
          <a-button type="primary" size="small" :loading="loading" @click="fetchOps">
            <template #icon><IconRefresh /></template>
            刷新
          </a-button>
        </a-space>
      </div>
    </div>

    <!-- ===== Diagnosis Banner ===== -->
    <div class="diag-banner glass-panel" :class="'diag-' + globalDiagnosis[0]?.level">
      <div v-for="(d, i) in globalDiagnosis" :key="i" class="diag-item">
        <IconCheck v-if="d.level === 'ok'" class="diag-icon ok" />
        <IconClockCircle v-else-if="d.level === 'warn'" class="diag-icon warn" />
        <IconClose v-else class="diag-icon error" />
        <span>{{ d.text }}</span>
      </div>
    </div>

    <!-- ===== Filter Bar ===== -->
    <div class="filter-bar glass-panel">
      <div class="fb-label"><IconFilter /> 筛选</div>
      <div class="fb-group">
        <div class="fb-field">
          <span class="fb-field-label">时间窗口</span>
          <a-radio-group v-model="windowMin" type="button" size="small">
            <a-radio v-for="opt in windowOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</a-radio>
          </a-radio-group>
        </div>
        <div class="fb-field">
          <span class="fb-field-label">模块</span>
          <a-select v-model="filterModule" placeholder="全部" allow-clear size="small" style="width: 120px">
            <a-option v-for="m in moduleOptions" :key="m" :value="m">{{ moduleLabel[m] || m }}</a-option>
          </a-select>
        </div>
        <div class="fb-field">
          <span class="fb-field-label">服务商</span>
          <a-select v-model="filterProvider" placeholder="全部" allow-clear size="small" style="width: 140px">
            <a-option v-for="p in providerOptions" :key="p" :value="p">{{ p }}</a-option>
          </a-select>
        </div>
        <div class="fb-field">
          <span class="fb-field-label">任务类型</span>
          <a-select v-model="filterTaskType" placeholder="全部" allow-clear size="small" style="width: 140px">
            <a-option v-for="t in taskTypeOptions" :key="t" :value="t">{{ t }}</a-option>
          </a-select>
        </div>
        <a-button v-if="hasActiveFilter" size="small" type="text" status="warning" @click="clearFilters">
          清除筛选
        </a-button>
      </div>
    </div>

    <!-- ===== Metric Cards ===== -->
    <div class="metric-grid">
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-orange"><IconStorage /></div>
          <div class="mc-label">队列积压</div>
        </div>
        <div class="mc-val">{{ totalBacklog }}</div>
        <div class="mc-hint">waiting + delayed</div>
      </div>
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-green"><IconArrowRise /></div>
          <div class="mc-label">正在处理</div>
        </div>
        <div class="mc-val">{{ totalActive }}</div>
        <div class="mc-hint">active jobs</div>
      </div>
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-purple"><IconThunderbolt /></div>
          <div class="mc-label">任务进行中</div>
        </div>
        <div class="mc-val">{{ totalInflight }}</div>
        <div class="mc-hint">created 但未结束</div>
      </div>
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-cyan"><IconWifi /></div>
          <div class="mc-label">WS 在线</div>
        </div>
        <div class="mc-val">{{ stats?.ws?.connectedClients ?? 0 }}</div>
        <div class="mc-hint">rooms {{ stats?.ws?.rooms ?? '-' }}</div>
      </div>
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-pink"><IconBug /></div>
          <div class="mc-label">堆内存</div>
        </div>
        <div class="mc-val">{{ fmtBytes(stats?.memory?.heapUsed ?? 0) }}</div>
        <div class="mc-hint">RSS {{ fmtBytes(stats?.memory?.rss ?? 0) }}</div>
      </div>
      <div class="mc glass-panel">
        <div class="mc-top">
          <div class="mc-badge tone-blue"><IconClockCircle /></div>
          <div class="mc-label">运行时间</div>
        </div>
        <div class="mc-val">{{ fmtUptime(stats?.uptimeSec ?? 0) }}</div>
        <div class="mc-hint">PID {{ stats?.pid ?? '-' }}</div>
      </div>
    </div>

    <!-- ===== Trend Chart ===== -->
    <div class="glass-panel section">
      <div class="sec-head">
        <div class="sec-title"><IconArrowRise /> 实时趋势</div>
        <div class="sec-sub">每 30 秒采样，展示最近 {{ windowMin }} 分钟</div>
      </div>
      <div ref="trendChartEl" class="trend-chart" />
      <div v-if="!stats?.timeSeries?.length" class="chart-empty">
        等待采样数据（服务启动后约 30 秒开始）
      </div>
    </div>

    <!-- ===== Two-Column: Queue + WS ===== -->
    <div class="dual-row">
      <div class="glass-panel section">
        <div class="sec-head">
          <div class="sec-title"><IconCloud /> 队列状态</div>
        </div>
        <a-table :data="queueRows" :pagination="false" size="small" class="mono-tbl">
          <a-table-column title="模块" data-index="label" :width="72" />
          <a-table-column title="积压">
            <template #cell="{ record }">
              <span :class="{ 'val-warn': record.backlog > 5, 'val-error': record.backlog > 20 }">
                {{ record.backlog }}
              </span>
            </template>
          </a-table-column>
          <a-table-column title="waiting" data-index="waiting" />
          <a-table-column title="delayed" data-index="delayed" />
          <a-table-column title="active" data-index="active" />
          <a-table-column title="completed" data-index="completed" />
          <a-table-column title="failed">
            <template #cell="{ record }">
              <span :class="{ 'val-error': record.failed > 0 }">{{ record.failed }}</span>
            </template>
          </a-table-column>
        </a-table>
      </div>

      <div class="glass-panel section">
        <div class="sec-head">
          <div class="sec-title"><IconWifi /> WS 推送统计</div>
          <div class="sec-sub">进程累计</div>
        </div>
        <div class="stat-grid">
          <div class="stat-cell">
            <div class="stat-num">{{ stats?.ws?.emit?.total ?? 0 }}</div>
            <div class="stat-label">推送总数</div>
          </div>
          <div class="stat-cell">
            <div class="stat-num">{{ stats?.ws?.emit?.dropped ?? 0 }}</div>
            <div class="stat-label">去重丢弃</div>
          </div>
          <div class="stat-cell">
            <div class="stat-num">{{ stats?.ws?.emit?.debounced ?? 0 }}</div>
            <div class="stat-label">节流合并</div>
          </div>
          <div class="stat-cell">
            <div class="stat-num">{{ stats?.ws?.connectedClients ?? 0 }}</div>
            <div class="stat-label">在线客户端</div>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== Task Metrics Table ===== -->
    <div class="glass-panel section">
      <div class="sec-head">
        <div class="sec-title">
          <IconThunderbolt /> 任务成功率与耗时
          <a-tag size="small" color="arcoblue" style="margin-left: 8px">最近 {{ windowMin }} 分钟</a-tag>
          <a-tag v-if="hasActiveFilter" size="small" color="orangered">已筛选</a-tag>
        </div>
        <div class="sec-sub">p50/p95 精确百分位</div>
      </div>

      <div v-if="!taskRows.length" class="empty-hint">当前窗口/筛选条件下无任务完成记录</div>

      <a-table
        v-else
        :data="taskRows"
        :pagination="taskRows.length > 15 ? { pageSize: 15 } : false"
        size="small"
        class="mono-tbl task-tbl"
        :scroll="{ x: 1100 }"
      >
        <a-table-column title="模块" :width="72">
          <template #cell="{ record }">
            <a-tag size="small">{{ moduleLabel[record.module] || record.module }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="服务商" data-index="provider" :width="110" ellipsis />
        <a-table-column title="类型" data-index="taskType" :width="100" ellipsis />
        <a-table-column title="进行中" :width="72">
          <template #cell="{ record }">
            <span :class="{ 'val-active': record.inflight > 0 }">{{ record.inflight }}</span>
          </template>
        </a-table-column>
        <a-table-column title="完成" data-index="done" :width="64" />
        <a-table-column title="失败" :width="64">
          <template #cell="{ record }">
            <span :class="{ 'val-error': record.failed > 0 }">{{ record.failed }}</span>
          </template>
        </a-table-column>
        <a-table-column title="失败率" :width="80">
          <template #cell="{ record }">
            <a-tag :color="record.failRate >= 0.3 ? 'red' : record.failRate >= 0.15 ? 'orangered' : record.failRate >= 0.08 ? 'orange' : 'green'" size="small">
              {{ fmtPct(record.failRate) }}
            </a-tag>
          </template>
        </a-table-column>
        <a-table-column title="p50 排队" :width="84">
          <template #cell="{ record }">{{ fmtMs(record.p50.queueMs) }}</template>
        </a-table-column>
        <a-table-column title="p50 处理" :width="84">
          <template #cell="{ record }">{{ fmtMs(record.p50.procMs) }}</template>
        </a-table-column>
        <a-table-column title="p95 排队" :width="84">
          <template #cell="{ record }">
            <span :class="{ 'val-warn': record.p95.queueMs != null && record.p95.queueMs >= 30000 }">
              {{ fmtMs(record.p95.queueMs) }}
            </span>
          </template>
        </a-table-column>
        <a-table-column title="p95 处理" :width="84">
          <template #cell="{ record }">
            <span :class="{ 'val-warn': record.p95.procMs != null && record.p95.procMs >= 120000 }">
              {{ fmtMs(record.p95.procMs) }}
            </span>
          </template>
        </a-table-column>
        <a-table-column title="avg 总耗时" :width="90">
          <template #cell="{ record }">{{ fmtMs(record.avg.totalMs) }}</template>
        </a-table-column>
        <a-table-column title="诊断" :width="130">
          <template #cell="{ record }">
            <a-tag :color="record.diagLevel === 'ok' ? 'green' : record.diagLevel === 'warn' ? 'orange' : 'red'" size="small">
              {{ record.diagnosis }}
            </a-tag>
          </template>
        </a-table-column>
      </a-table>

      <div class="sec-tip">
        排队慢 → 检查 backlog/active、扩 Worker 或排查 Redis；处理慢 → 检查上游服务商响应；失败率高 → 看下方失败明细定位。
      </div>
    </div>

    <!-- ===== Recent Failures ===== -->
    <div class="glass-panel section">
      <div class="sec-head">
        <div class="sec-title">
          <IconExclamationCircle /> 最近失败任务
          <a-tag v-if="recentFailures.length" size="small" color="red">{{ recentFailures.length }}</a-tag>
        </div>
        <div class="sec-sub">最近 20 条，可按上方筛选联动</div>
      </div>

      <div v-if="!recentFailures.length" class="empty-hint empty-ok">
        <IconCheck class="empty-ok-icon" /> 当前无失败记录
      </div>

      <a-table
        v-else
        :data="recentFailures"
        :pagination="recentFailures.length > 10 ? { pageSize: 10 } : false"
        size="small"
        class="mono-tbl fail-tbl"
      >
        <a-table-column title="时间" :width="80">
          <template #cell="{ record }">{{ fmtTime(record.endedAt) }}</template>
        </a-table-column>
        <a-table-column title="模块" :width="64">
          <template #cell="{ record }">
            <a-tag size="small">{{ moduleLabel[record.module] || record.module }}</a-tag>
          </template>
        </a-table-column>
        <a-table-column title="服务商" data-index="provider" :width="110" ellipsis />
        <a-table-column title="类型" data-index="taskType" :width="100" ellipsis />
        <a-table-column title="耗时" :width="80">
          <template #cell="{ record }">{{ fmtMs(record.totalMs) }}</template>
        </a-table-column>
        <a-table-column title="TaskID" data-index="taskId" :width="120" ellipsis />
        <a-table-column title="错误信息">
          <template #cell="{ record }">
            <span class="err-msg">{{ record.errorMessage || '（无详细信息）' }}</span>
          </template>
        </a-table-column>
      </a-table>
    </div>
  </div>
</template>

<style scoped>
.ops-root {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
  width: 100%;
}

.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(12px);
}

/* ===== Header ===== */
.ops-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  gap: 12px;
  flex-wrap: wrap;
}
.oh-left { display: flex; align-items: center; gap: 14px; }
.oh-icon {
  width: 40px; height: 40px; border-radius: 12px;
  display: flex; align-items: center; justify-content: center;
  font-size: 20px;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.24), rgba(20, 201, 201, 0.18));
  color: #B2D4FF; flex-shrink: 0;
}
.oh-title { font-size: 18px; font-weight: 900; }
.oh-sub { color: var(--color-text-3); font-size: 12px; margin-top: 2px; }
.oh-time { margin-left: 8px; opacity: 0.7; }
.oh-right { display: flex; align-items: center; }
.label-sm { font-size: 12px; color: var(--color-text-3); }

/* ===== Diagnosis Banner ===== */
.diag-banner {
  padding: 12px 20px;
  display: flex; flex-wrap: wrap; gap: 16px; align-items: center;
  transition: border-color 0.3s;
}
.diag-banner.diag-error { border-color: rgba(245, 63, 63, 0.3); }
.diag-banner.diag-warn { border-color: rgba(255, 125, 0, 0.3); }
.diag-banner.diag-ok { border-color: rgba(0, 180, 42, 0.2); }
.diag-item { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; }
.diag-icon { font-size: 16px; }
.diag-icon.ok { color: #00B42A; }
.diag-icon.warn { color: #FF7D00; }
.diag-icon.error { color: #F53F3F; }

/* ===== Filter Bar ===== */
.filter-bar { padding: 12px 20px; display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
.fb-label {
  display: flex; align-items: center; gap: 6px;
  font-weight: 800; font-size: 13px; color: var(--color-text-2); flex-shrink: 0;
}
.fb-group { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
.fb-field { display: flex; align-items: center; gap: 6px; }
.fb-field-label { font-size: 12px; color: var(--color-text-3); white-space: nowrap; }

/* ===== Metric Cards ===== */
.metric-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.mc { padding: 14px 16px; display: flex; flex-direction: column; gap: 4px; }
.mc-top { display: flex; align-items: center; gap: 8px; }
.mc-badge {
  width: 28px; height: 28px; border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  font-size: 14px; flex-shrink: 0;
}
.tone-orange { background: rgba(255, 125, 0, 0.16); color: #FBBF24; }
.tone-green { background: rgba(0, 180, 42, 0.16); color: #6EE7B7; }
.tone-purple { background: rgba(64, 128, 255, 0.16); color: #C4B5FD; }
.tone-cyan { background: rgba(20, 201, 201, 0.16); color: #67E8F9; }
.tone-pink { background: rgba(247, 89, 171, 0.14); color: #F9A8D4; }
.tone-blue { background: rgba(22, 93, 255, 0.16); color: #B2D4FF; }
.mc-label { font-size: 12px; font-weight: 700; color: var(--color-text-2); }
.mc-val { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1.1; }
.mc-hint { font-size: 11px; color: var(--color-text-4); }

/* ===== Chart ===== */
.trend-chart { width: 100%; height: 260px; }
.chart-empty {
  position: absolute;
  inset: 0;
  display: flex; align-items: center; justify-content: center;
  color: var(--color-text-4); font-size: 13px;
  pointer-events: none;
}
.section { position: relative; }

/* ===== Sections ===== */
.dual-row { display: grid; grid-template-columns: 1.3fr 0.7fr; gap: 12px; }
.section { padding: 16px 18px; }
.sec-head {
  display: flex; align-items: baseline; justify-content: space-between;
  gap: 10px; margin-bottom: 12px; flex-wrap: wrap;
}
.sec-title { font-weight: 900; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.sec-sub { font-size: 12px; color: var(--color-text-4); }
.sec-tip {
  margin-top: 12px; font-size: 12px; color: var(--color-text-4);
  line-height: 1.6; padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02); border-radius: 8px;
  border-left: 3px solid rgba(22, 93, 255, 0.3);
}

/* ===== Stats Grid ===== */
.stat-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
.stat-cell {
  text-align: center; padding: 12px 8px;
  background: rgba(255, 255, 255, 0.02); border-radius: 10px;
}
.stat-num { font-size: 20px; font-weight: 900; font-variant-numeric: tabular-nums; }
.stat-label { font-size: 11px; color: var(--color-text-3); margin-top: 2px; }

/* ===== Table ===== */
.mono-tbl :deep(.arco-table-th),
.mono-tbl :deep(.arco-table-td) {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
}
.empty-hint { text-align: center; color: var(--color-text-4); padding: 32px 0; font-size: 13px; }
.empty-ok { display: flex; align-items: center; justify-content: center; gap: 8px; }
.empty-ok-icon { color: #00B42A; font-size: 18px; }

/* ===== Failure table ===== */
.err-msg {
  color: #f87171;
  font-size: 12px;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* ===== Value highlights ===== */
.val-warn { color: #FF7D00; font-weight: 700; }
.val-error { color: #F53F3F; font-weight: 700; }
.val-active { color: #4080FF; font-weight: 700; }

/* ===== Responsive ===== */
@media (max-width: 1200px) {
  .metric-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .dual-row { grid-template-columns: 1fr; }
}
@media (max-width: 768px) {
  .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ops-header { flex-direction: column; align-items: flex-start; }
  .filter-bar { flex-direction: column; align-items: flex-start; }
}
</style>
