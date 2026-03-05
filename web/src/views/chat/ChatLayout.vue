<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import {
  IconPlus, IconDelete, IconSend, IconSearch, IconEdit,
  IconCopy, IconRefresh, IconThumbUp, IconThumbDown, IconRecordStop,
  IconClose, IconFile,
} from '@arco-design/web-vue/es/icon'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import zhCn from 'dayjs/locale/zh-cn'
import { useChatStore } from '../../stores/chat'
import { useUserStore } from '../../stores/user'
import type { Model } from '../../api/model'
import type { ChatGroup, MessageAttachment } from '../../api/chat'
import MarkdownRender from '../../components/MarkdownRender.vue'
import { submitFeedback } from '../../api/feedback'
import { uploadFile } from '../../api/upload'
import huaguangLogo from '../../assets/huaguang-logo.png'

dayjs.extend(relativeTime)
dayjs.locale(zhCn)

const chatStore = useChatStore()
const userStore = useUserStore()

const msgListRef = ref<HTMLElement>()
const inputTextareaRef = ref<{ $el?: HTMLElement } | HTMLTextAreaElement | null>(null)
const inputText = ref('')
import { getModels } from '../../api/model'

const CHAT_MODEL_NAMES = [
  'gpt-5',
  'gpt-4-1106-preview',
  'claude-opus-4-5-20251101',
  'gemini-3-pro',
]
const DEFAULT_CHAT_MODEL = CHAT_MODEL_NAMES[0] ?? 'gpt-5'
const models = ref<Model[]>(
  CHAT_MODEL_NAMES.map((name) => ({ id: name, modelName: name } as Model))
)
const selectedModel = ref<string>(DEFAULT_CHAT_MODEL)

async function fetchChatModels() {
  try {
    const all = await getModels({ type: 'text' })
    if (Array.isArray(all) && all.length > 0) {
      const chatModels = all.filter(m => CHAT_MODEL_NAMES.includes(m.modelName) && m.isActive)
      if (chatModels.length > 0) {
        models.value = chatModels
      }
    }
  } catch { /* use defaults */ }
}
const searchQ = ref('')
const hoverGroup = ref<string | null>(null)
const hoverMsg = ref<string | null>(null)
const showConvPanel = ref(false)
const copiedId = ref<string | null>(null)
type MsgReaction = 'up' | 'down'
const msgReactions = ref<Record<string, MsgReaction>>({})
const reactionSending = ref<Record<string, boolean>>({})

/* 分组对话列表：今天/昨天/更早 */
const groupedConversations = computed(() => {
  const q = searchQ.value.trim().toLowerCase()
  let list = chatStore.groups
  if (q) list = list.filter(g => (g.title || '新对话').toLowerCase().includes(q))

  const today: ChatGroup[] = []
  const yesterday: ChatGroup[] = []
  const week: ChatGroup[] = []
  const older: ChatGroup[] = []
  const now = dayjs()

  for (const g of list) {
    const d = dayjs(g.createdAt)
    if (!d.isValid()) { today.push(g); continue }
    const diff = now.diff(d, 'day')
    if (diff === 0) today.push(g)
    else if (diff === 1) yesterday.push(g)
    else if (diff < 7) week.push(g)
    else older.push(g)
  }

  const groups: { label: string; items: ChatGroup[] }[] = []
  if (today.length) groups.push({ label: '今天', items: today })
  if (yesterday.length) groups.push({ label: '昨天', items: yesterday })
  if (week.length) groups.push({ label: '最近 7 天', items: week })
  if (older.length) groups.push({ label: '更早', items: older })
  return groups
})

// 欢迎页无卡片，避免 async 竞态问题

onMounted(async () => {
  await Promise.all([chatStore.fetchGroups(), fetchChatModels()])
  selectedModel.value = DEFAULT_CHAT_MODEL
  if (!chatStore.currentGroup && chatStore.groups.length === 0) {
    // 不自动创建，显示欢迎页
  }
})

function resolveCreateGroupError(err: unknown): string {
  const axiosLike = err as {
    message?: string
    response?: { status?: number; data?: { message?: string } }
  } | null
  const status = axiosLike?.response?.status
  const msg = axiosLike?.response?.data?.message || axiosLike?.message || ''
  const lower = String(msg).toLowerCase()

  if (status === 401 || lower.includes('401')) {
    return '登录已失效，请重新登录'
  }
  if (
    lower.includes('econnrefused') ||
    lower.includes('network error') ||
    lower.includes('failed to fetch')
  ) {
    return '后端服务不可用（3001），请稍后重试'
  }
  return msg || '创建对话失败'
}

watch(() => chatStore.currentGroup?.id, async (id) => {
  loadGroupReactions(id)
  if (id) {
    await chatStore.fetchHistory(id)
    nextTick(scrollBottom)
  } else { chatStore.clearMessages() }
}, { immediate: true })

// 流式内容直接取 store 的 streamingContent ref
const streamText = computed(() => chatStore.streamingContent || '')
const streamStartedAt = ref<number | null>(null)
const streamElapsedMs = ref(0)
let streamTicker: ReturnType<typeof setInterval> | null = null

function stopStreamTicker() {
  if (streamTicker) {
    clearInterval(streamTicker)
    streamTicker = null
  }
}

function startStreamTicker() {
  streamStartedAt.value = Date.now()
  streamElapsedMs.value = 0
  stopStreamTicker()
  streamTicker = setInterval(() => {
    if (!streamStartedAt.value) return
    streamElapsedMs.value = Date.now() - streamStartedAt.value
  }, 250)
}

function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

function resetInputTextareaHeight() {
  const target = inputTextareaRef.value
  if (!target) return

  const textarea =
    target instanceof HTMLTextAreaElement
      ? target
      : target.$el?.querySelector?.('textarea')

  if (textarea instanceof HTMLTextAreaElement) {
    textarea.style.height = 'auto'
  }
}

const stickToBottom = ref(true)
const showBackToBottom = computed(() => !stickToBottom.value && chatStore.messages.length > 0)
let scrollRaf = 0

watch(() => chatStore.messages.length, () => {
  nextTick(() => scrollBottom(true))
})

watch(streamText, () => {
  if (!chatStore.streaming) return
  scheduleScrollBottom()
})

