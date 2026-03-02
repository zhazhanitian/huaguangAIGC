<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  IconUser,
  IconApps,
  IconSettings,
  IconArrowRise,
  IconArrowFall,
  IconRefresh,
  IconBook,
  IconRobot,
  IconGift,
  IconThunderbolt,
  IconCloud,
  IconImage,
  IconVideoCamera,
  IconMusic,
  IconCode,
} from '@arco-design/web-vue/es/icon'
import * as echarts from 'echarts/core'
import { LineChart, BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import {
  getDashboardStats,
  getUserGrowth,
  getRevenueStats,
  getModelUsage,
  getTokenTrend,
  type DashboardStats,
  type UserGrowthItem,
  type RevenueItem,
  type ModelUsageItem,
  type TokenTrendItem,
  type AigcModuleStat,
} from '../api/statistics'

echarts.use([LineChart, BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

const router = useRouter()
const loading = ref(true)
const lastUpdatedAt = ref('')
const autoRefresh = ref(true)
let timer: ReturnType<typeof setInterval> | null = null

const stats = ref<DashboardStats | null>(null)
const userGrowth = ref<UserGrowthItem[]>([])
const revenueData = ref<RevenueItem[]>([])
const modelUsage = ref<ModelUsageItem[]>([])
const tokenTrend = ref<TokenTrendItem[]>([])

const growthDays = ref(30)
const revenueDays = ref(30)
const tokenDays = ref(30)
const dayOptions = [
  { label: '7 天', value: 7 },
  { label: '14 天', value: 14 },
  { label: '30 天', value: 30 },
]

// --- Chart colors ---
const cText = '#86909C'
const cGrid = 'rgba(255,255,255,0.04)'
const cTipBg = 'rgba(42, 42, 43, 0.92)'
const cTipBd = 'rgba(255,255,255,0.08)'

// --- KPI ---
function delta(today: number, yesterday: number) {
  const diff = today - yesterday
  const pct = yesterday > 0 ? ((diff / yesterday) * 100) : (today > 0 ? 100 : 0)
  return { diff, pct: Math.round(pct), up: diff >= 0 }
}

const kpiCards = computed(() => {
  const s = stats.value
  if (!s) return []
  const regDelta = delta(s.todayRegistrations, s.yesterdayRegistrations)
  const convDelta = delta(s.todayConversations, s.yesterdayConversations)
  const revDelta = delta(s.todayRevenue, s.yesterdayRevenue)
  const aigcDelta = delta(s.aigc.todayTotal, s.aigc.yesterdayTotal)
  return [
    { label: '总用户', value: s.totalUsers, icon: IconUser, tone: 'indigo', sub: `今日 +${s.todayRegistrations}`, delta: regDelta },
    { label: '今日会话', value: s.todayConversations, icon: IconApps, tone: 'cyan', sub: `总 ${s.totalConversations.toLocaleString()}`, delta: convDelta },
    { label: '今日收入', value: s.todayRevenue, icon: IconArrowRise, tone: 'pink', sub: `总 ¥${s.totalRevenue.toLocaleString()}`, delta: revDelta, prefix: '¥' },
    { label: '付费订单', value: s.totalOrders, icon: IconGift, tone: 'amber', sub: null, delta: null },
    { label: '今日生成', value: s.aigc.todayTotal, icon: IconThunderbolt, tone: 'violet', sub: `昨日 ${s.aigc.yesterdayTotal}`, delta: aigcDelta },
    { label: '启用模型', value: s.activeModelsCount, icon: IconRobot, tone: 'emerald', sub: null, delta: null },
  ]
})

// --- AIGC Module Stats ---
const aigcModules = computed(() => {
  const a = stats.value?.aigc
  if (!a) return []
  const mk = (label: string, icon: any, tone: string, data: AigcModuleStat) => {
    const d = delta(data.today, data.yesterday)
    return { label, icon, tone, ...data, delta: d, successRatePct: data.successRate != null ? Math.round(data.successRate * 100) : null }
  }
  return [
    mk('绘画', IconImage, 'indigo', a.draw),
    mk('视频', IconVideoCamera, 'cyan', a.video),
    mk('音乐', IconMusic, 'pink', a.music),
    mk('3D', IconCode, 'violet', a.model3d),
  ]
})

// --- Charts ---
const growthChartEl = ref<HTMLDivElement | null>(null)
const revenueChartEl = ref<HTMLDivElement | null>(null)
const modelChartEl = ref<HTMLDivElement | null>(null)
const tokenChartEl = ref<HTMLDivElement | null>(null)
const growthChart = shallowRef<echarts.ECharts | null>(null)
const revenueChart = shallowRef<echarts.ECharts | null>(null)
const modelChart = shallowRef<echarts.ECharts | null>(null)
const tokenChart = shallowRef<echarts.ECharts | null>(null)

function initCharts() {
  const init = (el: HTMLDivElement | null) => el ? echarts.init(el, 'dark') : null
  growthChart.value?.dispose(); growthChart.value = init(growthChartEl.value)
  revenueChart.value?.dispose(); revenueChart.value = init(revenueChartEl.value)
  modelChart.value?.dispose(); modelChart.value = init(modelChartEl.value)
  tokenChart.value?.dispose(); tokenChart.value = init(tokenChartEl.value)
}

function updateGrowthChart() {
  const ch = growthChart.value; if (!ch || !userGrowth.value.length) { ch?.clear(); return }
  ch.setOption({
    tooltip: { trigger: 'axis', backgroundColor: cTipBg, borderColor: cTipBd, textStyle: { color: '#e2e8f0', fontSize: 12 } },
    grid: { left: 40, right: 16, top: 16, bottom: 24 },
    xAxis: { type: 'category', data: userGrowth.value.map(d => d.date.slice(5)), axisLabel: { color: cText, fontSize: 10 }, axisLine: { lineStyle: { color: cGrid } } },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: cGrid } }, axisLabel: { color: cText, fontSize: 10 } },
    series: [{ type: 'line', data: userGrowth.value.map(d => d.count), smooth: true, symbol: 'circle', symbolSize: 4, lineStyle: { width: 2.5, color: '#4080FF' },
      areaStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: 'rgba(64,128,255,0.25)' }, { offset: 1, color: 'rgba(64,128,255,0.02)' }]) }, itemStyle: { color: '#4080FF' } }],
  }, true)
}

