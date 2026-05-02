<template>
  <div class="badwords-manage">
    <!-- Header -->
    <div class="glow-card header-card">
      <div class="header-left">
        <div class="header-icon">
          <IconStop />
        </div>
        <div>
          <h2 class="header-title">敏感词管理</h2>
          <p class="header-subtitle">管理内容审核敏感词库与违规记录</p>
        </div>
      </div>
      <div class="header-right">
        <a-button type="primary" @click="openAddModal">
          <template #icon><IconPlus /></template>
          添加敏感词
        </a-button>
      </div>
    </div>

    <!-- 工具栏 -->
    <div class="glow-card toolbar-card">
      <div class="toolbar">
        <a-input
          v-model="filters.keyword"
          placeholder="搜索敏感词..."
          allow-clear
          class="search-input"
          @press-enter="loadBadWords"
          @clear="loadBadWords"
        >
          <template #prefix><IconSearch /></template>
        </a-input>
        <a-select
          v-model="filters.level"
          placeholder="等级筛选"
          allow-clear
          style="width: 130px"
          @change="loadBadWords"
        >
          <a-option value="low">初级</a-option>
          <a-option value="medium">中级</a-option>
          <a-option value="high">高级</a-option>
        </a-select>
        <a-select
          v-model="filters.category"
          placeholder="分类筛选"
          allow-clear
          style="width: 150px"
          @change="loadBadWords"
        >
          <a-option v-for="cat in categories" :key="cat" :value="cat">{{ cat }}</a-option>
        </a-select>
        <a-select
          v-model="filters.isActive"
          placeholder="状态筛选"
          allow-clear
          style="width: 120px"
          @change="loadBadWords"
        >
          <a-option :value="true">启用</a-option>
          <a-option :value="false">禁用</a-option>
        </a-select>
        <a-button @click="loadBadWords">
          <template #icon><IconSearch /></template>
          搜索
        </a-button>
        <a-button @click="resetFilters">重置</a-button>
      </div>
    </div>

    <!-- 统计卡片 -->
    <div class="stats-row">
      <div class="glow-card stat-card">
        <div class="stat-badge tone-indigo"><IconApps /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.total.toLocaleString() }}</div>
          <div class="stat-label">总词条</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-cyan"><IconFile /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.lowCount.toLocaleString() }}</div>
          <div class="stat-label">初级（标记）</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-amber"><IconExclamationCircle /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.mediumCount.toLocaleString() }}</div>
          <div class="stat-label">中级（确认）</div>
        </div>
      </div>
      <div class="glow-card stat-card">
        <div class="stat-badge tone-pink"><IconStop /></div>
        <div class="stat-content">
          <div class="stat-value">{{ stats.highCount.toLocaleString() }}</div>
          <div class="stat-label">高级（拦截）</div>
        </div>
      </div>
    </div>

    <!-- Tab 切换 -->
    <div class="glow-card content-card">
      <a-tabs v-model:active-key="activeTab" @change="onTabChange">
        <a-tab-pane key="words" title="敏感词库">
          <!-- 网格布局 -->
          <a-spin :loading="wordsLoading" style="width: 100%">
            <div class="words-grid" v-if="badWordList.length > 0">
              <div
                v-for="item in badWordList"
                :key="item.id"
                class="word-card"
                :class="['level-' + item.level, { 'is-disabled': !item.isActive }]"
                @click="openDetailModal(item)"
              >
                <div class="word-text">{{ item.word }}</div>
                <div class="word-meta">
                  <a-tag :color="getLevelColor(item.level)" size="small">
                    {{ getLevelLabel(item.level) }}
                  </a-tag>
                  <span v-if="item.category" class="word-category">{{ item.category }}</span>
                </div>
                <div v-if="!item.isActive" class="disabled-badge">已禁用</div>
              </div>
            </div>
            <div v-if="badWordList.length === 0 && !wordsLoading" class="empty-tip">
              暂无数据
            </div>
          </a-spin>

          <!-- 分页 -->
          <div class="pagination-wrap" v-if="wordsTotal > 0">
            <a-pagination
              v-model:current="wordsPage"
              :total="wordsTotal"
              :page-size="pageSize"
              show-total
              @change="onWordsPageChange"
            />
          </div>
        </a-tab-pane>

        <a-tab-pane key="violations" title="违规记录">
          <a-table
            :data="violationList"
            :loading="violationsLoading"
            :pagination="violationsPagination"
            @page-change="onViolationsPageChange"
            row-key="id"
          >
            <template #columns>
              <a-table-column title="用户" data-index="username" :width="140">
                <template #cell="{ record }">
                  <span v-if="record.username">{{ record.username }}</span>
                  <span v-else class="anonymous-user">匿名用户</span>
                </template>
              </a-table-column>
              <a-table-column title="匹配敏感词" data-index="matchedWord" :width="150" />
              <a-table-column title="处理动作" data-index="action" :width="100">
                <template #cell="{ record }">
                  <a-tag :color="getActionColor(record.action)">{{ getActionLabel(record.action) }}</a-tag>
                </template>
              </a-table-column>
              <a-table-column title="违规内容" data-index="content">
                <template #cell="{ record }">
                  <div class="content-cell">{{ truncateContent(record.content) }}</div>
                </template>
              </a-table-column>
              <a-table-column title="时间" data-index="createdAt" :width="180">
                <template #cell="{ record }">{{ formatDate(record.createdAt) }}</template>
              </a-table-column>
            </template>
          </a-table>
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 添加敏感词弹窗 -->
    <a-modal
      v-model:visible="addModalVisible"
      title="添加敏感词"
      @ok="handleAddWord"
      @cancel="addModalVisible = false"
      :ok-loading="addLoading"
      width="480px"
      unmount-on-close
      :mask-style="{ background: 'var(--bg-overlay)' }"
    >
      <a-form :model="addForm" layout="vertical">
        <a-form-item label="敏感词" field="word" required>
          <a-input v-model="addForm.word" placeholder="输入敏感词" />
        </a-form-item>
        <a-form-item label="等级" field="level">
          <a-select v-model="addForm.level">
            <a-option value="low">初级（仅标记，允许生成）</a-option>
            <a-option value="medium">中级（弹窗确认后生成）</a-option>
            <a-option value="high">高级（直接拦截禁止生成）</a-option>
          </a-select>
        </a-form-item>
        <a-form-item label="分类" field="category">
          <a-input v-model="addForm.category" placeholder="如：色情、政治、暴力等" />
        </a-form-item>
      </a-form>
    </a-modal>

    <!-- 详情/编辑弹窗 -->
    <a-modal
      v-model:visible="detailModalVisible"
      title="敏感词详情"
      @cancel="detailModalVisible = false"
      :footer="false"
      width="500px"
      unmount-on-close
      :mask-style="{ background: 'var(--bg-overlay)' }"
    >
      <a-form v-if="currentWord" :model="editForm" layout="vertical">
        <a-form-item label="敏感词">
          <a-input v-model="editForm.word" />
        </a-form-item>
        <a-form-item label="等级">
          <a-radio-group v-model="editForm.level" type="button">
            <a-radio value="low">初级</a-radio>
            <a-radio value="medium">中级</a-radio>
            <a-radio value="high">高级</a-radio>
          </a-radio-group>
        </a-form-item>
        <a-form-item label="分类">
          <a-input v-model="editForm.category" placeholder="如：色情、政治、暴力等" />
        </a-form-item>
        <a-form-item label="状态">
          <a-switch v-model="editForm.isActive" />
          <span style="margin-left: 8px">{{ editForm.isActive ? '启用' : '禁用' }}</span>
        </a-form-item>
        <a-form-item label="创建时间">
          <span>{{ formatDate(currentWord.createdAt) }}</span>
        </a-form-item>
        <div class="modal-actions">
          <a-popconfirm content="确定删除此敏感词？" @ok="handleDeleteWord">
            <a-button status="danger">删除</a-button>
          </a-popconfirm>
          <a-button type="primary" :loading="editLoading" @click="handleUpdateWord">保存修改</a-button>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue'
