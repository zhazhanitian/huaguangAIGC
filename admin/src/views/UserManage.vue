<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import {
  IconSearch,
  IconEdit,
  IconMessageBanned,
  IconDelete,
  IconPlus,
  IconUser,
  IconRefresh,
} from '@arco-design/web-vue/es/icon'
import {
  getUsers,
  createUser,
  updateUser,
  setUserStatus,
  deleteUser,
  type User,
  type UserListParams,
  type UpdateUserData,
  type CreateUserData,
} from '../api/user'

const loading = ref(false)
const tableData = ref<User[]>([])
const total = ref(0)
const searchKeyword = ref('')
const roleFilter = ref<string | undefined>()
const statusFilter = ref<string | number | undefined>()
const dateRange = ref<string[]>([])
const pagination = reactive({ page: 1, pageSize: 10 })
const formRef = ref<FormInstance>()
const addFormRef = ref<FormInstance>()
const editDialogVisible = ref(false)
const addDialogVisible = ref(false)

interface EditFormState {
  id?: string
  username?: string
  role?: 'user' | 'admin' | 'super'
  status?: 'active' | 'banned'
  balance?: number
}
const editForm = ref<EditFormState>({})
const editLoading = ref(false)

interface AddFormState {
  email: string
  username: string
  password: string
  role: 'user' | 'admin' | 'super'
  status: 'active' | 'banned'
  balance: number
}
const addForm = reactive<AddFormState>({
  email: '',
  username: '',
  password: '',
  role: 'user',
  status: 'active',
  balance: 0,
})
const addLoading = ref(false)

const columns = [
  {
    title: '用户',
    slotName: 'user',
    minWidth: 220,
  },
  {
    title: '角色',
    dataIndex: 'role',
    width: 120,
    slotName: 'role',
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 120,
    slotName: 'status',
  },
  {
    title: '余额',
    dataIndex: 'balance',
    width: 120,
    slotName: 'balance',
  },
  {
    title: '操作',
    slotName: 'action',
    width: 140,
    fixed: 'right' as const,
  },
]

const paginationConfig = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
})

const fetchList = async () => {
  loading.value = true
  try {
    const params: UserListParams = {
      page: pagination.page,
      pageSize: pagination.pageSize,
      keyword: searchKeyword.value || undefined,
      role: (roleFilter.value as any) || undefined,
      status: (statusFilter.value as any) || undefined,
      startDate: dateRange.value?.[0] || undefined,
      endDate: dateRange.value?.[1] || undefined,
    }
    const res = await getUsers(params)
    tableData.value = res.list ?? (Array.isArray(res) ? res : [])
    total.value = res.total ?? (Array.isArray(res) ? res.length : 0)
    paginationConfig.total = total.value
    paginationConfig.current = pagination.page
    paginationConfig.pageSize = pagination.pageSize
  } catch {
    tableData.value = []
    total.value = 0
    paginationConfig.total = 0
  } finally {
    loading.value = false
  }
}

watch([() => pagination.page, () => pagination.pageSize], fetchList)
onMounted(fetchList)

function handleSearch() {
  pagination.page = 1
  paginationConfig.current = 1
  fetchList()
}

function handleResetFilters() {
  searchKeyword.value = ''
  roleFilter.value = undefined
  statusFilter.value = undefined
  dateRange.value = []
  handleSearch()
}

// 过滤条件变化时自动刷新
watch([roleFilter, statusFilter, dateRange], () => {
  pagination.page = 1
  paginationConfig.current = 1
  fetchList()
})

function openEdit(row: User) {
  editForm.value = {
    id: row.id,
    username: row.username,
    role: row.role,
    status: row.status === 'active' ? 'active' : 'banned',
    balance: Number((row as any).balance ?? 0),
  }
  editDialogVisible.value = true
}

const editRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  balance: [{ type: 'number', min: 0, message: '余额不能小于 0', trigger: 'blur' }],
}

const addRules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码（至少 6 位）', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

function openAdd() {
  addForm.email = ''
  addForm.username = ''
  addForm.password = ''
  addForm.role = 'user'
  addForm.status = 'active'
  addForm.balance = 0
  addDialogVisible.value = true
}

async function submitAdd() {
  const errors = await addFormRef.value?.validate()
  if (errors) return
  addLoading.value = true
  try {
    const payload: CreateUserData = {
      email: addForm.email.trim(),
      username: addForm.username.trim(),
      password: addForm.password,
      role: addForm.role,
      status: addForm.status,
      balance: Number(addForm.balance ?? 0),
    }
    await createUser(payload)
    Message.success('创建成功')
    addDialogVisible.value = false
    pagination.page = 1
    paginationConfig.current = 1
    fetchList()
  } finally {
    addLoading.value = false
  }
}