function updateRevenueChart() {
  const ch = revenueChart.value; if (!ch || !revenueData.value.length) { ch?.clear(); return }
  ch.setOption({
    tooltip: { trigger: 'axis', backgroundColor: cTipBg, borderColor: cTipBd, textStyle: { color: '#e2e8f0', fontSize: 12 } },
    legend: { data: ['收入 (元)', '订单数'], top: 0, textStyle: { color: cText, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    grid: { left: 50, right: 40, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: revenueData.value.map(d => d.date.slice(5)), axisLabel: { color: cText, fontSize: 10 }, axisLine: { lineStyle: { color: cGrid } } },
    yAxis: [
      { type: 'value', splitLine: { lineStyle: { color: cGrid } }, axisLabel: { color: cText, fontSize: 10 } },
      { type: 'value', splitLine: { show: false }, axisLabel: { color: cText, fontSize: 10 }, minInterval: 1 },
    ],
    series: [
      { name: '收入 (元)', type: 'bar', data: revenueData.value.map(d => d.revenue), barMaxWidth: 18,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#F759AB' }, { offset: 1, color: 'rgba(247,89,171,0.3)' }]), borderRadius: [4, 4, 0, 0] } },
      { name: '订单数', type: 'line', yAxisIndex: 1, data: revenueData.value.map(d => d.count), smooth: true, symbol: 'none', lineStyle: { width: 2, color: '#FF7D00' }, itemStyle: { color: '#FF7D00' } },
    ],
  }, true)
}

function updateModelChart() {
  const ch = modelChart.value; if (!ch || !modelUsage.value.length) { ch?.clear(); return }
  const sorted = modelUsage.value.slice().sort((a, b) => a.count - b.count).slice(-10)
  const palette = ['#4080FF', '#165DFF', '#0E42D2', '#14C9C9', '#00B42A', '#FF7D00', '#F759AB', '#F53F3F', '#86909C', '#C9CDD4']
  ch.setOption({
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: cTipBg, borderColor: cTipBd, textStyle: { color: '#e2e8f0', fontSize: 12 },
      formatter: (params: any) => { const p = Array.isArray(params) ? params[0] : params; const item = sorted[p.dataIndex as number]; if (!item) return ''; return `<b>${item.modelName}</b><br/>调用 ${item.count.toLocaleString()} 次<br/>Token ${item.tokens.toLocaleString()}` } },
    grid: { left: 120, right: 24, top: 8, bottom: 16 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: cGrid } }, axisLabel: { color: cText, fontSize: 10 } },
    yAxis: { type: 'category', data: sorted.map(m => m.modelName), axisLabel: { color: cText, fontSize: 11, width: 110, overflow: 'truncate' }, axisLine: { lineStyle: { color: cGrid } } },
    series: [{ type: 'bar', data: sorted.map((m, i) => ({ value: m.count, itemStyle: { color: palette[i % palette.length], borderRadius: [0, 4, 4, 0] } })), barMaxWidth: 22 }],
  }, true)
}