import { Message } from '@arco-design/web-vue'
import { IconPlus, IconSearch, IconApps, IconFile, IconExclamationCircle, IconStop } from '@arco-design/web-vue/es/icon'
import {
  getBadWords,
  getStats,
  addBadWord,
  updateBadWord,
  deleteBadWord,
  getViolationLogs,
  type BadWord,
  type ViolationLog,
  type BadWordStats,
} from '../api/badwords'

const activeTab = ref('words')
const pageSize = 50

// 统计
const stats = ref<BadWordStats>({ total: 0, lowCount: 0, mediumCount: 0, highCount: 0 })

// 敏感词列表
const badWordList = ref<BadWord[]>([])
const wordsLoading = ref(false)
const wordsPage = ref(1)
const wordsTotal = ref(0)
const categories = ref<string[]>([])

// 筛选
const filters = reactive({
  keyword: '',
  level: undefined as 'low' | 'medium' | 'high' | undefined,
  category: undefined as string | undefined,
  isActive: undefined as boolean | undefined,
})

// 违规记录
const violationList = ref<ViolationLog[]>([])
const violationsLoading = ref(false)
const violationsPage = ref(1)
const violationsTotal = ref(0)
const violationsPagination = reactive({
  current: 1,
  pageSize: 20,
  total: 0,
})