async function submitEdit() {
  const errors = await formRef.value?.validate()
  if (errors) return
  if (!editForm.value.id) return
  editLoading.value = true
  try {
    const { id, username, role, status, balance } = editForm.value
    const data: UpdateUserData = {
      username,
      role,
      status,
      balance: balance == null ? undefined : Number(balance),
    }
    await updateUser(id!, data)
    Message.success('更新成功')
    editDialogVisible.value = false
    fetchList()
  } finally {
    editLoading.value = false
  }
}

async function handleStatusChange(row: User) {
  const isActiveUser = row.status === 'active'
  const newStatus = isActiveUser ? 'banned' : 'active'
  const action = isActiveUser ? '封禁' : '启用'
  Modal.confirm({
    title: '提示',
    content: `确定要${action}用户 "${row.username}" 吗？`,
    okText: '确定',
    cancelText: '取消',
    onOk: async () => {
      await setUserStatus(row.id, newStatus)
      Message.success(`${action}成功`)
      fetchList()
    },
  })
}

async function handleDelete(row: User) {
  Modal.confirm({
    title: '删除确认',
    content: `确定要删除用户 "${row.username}" 吗？此操作不可恢复。`,
    okText: '确定',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    onOk: async () => {
      await deleteUser(row.id)
      Message.success('删除成功')
      fetchList()
    },
  })
}

function isActive(row: User) {
  return row.status === 'active'
}

function roleText(role: string) {
  const map: Record<string, string> = {
    admin: '管理员',
    super: '超级管理员',
    user: '普通用户',
  }
  return map[role] ?? role
}

function roleColor(role: string) {
  if (role === 'admin') return 'purple'
  if (role === 'super') return 'arcoblue'
  return 'gray'
}

function onPageChange(page: number) {
  pagination.page = page
  paginationConfig.current = page
  fetchList()
}

function onPageSizeChange(size: number) {
  pagination.pageSize = size
  pagination.page = 1
  paginationConfig.pageSize = size
  paginationConfig.current = 1
  fetchList()
}
</script>

