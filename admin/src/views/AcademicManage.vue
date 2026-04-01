<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { IconApps, IconPlus, IconDelete, IconEdit } from '@arco-design/web-vue/es/icon'
import {
  getColleges,
  getGrades,
  getMajors,
  getClasses,
  createCollege,
  createGrade,
  createMajor,
  createClass,
  updateCollege,
  updateGrade,
  updateMajor,
  updateClass,
  deleteCollege,
  deleteGrade,
  deleteMajor,
  deleteClass,
  type College,
  type Grade,
  type Major,
  type Clazz,
} from '../api/academic'

type TabKey = 'college' | 'grade' | 'major' | 'class'

const activeTab = ref<TabKey>('college')
const loading = ref(false)

const collegeList = ref<College[]>([])
const gradeList = ref<Grade[]>([])
const majorList = ref<Major[]>([])
const classList = ref<Clazz[]>([])

const filterCollegeId = ref<string | undefined>()
const filterGradeId = ref<string | undefined>()
const filterMajorId = ref<string | undefined>()

const nameFormRef = ref<FormInstance>()
const nameForm = reactive<{
  id?: string
  name: string
  collegeId?: string
  gradeId?: string
  majorId?: string
}>({
  id: undefined,
  name: '',
  collegeId: undefined,
  gradeId: undefined,
  majorId: undefined,
})
const gradeOptionsInModal = ref<Grade[]>([])
const majorOptionsInModal = ref<Major[]>([])
const nameFormRules = {
  name: [{ required: true, message: '请输入名称', trigger: 'blur' }],
}
const nameDialogVisible = ref(false)
const nameDialogTitle = ref('')
const nameDialogType = ref<TabKey>('college')
const submitLoading = ref(false)

const addButtonText = computed(() => {
  const map: Record<TabKey, string> = {
    college: '新增窑口',
    grade: '新增设计',
    major: '新增生产',
    class: '新增宣传',
  }
  return map[activeTab.value]
})

const collegeColumns = [
  { title: '窑口名称', dataIndex: 'name' },
  { title: '操作', slotName: 'collegeAction', width: 160 },
]
const gradeColumns = [
  { title: '窑口', slotName: 'college', minWidth: 140 },
  { title: '设计名称', dataIndex: 'name', minWidth: 140 },
  { title: '操作', slotName: 'gradeAction', width: 200 },
]
const majorColumns = [
  { title: '窑口', slotName: 'college', minWidth: 120 },
  { title: '设计', slotName: 'grade', minWidth: 120 },
  { title: '生产名称', dataIndex: 'name', minWidth: 160 },
  { title: '操作', slotName: 'majorAction', width: 200 },
]
const classColumns = [
  { title: '窑口', slotName: 'college', minWidth: 120 },
  { title: '设计', slotName: 'grade', minWidth: 120 },
  { title: '生产', slotName: 'major', minWidth: 140 },
  { title: '宣传名称', dataIndex: 'name', minWidth: 160 },
  { title: '操作', slotName: 'classAction', width: 160 },
]

function getCollegeName(id?: string) {
  if (!id) return '-'
  return collegeList.value.find((c) => c.id === id)?.name ?? '-'
}

function getGradeName(id?: string) {
  if (!id) return '-'
  return gradeList.value.find((g) => g.id === id)?.name ?? '-'
}

function getMajorName(id?: string) {
  if (!id) return '-'
  return majorList.value.find((m) => m.id === id)?.name ?? '-'
}

function openAddFromHeader() {
  openAdd(activeTab.value)
}

