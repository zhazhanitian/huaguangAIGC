<script setup lang="ts">
import { ref, reactive, watch, onMounted } from 'vue'
import { IconSearch, IconRefresh } from '@arco-design/web-vue/es/icon'
import {
  getCreditLogs,
  CREDIT_TYPE_LABELS,
  CREDIT_TYPE_COLORS,
  type CreditLog,
  type CreditLogListParams,
} from '../api/creditLog'

// ===== 积分类型下拉选项 =====
const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '套餐购买', value: 'recharge_payment' },
  { label: '卡密兑换', value: 'recharge_crami' },
  { label: '邀请奖励', value: 'recharge_invite' },
  { label: '签到奖励', value: 'recharge_signin' },
  { label: '管理员充值', value: 'recharge_admin' },
  { label: '绘图消费', value: 'consume_draw' },
  { label: '视频消费', value: 'consume_video' },
  { label: '音乐消费', value: 'consume_music' },
  { label: '3D消费', value: 'consume_model3d' },
  { label: '对话消费', value: 'consume_chat' },
  { label: '任务退款', value: 'refund_task' },
  { label: '积分修正-增加', value: 'correct_add' },
  { label: '积分修正-扣除', value: 'correct_deduct' },
]

// ===== 筛选条件 =====
const filter = reactive({
  phone: '',
  type: '',
  startDate: '',
  endDate: '',
  page: 1,
  pageSize: 20,
})

const dateRange = ref<string[]>([])
watch(dateRange, (val) => {
  filter.startDate = val?.[0] ?? ''
  filter.endDate = val?.[1] ?? ''
})

// ===== 列表数据 =====
const loading = ref(false)
const tableData = ref<CreditLog[]>([])
const total = ref(0)
const paginationConfig = reactive({ current: 1, pageSize: 20 })

const columns = [
  { title: '时间', dataIndex: 'createdAt', width: 170, slotName: 'createdAt' },
  { title: '用户', slotName: 'user', minWidth: 130 },
  { title: '类型', dataIndex: 'type', width: 140, slotName: 'type' },
  { title: '变动积分', dataIndex: 'amount', width: 110, slotName: 'amount' },
  { title: '变动前余额', dataIndex: 'balanceBefore', width: 110 },
  { title: '变动后余额', dataIndex: 'balanceAfter', width: 110 },
  { title: '关联单号', dataIndex: 'refId', width: 200, slotName: 'refId' },
  { title: '备注', dataIndex: 'remark', minWidth: 140, slotName: 'remark' },
]

