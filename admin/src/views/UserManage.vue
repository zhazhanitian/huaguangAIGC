<script setup lang="ts">
import { ref, reactive, onMounted, watch, computed } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import {
  IconSearch,
  IconEdit,
  IconLock,
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
  resetUserPassword,
  type User,
  type UserListParams,
  type UpdateUserData,
  type CreateUserData,
  type ResetUserPasswordData,
} from '../api/user'
import {
  getColleges,
  getGrades,
  getMajors,
  getClasses,
  type College,
  type Grade,
  type Major,
  type Clazz,
} from '../api/academic'
import { useUserStore } from '../stores/user'

const userStore = useUserStore()
/** 当前登录是否为超级管理员（超级管理员可管理所有用户，普通管理员只能管理普通用户与管理员） */
const isSuperAdmin = computed(() => userStore.userInfo?.role === 'super')

const loading = ref(false)
const tableData = ref<User[]>([])
const total = ref(0)
const searchKeyword = ref('')
const roleFilter = ref<string | undefined>()
const statusFilter = ref<string | number | undefined>()
const collegeId = ref<string | undefined>()
const gradeId = ref<string | undefined>()
const majorId = ref<string | undefined>()
const classId = ref<string | undefined>()
const pagination = reactive({ page: 1, pageSize: 10 })
const formRef = ref<FormInstance>()
const addFormRef = ref<FormInstance>()
const editDialogVisible = ref(false)
const addDialogVisible = ref(false)
const resetDialogVisible = ref(false)

interface EditFormState {
  id?: string
  username?: string
  phone?: string
  email?: string
  role?: 'user' | 'admin' | 'super'
  status?: 'active' | 'banned'
  balance?: number
  collegeId?: string | null
  gradeId?: string | null
  majorId?: string | null
  classId?: string | null
}
const editForm = ref<EditFormState>({})
const editLoading = ref(false)

interface AddFormState {
  phone: string
  email: string
  username: string
  password: string
  role: 'user' | 'admin' | 'super'
  status: 'active' | 'banned'
  balance: number
  collegeId?: string
  gradeId?: string
  majorId?: string
  classId?: string
}
const addForm = reactive<AddFormState>({
  phone: '',
  email: '',
  username: '',
  password: '',
  role: 'user',
  status: 'active',
  balance: 0,
  collegeId: undefined,
  gradeId: undefined,
  majorId: undefined,
  classId: undefined,
})

const collegeOptionsForForm = ref<College[]>([])
const gradeOptionsForForm = ref<Grade[]>([])
const majorOptionsForForm = ref<Major[]>([])
const classOptionsForForm = ref<Clazz[]>([])
const filterCollegeList = ref<College[]>([])
const filterGradeList = ref<Grade[]>([])
const filterMajorList = ref<Major[]>([])
const filterClassList = ref<Clazz[]>([])
const addLoading = ref(false)

interface ResetPasswordFormState {
  id?: string
  password: string
  confirmPassword: string
}

const resetFormRef = ref<FormInstance>()
const resetForm = ref<ResetPasswordFormState>({
  id: undefined,
  password: '',
  confirmPassword: '',
})
const resetLoading = ref(false)