async function openAdd(type: TabKey, parent?: { collegeId?: string; gradeId?: string; majorId?: string }) {
  nameForm.id = undefined
  nameForm.name = ''
  nameForm.collegeId = parent?.collegeId ?? undefined
  nameForm.gradeId = parent?.gradeId ?? undefined
  nameForm.majorId = parent?.majorId ?? undefined
  nameDialogType.value = type
  if (type === 'college') {
    nameDialogTitle.value = '新增窑口'
  } else if (type === 'grade') {
    nameDialogTitle.value = '新增设计'
    filterCollegeId.value = parent?.collegeId ?? filterCollegeId.value
    await loadGradeOptionsInModal()
  } else if (type === 'major') {
    nameDialogTitle.value = '新增生产'
    filterCollegeId.value = parent?.collegeId ?? filterCollegeId.value
    filterGradeId.value = parent?.gradeId ?? filterGradeId.value
    await loadGradeOptionsInModal()
    await loadMajorOptionsInModal()
  } else {
    nameDialogTitle.value = '新增宣传'
    filterCollegeId.value = parent?.collegeId ?? filterCollegeId.value
    filterGradeId.value = parent?.gradeId ?? filterGradeId.value
    filterMajorId.value = parent?.majorId ?? filterMajorId.value
    await loadGradeOptionsInModal()
    await loadMajorOptionsInModal()
  }
  nameDialogVisible.value = true
  nameFormRef.value?.clearValidate()
}

async function loadGradeOptionsInModal() {
  if (!nameForm.collegeId) {
    gradeOptionsInModal.value = []
    return
  }
  gradeOptionsInModal.value = await getGrades({ collegeId: nameForm.collegeId })
}

async function loadMajorOptionsInModal() {
  if (!nameForm.collegeId || !nameForm.gradeId) {
    majorOptionsInModal.value = []
    return
  }
  majorOptionsInModal.value = await getMajors({
    collegeId: nameForm.collegeId,
    gradeId: nameForm.gradeId,
  })
}

function onModalCollegeChange() {
  nameForm.gradeId = undefined
  nameForm.majorId = undefined
  loadGradeOptionsInModal()
  loadMajorOptionsInModal()
}

function onModalGradeChange() {
  nameForm.majorId = undefined
  loadMajorOptionsInModal()
}

function openEdit(type: TabKey, row: College | Grade | Major | Clazz) {
  nameForm.id = row.id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nameForm.name = (row as any).name
  nameDialogType.value = type
  if (type === 'college') {
    nameDialogTitle.value = '编辑窑口'
  } else if (type === 'grade') {
    nameDialogTitle.value = '编辑设计'
  } else if (type === 'major') {
    nameDialogTitle.value = '编辑生产'
  } else {
    nameDialogTitle.value = '编辑宣传'
  }
  nameDialogVisible.value = true
  nameFormRef.value?.clearValidate()
}

async function submitName() {
  const errors = await nameFormRef.value?.validate()
  if (errors) return
  const type = nameDialogType.value
  if (type === 'grade' && !nameForm.collegeId) {
    Message.error('请选择窑口')
    return
  }
  if (type === 'major' && (!nameForm.collegeId || !nameForm.gradeId)) {
    Message.error('请选择窑口和设计')
    return
  }
  if (type === 'class' && (!nameForm.collegeId || !nameForm.gradeId || !nameForm.majorId)) {
    Message.error('请选择窑口、设计和生产')
    return
  }
  submitLoading.value = true
  try {
    if (type === 'college') {
      if (nameForm.id) {
        await updateCollege(nameForm.id, { name: nameForm.name })
        Message.success('窑口已更新')
      } else {
        await createCollege({ name: nameForm.name })
        Message.success('窑口已创建')
      }
      await fetchColleges()
    } else if (type === 'grade') {
      if (nameForm.id) {
        await updateGrade(nameForm.id, { name: nameForm.name })
        Message.success('设计已更新')
      } else {
        await createGrade({ name: nameForm.name, collegeId: nameForm.collegeId! })
        Message.success('设计已创建')
      }
      await fetchGrades()
    } else if (type === 'major') {
      if (nameForm.id) {
        await updateMajor(nameForm.id, { name: nameForm.name })
        Message.success('生产已更新')
      } else {
        await createMajor({
          name: nameForm.name,
          collegeId: nameForm.collegeId!,
          gradeId: nameForm.gradeId!,
        })
        Message.success('生产已创建')
      }
      await fetchMajors()
    } else {
      if (nameForm.id) {
        await updateClass(nameForm.id, { name: nameForm.name })
        Message.success('宣传已更新')
      } else {
        await createClass({
          name: nameForm.name,
          collegeId: nameForm.collegeId!,
          gradeId: nameForm.gradeId!,
          majorId: nameForm.majorId!,
        })
        Message.success('宣传已创建')
      }
      await fetchClasses()
    }
    nameDialogVisible.value = false
  } catch (e: any) {
    Message.error(e?.response?.data?.message ?? e?.message ?? '操作失败')
  } finally {
    submitLoading.value = false
  }
}