function updateTokenChart() {
  const ch = tokenChart.value; if (!ch || !tokenTrend.value.length) { ch?.clear(); return }
  ch.setOption({
    tooltip: { trigger: 'axis', backgroundColor: cTipBg, borderColor: cTipBd, textStyle: { color: '#e2e8f0', fontSize: 12 } },
    legend: { data: ['输入 Token', '输出 Token'], top: 0, textStyle: { color: cText, fontSize: 11 }, itemWidth: 14, itemHeight: 8 },
    grid: { left: 56, right: 16, top: 32, bottom: 24 },
    xAxis: { type: 'category', data: tokenTrend.value.map(d => d.date.slice(5)), axisLabel: { color: cText, fontSize: 10 }, axisLine: { lineStyle: { color: cGrid } } },
    yAxis: { type: 'value', splitLine: { lineStyle: { color: cGrid } }, axisLabel: { color: cText, fontSize: 10, formatter: (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v) } },
    series: [
      { name: '输入 Token', type: 'bar', stack: 'tok', data: tokenTrend.value.map(d => d.promptTokens), barMaxWidth: 16,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#4080FF' }, { offset: 1, color: 'rgba(64,128,255,0.3)' }]), borderRadius: [0, 0, 0, 0] } },
      { name: '输出 Token', type: 'bar', stack: 'tok', data: tokenTrend.value.map(d => d.completionTokens), barMaxWidth: 16,
        itemStyle: { color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: '#14C9C9' }, { offset: 1, color: 'rgba(20,201,201,0.3)' }]), borderRadius: [4, 4, 0, 0] } },
    ],
  }, true)
}

function updateAllCharts() {
  updateGrowthChart(); updateRevenueChart(); updateModelChart(); updateTokenChart()
}

let resizeOb: ResizeObserver | null = null

// --- Shortcuts ---
const shortcuts = [
  { label: '用户管理', desc: '查看、封禁、权限调整', path: '/users', icon: IconUser, tone: 'primary' },
  { label: '模型管理', desc: '模型库与 Key 池配置', path: '/models', icon: IconRobot, tone: 'success' },
  { label: '系统配置', desc: '站点参数与开关策略', path: '/config', icon: IconSettings, tone: 'warning' },
  { label: '运维监控', desc: '队列、WS、任务趋势', path: '/ops', icon: IconCloud, tone: 'info' },
  { label: 'API 文档', desc: 'Swagger 在线接口', external: 'http://localhost:3000/api/docs', icon: IconBook, tone: 'secondary' },
]
function handleEntryClick(s: (typeof shortcuts)[number]) {
  if ('external' in s && s.external) { window.open(s.external as string, '_blank', 'noopener,noreferrer'); return }
  if ('path' in s && s.path) router.push(s.path)
}

// --- Fetch ---
async function fetchAll() {
  loading.value = true
  try {
    const [s, g, r, m, t] = await Promise.all([
      getDashboardStats(),
      getUserGrowth(growthDays.value),
      getRevenueStats(revenueDays.value),
      getModelUsage(),
      getTokenTrend(tokenDays.value),
    ])
    if (s && typeof s === 'object') stats.value = s as DashboardStats
    userGrowth.value = g ?? []
    revenueData.value = r ?? []
    modelUsage.value = m ?? []
    tokenTrend.value = t ?? []
    const now = new Date()
    lastUpdatedAt.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
  } catch { /* keep defaults */ } finally {
    loading.value = false
    await nextTick(); updateAllCharts()
  }
}