async function fetchList() {
  loading.value = true
  try {
    const params: CreditLogListParams = {
      phone: filter.phone || undefined,
      type: filter.type || undefined,
      startDate: filter.startDate || undefined,
      endDate: filter.endDate || undefined,
      page: filter.page,
      pageSize: filter.pageSize,
    }
    const res = await getCreditLogs(params)
    tableData.value = res.list
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function handleSearch() {
  filter.page = 1
  paginationConfig.current = 1
  fetchList()
}

function handleReset() {
  filter.phone = ''
  filter.type = ''
  filter.startDate = ''
  filter.endDate = ''
  dateRange.value = []
  handleSearch()
}

function onPageChange(page: number) {
  filter.page = page
  paginationConfig.current = page
  fetchList()
}

function onPageSizeChange(size: number) {
  filter.pageSize = size
  paginationConfig.pageSize = size
  filter.page = 1
  paginationConfig.current = 1
  fetchList()
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-')
}

onMounted(fetchList)
</script>

<template>
  <div class="credit-logs">
    <!-- 筛选条件 -->
    <div class="filter-card glass-card">
      <div class="filter-row">
        <a-input
          v-model="filter.phone"
          placeholder="手机号"
          style="width: 180px"
          allow-clear
          @press-enter="handleSearch"
        >
          <template #prefix><IconSearch /></template>
        </a-input>

        <a-select
          v-model="filter.type"
          placeholder="积分类型"
          style="width: 160px"
          allow-clear
        >
          <a-option v-for="opt in typeOptions" :key="opt.value" :value="opt.value" :label="opt.label" />
        </a-select>

        <a-range-picker
          v-model="dateRange"
          style="width: 260px"
          :shortcuts="[
            { label: '今天', value: () => [new Date().toISOString().slice(0,10), new Date().toISOString().slice(0,10)] },
            { label: '最近7天', value: () => { const e = new Date(); const s = new Date(Date.now()-6*86400000); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)] }},
            { label: '最近30天', value: () => { const e = new Date(); const s = new Date(Date.now()-29*86400000); return [s.toISOString().slice(0,10), e.toISOString().slice(0,10)] }},
          ]"
        />

        <a-button type="primary" @click="handleSearch">
          <template #icon><IconSearch /></template>
          查询
        </a-button>
        <a-button @click="handleReset">
          <template #icon><IconRefresh /></template>
          重置
        </a-button>
      </div>
    </div>

    <!-- 数据表格 -->
    <div class="table-card glass-card">
      <a-table
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :pagination="false"
        row-key="id"
        class="credit-table"
        :scroll="{ x: 1200 }"
      >
        <template #createdAt="{ record }">
          <span class="date-text">{{ formatDate(record.createdAt) }}</span>
        </template>

        <template #user="{ record }">
          <div class="user-cell">
            <span class="user-name">{{ record.username ?? '-' }}</span>
            <span class="user-phone">{{ record.phone ?? '-' }}</span>
          </div>
        </template>

        <template #type="{ record }">
          <a-tag :color="CREDIT_TYPE_COLORS[record.type] ?? 'gray'" size="small">
            {{ CREDIT_TYPE_LABELS[record.type] ?? record.type }}
          </a-tag>
        </template>

        <template #amount="{ record }">
          <span :class="Number(record.amount) >= 0 ? 'amount-positive' : 'amount-negative'">
            {{ Number(record.amount) >= 0 ? '+' : '' }}{{ Number(record.amount).toFixed(0) }}
          </span>
        </template>

        <template #refId="{ record }">
          <a-tooltip v-if="record.refId" :content="record.refId">
            <span class="ref-id-text">{{ record.refId?.slice(0, 16) }}...</span>
          </a-tooltip>
          <span v-else class="text-muted">-</span>
        </template>

        <template #remark="{ record }">
          <a-tooltip v-if="record.remark" :content="record.remark">
            <span class="remark-text">{{ record.remark?.slice(0, 20) }}{{ (record.remark?.length ?? 0) > 20 ? '...' : '' }}</span>
          </a-tooltip>
          <span v-else class="text-muted">-</span>
        </template>
      </a-table>

      <div class="pagination-wrap">
        <a-pagination
          v-model:current="paginationConfig.current"
          v-model:page-size="paginationConfig.pageSize"
          :total="total"
          :page-size-options="[20, 50, 100]"
          show-total
          show-page-size
          @change="onPageChange"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.credit-logs {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.filter-card {
  padding: var(--sp-5) var(--sp-6);
}

.filter-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  flex-wrap: wrap;
}

.table-card {
  padding: var(--sp-6);
  overflow: hidden;
}

.credit-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: rgba(22, 93, 255, 0.06) !important;
}

.date-text {
  font-size: 13px;
  color: var(--text-2);
}

.user-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 500;
  color: var(--text-1);
  font-size: 13px;
}

.user-phone {
  font-size: 12px;
  color: var(--text-3);
}

.amount-positive {
  color: var(--color-success-6);
  font-weight: 600;
  font-size: 14px;
}

.amount-negative {
  color: var(--color-danger-6);
  font-weight: 600;
  font-size: 14px;
}

.ref-id-text {
  font-family: monospace;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}

.remark-text {
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}

.text-muted {
  color: var(--text-3);
}

.pagination-wrap {
  margin-top: var(--sp-4);
  display: flex;
  justify-content: flex-end;
}
</style>