async function handleDelete(type: TabKey, row: College | Grade | Major | Clazz) {
  const name = (row as any).name as string
  Modal.confirm({
    title: '删除确认',
    content: `确定要删除「${name}」吗？`,
    okText: '确定',
    cancelText: '取消',
    okButtonProps: { status: 'danger' },
    async onOk() {
      try {
        if (type === 'college') {
          await deleteCollege(row.id)
          Message.success('窑口已删除')
          await fetchColleges()
        } else if (type === 'grade') {
          await deleteGrade(row.id)
          Message.success('设计已删除')
          await fetchGrades()
        } else if (type === 'major') {
          await deleteMajor(row.id)
          Message.success('生产已删除')
          await fetchMajors()
        } else {
          await deleteClass(row.id)
          Message.success('宣传已删除')
          await fetchClasses()
        }
      } catch (e: any) {
        Message.error(e?.response?.data?.message || e?.message || '删除失败')
      }
    },
  })
}

async function fetchColleges() {
  loading.value = true
  try {
    collegeList.value = await getColleges()
  } finally {
    loading.value = false
  }
}

async function fetchGrades() {
  loading.value = true
  try {
    gradeList.value = await getGrades({ collegeId: filterCollegeId.value })
  } finally {
    loading.value = false
  }
}

async function fetchMajors() {
  loading.value = true
  try {
    majorList.value = await getMajors({
      collegeId: filterCollegeId.value,
      gradeId: filterGradeId.value,
    })
  } finally {
    loading.value = false
  }
}

async function fetchClasses() {
  loading.value = true
  try {
    classList.value = await getClasses({
      collegeId: filterCollegeId.value,
      gradeId: filterGradeId.value,
      majorId: filterMajorId.value,
    })
  } finally {
    loading.value = false
  }
}

function resetCascadeFromCollege() {
  filterGradeId.value = undefined
  filterMajorId.value = undefined
}

function resetCascadeFromGrade() {
  filterMajorId.value = undefined
}

onMounted(async () => {
  await fetchColleges()
  await fetchGrades()
  await fetchMajors()
  await fetchClasses()
})
</script>