// 添加弹窗
const addModalVisible = ref(false)
const addLoading = ref(false)
const addForm = reactive({
  word: '',
  level: 'medium' as 'low' | 'medium' | 'high',
  category: '',
})

// 详情弹窗
const detailModalVisible = ref(false)
const editLoading = ref(false)
const currentWord = ref<BadWord | null>(null)
const editForm = reactive({
  word: '',
  level: 'medium' as 'low' | 'medium' | 'high',
  category: '',
  isActive: true,
})

async function loadStats() {
  try {
    const data = await getStats()
    stats.value = data
  } catch {}
}

async function loadBadWords() {
  wordsLoading.value = true
  try {
    const data = await getBadWords({
      page: wordsPage.value,
      pageSize,
      keyword: filters.keyword || undefined,
      level: filters.level,
      category: filters.category,
      isActive: filters.isActive,
    })
    badWordList.value = data.list
    wordsTotal.value = data.total
    categories.value = data.categories || []
  } catch {
    badWordList.value = []
  } finally {
    wordsLoading.value = false
  }
}

async function loadViolations() {
  violationsLoading.value = true
  try {
    const data = await getViolationLogs(violationsPage.value, 20)
    violationList.value = data.list
    violationsTotal.value = data.total
    violationsPagination.total = data.total
    violationsPagination.current = data.page
  } catch {
    violationList.value = []
  } finally {
    violationsLoading.value = false
  }
}

function onTabChange(key: string | number) {
  if (key === 'violations' && violationList.value.length === 0) {
    loadViolations()
  }
}

function onWordsPageChange(page: number) {
  wordsPage.value = page
  loadBadWords()
}

function onViolationsPageChange(page: number) {
  violationsPage.value = page
  violationsPagination.current = page
  loadViolations()
}

function openAddModal() {
  addForm.word = ''
  addForm.level = 'medium'
  addForm.category = ''
  addModalVisible.value = true
}

async function handleAddWord() {
  if (!addForm.word.trim()) {
    Message.warning('请输入敏感词')
    return
  }
  addLoading.value = true
  try {
    await addBadWord({
      word: addForm.word.trim(),
      level: addForm.level,
      category: addForm.category.trim() || undefined,
    })
    Message.success('添加成功')
    addModalVisible.value = false
    loadBadWords()
    loadStats()
  } catch {
    Message.error('添加失败')
  } finally {
    addLoading.value = false
  }
}

function openDetailModal(item: BadWord) {
  currentWord.value = item
  editForm.word = item.word
  editForm.level = item.level
  editForm.category = item.category || ''
  editForm.isActive = item.isActive
  detailModalVisible.value = true
}