watch(
  () => chatStore.streaming,
  (active) => {
    if (active) startStreamTicker()
    else {
      stopStreamTicker()
      streamStartedAt.value = null
    }
  },
  { immediate: true },
)

function scheduleScrollBottom() {
  if (scrollRaf) return
  scrollRaf = requestAnimationFrame(() => {
    scrollRaf = 0
    scrollBottom(false)
  })
}

function scrollBottom(force = false) {
  const el = msgListRef.value
  if (!el) return
  if (!force && !stickToBottom.value) return
  el.scrollTo({ top: el.scrollHeight, behavior: chatStore.streaming ? 'auto' : 'smooth' })
}

function handleMsgScroll() {
  const el = msgListRef.value
  if (!el) return
  const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = distanceToBottom < 48
}

function reactionStorageKey(groupId?: string | null) {
  const uid = (userStore.userInfo as { id?: string } | null | undefined)?.id || 'anonymous'
  return `chat:reactions:${uid}:${groupId || 'none'}`
}

function loadGroupReactions(groupId?: string | null) {
  if (!groupId) {
    msgReactions.value = {}
    return
  }
  try {
    const raw = localStorage.getItem(reactionStorageKey(groupId))
    msgReactions.value = raw ? JSON.parse(raw) : {}
  } catch {
    msgReactions.value = {}
  }
}

function saveGroupReactions(groupId?: string | null) {
  if (!groupId) return
  try {
    localStorage.setItem(reactionStorageKey(groupId), JSON.stringify(msgReactions.value))
  } catch {
    // ignore storage errors
  }
}

async function handleNewChat() {
  try {
    await chatStore.createGroup('新对话', selectedModel.value)
  } catch (err) {
    Message.error(resolveCreateGroupError(err))
  }
}

function selectGroup(g: ChatGroup) {
  chatStore.setCurrentGroup(chatStore.groups.find(x => x.id === g.id) ?? null)
}

async function deleteGroup(e: Event, id: string) {
  e.stopPropagation()
  Modal.confirm({
    title: '删除对话', content: '确定删除此对话？删除后不可恢复。',
    onOk: async () => { try { await chatStore.deleteGroup(id) } catch { /* */ } },
  })
}

async function send(prompt?: string) {
  const text = (prompt ?? inputText.value).trim()
  const pendingFiles = attachedFiles.value.slice()
  const hasAttachments = pendingFiles.length > 0
  if (!text && !hasAttachments) return
  if (chatStore.streaming || uploadingAttachments.value) return
  // 如果没有当前对话，先创建一个
  if (!chatStore.currentGroup) {
    try {
      await chatStore.createGroup('新对话', selectedModel.value)
    } catch (err) {
      Message.error(resolveCreateGroupError(err))
      return
    }
  }

  let sentAttachments: MessageAttachment[] = []
  if (hasAttachments) {
    uploadingAttachments.value = true
    try {
      const uploaded = await Promise.all(
        pendingFiles.map(async (f) => {
          const { data } = await uploadFile(f.file)
          const absUrl = data.url.startsWith('http')
            ? data.url
            : `${window.location.origin}${data.url.startsWith('/') ? data.url : `/${data.url}`}`
          return { file: f, url: absUrl }
        }),
      )
      sentAttachments = uploaded.map((it) => ({
        id: it.file.id,
        name: it.file.name,
        size: it.file.size,
        type: it.file.type,
        url: it.url,
        mimetype: it.file.file.type || undefined,
      }))
    } catch {
      Message.error('附件上传失败，请检查文件类型（图片/PDF/TXT/JSON）和大小（<=10MB）')
      uploadingAttachments.value = false
      return
    } finally {
      uploadingAttachments.value = false
    }
  }

  const attachmentNames = pendingFiles.map((f) => f.name).slice(0, 3).join('、')
  // 前端只展示用户原始输入，附件通过 attachments 字段传给后端模型
  const finalText = text || `请查看我上传的附件并进行分析：${attachmentNames}${pendingFiles.length > 3 ? ' 等' : ''}`
  inputText.value = ''
  resetInputTextareaHeight()
  for (const f of attachedFiles.value) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
  }
  attachedFiles.value = []
  try {
    await chatStore.sendMessage(
      chatStore.currentGroup!.id,
      finalText,
      selectedModel.value,
      true,
      sentAttachments
    )
  } catch (err: any) {
    const msg = err?.response?.data?.message || err?.message || ''
    if (msg.includes('敏感词') || msg.includes('sensitive')) {
      Message.error({ content: '❗ 您的消息包含敏感内容，请修改后重试', duration: 6000 })
    } else if (msg.includes('余额不足') || msg.includes('balance')) {
      Message.error({ content: '积分不足，请充值后再试', duration: 5000 })
    } else {
      Message.error(msg || '发送失败')
    }
  }
}

function stopGeneration() {
  chatStore.stopStream()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() }
}

function copyMsg(content: string, id: string) {
  navigator.clipboard.writeText(content).then(() => {
    copiedId.value = id
    setTimeout(() => { copiedId.value = null }, 2000)
  })
}

async function toggleReaction(msg: { id: string; content: string }, reaction: MsgReaction) {
  if (reactionSending.value[msg.id]) return
  const curr = msgReactions.value[msg.id]
  const next = curr === reaction ? undefined : reaction
  if (next) msgReactions.value[msg.id] = next
  else delete msgReactions.value[msg.id]
  saveGroupReactions(chatStore.currentGroup?.id)

  if (!next) {
    Message.info('已取消反馈')
    return
  }

  reactionSending.value[msg.id] = true
  try {
    const cleaned = msg.content.replace(/\s+/g, ' ').trim().slice(0, 320)
    await submitFeedback({
      type: next === 'up' ? 'suggestion' : 'bug',
      content: `[chat][${next === 'up' ? '点赞' : '点踩'}] ${cleaned || '空内容'}`,
    })
    Message.success(next === 'up' ? '已记录你的点赞' : '已记录问题反馈')
  } catch {
    Message.warning('反馈提交失败，已本地保存')
  } finally {
    reactionSending.value[msg.id] = false
  }
}

function regenerate(msgId: string) {
  // 从当前消息向前查找最近一条用户消息，避免索引偏移导致误发
  const idx = chatStore.messages.findIndex(m => m.id === msgId)
  if (idx < 0) return
  for (let i = idx - 1; i >= 0; i--) {
    const userMsg = chatStore.messages[i]
    if (userMsg?.role === 'user') {
      send(userMsg.content)
      return
    }
  }
}