<template>
  <div class="academic-manage">
    <div class="glow-card header-card">
      <div class="header-left">
        <div class="header-icon">
          <IconApps />
        </div>
        <div>
          <h2 class="header-title">企业管理</h2>
          <p class="header-subtitle">管理窑口、设计、生产与宣传层级结构</p>
        </div>
      </div>
      <div class="header-right">
        <a-button type="primary" class="add-btn" @click="openAddFromHeader">
          <template #icon>
            <IconPlus />
          </template>
          {{ addButtonText }}
        </a-button>
      </div>
    </div>

    <div class="glow-card tab-card">
      <a-tabs v-model:active-key="activeTab" type="line">
        <a-tab-pane key="college" title="窑口">
          <a-table :columns="collegeColumns" :data="collegeList" :pagination="false" row-key="id" :loading="loading"
            class="data-table">
            <template #collegeAction="{ record }">
              <div class="action-btns">
                <a-tooltip content="新增设计" position="top">
                  <a-button type="text" size="small" @click="openAdd('grade', { collegeId: record.id })">
                    <template #icon>
                      <IconPlus />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="编辑" position="top">
                  <a-button type="text" size="small" @click="openEdit('college', record)">
                    <template #icon>
                      <IconEdit />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="删除" position="top">
                  <a-button type="text" size="small" status="danger" @click="handleDelete('college', record)">
                    <template #icon>
                      <IconDelete />
                    </template>
                  </a-button>
                </a-tooltip>
              </div>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="grade" title="设计">
          <div class="tab-toolbar">
            <a-select v-model="filterCollegeId" placeholder="选择窑口" allow-clear style="width: 200px" @change="
              () => {
                resetCascadeFromCollege()
                fetchGrades()
                fetchMajors()
                fetchClasses()
              }
            ">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
          </div>
          <a-table :columns="gradeColumns" :data="gradeList" :pagination="false" row-key="id" :loading="loading"
            class="data-table">
            <template #college="{ record }">
              {{ getCollegeName(record.collegeId) }}
            </template>
            <template #gradeAction="{ record }">
              <div class="action-btns">
                <a-tooltip content="新增生产" position="top">
                  <a-button type="text" size="small"
                    @click="openAdd('major', { collegeId: record.collegeId, gradeId: record.id })">
                    <template #icon>
                      <IconPlus />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="编辑" position="top">
                  <a-button type="text" size="small" @click="openEdit('grade', record)">
                    <template #icon>
                      <IconEdit />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="删除" position="top">
                  <a-button type="text" size="small" status="danger" @click="handleDelete('grade', record)">
                    <template #icon>
                      <IconDelete />
                    </template>
                  </a-button>
                </a-tooltip>
              </div>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="major" title="生产">
          <div class="tab-toolbar">
            <a-select v-model="filterCollegeId" placeholder="选择窑口" allow-clear style="width: 180px" @change="
              () => {
                resetCascadeFromCollege()
                fetchGrades()
                fetchMajors()
                fetchClasses()
              }
            ">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
            <a-select v-model="filterGradeId" placeholder="选择设计" allow-clear style="width: 180px" @change="
              () => {
                resetCascadeFromGrade()
                fetchMajors()
                fetchClasses()
              }
            ">
              <a-option v-for="g in gradeList" :key="g.id" :value="g.id" :label="g.name" />
            </a-select>
          </div>
          <a-table :columns="majorColumns" :data="majorList" :pagination="false" row-key="id" :loading="loading"
            class="data-table">
            <template #college="{ record }">
              {{ getCollegeName(record.collegeId) }}
            </template>
            <template #grade="{ record }">
              {{ getGradeName(record.gradeId) }}
            </template>
            <template #majorAction="{ record }">
              <div class="action-btns">
                <a-tooltip content="新增宣传" position="top">
                  <a-button type="text" size="small"
                    @click="openAdd('class', { collegeId: record.collegeId, gradeId: record.gradeId, majorId: record.id })">
                    <template #icon>
                      <IconPlus />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="编辑" position="top">
                  <a-button type="text" size="small" @click="openEdit('major', record)">
                    <template #icon>
                      <IconEdit />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="删除" position="top">
                  <a-button type="text" size="small" status="danger" @click="handleDelete('major', record)">
                    <template #icon>
                      <IconDelete />
                    </template>
                  </a-button>
                </a-tooltip>
              </div>
            </template>
          </a-table>
        </a-tab-pane>

        <a-tab-pane key="class" title="宣传">
          <div class="tab-toolbar">
            <a-select v-model="filterCollegeId" placeholder="选择窑口" allow-clear style="width: 160px" @change="
              () => {
                resetCascadeFromCollege()
                fetchGrades()
                fetchMajors()
                fetchClasses()
              }
            ">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
            <a-select v-model="filterGradeId" placeholder="选择设计" allow-clear style="width: 160px" @change="
              () => {
                resetCascadeFromGrade()
                fetchMajors()
                fetchClasses()
              }
            ">
              <a-option v-for="g in gradeList" :key="g.id" :value="g.id" :label="g.name" />
            </a-select>
            <a-select v-model="filterMajorId" placeholder="选择生产" allow-clear style="width: 160px"
              @change="fetchClasses">
              <a-option v-for="m in majorList" :key="m.id" :value="m.id" :label="m.name" />
            </a-select>
          </div>
          <a-table :columns="classColumns" :data="classList" :pagination="false" row-key="id" :loading="loading"
            class="data-table">
            <template #college="{ record }">
              {{ getCollegeName(record.collegeId) }}
            </template>
            <template #grade="{ record }">
              {{ getGradeName(record.gradeId) }}
            </template>
            <template #major="{ record }">
              {{ getMajorName(record.majorId) }}
            </template>
            <template #classAction="{ record }">
              <div class="action-btns">
                <a-tooltip content="编辑" position="top">
                  <a-button type="text" size="small" @click="openEdit('class', record)">
                    <template #icon>
                      <IconEdit />
                    </template>
                  </a-button>
                </a-tooltip>
                <a-tooltip content="删除" position="top">
                  <a-button type="text" size="small" status="danger" @click="handleDelete('class', record)">
                    <template #icon>
                      <IconDelete />
                    </template>
                  </a-button>
                </a-tooltip>
              </div>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </div>

    <a-modal v-model:visible="nameDialogVisible" :title="nameDialogTitle" width="420px" unmount-on-close
      class="edit-modal" :mask-style="{ background: 'var(--bg-overlay)' }">
      <a-form ref="nameFormRef" :model="nameForm" :rules="nameFormRules" layout="horizontal"
        :label-col-props="{ span: 6 }" :wrapper-col-props="{ span: 18 }">
        <!-- 新增设计：必选窑口 + 设计名称 -->
        <template v-if="nameDialogType === 'grade' && !nameForm.id">
          <a-form-item label="窑口" field="collegeId" required>
            <a-select v-model="nameForm.collegeId" placeholder="请选择窑口" allow-clear @change="onModalCollegeChange">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="设计名称" field="name">
            <a-input v-model="nameForm.name" placeholder="" />
          </a-form-item>
        </template>
        <!-- 编辑设计：仅名称 -->
        <template v-else-if="nameDialogType === 'grade'">
          <a-form-item label="设计名称" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
        <!-- 新增生产：必选窑口、设计 + 生产名称 -->
        <template v-else-if="nameDialogType === 'major' && !nameForm.id">
          <a-form-item label="窑口" field="collegeId" required>
            <a-select v-model="nameForm.collegeId" placeholder="请选择窑口" allow-clear @change="onModalCollegeChange">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="设计" field="gradeId" required>
            <a-select v-model="nameForm.gradeId" placeholder="请选择设计" allow-clear :disabled="!nameForm.collegeId"
              @change="onModalGradeChange">
              <a-option v-for="g in gradeOptionsInModal" :key="g.id" :value="g.id" :label="g.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="生产名称" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
        <template v-else-if="nameDialogType === 'major'">
          <a-form-item label="生产名称" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
        <!-- 新增宣传：必选窑口、设计、生产 + 宣传名称 -->
        <template v-else-if="nameDialogType === 'class' && !nameForm.id">
          <a-form-item label="窑口" field="collegeId" required>
            <a-select v-model="nameForm.collegeId" placeholder="请选择窑口" allow-clear @change="onModalCollegeChange">
              <a-option v-for="c in collegeList" :key="c.id" :value="c.id" :label="c.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="设计" field="gradeId" required>
            <a-select v-model="nameForm.gradeId" placeholder="请选择设计" allow-clear :disabled="!nameForm.collegeId"
              @change="onModalGradeChange">
              <a-option v-for="g in gradeOptionsInModal" :key="g.id" :value="g.id" :label="g.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="生产" field="majorId" required>
            <a-select v-model="nameForm.majorId" placeholder="请选择生产" allow-clear :disabled="!nameForm.gradeId">
              <a-option v-for="m in majorOptionsInModal" :key="m.id" :value="m.id" :label="m.name" />
            </a-select>
          </a-form-item>
          <a-form-item label="宣传名称" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
        <template v-else-if="nameDialogType === 'class'">
          <a-form-item label="宣传名称" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
        <!-- 窑口：仅名称 -->
        <template v-else>
          <a-form-item :label="nameDialogType === 'college' ? '窑口名称' : ''" field="name">
            <a-input v-model="nameForm.name" />
          </a-form-item>
        </template>
      </a-form>
      <template #footer>
        <a-button @click="nameDialogVisible = false">取消</a-button>
        <a-button type="primary" :loading="submitLoading" @click="submitName">确定</a-button>
      </template>
    </a-modal>
  </div>
</template>

<style scoped>
.academic-manage {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

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
  color: #b2d4ff;
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

.tab-card {
  padding: var(--sp-4);
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  margin-bottom: var(--sp-4);
  flex-wrap: wrap;
}

.action-btns {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.data-table :deep(.arco-table-tr:hover .arco-table-td) {
  background: rgba(22, 93, 255, 0.06) !important;
}

.edit-modal :deep(.arco-modal) {
  background: var(--bg-surface-2);
  border: 1px solid var(--glass-border);
}
</style>