async function handleUpdateWord() {
  if (!currentWord.value) return
  editLoading.value = true
  try {
    await updateBadWord(currentWord.value.id, {
      word: editForm.word.trim(),
      level: editForm.level,
      category: editForm.category.trim() || undefined,
      isActive: editForm.isActive,
    })
    Message.success('更新成功')
    detailModalVisible.value = false
    loadBadWords()
    loadStats()
  } catch {
    Message.error('更新失败')
  } finally {
    editLoading.value = false
  }
}

async function handleDeleteWord() {
  if (!currentWord.value) return
  try {
    await deleteBadWord(currentWord.value.id)
    Message.success('删除成功')
    detailModalVisible.value = false
    loadBadWords()
    loadStats()
  } catch {
    Message.error('删除失败')
  }
}

function getLevelLabel(level: string) {
  switch (level) {
    case 'low': return '初级'
    case 'medium': return '中级'
    case 'high': return '高级'
    default: return level
  }
}

function getLevelColor(level: string) {
  switch (level) {
    case 'low': return 'arcoblue'
    case 'medium': return 'orangered'
    case 'high': return 'red'
    default: return 'gray'
  }
}

function getActionColor(action: string) {
  switch (action) {
    case 'warn': return 'blue'
    case 'block': return 'orange'
    case 'ban': return 'red'
    default: return 'gray'
  }
}

function getActionLabel(action: string) {
  switch (action) {
    case 'warn': return '标记'
    case 'block': return '确认'
    case 'ban': return '拦截'
    default: return action
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('zh-CN')
}

function truncateContent(content: string) {
  if (!content) return '-'
  return content.length > 80 ? content.slice(0, 80) + '...' : content
}

function resetFilters() {
  filters.keyword = ''
  filters.level = undefined
  filters.category = undefined
  filters.isActive = undefined
  wordsPage.value = 1
  loadBadWords()
}

onMounted(() => {
  loadStats()
  loadBadWords()
})
</script>

<style scoped>
.badwords-manage {
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
  background: linear-gradient(135deg, rgba(245, 63, 63, 0.24), rgba(247, 89, 171, 0.18));
  color: #fca5a5;
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

/* 工具栏 */
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
  width: 220px;
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
.tone-cyan { background: rgba(20, 201, 201, 0.16); color: #67E8F9; }
.tone-amber { background: rgba(255, 125, 0, 0.16); color: #FBBF24; }
.tone-pink { background: rgba(247, 89, 171, 0.14); color: #F9A8D4; }

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

/* 内容卡片 */
.content-card {
  padding: var(--sp-6);
}

/* 网格布局 */
.words-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: var(--sp-3);
  min-height: 200px;
}

.word-card {
  position: relative;
  background: var(--bg-surface-2);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-md);
  padding: var(--sp-3);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
}

.word-card:hover {
  border-color: var(--border-focus);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.word-card.level-low { border-left: 3px solid var(--accent-cyan); }
.word-card.level-medium { border-left: 3px solid var(--accent-amber); }
.word-card.level-high { border-left: 3px solid var(--accent-red); }

.word-card.is-disabled {
  opacity: 0.5;
}

.word-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-1);
  word-break: break-all;
  margin-bottom: var(--sp-2);
}

.word-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.word-category {
  font-size: 11px;
  color: var(--text-4);
}

.disabled-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  font-size: 10px;
  color: var(--text-4);
  background: var(--bg-surface-3);
  padding: 2px 6px;
  border-radius: var(--radius-sm);
}

.empty-tip {
  text-align: center;
  color: var(--text-3);
  padding: 40px 0;
}

.pagination-wrap {
  margin-top: var(--sp-4);
  display: flex;
  justify-content: flex-end;
  padding: var(--sp-4) 0 0;
}

.content-cell {
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-2);
}

.anonymous-user {
  color: var(--text-4);
  font-style: italic;
}

.modal-actions {
  display: flex;
  justify-content: space-between;
  margin-top: var(--sp-4);
  padding-top: var(--sp-4);
  border-top: 1px solid var(--border-1);
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
  
  .search-input {
    width: 100%;
  }
}
</style>