const columns = [
  {
    title: '用户',
    slotName: 'user',
    minWidth: 220,
  },
  {
    title: '学院/学级/专业/班级',
    slotName: 'academic',
    minWidth: 260,
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
    width: 200,
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
      startDate: undefined,
      endDate: undefined,
      collegeId: collegeId.value || undefined,
      gradeId: gradeId.value || undefined,
      majorId: majorId.value || undefined,
      classId: classId.value || undefined,
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
onMounted(async () => {
  filterCollegeList.value = await getColleges()
  fetchList()
})

async function onFilterCollegeChange() {
  gradeId.value = undefined
  majorId.value = undefined
  classId.value = undefined
  if (!collegeId.value) {
    filterGradeList.value = []
    filterMajorList.value = []
    filterClassList.value = []
    return
  }
  filterGradeList.value = await getGrades({ collegeId: collegeId.value })
  filterMajorList.value = []
  filterClassList.value = []
}

async function onFilterGradeChange() {
  majorId.value = undefined
  classId.value = undefined
  if (!collegeId.value || !gradeId.value) {
    filterMajorList.value = []
    filterClassList.value = []
    return
  }
  filterMajorList.value = await getMajors({
    collegeId: collegeId.value,
    gradeId: gradeId.value,
  })
  filterClassList.value = []
}

async function onFilterMajorChange() {
  classId.value = undefined
  if (!collegeId.value || !gradeId.value || !majorId.value) {
    filterClassList.value = []
    return
  }
  filterClassList.value = await getClasses({
    collegeId: collegeId.value,
    gradeId: gradeId.value,
    majorId: majorId.value,
  })
}

function handleSearch() {
  pagination.page = 1
  paginationConfig.current = 1
  fetchList()
}

function handleResetFilters() {
  searchKeyword.value = ''
  roleFilter.value = undefined
  statusFilter.value = undefined
  collegeId.value = undefined
  gradeId.value = undefined
  majorId.value = undefined
  classId.value = undefined
  filterGradeList.value = []
  filterMajorList.value = []
  filterClassList.value = []
  handleSearch()
}

// 过滤条件变化时自动刷新
watch([roleFilter, statusFilter, collegeId, gradeId, majorId, classId], () => {
  pagination.page = 1
  paginationConfig.current = 1
  fetchList()
})

async function openEdit(row: User) {
  editForm.value = {
    id: row.id,
    username: row.username,
    phone: row.phone,
    email: row.email,
    role: row.role,
    status: row.status === 'active' ? 'active' : 'banned',
    balance: Number((row as any).balance ?? 0),
    collegeId: row.collegeId ?? undefined,
    gradeId: row.gradeId ?? undefined,
    majorId: row.majorId ?? undefined,
    classId: row.classId ?? undefined,
  }
  editDialogVisible.value = true
  collegeOptionsForForm.value = await getColleges()
  if (editForm.value.collegeId) {
    gradeOptionsForForm.value = await getGrades({ collegeId: editForm.value.collegeId })
  } else {
    gradeOptionsForForm.value = []
  }
  if (editForm.value.collegeId && editForm.value.gradeId) {
    majorOptionsForForm.value = await getMajors({
      collegeId: editForm.value.collegeId,
      gradeId: editForm.value.gradeId,
    })
  } else {
    majorOptionsForForm.value = []
  }
  if (editForm.value.collegeId && editForm.value.gradeId && editForm.value.majorId) {
    classOptionsForForm.value = await getClasses({
      collegeId: editForm.value.collegeId,
      gradeId: editForm.value.gradeId,
      majorId: editForm.value.majorId,
    })
  } else {
    classOptionsForForm.value = []
  }
}

const editRules = {
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  email: [{ type: 'email', message: '邮箱格式不正确', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  balance: [{ type: 'number', min: 0, message: '余额不能小于 0', trigger: 'blur' }],
}

const addRules = {
  phone: [
    { required: true, message: '请输入手机号', trigger: 'blur' },
    { min: 5, max: 20, message: '手机号格式不正确', trigger: 'blur' },
  ],
  email: [
    { type: 'email', message: '邮箱格式不正确', trigger: 'blur' },
  ],
  username: [{ required: true, message: '请输入用户名', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码（至少 6 位）', trigger: 'blur' }],
  role: [{ required: true, message: '请选择角色', trigger: 'change' }],
  status: [{ required: true, message: '请选择状态', trigger: 'change' }],
}

const resetRules = {
  password: [
    { required: true, message: '请输入新密码', trigger: 'blur' },
    { min: 6, message: '密码至少 6 位', trigger: 'blur' },
  ],
  confirmPassword: [
    { required: true, message: '请再次输入新密码', trigger: 'blur' },
    {
      validator: (value: string, cb: (error?: string) => void) => {
        if (!value) {
          cb()
          return
        }
        if (value !== resetForm.value.password) {
          cb('两次输入的密码不一致')
        } else {
          cb()
        }
      },
      trigger: 'blur',
    },
  ],
}

async function openAdd() {
  addForm.phone = ''
  addForm.email = ''
  addForm.username = ''
  addForm.password = ''
  addForm.role = 'user'
  addForm.status = 'active'
  addForm.balance = 0
  addForm.collegeId = undefined
  addForm.gradeId = undefined
  addForm.majorId = undefined
  addForm.classId = undefined
  collegeOptionsForForm.value = await getColleges()
  gradeOptionsForForm.value = []
  majorOptionsForForm.value = []
  classOptionsForForm.value = []
  addDialogVisible.value = true
}

async function onAddFormCollegeChange() {
  addForm.gradeId = undefined
  addForm.majorId = undefined
  addForm.classId = undefined
  if (!addForm.collegeId) {
    gradeOptionsForForm.value = []
    majorOptionsForForm.value = []
    classOptionsForForm.value = []
    return
  }
  gradeOptionsForForm.value = await getGrades({ collegeId: addForm.collegeId })
  majorOptionsForForm.value = []
  classOptionsForForm.value = []
}

async function onAddFormGradeChange() {
  addForm.majorId = undefined
  addForm.classId = undefined
  if (!addForm.collegeId || !addForm.gradeId) {
    majorOptionsForForm.value = []
    classOptionsForForm.value = []
    return
  }
  majorOptionsForForm.value = await getMajors({
    collegeId: addForm.collegeId,
    gradeId: addForm.gradeId,
  })
  classOptionsForForm.value = []
}

async function onAddFormMajorChange() {
  addForm.classId = undefined
  if (!addForm.collegeId || !addForm.gradeId || !addForm.majorId) {
    classOptionsForForm.value = []
    return
  }
  classOptionsForForm.value = await getClasses({
    collegeId: addForm.collegeId,
    gradeId: addForm.gradeId,
    majorId: addForm.majorId,
  })
}

async function onEditFormCollegeChange() {
  const f = editForm.value
  f.gradeId = undefined
  f.majorId = undefined
  f.classId = undefined
  if (!f.collegeId) {
    gradeOptionsForForm.value = []
    majorOptionsForForm.value = []
    classOptionsForForm.value = []
    return
  }
  gradeOptionsForForm.value = await getGrades({ collegeId: f.collegeId })
  majorOptionsForForm.value = []
  classOptionsForForm.value = []
}

async function onEditFormGradeChange() {
  const f = editForm.value
  f.majorId = undefined
  f.classId = undefined
  if (!f.collegeId || !f.gradeId) {
    majorOptionsForForm.value = []
    classOptionsForForm.value = []
    return
  }
  majorOptionsForForm.value = await getMajors({
    collegeId: f.collegeId,
    gradeId: f.gradeId,
  })
  classOptionsForForm.value = []
}

async function onEditFormMajorChange() {
  const f = editForm.value
  f.classId = undefined
  if (!f.collegeId || !f.gradeId || !f.majorId) {
    classOptionsForForm.value = []
    return
  }
  classOptionsForForm.value = await getClasses({
    collegeId: f.collegeId,
    gradeId: f.gradeId,
    majorId: f.majorId,
  })
}

function openReset(row: User) {
  resetForm.value = {
    id: row.id,
    password: '',
    confirmPassword: '',
  }
  resetDialogVisible.value = true
  resetFormRef.value?.clearValidate()
}

async function submitAdd() {
  const errors = await addFormRef.value?.validate()
  if (errors) return
  addLoading.value = true
  try {
    const payload: CreateUserData = {
      phone: addForm.phone.trim(),
      email: addForm.email.trim() || undefined,
      username: addForm.username.trim(),
      password: addForm.password,
      role: addForm.role,
      status: addForm.status,
      balance: Number(addForm.balance ?? 0),
      collegeId: addForm.collegeId || undefined,
      gradeId: addForm.gradeId || undefined,
      majorId: addForm.majorId || undefined,
      classId: addForm.classId || undefined,
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
    const { id, username, email, role, status, balance, collegeId, gradeId, majorId, classId } = editForm.value
    const data: UpdateUserData = {
      username,
      email,
      role,
      status,
      balance: balance == null ? undefined : Number(balance),
      collegeId: collegeId ?? null,
      gradeId: gradeId ?? null,
      majorId: majorId ?? null,
      classId: classId ?? null,
    }
    await updateUser(id!, data)
    Message.success('更新成功')
    editDialogVisible.value = false
    fetchList()
  } finally {
    editLoading.value = false
  }
}

async function submitResetPassword() {
  const errors = await resetFormRef.value?.validate()
  if (errors) return
  const id = resetForm.value.id
  if (!id) return
  resetLoading.value = true
  try {
    const payload: ResetUserPasswordData = {
      password: resetForm.value.password,
    }
    await resetUserPassword(id, payload)
    Message.success('密码重置成功')
    resetDialogVisible.value = false
  } catch (e: any) {
    Message.error(e?.response?.data?.message || e?.message || '密码重置失败')
  } finally {
    resetLoading.value = false
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

/** 当前登录角色是否可管理该行（超级管理员可管理所有人；普通管理员不能管理超级管理员） */
function canManageRow(record: User) {
  return isSuperAdmin.value || record.role !== 'super'
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
          <template #icon>
            <IconPlus />
          </template>
          添加用户
        </a-button>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="glow-card toolbar-card">
      <div class="toolbar">
        <div class="toolbar-row toolbar-row-filters">
          <a-input v-model="searchKeyword" placeholder="搜索用户名/手机号/邮箱" allow-clear class="search-input"
            @press-enter="handleSearch">
            <template #prefix>
              <IconSearch />
            </template>
          </a-input>
          <a-select v-model="roleFilter" placeholder="角色筛选" allow-clear class="filter-select role">
            <a-option v-if="isSuperAdmin" label="超级管理员" value="super" />
            <a-option label="管理员" value="admin" />
            <a-option label="普通用户" value="user" />
          </a-select>
          <a-select v-model="statusFilter" placeholder="状态筛选" allow-clear class="filter-select status">
            <a-option label="正常" value="active" />
            <a-option label="已封禁" value="banned" />
          </a-select>
          <a-select v-model="collegeId" placeholder="学院" allow-clear class="filter-select college"
            @change="onFilterCollegeChange">
            <a-option v-for="c in filterCollegeList" :key="c.id" :value="c.id" :label="c.name" />
          </a-select>
          <a-select v-model="gradeId" placeholder="学级" allow-clear :disabled="!collegeId" class="filter-select grade"
            @change="onFilterGradeChange">
            <a-option v-for="g in filterGradeList" :key="g.id" :value="g.id" :label="g.name" />
          </a-select>
          <a-select v-model="majorId" placeholder="专业" allow-clear :disabled="!gradeId" class="filter-select major"
            @change="onFilterMajorChange">
            <a-option v-for="m in filterMajorList" :key="m.id" :value="m.id" :label="m.name" />
          </a-select>
          <a-select v-model="classId" placeholder="班级" allow-clear :disabled="!majorId" class="filter-select class">
            <a-option v-for="cl in filterClassList" :key="cl.id" :value="cl.id" :label="cl.name" />
          </a-select>
          <div class="toolbar-actions">
            <a-button type="primary" @click="handleSearch">
              <template #icon>
                <IconSearch />
              </template>
              搜索
            </a-button>
            <a-button @click="handleResetFilters">
              <template #icon>
                <IconRefresh />
              </template>
              重置
            </a-button>
          </div>
        </div>
      </div>
    </div>

    <!-- Table -->
    <div class="glow-card table-card">
      <a-table :columns="columns" :data="tableData" :loading="loading" :pagination="false" row-key="id"
        class="data-table">
        <template #academic="{ record }">
          <span class="academic-cell">
            {{ [record.collegeName, record.gradeName, record.majorName, record.className].filter(Boolean).join(' / ') ||
              '—' }}
          </span>
        </template>
        <template #user="{ record }">
          <div class="user-cell">
            <a-avatar :size="40" class="user-avatar">
              {{ record.username?.charAt(0) ?? '?' }}
            </a-avatar>
            <div class="user-info">
              <span class="user-name">{{ record.username }}</span>
              <span class="user-email">手机号：{{ record.phone }}</span>
              <span class="user-email">邮箱：{{ record.email ?? '-' }}</span>
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
          <template v-if="canManageRow(record)">
            <a-tooltip content="编辑">
              <a-button type="text" size="small" class="action-btn" @click="openEdit(record)">
                <template #icon>
                  <IconEdit />
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="重置密码">
              <a-button type="text" size="small" class="action-btn" @click="openReset(record)">
                <template #icon>
                  <IconLock />
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip :content="isActive(record) ? '封禁' : '启用'">
              <a-button type="text" size="small" :status="isActive(record) ? 'warning' : 'success'" class="action-btn"
                @click="handleStatusChange(record)">
                <template #icon>
                  <IconMessageBanned />
                </template>
              </a-button>
            </a-tooltip>
            <a-tooltip content="删除">
              <a-button type="text" status="danger" size="small" class="action-btn" @click="handleDelete(record)">
                <template #icon>
                  <IconDelete />
                </template>
              </a-button>
            </a-tooltip>
          </template>
          <span v-else class="no-permission-tip">—</span>
        </template>
      </a-table>

      <div class="pagination-wrap">
        <a-pagination v-model:current="paginationConfig.current" v-model:page-size="paginationConfig.pageSize"
          :total="paginationConfig.total" :page-size-options="[10, 20, 50]" show-total show-page-size
          @change="onPageChange" @page-size-change="onPageSizeChange" />
      </div>
    </div>

    <!-- Edit Modal -->
    <a-modal v-model:visible="editDialogVisible" title="编辑用户" width="480px" unmount-on-close class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }" @close="formRef?.clearValidate()">
      <a-form ref="formRef" :model="editForm" :rules="editRules" layout="horizontal" :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }">
        <a-form-item label="手机号" field="phone">
          <a-input v-model="editForm.phone" disabled placeholder="登录账号，不能修改" />
        </a-form-item>
        <a-form-item label="用户名" field="username">
          <a-input v-model="editForm.username" />
        </a-form-item>
        <a-form-item label="邮箱" field="email">
          <a-input v-model="editForm.email" placeholder="可选，用于通知/找回密码" />
        </a-form-item>
        <a-form-item label="角色" field="role">
          <a-select v-model="editForm.role" placeholder="请选择" allow-clear>
            <a-option v-if="isSuperAdmin" label="超级管理员" value="super" />
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
        <a-form-item label="学院" field="collegeId">
          <a-select v-model="editForm.collegeId" placeholder="可选" allow-clear style="width: 100%"
            @change="onEditFormCollegeChange">
            <a-option v-for="c in collegeOptionsForForm" :key="c.id" :value="c.id" :label="c.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="学级" field="gradeId">
          <a-select v-model="editForm.gradeId" placeholder="先选学院" allow-clear :disabled="!editForm.collegeId"
            style="width: 100%" @change="onEditFormGradeChange">
            <a-option v-for="g in gradeOptionsForForm" :key="g.id" :value="g.id" :label="g.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="专业" field="majorId">
          <a-select v-model="editForm.majorId" placeholder="先选学级" allow-clear :disabled="!editForm.gradeId"
            style="width: 100%" @change="onEditFormMajorChange">
            <a-option v-for="m in majorOptionsForForm" :key="m.id" :value="m.id" :label="m.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="班级" field="classId">
          <a-select v-model="editForm.classId" placeholder="先选专业" allow-clear :disabled="!editForm.majorId"
            style="width: 100%">
            <a-option v-for="cl in classOptionsForForm" :key="cl.id" :value="cl.id" :label="cl.name" />
          </a-select>
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
    <a-modal v-model:visible="addDialogVisible" title="添加用户" width="520px" unmount-on-close class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }" @close="addFormRef?.clearValidate()">
      <a-form ref="addFormRef" :model="addForm" :rules="addRules" layout="horizontal" :label-col-props="{ span: 6 }"
        :wrapper-col-props="{ span: 18 }">
        <a-form-item label="手机号" field="phone">
          <a-input v-model="addForm.phone" placeholder="登录账号，必填且唯一" />
        </a-form-item>
        <a-form-item label="邮箱" field="email">
          <a-input v-model="addForm.email" placeholder="可选，用于通知/找回密码" />
        </a-form-item>
        <a-form-item label="用户名" field="username">
          <a-input v-model="addForm.username" placeholder="展示名称" />
        </a-form-item>
        <a-form-item label="密码" field="password">
          <a-input-password v-model="addForm.password" placeholder="至少 6 位" />
        </a-form-item>
        <a-form-item label="角色" field="role">
          <a-select v-model="addForm.role" placeholder="请选择">
            <a-option v-if="isSuperAdmin" label="超级管理员" value="super" />
            <a-option label="管理员" value="admin" />
            <a-option label="普通用户" value="user" />
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
        <a-form-item label="学院" field="collegeId">
          <a-select v-model="addForm.collegeId" placeholder="可选" allow-clear style="width: 100%"
            @change="onAddFormCollegeChange">
            <a-option v-for="c in collegeOptionsForForm" :key="c.id" :value="c.id" :label="c.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="学级" field="gradeId">
          <a-select v-model="addForm.gradeId" placeholder="先选学院" allow-clear :disabled="!addForm.collegeId"
            style="width: 100%" @change="onAddFormGradeChange">
            <a-option v-for="g in gradeOptionsForForm" :key="g.id" :value="g.id" :label="g.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="专业" field="majorId">
          <a-select v-model="addForm.majorId" placeholder="先选学级" allow-clear :disabled="!addForm.gradeId"
            style="width: 100%" @change="onAddFormMajorChange">
            <a-option v-for="m in majorOptionsForForm" :key="m.id" :value="m.id" :label="m.name" />
          </a-select>
        </a-form-item>
        <a-form-item label="班级" field="classId">
          <a-select v-model="addForm.classId" placeholder="先选专业" allow-clear :disabled="!addForm.majorId"
            style="width: 100%">
            <a-option v-for="cl in classOptionsForForm" :key="cl.id" :value="cl.id" :label="cl.name" />
          </a-select>
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="addDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="addLoading" @click="submitAdd">创建</a-button>
      </template>
    </a-modal>
    <!-- Reset Password Modal -->
    <a-modal v-model:visible="resetDialogVisible" title="重置密码" width="420px" unmount-on-close class="edit-modal"
      :mask-style="{ background: 'var(--bg-overlay)' }" @close="resetFormRef?.clearValidate()">
      <a-form ref="resetFormRef" :model="resetForm" :rules="resetRules" layout="horizontal"
        :label-col-props="{ span: 6 }" :wrapper-col-props="{ span: 18 }">
        <a-form-item label="新密码" field="password">
          <a-input-password v-model="resetForm.password" placeholder="请输入新密码（至少 6 位）" />
        </a-form-item>
        <a-form-item label="确认密码" field="confirmPassword">
          <a-input-password v-model="resetForm.confirmPassword" placeholder="请再次输入新密码" />
        </a-form-item>
      </a-form>
      <template #footer>
        <a-button @click="resetDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="resetLoading" @click="submitResetPassword">
          确认重置
        </a-button>
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

/* Toolbar：简单两行，不搞花里胡哨的适配 */
.toolbar-card {
  padding: var(--sp-4);
}

.toolbar {
  display: flex;
  flex-direction: column;
  gap: var(--sp-4);
}

/* 纯 Grid：5 列，前 5 项第一行，后 3 项第二行；专业/班级与首行同列宽，按钮组不拉伸 */
.toolbar-row-filters {
  display: grid;
  grid-template-columns: repeat(5, minmax(180px, 1fr));
  gap: var(--sp-4);
}

.toolbar-actions {
  display: flex;
  gap: var(--sp-4);
  justify-self: start;
}

.search-input {
  width: 100%;
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

.no-permission-tip {
  color: var(--text-3);
  font-size: 12px;
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
}
</style>