async function fetchSeries(type: 'growth' | 'revenue' | 'token') {
  try {
    if (type === 'growth') { userGrowth.value = await getUserGrowth(growthDays.value) ?? [] }
    else if (type === 'revenue') { revenueData.value = await getRevenueStats(revenueDays.value) ?? [] }
    else { tokenTrend.value = await getTokenTrend(tokenDays.value) ?? [] }
  } catch { /* */ }
  await nextTick()
  if (type === 'growth') updateGrowthChart()
  else if (type === 'revenue') updateRevenueChart()
  else updateTokenChart()
}

watch(growthDays, () => fetchSeries('growth'))
watch(revenueDays, () => fetchSeries('revenue'))
watch(tokenDays, () => fetchSeries('token'))

function ensureTimer() {
  if (timer) return
  timer = setInterval(() => {
    if (!autoRefresh.value || document.visibilityState === 'hidden') return
    fetchAll()
  }, 30_000)
}
function stopTimer() { if (timer) clearInterval(timer); timer = null }

onMounted(async () => {
  await fetchAll()
  await nextTick(); initCharts(); updateAllCharts()
  const el = document.querySelector('.dashboard') as HTMLElement | null
  if (el) {
    resizeOb = new ResizeObserver(() => {
      growthChart.value?.resize(); revenueChart.value?.resize()
      modelChart.value?.resize(); tokenChart.value?.resize()
    })
    resizeOb.observe(el)
  }
  ensureTimer()
})
onUnmounted(() => {
  stopTimer(); resizeOb?.disconnect()
  growthChart.value?.dispose(); revenueChart.value?.dispose()
  modelChart.value?.dispose(); tokenChart.value?.dispose()
})

