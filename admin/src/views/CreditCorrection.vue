<script setup lang="ts">
import { ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { IconSearch } from '@arco-design/web-vue/es/icon'
import {
  getUserCreditInfo,
  correctCreditLog,
  CREDIT_TYPE_LABELS,
  CREDIT_TYPE_COLORS,
  type CreditLog,
  type UserInfoResult,
} from '../api/creditLog'

// ===== 查询用户 =====
const searchPhone = ref('')
const searchLoading = ref(false)
const userInfo = ref<UserInfoResult | null>(null)
const recentLogs = ref<CreditLog[]>([])

async function handleSearch() {
  if (!searchPhone.value.trim()) {
    Message.warning('请输入手机号')
    return
  }
  searchLoading.value = true
  userInfo.value = null
  recentLogs.value = []
  try {
    const res = await getUserCreditInfo(searchPhone.value.trim())
    userInfo.value = res
    recentLogs.value = (res.recentLogs ?? []) as CreditLog[]
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e?.message || '用户不存在或查询失败')
  } finally {
    searchLoading.value = false
  }
}

// ===== 修正表单 =====
const formRef = ref<FormInstance>()
const submitLoading = ref(false)
const form = ref({
  action: 'deduct' as 'add' | 'deduct',
  amount: undefined as number | undefined,
  remark: '',
})

const formRules = {
  amount: [{ required: true, message: '请输入积分数量' }],
  remark: [{ required: true, message: '备注不能为空' }],
}

async function handleSubmit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  if (!userInfo.value) return
  if (!form.value.amount || form.value.amount <= 0) {
    Message.error('积分数量必须大于 0')
    return
  }

  const actionLabel = form.value.action === 'add' ? '增加' : '扣除'
  const confirmMsg = `确认对用户【${userInfo.value.username}（${userInfo.value.phone}）】执行积分${actionLabel} ${form.value.amount} 操作？\n\n备注：${form.value.remark}`

  Modal.confirm({
    title: '积分修正确认',
    content: confirmMsg,
    onOk: async () => {
      submitLoading.value = true
      try {
        const res = await correctCreditLog({
          userId: userInfo.value!.userId,
          action: form.value.action,
          amount: form.value.amount!,
          remark: form.value.remark,
        })
        Message.success(`操作成功，当前余额：${res.balance}`)
        userInfo.value = res
        recentLogs.value = (res.recentLogs ?? []) as CreditLog[]
        form.value.amount = undefined
        form.value.remark = ''
        formRef.value?.clearValidate()
      } catch (e: any) {
        Message.error(e?.response?.data?.message || e?.message || '操作失败')
      } finally {
        submitLoading.value = false
      }
    },
  })
}

const recentColumns = [
  { title: '时间', dataIndex: 'createdAt', width: 160, slotName: 'createdAt' },
  { title: '类型', dataIndex: 'type', width: 130, slotName: 'type' },
  { title: '变动', dataIndex: 'amount', width: 90, slotName: 'amount' },
  { title: '操作后余额', dataIndex: 'balanceAfter', width: 110 },
  { title: '备注', dataIndex: 'remark', slotName: 'remark' },
]

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).replace(/\//g, '-')
}
</script>

<template>
  <div class="credit-correction">
    <!-- 搜索用户 -->
    <div class="search-card glass-card">
      <div class="search-title">查询学员</div>
      <div class="search-row">
        <a-input
          v-model="searchPhone"
          placeholder="请输入学员手机号"
          style="width: 260px"
          allow-clear
          @press-enter="handleSearch"
        >
          <template #prefix><IconSearch /></template>
        </a-input>
        <a-button type="primary" :loading="searchLoading" @click="handleSearch">
          查询
        </a-button>
      </div>
    </div>

    <!-- 用户信息 + 修正表单 -->
    <template v-if="userInfo">
      <div class="content-row">
        <!-- 用户信息 -->
        <div class="user-info-card glass-card">
          <div class="section-title">学员信息</div>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">姓名</span>
              <span class="info-value">{{ userInfo.username }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">手机号</span>
              <span class="info-value">{{ userInfo.phone }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">当前积分</span>
              <span class="info-value balance-value">{{ userInfo.balance }}</span>
            </div>
          </div>

          <!-- 修正表单 -->
          <div class="section-title" style="margin-top: 20px">积分修正</div>
          <a-form
            ref="formRef"
            :model="form"
            :rules="formRules"
            layout="vertical"
          >
            <a-form-item label="操作类型" field="action">
              <a-radio-group v-model="form.action" type="button">
                <a-radio value="deduct">
                  <span style="color: var(--color-danger-6)">扣除积分</span>
                </a-radio>
                <a-radio value="add">
                  <span style="color: var(--color-success-6)">增加积分</span>
                </a-radio>
              </a-radio-group>
            </a-form-item>

            <a-form-item label="积分数量" field="amount">
              <a-input-number
                v-model="form.amount"
                :min="1"
                :precision="0"
                placeholder="请输入正整数"
                style="width: 200px"
              />
            </a-form-item>

            <a-form-item label="备注（必填，说明修正原因）" field="remark">
              <a-textarea
                v-model="form.remark"
                placeholder="例如：因系统 Bug 多退积分，现扣回；数量：XX"
                :auto-size="{ minRows: 3, maxRows: 6 }"
                style="width: 100%"
              />
            </a-form-item>

            <a-form-item>
              <a-button
                type="primary"
                :status="form.action === 'deduct' ? 'danger' : 'success'"
                :loading="submitLoading"
                @click="handleSubmit"
              >
                {{ form.action === 'deduct' ? '确认扣除' : '确认增加' }}
              </a-button>
            </a-form-item>
          </a-form>
        </div>

        <!-- 最近流水 -->
        <div class="recent-logs-card glass-card">
          <div class="section-title">最近流水记录</div>
          <a-table
            :columns="recentColumns"
            :data="recentLogs"
            :pagination="false"
            row-key="id"
            size="small"
            class="recent-table"
          >
            <template #createdAt="{ record }">
              <span class="date-text">{{ formatDate(record.createdAt) }}</span>
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

            <template #remark="{ record }">
              <a-tooltip v-if="record.remark" :content="record.remark">
                <span class="remark-text">{{ record.remark?.slice(0, 20) }}{{ (record.remark?.length ?? 0) > 20 ? '...' : '' }}</span>
              </a-tooltip>
              <span v-else class="text-muted">-</span>
            </template>
          </a-table>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.credit-correction {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.search-card,
.user-info-card,
.recent-logs-card {
  padding: var(--sp-5) var(--sp-6);
}

.search-title,
.section-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  margin-bottom: var(--sp-4);
}

.search-row {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.content-row {
  display: grid;
  grid-template-columns: 380px 1fr;
  gap: var(--sp-6);
  align-items: start;
}

.info-grid {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
}

.info-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.info-label {
  width: 72px;
  color: var(--text-3);
  font-size: 13px;
  flex-shrink: 0;
}

.info-value {
  color: var(--text-1);
  font-size: 14px;
}

.balance-value {
  color: var(--color-success-6);
  font-weight: 700;
  font-size: 18px;
}

.date-text {
  font-size: 12px;
  color: var(--text-2);
}

.amount-positive {
  color: var(--color-success-6);
  font-weight: 600;
}

.amount-negative {
  color: var(--color-danger-6);
  font-weight: 600;
}

.remark-text {
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
}

.text-muted {
  color: var(--text-3);
}

.recent-table :deep(.arco-table-td) {
  padding: 8px 12px !important;
}

@media (max-width: 900px) {
  .content-row {
    grid-template-columns: 1fr;
  }
}
</style>