const userName = computed(() => userStore.userInfo?.username?.charAt(0)?.toUpperCase() || 'U')
const isWelcome = computed(() => !chatStore.currentGroup || (chatStore.messages.length === 0 && !chatStore.loading))

/* 解析 <think> 标签：分离思考和正文 */
function parseThink(raw: string): { think: string; text: string } {
  const m = raw.match(/<think>([\s\S]*?)(<\/think>|$)/)
  if (!m) return { think: '', text: raw }
  const think = (m[1] ?? '').trim()
  const text = raw.replace(/<think>[\s\S]*?(<\/think>|$)/, '').trim()
  return { think, text }
}

/* 流式阶段实时解析，避免先显示原始 <think> 标签再重渲染 */
function parseThinkStreaming(raw: string): { think: string; text: string; inThink: boolean } {
  const openTag = '<think>'
  const closeTag = '</think>'
  const stripPartialTagTail = (input: string) => {
    const tags = [openTag, closeTag]
    for (const tag of tags) {
      for (let i = tag.length - 1; i > 0; i--) {
        const frag = tag.slice(0, i)
        if (input.endsWith(frag)) {
          return input.slice(0, -frag.length)
        }
      }
    }
    return input
  }

  const openIdx = raw.indexOf(openTag)
  if (openIdx === -1) {
    return { think: '', text: stripPartialTagTail(raw).trim(), inThink: false }
  }

  const before = raw.slice(0, openIdx)
  const afterOpen = raw.slice(openIdx + openTag.length)
  const closeIdx = afterOpen.indexOf(closeTag)

  if (closeIdx === -1) {
    return {
      think: stripPartialTagTail(afterOpen).trim(),
      text: stripPartialTagTail(before).trim(),
      inThink: true,
    }
  }

  const think = afterOpen.slice(0, closeIdx).trim()
  const afterClose = afterOpen.slice(closeIdx + closeTag.length)
  return {
    think: stripPartialTagTail(think),
    text: stripPartialTagTail(`${before}${afterClose}`).trim(),
    inThink: false,
  }
}

const streamParsed = computed(() => parseThinkStreaming(streamText.value))
const streamElapsedText = computed(() => formatElapsed(streamElapsedMs.value))
const streamStage = computed(() => {
  if (!chatStore.streaming) {
    return {
      phase: 'idle' as const,
      label: '',
      hint: '',
    }
  }
  const raw = streamText.value.trim()
  if (!raw) {
    return {
      phase: 'waiting' as const,
      label: '请求已发送，正在连接模型',
      hint: '正在建立会话与分配推理资源，请稍候...',
    }
  }
  if (streamParsed.value.inThink || (!!streamParsed.value.think && !streamParsed.value.text)) {
    return {
      phase: 'thinking' as const,
      label: '模型正在深度思考',
      hint: '正在进行推理与组织答案结构',
    }
  }
  return {
    phase: 'answering' as const,
    label: '正在生成回答',
    hint: '内容实时输出中，可随时停止生成',
  }
})

function isStreamingAssistantMsg(msg: { role: string }, index: number) {
  return msg.role === 'assistant' && chatStore.streaming && index === chatStore.messages.length - 1
}
function parsedContentByMessage(msg: { role: string; content: string }, index: number) {
  return isStreamingAssistantMsg(msg, index)
    ? streamParsed.value
    : { ...parseThink(msg.content), inThink: false }
}

/* 每条消息的折叠状态 */
const thinkExpanded = ref<Record<string, boolean>>({})

/* === 文件上传 === */
interface AttachedFile { id: string; file: File; name: string; size: string; type: 'image' | 'document'; previewUrl?: string }
const attachedFiles = ref<AttachedFile[]>([])
const fileInputRef = ref<HTMLInputElement>()
const MAX_FILES = 10
const MAX_SIZE_MB = 10
const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
  'text/plain',
  'application/json',
])
const uploadingAttachments = ref(false)

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function openFilePicker() { fileInputRef.value?.click() }

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files) return
  addFiles(Array.from(input.files))
  input.value = ''
}

function handleFileDrop(e: DragEvent) {
  e.preventDefault()
  if (!e.dataTransfer?.files) return
  addFiles(Array.from(e.dataTransfer.files))
}