function fmtNum(n: number) {
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}万`
  return n.toLocaleString()
}
</script>

<template>
  <div class="dashboard">
    <!-- Header -->
    <div class="dash-header glass-panel">
      <div class="dh-left">
        <div class="dh-icon"><IconThunderbolt /></div>
        <div>
          <div class="dh-title">数据概览</div>
          <div class="dh-sub">
            实时指标 · 日环比 · AIGC 生成统计
            <span v-if="lastUpdatedAt" class="dh-time">{{ lastUpdatedAt }}</span>
          </div>
        </div>
      </div>
      <div class="dh-right">
        <a-switch v-model="autoRefresh" size="small" />
        <span class="label-sm">自动 30s</span>
        <a-button type="primary" size="small" :loading="loading" @click="fetchAll">
          <template #icon><IconRefresh /></template>
          刷新
        </a-button>
      </div>
    </div>

    <!-- KPI Cards -->
    <div class="kpi-grid">
      <div v-for="card in kpiCards" :key="card.label" class="kpi glass-panel">
        <div class="kpi-top">
          <div class="kpi-badge" :class="'tone-' + card.tone"><component :is="card.icon" /></div>
          <div class="kpi-label">{{ card.label }}</div>
        </div>
        <div class="kpi-val">{{ card.prefix ?? '' }}{{ fmtNum(card.value) }}</div>
        <div class="kpi-bottom">
          <span v-if="card.sub" class="kpi-sub">{{ card.sub }}</span>
          <span v-if="card.delta" class="kpi-delta" :class="card.delta.up ? 'up' : 'down'">
            <IconArrowRise v-if="card.delta.up" class="delta-icon" />
            <IconArrowFall v-else class="delta-icon" />
            {{ card.delta.pct }}%
          </span>
        </div>
      </div>
    </div>

    <!-- AIGC Generation Cards -->
    <div class="aigc-section glass-panel">
      <div class="sec-head">
        <div class="sec-title"><IconThunderbolt /> AIGC 生成统计（今日）</div>
        <div class="sec-sub">各模块任务量、成功率、日环比</div>
      </div>
      <div class="aigc-grid">
        <div v-for="m in aigcModules" :key="m.label" class="aigc-card">
          <div class="aigc-top">
            <div class="aigc-badge" :class="'tone-' + m.tone"><component :is="m.icon" /></div>
            <div class="aigc-name">{{ m.label }}</div>
          </div>
          <div class="aigc-num">{{ m.today }}</div>
          <div class="aigc-row">
            <span class="aigc-tag ok">成功 {{ m.todayCompleted }}</span>
            <span v-if="m.todayFailed" class="aigc-tag fail">失败 {{ m.todayFailed }}</span>
          </div>
          <div class="aigc-row">
            <span v-if="m.successRatePct != null" class="aigc-rate" :class="{ warn: m.successRatePct < 80 }">
              成功率 {{ m.successRatePct }}%
            </span>
            <span class="kpi-delta" :class="m.delta.up ? 'up' : 'down'">
              <IconArrowRise v-if="m.delta.up" class="delta-icon" />
              <IconArrowFall v-else class="delta-icon" />
              {{ m.delta.pct }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Charts Row 1: Growth + Revenue -->
    <div class="chart-row">
      <div class="glass-panel chart-panel">
        <div class="cp-head">
          <div class="cp-title"><IconUser class="cp-icon" /> 用户增长</div>
          <a-radio-group v-model="growthDays" type="button" size="mini">
            <a-radio v-for="o in dayOptions" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
          </a-radio-group>
        </div>
        <div ref="growthChartEl" class="chart-box" />
      </div>
      <div class="glass-panel chart-panel">
        <div class="cp-head">
          <div class="cp-title"><IconArrowRise class="cp-icon" /> 收入趋势</div>
          <a-radio-group v-model="revenueDays" type="button" size="mini">
            <a-radio v-for="o in dayOptions" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
          </a-radio-group>
        </div>
        <div ref="revenueChartEl" class="chart-box" />
      </div>
    </div>

    <!-- Charts Row 2: Token + Model -->
    <div class="chart-row">
      <div class="glass-panel chart-panel">
        <div class="cp-head">
          <div class="cp-title"><IconCloud class="cp-icon" /> Token 消耗趋势</div>
          <a-radio-group v-model="tokenDays" type="button" size="mini">
            <a-radio v-for="o in dayOptions" :key="o.value" :value="o.value">{{ o.label }}</a-radio>
          </a-radio-group>
        </div>
        <div ref="tokenChartEl" class="chart-box" />
      </div>
      <div class="glass-panel chart-panel">
        <div class="cp-head">
          <div class="cp-title"><IconRobot class="cp-icon" /> 模型使用 Top 10</div>
          <div class="cp-sub">按调用次数排序</div>
        </div>
        <div ref="modelChartEl" class="chart-box chart-box-model" />
      </div>
    </div>

    <!-- Shortcuts -->
    <div class="glass-panel shortcut-section">
      <div class="cp-head"><div class="cp-title"><IconApps class="cp-icon" /> 快捷入口</div></div>
      <div class="entry-grid">
        <div v-for="(s, i) in shortcuts" :key="i" class="entry-card" role="button" tabindex="0" @click="handleEntryClick(s)">
          <div class="entry-icon" :class="'tone-' + s.tone"><component :is="s.icon" /></div>
          <div class="entry-info">
            <div class="entry-title">{{ s.label }}</div>
            <div class="entry-desc">{{ s.desc }}</div>
          </div>
          <div class="entry-go">→</div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.glass-panel {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: var(--radius-lg);
  backdrop-filter: blur(12px);
}

/* Header */
.dash-header { display: flex; align-items: center; justify-content: space-between; padding: 16px 20px; gap: 12px; flex-wrap: wrap; }
.dh-left { display: flex; align-items: center; gap: 14px; }
.dh-icon { width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; background: linear-gradient(135deg, rgba(22,93,255,0.24), rgba(64,128,255,0.18)); color: #B2D4FF; flex-shrink: 0; }
.dh-title { font-size: 18px; font-weight: 900; }
.dh-sub { color: var(--color-text-3); font-size: 12px; margin-top: 2px; }
.dh-time { margin-left: 8px; opacity: 0.7; }
.dh-right { display: flex; align-items: center; gap: 8px; }
.label-sm { font-size: 12px; color: var(--color-text-3); }

/* KPI */
.kpi-grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
.kpi { padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.kpi-top { display: flex; align-items: center; gap: 8px; }
.kpi-badge { width: 30px; height: 30px; border-radius: 9px; display: flex; align-items: center; justify-content: center; font-size: 15px; flex-shrink: 0; }
.kpi-label { font-size: 12px; font-weight: 700; color: var(--color-text-2); }
.kpi-val { font-size: 24px; font-weight: 900; font-variant-numeric: tabular-nums; line-height: 1; }
.kpi-bottom { display: flex; align-items: center; gap: 8px; min-height: 18px; }
.kpi-sub { font-size: 11px; color: var(--color-text-4); }
.kpi-delta { display: inline-flex; align-items: center; gap: 2px; font-size: 11px; font-weight: 700; border-radius: 6px; padding: 1px 6px; }
.kpi-delta.up { color: #00B42A; background: rgba(0,180,42,0.12); }
.kpi-delta.down { color: #F53F3F; background: rgba(245,63,63,0.12); }
.delta-icon { font-size: 12px; }

/* Tones */
.tone-indigo { background: rgba(22,93,255,0.16); color: #B2D4FF; }
.tone-emerald { background: rgba(0,180,42,0.16); color: #6EE7B7; }
.tone-cyan { background: rgba(20,201,201,0.16); color: #67E8F9; }
.tone-amber { background: rgba(255,125,0,0.16); color: #FBBF24; }
.tone-pink { background: rgba(247,89,171,0.14); color: #F9A8D4; }
.tone-violet { background: rgba(64,128,255,0.16); color: #C4B5FD; }
.tone-primary { background: rgba(22,93,255,0.12); color: #B2D4FF; }
.tone-success { background: rgba(0,180,42,0.12); color: #A7F3D0; }
.tone-warning { background: rgba(255,125,0,0.12); color: #FDE68A; }
.tone-info { background: rgba(20,201,201,0.12); color: #A5F3FC; }
.tone-secondary { background: rgba(64,128,255,0.12); color: #DDD6FE; }

/* AIGC Section */
.aigc-section { padding: 16px 18px; }
.sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.sec-title { font-weight: 900; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.sec-sub { font-size: 12px; color: var(--color-text-4); }
.aigc-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; }
.aigc-card { padding: 14px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); border-radius: 12px; display: flex; flex-direction: column; gap: 6px; }
.aigc-top { display: flex; align-items: center; gap: 8px; }
.aigc-badge { width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 14px; flex-shrink: 0; }
.aigc-name { font-size: 13px; font-weight: 700; color: var(--color-text-2); }
.aigc-num { font-size: 22px; font-weight: 900; font-variant-numeric: tabular-nums; }
.aigc-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.aigc-tag { font-size: 11px; padding: 1px 8px; border-radius: 6px; font-weight: 600; }
.aigc-tag.ok { color: #00B42A; background: rgba(0,180,42,0.12); }
.aigc-tag.fail { color: #F53F3F; background: rgba(245,63,63,0.12); }
.aigc-rate { font-size: 11px; color: var(--color-text-3); font-weight: 600; }
.aigc-rate.warn { color: #FF7D00; }

/* Charts */
.chart-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.chart-panel { padding: 16px 18px; position: relative; }
.cp-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; flex-wrap: wrap; }
.cp-title { font-weight: 900; font-size: 14px; display: flex; align-items: center; gap: 6px; }
.cp-icon { font-size: 16px; }
.cp-sub { font-size: 12px; color: var(--color-text-4); }
.chart-box { width: 100%; height: 240px; }
.chart-box-model { height: 280px; }

/* Shortcuts */
.shortcut-section { padding: 16px 18px; }
.entry-grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
.entry-card { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 16px 12px; border-radius: 12px; background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.05); cursor: pointer; transition: all 0.2s ease; user-select: none; text-align: center; }
.entry-card:hover { transform: translateY(-2px); border-color: rgba(22,93,255,0.18); background: rgba(22,93,255,0.06); }
.entry-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; }
.entry-info { min-width: 0; }
.entry-title { font-weight: 700; font-size: 13px; color: var(--color-text-1); }
.entry-desc { font-size: 11px; color: var(--color-text-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.entry-go { font-size: 12px; color: var(--color-text-3); opacity: 0; transition: opacity 0.2s; }
.entry-card:hover .entry-go { opacity: 1; }

/* Responsive */
@media (max-width: 1200px) {
  .kpi-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .chart-row { grid-template-columns: 1fr; }
  .aigc-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .entry-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
}
@media (max-width: 768px) {
  .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .aigc-grid { grid-template-columns: 1fr; }
  .entry-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .dash-header { flex-direction: column; align-items: flex-start; }
}
</style>