<template>
  <div class="user-manage">
    <!-- Header -->
    <div class="glow-card header-card">
      <div class="header-left">
        <div class="header-icon">
          <IconUser />
        </div>
        <div>
          <h2 class="header-title">用户管理</h2>
          <p class="header-subtitle">管理系统用户、角色权限与账户状态</p>
        </div>
      </div>
      <div class="header-right">
        <a-button type="primary" class="add-btn" @click="openAdd">
          <template #icon><IconPlus /></template>
          添加用户
        </a-button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="glow-card toolbar-card">
      <div class="toolbar">
        <a-input
          v-model="searchKeyword"
          placeholder="搜索用户名/邮箱"
          allow-clear
          class="search-input"
          @press-enter="handleSearch"
        >
          <template #prefix>
            <IconSearch />
          </template>
        </a-input>
        <a-select
          v-model="roleFilter"
          placeholder="角色筛选"
          allow-clear
          style="width: 140px"
        >
          <a-option label="超级管理员" value="super" />
          <a-option label="管理员" value="admin" />
          <a-option label="普通用户" value="user" />
        </a-select>
        <a-select
          v-model="statusFilter"
          placeholder="状态筛选"
          allow-clear
          style="width: 120px"
        >
          <a-option label="正常" value="active" />
          <a-option label="已封禁" value="banned" />
        </a-select>
        <a-range-picker
          v-model="dateRange"
          style="width: 240px"
          format="YYYY-MM-DD"
          value-format="YYYY-MM-DD"
        />
        <a-button type="primary" @click="handleSearch">
          <template #icon><IconSearch /></template>
          搜索
        </a-button>
        <a-button @click="handleResetFilters">
          <template #icon><IconRefresh /></template>
          重置
        </a-button>
      </div>
    </div>

    <!-- Table -->
    <div class="glow-card table-card">
      <a-table
        :columns="columns"
        :data="tableData"
        :loading="loading"
        :pagination="false"
        row-key="id"
        class="data-table"
      >
        <template #user="{ record }">
          <div class="user-cell">
            <a-avatar :size="40" class="user-avatar">
              {{ record.username?.charAt(0) ?? '?' }}
            </a-avatar>
            <div class="user-info">
              <span class="user-name">{{ record.username }}</span>
              <span class="user-email">{{ record.email ?? '-' }}</span>
            </div>
          </div>
        </template>
        <template #role="{ record }">
          <a-tag :color="roleColor(record.role)" size="small">
            {{ roleText(record.role) }}
          </a-tag>
        </template>
        <template #status="{ record }">
          <div class="status-cell">
            <span class="status-dot" :class="{ active: isActive(record) }" />
            <span>{{ isActive(record) ? '正常' : '已封禁' }}</span>
          </div>
        </template>
        <template #balance="{ record }">
          <span class="balance-cell">
            <span class="coin-icon">¥</span>
            {{ record.balance ?? 0 }}
          </span>
        </template>
        <template #action="{ record }">
          <a-tooltip content="编辑">
            <a-button type="text" size="small" class="action-btn" @click="openEdit(record)">
              <template #icon><IconEdit /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip :content="isActive(record) ? '封禁' : '启用'">
            <a-button
              type="text"
              size="small"
              :status="isActive(record) ? 'warning' : 'success'"
              class="action-btn"
              @click="handleStatusChange(record)"
            >
              <template #icon><IconMessageBanned /></template>
            </a-button>
          </a-tooltip>
          <a-tooltip content="删除">
            <a-button type="text" status="danger" size="small" class="action-btn" @click="handleDelete(record)">
              <template #icon><IconDelete /></template>
            </a-button>
          </a-tooltip>
        </template>
      </a-table>

      <div class="pagination-wrap">
        <a-pagination
          v-model:current="paginationConfig.current"
          v-model:page-size="paginationConfig.pageSize"
          :total="paginationConfig.total"
          :page-size-options="[10, 20, 50]"
          show-total
          show-page-size
          @change="onPageChange"
          @page-size-change="onPageSizeChange"
        />
      </div>
    </div>

    <!-- Edit Modal -->
    <a-modal
      v-model:visible="editDialogVisible"
      title="编辑用户"
      width="480px"
      unmount-on-close
      class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }"
      @close="formRef?.clearValidate()"
    >
      <a-form
        ref="formRef"
        :model="editForm"
        :rules="editRules"
        layout="horizontal"
        :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }"
      >
        <a-form-item label="用户名" field="username">
          <a-input v-model="editForm.username" />
        </a-form-item>
        <a-form-item label="角色" field="role">
          <a-select v-model="editForm.role" placeholder="请选择" allow-clear>
            <a-option label="超级管理员" value="super" />
            <a-option label="管理员" value="admin" />
            <a-option label="普通用户" value="user" />
          </a-select>
        </a-form-item>
        <a-form-item label="状态" field="status">
          <a-radio-group v-model="editForm.status">
            <a-radio value="active">正常</a-radio>
            <a-radio value="banned">已封禁</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="余额" field="balance">
          <a-input-number v-model="editForm.balance" :min="0" :precision="2" style="width: 200px" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="editDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="editLoading" @click="submitEdit">
          保存
        </a-button>
      </template>
    </a-modal>

    <!-- Add Modal -->
    <a-modal
      v-model:visible="addDialogVisible"
      title="添加用户"
      width="520px"
      unmount-on-close
      class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }"
      @close="addFormRef?.clearValidate()"
    >
      <a-form
        ref="addFormRef"
        :model="addForm"
        :rules="addRules"
        layout="horizontal"
        :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }"
      >
        <a-form-item label="邮箱" field="email">
          <a-input v-model="addForm.email" placeholder="用于登录/找回密码" />
        </a-form-item>
        <a-form-item label="用户名" field="username">
          <a-input v-model="addForm.username" placeholder="展示名称" />
        </a-form-item>
        <a-form-item label="密码" field="password">
          <a-input-password v-model="addForm.password" placeholder="至少 6 位" />
        </a-form-item>
        <a-form-item label="角色" field="role">
          <a-select v-model="addForm.role" placeholder="请选择">
            <a-option label="普通用户" value="user" />
            <a-option label="管理员" value="admin" />
            <a-option label="超级管理员" value="super" />
          </a-select>
        </a-form-item>
        <a-form-item label="状态" field="status">
          <a-radio-group v-model="addForm.status">
            <a-radio value="active">正常</a-radio>
            <a-radio value="banned">已封禁</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="初始余额" field="balance">
          <a-input-number v-model="addForm.balance" :min="0" :precision="2" style="width: 200px" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="addDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="addLoading" @click="submitAdd">创建</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.user-manage {
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

.add-btn {
  background: var(--gradient-primary) !important;
  border: none;
}

/* Toolbar */
.toolbar-card {
  padding: var(--sp-4);
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp-4);
}

.search-input {
  width: 260px;
}

/* Table */
.table-card {
  padding: var(--sp-6);
  overflow: hidden;
}

.data-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: rgba(22, 93, 255, 0.06) !important;
}

.user-cell {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
}

.user-avatar {
  background: var(--gradient-primary);
  color: #fff;
  flex-shrink: 0;
}

.user-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.user-name {
  font-weight: 500;
  color: var(--text-1);
}

.user-email {
  font-size: 12px;
  color: var(--text-4);
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

.balance-cell {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.coin-icon {
  color: var(--accent-amber);
  font-size: 14px;
}

.action-btn {
  margin: 0 2px;
}

.pagination-wrap {
  margin-top: var(--sp-4);
  display: flex;
  justify-content: flex-end;
  padding: var(--sp-4) 0 0;
}

/* Modal */
.edit-modal :deep(.arco-modal) {
  background: var(--bg-surface-2);
  border: 1px solid var(--glass-border);
}

/* Responsive */
@media (max-width: 768px) {
  .header-card {
    flex-direction: column;
    align-items: flex-start;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .search-input {
    width: 100%;
  }
}
</style>