function addFiles(files: File[]) {
  const remaining = MAX_FILES - attachedFiles.value.length
  if (remaining <= 0) { Message.warning(`最多添加 ${MAX_FILES} 个文件`); return }
  const toAdd = files.slice(0, remaining)
  for (const file of toAdd) {
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      Message.warning(`${file.name} 超过 ${MAX_SIZE_MB}MB 限制`)
      continue
    }
    if (!ALLOWED_MIMES.has(file.type)) {
      Message.warning(`${file.name} 文件类型不支持（仅图片/PDF/TXT/JSON）`)
      continue
    }
    const isImage = file.type.startsWith('image/')
    const item: AttachedFile = {
      id: `f-${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
      file, name: file.name,
      size: formatFileSize(file.size),
      type: isImage ? 'image' : 'document',
      previewUrl: isImage ? URL.createObjectURL(file) : undefined,
    }
    attachedFiles.value.push(item)
  }
}

function removeFile(id: string) {
  const idx = attachedFiles.value.findIndex(f => f.id === id)
  if (idx >= 0) {
    const target = attachedFiles.value[idx]
    if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
    attachedFiles.value.splice(idx, 1)
  }
}

function openAttachment(url?: string) {
  if (!url) return
  window.open(url, '_blank', 'noopener,noreferrer')
}

async function renameGroup(e: Event, g: ChatGroup) {
  e.stopPropagation()
  const next = window.prompt('输入新的会话标题', g.title || '新对话')
  if (next === null) return
  const title = next.trim()
  if (!title) {
    Message.warning('标题不能为空')
    return
  }
  try {
    await chatStore.updateGroupTitle(g.id, title)
    Message.success('标题已更新')
  } catch {
    Message.error('标题更新失败')
  }
}

onBeforeUnmount(() => {
  chatStore.stopStream()
  stopStreamTicker()
  if (scrollRaf) {
    cancelAnimationFrame(scrollRaf)
    scrollRaf = 0
  }
  for (const f of attachedFiles.value) {
    if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
  }
  for (const m of chatStore.messages) {
    for (const a of m.attachments || []) {
      if (a.url?.startsWith('blob:')) URL.revokeObjectURL(a.url)
    }
  }
})
</script>

<template>
  <div class="chat">
    <!-- ====== 顶栏 ====== -->
    <header class="topbar">
      <div class="topbar-left">
        <!-- 对话下拉选择器 -->
        <div class="conv-picker" @click="showConvPanel = !showConvPanel">
          <span class="conv-current">{{ chatStore.currentGroup?.title || '新对话' }}</span>
          <svg width="12" height="12" viewBox="0 0 12 12" class="conv-arrow" :class="{open: showConvPanel}"><path d="M3 4L6 7L9 4" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round"/></svg>
        </div>
        <a-button class="topbar-btn" type="text" @click="handleNewChat" title="新建对话"><IconPlus :size="16" /></a-button>
      </div>
      <div class="topbar-right">
        <div class="model-sel-wrap">
          <a-select v-model="selectedModel" size="small" :style="{width: '100%'}">
            <a-option v-for="m in models" :key="m.id" :value="m.modelName" :label="m.modelName">
              <div class="ui-option">
                <div class="ui-option-main">
                  <div class="ui-option-header">
                    <span class="ui-option-title">{{ m.modelName }}</span>
                    <span v-if="m.deductPoints" class="ui-option-badge">{{ m.deductPoints }}积分</span>
                  </div>
                  <div v-if="m.description" class="ui-option-desc">
                    {{ m.description }}
                  </div>
                </div>
              </div>
            </a-option>
          </a-select>
        </div>
      </div>
    </header>

    <!-- 对话列表面板（下拉展开） -->
    <Transition name="panel-slide">
      <div v-if="showConvPanel" class="conv-panel" @click.self="showConvPanel = false">
        <div class="conv-panel-inner">
          <div class="conv-search">
            <IconSearch :size="14" />
            <a-input v-model="searchQ" placeholder="搜索对话..." />
          </div>
          <div class="conv-scroll">
            <template v-for="group in groupedConversations" :key="group.label">
              <div class="conv-date">{{ group.label }}</div>
              <div
                v-for="item in group.items" :key="item.id"
                class="conv-row"
                :class="{ active: chatStore.currentGroup?.id === item.id }"
                @click="selectGroup(item); showConvPanel = false"
                @mouseenter="hoverGroup = item.id"
                @mouseleave="hoverGroup = null"
              >
                <span class="conv-name">{{ item.title || '新对话' }}</span>
                <button v-show="hoverGroup === item.id" class="conv-x" @click.stop="renameGroup($event, item)" title="重命名">
                  <IconEdit :size="13" />
                </button>
                <button v-show="hoverGroup === item.id" class="conv-x" @click.stop="deleteGroup($event, item.id)"><IconDelete :size="13" /></button>
              </div>
            </template>
            <div v-if="groupedConversations.length === 0 && searchQ" class="conv-none">无匹配</div>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ====== 主区域 ====== -->
    <main class="main">
      <!-- 消息流 -->
      <div ref="msgListRef" class="msg-scroll" @scroll="handleMsgScroll">
        <!-- 欢迎页 -->
        <div v-if="isWelcome" class="welcome">
          <div class="welcome-logo">
            <img :src="huaguangLogo" alt="华光 logo" />
          </div>
          <h1 class="welcome-title">有什么可以帮你的？</h1>
          <p class="welcome-hint">在下方输入框输入消息开始对话</p>
        </div>

        <!-- 消息列表 -->
        <template v-else>
          <div
            v-for="(msg, mi) in chatStore.messages" :key="msg.id"
            class="msg-row"
            :class="[msg.role, { hover: hoverMsg === msg.id }]"
            @mouseenter="hoverMsg = msg.id"
            @mouseleave="hoverMsg = null"
          >
            <div class="msg-inner">
              <!-- 头像 -->
              <div class="msg-avatar" :class="msg.role">
                <template v-if="msg.role === 'user'">{{ userName }}</template>
                <template v-else>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </template>
              </div>

              <!-- 内容 -->
              <div class="msg-body">
                <span class="msg-role">{{ msg.role === 'user' ? (userStore.userInfo?.username || '你') : '助手' }}</span>
                <div class="msg-content">
                  <template v-if="msg.role === 'user'">
                    <div>{{ msg.content }}</div>
                    <div v-if="msg.attachments?.length" class="msg-attachments">
                      <button
                        v-for="a in msg.attachments"
                        :key="a.id"
                        class="msg-attachment"
                        type="button"
                        @click="openAttachment(a.url)"
                      >
                        <img v-if="a.type === 'image' && a.url" :src="a.url" class="msg-attachment-image" />
                        <div v-else class="msg-attachment-file">
                          <IconFile :size="16" />
                        </div>
                        <div class="msg-attachment-meta">
                          <span class="msg-attachment-name">{{ a.name }}</span>
                          <span class="msg-attachment-size">{{ a.size || '文件' }}</span>
                        </div>
                      </button>
                    </div>
                  </template>
                  <template v-else>
                    <div
                      v-if="isStreamingAssistantMsg(msg, mi)"
                      class="stream-feedback"
                      :class="`phase-${streamStage.phase}`"
                    >
                      <div class="stream-feedback-main">
                        <span class="stream-bars" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                        <span class="stream-label">{{ streamStage.label }}</span>
                        <span class="stream-elapsed">{{ streamElapsedText }}</span>
                      </div>
                      <div class="stream-hint">{{ streamStage.hint }}</div>
                    </div>
                    <!-- 取当前显示内容 -->
                    <template v-if="true" v-for="(_,__) in [parsedContentByMessage(msg, mi)]" :key="0">
                      <!-- 深度思考折叠块 -->
                      <div v-if="_.think" class="think-box" :class="{ 'is-streaming': isStreamingAssistantMsg(msg, mi) }">
                        <button class="think-btn" :class="{ 'is-live': isStreamingAssistantMsg(msg, mi) }" @click="thinkExpanded[msg.id] = !thinkExpanded[msg.id]">
                          <span v-if="isStreamingAssistantMsg(msg, mi)" class="live-dot" />
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
                          <span>{{ isStreamingAssistantMsg(msg, mi) ? '深度思考（生成中）' : '深度思考' }}</span>
                          <svg width="12" height="12" viewBox="0 0 12 12" :class="{flip:thinkExpanded[msg.id]}"><path d="M3 4L6 7L9 4" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round"/></svg>
                        </button>
                        <div v-show="thinkExpanded[msg.id]" class="think-body" :class="{ 'is-live': isStreamingAssistantMsg(msg, mi) }">
                          <MarkdownRender :content="_.think" />
                        </div>
                      </div>
                      <!-- 正文 -->
                      <div v-if="_.text" class="live-answer" :class="{ 'is-live': isStreamingAssistantMsg(msg, mi) }">
                        <MarkdownRender :content="_.text" />
                      </div>
                      <div v-if="isStreamingAssistantMsg(msg, mi) && !_.text && !_.think" class="stream-placeholder">
                        <div class="stream-placeholder-line short" />
                        <div class="stream-placeholder-line" />
                      </div>
                      <span v-if="isStreamingAssistantMsg(msg, mi)" class="cursor" />
                    </template>
                  </template>
                </div>

                <!-- 消息操作栏（hover 显示） -->
                <div v-show="hoverMsg === msg.id && !chatStore.streaming" class="msg-actions">
                  <button class="act-btn" :class="{ copied: copiedId === msg.id }" @click.stop="copyMsg(msg.content, msg.id)">
                    <IconCopy :size="14" />
                    <span>{{ copiedId === msg.id ? '已复制' : '复制' }}</span>
                  </button>
                  <template v-if="msg.role === 'assistant'">
                    <button class="act-btn" @click.stop="regenerate(msg.id)">
                      <IconRefresh :size="14" /><span>重新生成</span>
                    </button>
                    <button
                      class="act-btn react-btn"
                      :class="{ activeUp: msgReactions[msg.id] === 'up' }"
                      :disabled="reactionSending[msg.id]"
                      @click.stop="toggleReaction(msg, 'up')"
                    >
                      <IconThumbUp :size="14" />
                      <span>{{ msgReactions[msg.id] === 'up' ? '已赞' : '点赞' }}</span>
                    </button>
                    <button
                      class="act-btn react-btn"
                      :class="{ activeDown: msgReactions[msg.id] === 'down' }"
                      :disabled="reactionSending[msg.id]"
                      @click.stop="toggleReaction(msg, 'down')"
                    >
                      <IconThumbDown :size="14" />
                      <span>{{ msgReactions[msg.id] === 'down' ? '已踩' : '点踩' }}</span>
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
      <button v-show="showBackToBottom" class="to-bottom-btn" @click="scrollBottom(true)">
        回到底部
      </button>

      <!-- ====== 输入区 ====== -->
      <div class="input-wrap" @dragover.prevent @drop="handleFileDrop">
        <div class="input-box">
          <!-- 停止生成按钮 -->
          <a-button v-if="chatStore.streaming" type="outline" size="small" @click="stopGeneration">
            <IconRecordStop :size="14" />
            <span>停止生成</span>
          </a-button>
          <div v-if="chatStore.streaming" class="stream-global-tip">
            <span class="live-dot" />
            <span>{{ streamStage.label }}</span>
            <span class="stream-global-sep">·</span>
            <span>{{ streamElapsedText }}</span>
          </div>

          <!-- 已附加的文件列表 -->
          <div v-if="attachedFiles.length > 0" class="file-list">
            <div v-for="f in attachedFiles" :key="f.id" class="file-chip">
              <img v-if="f.type === 'image' && f.previewUrl" :src="f.previewUrl" class="file-thumb" />
              <div v-else class="file-icon-box">
                <IconFile :size="16" />
              </div>
              <div class="file-info">
                <span class="file-name">{{ f.name }}</span>
                <span class="file-size">{{ f.size }}</span>
              </div>
              <a-button type="text" size="mini" @click="removeFile(f.id)"><IconClose :size="12" /></a-button>
            </div>
          </div>

          <div class="input-row">
            <a-button class="attach-btn" type="text" size="large" title="上传文件" @click="openFilePicker"><IconPlus :size="18" /></a-button>
            <a-textarea
              ref="inputTextareaRef"
              v-model="inputText"
              class="input-textarea"
              placeholder="给 华光AI 发送消息..."
              rows="1"
              :disabled="chatStore.streaming"
              @keydown="onKeydown"
              @input="(_, e) => { const t = e.target as HTMLTextAreaElement; t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 200) + 'px' }"
            />
            <a-button
              class="send"
              :disabled="(!inputText.trim() && attachedFiles.length === 0) || chatStore.streaming || uploadingAttachments"
              @click="send()"
            ><IconSend :size="18" /></a-button>
          </div>

          <input ref="fileInputRef" type="file" multiple accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml,application/pdf,text/plain,application/json" style="display:none" @change="handleFileSelect" />

          <div class="input-footer">
            <span class="input-tip">Enter 发送 · Shift+Enter 换行 · 支持图片/PDF/TXT/JSON（<=10MB）</span>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* === 全局（无侧边栏，全屏） === */
.chat { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; }

/* === 顶栏 === */
.topbar {
  flex-shrink:0; height:48px; display:flex; align-items:center; justify-content:space-between;
  padding:0 20px; border-bottom:1px solid var(--border-1); background:var(--bg-surface-1);
}
.topbar-left { display:flex; align-items:center; gap:8px; }
.conv-picker {
  display:flex; align-items:center; gap:6px; padding:6px 12px;
  background:transparent; border:1px solid var(--border-1); border-radius:var(--radius-sm);
  color:var(--text-1); font-size:14px; cursor:pointer; transition:all 0s; max-width:240px;
}
.conv-picker:hover { border-color:var(--border-3); background:var(--bg-surface-2); }
.conv-current { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:500; }
.conv-arrow { color:var(--text-4); transition:transform 0s; flex-shrink:0; }
.conv-arrow.open { transform:rotate(180deg); }
.topbar-btn {
  width:32px !important; height:32px !important; min-width:32px !important;
  padding:0 !important; border:1px solid var(--border-1) !important; border-radius:var(--radius-sm);
  background:transparent !important; color:var(--text-3); cursor:pointer;
  display:inline-flex !important; align-items:center; justify-content:center;
  transition:all 0s;
}
.topbar-btn:hover { border-color:var(--primary) !important; color:var(--primary-light); background:rgba(22, 93, 255, 0.06) !important; }
.topbar-right { display:flex; align-items:center; gap:8px; }

/* === 对话列表下拉面板 === */
.conv-panel { position:absolute; top:48px; left:0; right:0; bottom:0; z-index:20; background:rgba(0,0,0,0.3); }
.conv-panel-inner {
  width:340px; max-height:70vh; margin:8px 20px; display:flex; flex-direction:column;
  background:var(--bg-surface-1); border:1px solid var(--border-2); border-radius:var(--radius-lg);
  box-shadow:0 16px 48px rgba(0,0,0,0.3); overflow:hidden;
}
.conv-search {
  display:flex; align-items:center; gap:8px; padding:12px 16px;
  border-bottom:1px solid var(--border-1); color:var(--text-4);
}
.conv-search :deep(.arco-input-wrapper) {
  flex:1; background:transparent !important; border:none !important;
  box-shadow:none !important; padding:0 !important; border-radius:0 !important;
}
.conv-search :deep(.arco-input) {
  background:transparent; color:var(--text-1); font-size:13px; padding:0;
}
.conv-search :deep(.arco-input::placeholder) { color:var(--text-4); }
.conv-scroll { flex:1; overflow-y:auto; padding:8px; }
.conv-date { padding:8px 10px 4px; font-size:11px; font-weight:600; color:var(--text-4); text-transform:uppercase; letter-spacing:0.04em; }
.conv-row {
  display:flex; align-items:center; padding:8px 12px; border-radius:var(--radius-sm);
  cursor:pointer; transition:background 0.1s;
}
.conv-row:hover { background:var(--bg-surface-2); }
.conv-row.active { background:rgba(22, 93, 255, 0.1); }
.conv-name { flex:1; font-size:13px; color:var(--text-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.conv-row.active .conv-name { color:var(--text-1); font-weight:500; }
.conv-x { flex-shrink:0; width:22px; height:22px; border:none; background:transparent; color:var(--text-4); cursor:pointer; display:flex; align-items:center; justify-content:center; border-radius:4px; }
.conv-x:hover { background:rgba(245, 63, 63, 0.1); color:var(--accent-red); }
.conv-none { padding:24px; text-align:center; font-size:13px; color:var(--text-4); }

/* 面板进出动画 */
.panel-slide-enter-active { animation:panelIn 0s ease-out; }
.panel-slide-leave-active { animation:panelIn 0s ease-in reverse; }
@keyframes panelIn { from { opacity:0; } to { opacity:1; } }
.panel-slide-enter-active .conv-panel-inner { animation:panelSlide 0s var(--ease-out); }
.panel-slide-leave-active .conv-panel-inner { animation:panelSlide 0s ease-in reverse; }
@keyframes panelSlide { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }

/* === 主区域 === */
.main { position:relative; flex:1; display:flex; flex-direction:column; min-width:0; min-height:0; overflow:hidden; }

/* 消息滚动区 */
.msg-scroll { flex:1; min-height:0; overflow-y:auto; overflow-x:hidden; }

/* === 欢迎页 === */
.welcome { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100%; padding:var(--sp-8); }
.welcome-logo {
  width: min(160px, 38vw);
  aspect-ratio: 1 / 1;
  border-radius: 22px;
  overflow: hidden;
  border: 1px solid var(--border-2);
  background: var(--bg-surface-1);
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.28);
  margin-bottom:var(--sp-6);
}
.welcome-logo img {
  width:100%;
  height:100%;
  object-fit:cover;
  display:block;
  border-radius: inherit;
}
.welcome-title { font-size:28px; font-weight:600; color:var(--text-1); margin:0 0 var(--sp-3); }
.welcome-hint { font-size:14px; color:var(--text-4); }

/* === 消息行（ChatGPT 全宽风格）=== */
.msg-row { padding:var(--sp-6) 0; transition:background var(--duration-fast); }
.msg-row:hover { background:rgba(255,255,255,0.015); }
.msg-row.assistant { background:rgba(255,255,255,0.01); }
.msg-row.assistant:hover { background:rgba(255,255,255,0.025); }
.msg-inner {
  max-width:1080px; margin:0 auto; padding:0 var(--sp-6);
  display:flex; gap:var(--sp-4); align-items:flex-start;
}

/* 头像 */
.msg-avatar {
  flex-shrink:0; width:32px; height:32px; border-radius:var(--radius-sm);
  display:flex; align-items:center; justify-content:center;
  font-size:13px; font-weight:600;
}
.msg-avatar.user { background:var(--primary); color:#fff; }
.msg-avatar.assistant { background:var(--bg-surface-3); border:1px solid var(--border-2); color:var(--primary-light); }

/* 内容 */
.msg-body { flex:1; min-width:0; }
.msg-role { display:block; font-size:13px; font-weight:600; color:var(--text-1); margin-bottom:4px; }
.msg-content { font-size:15px; line-height:1.7; color:var(--text-1); word-break:break-word; }
.stream-feedback {
  margin-bottom: 10px;
  border: 1px solid var(--border-2);
  border-radius: 12px;
  padding: 8px 10px;
  background: rgba(49, 49, 50, 0.05);
}
.stream-feedback-main {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
}
.stream-label { color: var(--text-2); }
.stream-elapsed {
  margin-left: auto;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}
.stream-hint {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-4);
}
.stream-feedback.phase-waiting {
  border-color: rgba(56, 189, 248, 0.08);
  background: rgba(14, 116, 144, 0.16);
}
.stream-feedback.phase-thinking {
  border-color: rgba(22, 93, 255, 0.3);
  background: rgba(22, 93, 255, 0.14);
}
.stream-feedback.phase-answering {
  border-color: rgba(0, 180, 42, 0.06);
  background: rgba(6, 95, 70, 0.14);
}
.stream-bars {
  display: inline-flex;
  align-items: flex-end;
  gap: 3px;
  width: 16px;
  height: 12px;
}
.stream-bars i {
  width: 3px;
  height: 4px;
  border-radius: 99px;
  background: currentColor;
  opacity: 0.9;
  animation: streamBars 1s ease-in-out infinite;
}
.stream-bars i:nth-child(2) { animation-delay: 0.12s; }
.stream-bars i:nth-child(3) { animation-delay: 0.4s; }
.stream-feedback.phase-waiting .stream-bars { color: #38bdf8; }
.stream-feedback.phase-thinking .stream-bars { color: #B2D4FF; }
.stream-feedback.phase-answering .stream-bars { color: #00B42A; }
.streaming-plain {
  white-space: pre-wrap;
  word-break: break-word;
}
.live-answer {
  padding: 2px 0;
  animation: liveFadeIn 0.18s ease-out;
}
.msg-content :deep(pre) { margin:var(--sp-3) 0; border-radius:var(--radius-md); overflow:hidden; }
.msg-content :deep(code) { font-size:13px; }
.msg-content :deep(p) { margin:0 0 var(--sp-2); }
.msg-content :deep(p:last-child) { margin-bottom:0; }
.msg-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}
.msg-attachment {
  display: flex;
  align-items: center;
  gap: 8px;
  width: min(320px, 100%);
  padding: 8px;
  border-radius: 10px;
  border: 1px solid var(--border-2);
  background: var(--bg-surface-2);
  color: var(--text-2);
  text-align: left;
  cursor: pointer;
}
.msg-attachment:hover { border-color: var(--border-3); }
.msg-attachment-image {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  flex-shrink: 0;
}
.msg-attachment-file {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary-light);
  flex-shrink: 0;
}
.msg-attachment-meta { min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.msg-attachment-name {
  font-size: 12px;
  color: var(--text-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msg-attachment-size { font-size: 11px; color: var(--text-4); }

/* 深度思考折叠块 */
.think-box { margin-bottom:8px; border-radius:10px; border:1px solid rgba(22, 93, 255, 0.1); background:rgba(22, 93, 255, 0.03); overflow:hidden; }
.think-btn { display:flex; align-items:center; gap:6px; width:100%; padding:8px 12px; border:none; background:transparent; color:#4080FF; font-size:13px; font-weight:500; cursor:pointer; }
.think-btn:hover { background:rgba(22, 93, 255, 0.06); }
.think-btn svg.flip { transform:rotate(180deg); }
.think-btn svg:last-child { margin-left:auto; transition:transform 0s; }
.think-body { padding:0 12px 10px; font-size:13px; color:#86909C; border-top:1px solid rgba(22, 93, 255, 0.1); max-height:300px; overflow-y:auto; }
.think-body :deep(.md) { font-size:13px !important; color:#86909C !important; }
.think-body :deep(strong) { color:#B2D4FF !important; }
.think-box.is-streaming {
  border-color: rgba(22, 93, 255, 0.2);
  background: rgba(22, 93, 255, 0.05);
}
.think-live-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: #B2D4FF;
  border-bottom: 1px solid rgba(22, 93, 255, 0.15);
}
.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: #4080FF;
  box-shadow: 0 0 10px rgba(64, 128, 255, 0.3);
  animation: livePulse 1s ease-in-out infinite;
}
.think-live-body {
  padding: 10px 12px;
  font-size: 13px;
  line-height: 1.7;
  color: #86909C;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 260px;
  overflow-y: auto;
}
.stream-placeholder {
  margin-top: 6px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stream-placeholder-line {
  height: 10px;
  border-radius: 999px;
    background: linear-gradient(90deg, var(--bg-surface-2), var(--bg-surface-3), var(--bg-surface-2));
  background-size: 200% 100%;
  animation: shimmer 1.1s linear infinite;
}
.stream-placeholder-line.short {
  width: 58%;
}

/* 打字光标 */
.cursor {
  display:inline-block; width:2px; height:1.1em; background:var(--primary-light);
  margin-left:1px; animation:blink 1s step-end infinite; vertical-align:text-bottom;
}
@keyframes blink { 50%{opacity:0} }
@keyframes livePulse {
  0%, 100% { transform: scale(1); opacity: 0.5; }
  50% { transform: scale(1.5); opacity: 1; }
}
@keyframes liveFadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes streamBars {
  0%, 100% { height: 4px; opacity: 0.7; }
  50% { height: 12px; opacity: 1; }
}
@keyframes shimmer {
  from { background-position: 200% 0; }
  to { background-position: -200% 0; }
}

/* 消息操作栏 */
.msg-actions {
  display:flex; gap:2px; margin-top:var(--sp-2);
  animation:fadeUp 0s var(--ease-out);
}
@keyframes fadeUp { from{opacity:0;transform:translateY(4px)} to{opacity:1;transform:translateY(0)} }
.act-btn {
  display:flex; align-items:center; gap:4px;
  padding:4px 8px; background:transparent; border:1px solid var(--border-1);
  border-radius:6px; color:var(--text-3); font-size:12px;
  cursor:pointer; transition:all var(--duration-fast);
}
.act-btn:hover { background:var(--bg-surface-2); color:var(--text-1); border-color:var(--border-3); }
.act-btn.copied { color:var(--accent-green); border-color:var(--accent-green); }
.react-btn:disabled { opacity: 0.55; cursor: wait; }
.react-btn.activeUp { color: #22c55e; border-color: rgba(34, 197, 94, 0.35); background: rgba(34, 197, 94, 0.1); }
.react-btn.activeDown { color: #f97316; border-color: rgba(249, 115, 22, 0.35); background: rgba(249, 115, 22, 0.1); }

.to-bottom-btn {
  position: absolute;
  right: 24px;
  bottom: 112px;
  z-index: 6;
  height: 32px;
  padding: 0 12px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: rgba(42, 42, 43, 0.06);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  box-shadow: 0 8px 22px rgba(0, 0, 0, 0.08);
  transition: all var(--duration-fast);
}
.to-bottom-btn:hover {
  color: var(--text-1);
  border-color: var(--border-3);
  transform: translateY(-1px);
}

/* === 输入区（底部固定）=== */
.input-wrap {
  position: sticky;
  bottom: 0;
  z-index: 5;
  flex-shrink: 0;
  padding: var(--sp-3) var(--sp-6) var(--sp-6);
  background: var(--bg-surface-1);
  backdrop-filter: blur(6px);
}
.input-box {
  max-width:1080px; margin:0 auto; display:flex; flex-direction:column; gap:var(--sp-2);
}

/* 附件文件列表 */
.file-list {
  display:flex; flex-wrap:wrap; gap:8px; padding:0 var(--sp-2);
  margin-bottom:var(--sp-2);
}
.file-chip {
  display:flex; align-items:center; gap:8px;
  padding:6px 10px 6px 6px; background:var(--bg-surface-2);
  border:1px solid var(--border-2); border-radius:10px;
  max-width:220px; transition:border-color var(--duration-fast);
}
.file-chip:hover { border-color:var(--border-3); }
.file-thumb {
  width:36px; height:36px; border-radius:6px; object-fit:cover; flex-shrink:0;
}
.file-icon-box {
  width:36px; height:36px; border-radius:6px;
  background:rgba(22, 93, 255, 0.1); color:var(--primary-light);
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
}
.file-info { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.file-name {
  font-size:12px; font-weight:500; color:var(--text-1);
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
}
.file-size { font-size:11px; color:var(--text-4); }
.file-remove {
  width:20px; height:20px; border-radius:50%; border:none;
  background:transparent; color:var(--text-4); cursor:pointer;
  display:flex; align-items:center; justify-content:center; flex-shrink:0;
  transition:all var(--duration-fast);
}
.file-remove:hover { background:rgba(245, 63, 63, 0.1); color:var(--accent-red); }

/* 停止按钮 */
.stop-btn {
  display:flex; align-items:center; justify-content:center; gap:6px;
  align-self:center; margin-bottom:var(--sp-2);
  padding:6px 16px; background:var(--bg-surface-2); border:1px solid var(--border-2);
  border-radius:var(--radius-full); color:var(--text-2); font-size:13px;
  cursor:pointer; transition:all var(--duration-fast);
}
.stop-btn:hover { background:var(--bg-surface-3); border-color:var(--border-3); color:var(--text-1); }
.stream-global-tip {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 6px;
  margin-bottom: var(--sp-2);
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  background: rgba(49, 49, 50, 0.06);
  color: var(--text-3);
  font-size: 12px;
}
.stream-global-sep { opacity: 0; }

/* 输入框行 */
.input-row {
  display:flex; align-items:center; gap:8px;
  background:transparent; border:none;
  border-radius:0; padding:0;
  min-height:0;
}
.input-row:focus-within { box-shadow:none; }

/* Arco textarea 包装器：去除所有自带的边框/背景/padding */
.input-textarea {
  flex:1; min-width:0;
  border:none !important; background:transparent !important;
  box-shadow:none !important; padding:0 !important;
  border-radius:0 !important; min-height:0 !important;
}
.input-textarea :deep(.arco-textarea-wrapper) {
  border:1px solid var(--border-2) !important;
  background:var(--bg-surface-1) !important;
  box-shadow:none !important;
  padding:0 !important;
  display:flex;
  align-items:center;
  border-radius:18px !important;
  transition:border-color var(--duration-normal), box-shadow var(--duration-normal);
}
.input-textarea :deep(.arco-textarea-wrapper:focus-within) {
  border-color:var(--border-focus) !important;
  box-shadow:0 0 0 3px rgba(22, 93, 255, 0.1) !important;
}
.input-textarea :deep(.arco-textarea-mirror) {
  padding:8px 12px !important; min-height:0 !important;
  font-size:15px; line-height:1.5; font-family:inherit;
}
.input-textarea :deep(textarea) {
  resize:none; outline:none;
  background:transparent !important; color:var(--text-1);
  font-size:15px; line-height:1.5;
  padding:8px 12px; max-height:200px; font-family:inherit;
  border:none !important; box-shadow:none !important;
  min-height:0 !important;
}
.input-textarea :deep(textarea::placeholder) { color:var(--text-4); }
.input-textarea :deep(textarea:disabled) { opacity:0.7; }

/* 发送按钮 */
.send {
  flex-shrink:0; width:34px !important; height:34px !important;
  min-width:34px !important; padding:0 !important;
  background:var(--primary) !important; border:none !important; border-radius:50% !important;
  color:#fff !important; cursor:pointer;
  display:inline-flex !important; align-items:center; justify-content:center;
  transition:all var(--duration-normal);
}
.send:hover:not(:disabled) { background:var(--primary-light) !important; transform:scale(1.05); }
.send:disabled { opacity:0.3; cursor:default; }

/* 上传按钮 */
.attach-btn {
  flex-shrink:0; width:34px !important; height:34px !important;
  min-width:34px !important; padding:0 !important;
  color:var(--text-3) !important; border-radius:50% !important;
  border:1px solid var(--border-2) !important;
  background:var(--bg-surface-1) !important;
  display:inline-flex !important; align-items:center; justify-content:center;
}
.attach-btn:hover { color:var(--text-1) !important; background:var(--bg-surface-2) !important; border-color:var(--border-3) !important; }

/* 底部栏 */
.input-footer {
  display:flex; align-items:center; justify-content:space-between;
  padding:2px 6px 0;
}
.model-sel-wrap {
  width:220px;
  flex-shrink:0;
}
.input-tip { font-size:11px; line-height:1.4; color:var(--text-4); }

/* Light 模式对比度补丁（仅必要项） */
:global(body[arco-theme='light']) .conv-panel {
  background: rgba(15, 23, 42, 0.16);
}
:global(body[arco-theme='light']) .msg-row:hover {
  background: rgba(15, 23, 42, 0.03);
}
:global(body[arco-theme='light']) .msg-row.assistant {
  background: rgba(15, 23, 42, 0.02);
}
:global(body[arco-theme='light']) .msg-row.assistant:hover {
  background: rgba(15, 23, 42, 0.04);
}
:global(body[arco-theme='light']) .stream-feedback {
  background: rgba(15, 23, 42, 0.04);
}
:global(body[arco-theme='light']) .think-box {
  background: rgba(22, 93, 255, 0.06);
}
:global(body[arco-theme='light']) .welcome-logo {
  box-shadow: 0 12px 28px rgba(15, 23, 42, 0.14), 0 2px 8px rgba(15, 23, 42, 0.08);
}
:global(body[arco-theme='dark']) .welcome-logo {
  border-color: var(--border-3);
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.45), 0 0 18px rgba(22, 93, 255, 0.18);
}

/* === 响应式 === */
@media(max-width:768px) {
  .msg-inner { padding:0 var(--sp-4); }
  .welcome-grid { grid-template-columns:1fr; }
  .conv-panel-inner { width:calc(100% - 32px); }
}
</style>
