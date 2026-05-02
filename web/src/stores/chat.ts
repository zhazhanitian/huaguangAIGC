import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ChatGroup, Message } from '../api/chat'
import {
  createGroup as createGroupApi,
  getGroups as getGroupsApi,
  deleteGroup as deleteGroupApi,
  updateGroupTitle as updateGroupTitleApi,
  sendMessage as sendMessageApi,
  sendMessageStream,
  getHistory as getHistoryApi,
} from '../api/chat'

export const useChatStore = defineStore('chat', () => {
  const groups = ref<ChatGroup[]>([])
  const currentGroup = ref<ChatGroup | null>(null)
  const messages = ref<Message[]>([])
  const loading = ref(false)
  const streaming = ref(false)
  const streamController = ref<AbortController | null>(null)
  const localDraftGroupId = ref<string | null>(null)

  async function fetchGroups() {
    loading.value = true
    try {
      const { data } = await getGroupsApi()
      groups.value = data || []
      return groups.value
    } finally {
      loading.value = false
    }
  }

  async function createGroup(title = '新对话', modelName?: string) {
    const { data } = await createGroupApi({ title, modelName })
    groups.value.unshift(data)
    currentGroup.value = data
    messages.value = []
    return data
  }

  async function deleteGroup(id: string) {
    await deleteGroupApi(id)
    groups.value = groups.value.filter((g) => g.id !== id)
    if (currentGroup.value?.id === id) {
      currentGroup.value = groups.value[0] ?? null
      messages.value = []
    }
  }

  async function fetchHistory(groupId: string, page = 1, pageSize = 20) {
    if (!groupId) return
    loading.value = true
    try {
      const { data } = await getHistoryApi(groupId, page, pageSize)
      if (currentGroup.value?.id !== groupId) return

      // 避免首次发送时，异步历史请求把本地流式消息覆盖掉（看起来像“输入后卡住/没反应”）
      const hasLocalTempMessages = messages.value.some(
        (m) => m.id.startsWith('user-') || m.id.startsWith('assistant-')
      )
      if (localDraftGroupId.value === groupId && (streaming.value || hasLocalTempMessages)) {
        return
      }

      messages.value = data?.messages ?? data?.list ?? []
    } finally {
      loading.value = false
    }
  }

  // 流式累积内容（用 ref 驱动响应式，避免高频 splice 卡顿）
  const streamingContent = ref('')
  const STREAM_FLUSH_INTERVAL_MS = 33
  const formatStreamError = (err: unknown) => {
    const raw = String((err as any)?.message || err || '').trim()
    if (!raw) return '生成失败，请重试。'
    if (raw.includes('余额不足')) return '余额不足，请先充值后再试。'
    if (raw.includes('未配置可用的 API Key')) return '当前模型未配置可用 Key，请切换模型或联系管理员。'
    return raw
  }

  async function sendMessage(
    groupId: string,
    content: string,
    modelId?: string,
    useStream = true,
    attachments?: Message['attachments']
  ) {
    localDraftGroupId.value = groupId
    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content,
      attachments,
    }
    messages.value.push(userMsg)

    if (useStream) {
      const assistantId = `assistant-${Date.now()}`
      const controller = new AbortController()
      streamController.value = controller
      streamingContent.value = ''
      messages.value.push({ id: assistantId, role: 'assistant', content: '' })
      streaming.value = true
      let pendingBuffer = ''
      let flushTimer: ReturnType<typeof setTimeout> | null = null
      let streamErrorMessage = ''

      const flushPending = () => {
        if (!pendingBuffer) return
        streamingContent.value += pendingBuffer
        pendingBuffer = ''
        const last = messages.value[messages.value.length - 1]
        if (last && last.id === assistantId) {
          last.content = streamingContent.value
        }
      }

      const scheduleFlush = () => {
        if (flushTimer) return
        flushTimer = setTimeout(() => {
          flushTimer = null
          flushPending()
        }, STREAM_FLUSH_INTERVAL_MS)
      }

      const finalizeStream = () => {
        if (flushTimer) {
          clearTimeout(flushTimer)
          flushTimer = null
        }
        flushPending()
        streaming.value = false
        streamController.value = null
        if (localDraftGroupId.value === groupId) {
          localDraftGroupId.value = null
        }
      }

      try {
        await sendMessageStream(
          { groupId, content, model: modelId, attachments },
          (chunk) => {
            if (!streaming.value) return
            pendingBuffer += chunk
            scheduleFlush()
          },
          () => {
            const last = messages.value[messages.value.length - 1]
            if (last && last.id === assistantId && !last.content.trim()) {
              last.content = '生成失败，请重试。'
            }
            finalizeStream()
          },
          (err) => {
            streamErrorMessage = formatStreamError(err)
            const last = messages.value[messages.value.length - 1]
            if (last && last.id === assistantId && !last.content.trim()) {
              last.content = streamErrorMessage
            }
            finalizeStream()
          },
          { signal: controller.signal }
        )
        if (streamErrorMessage) {
          throw new Error(streamErrorMessage)
        }
      } catch {
        const last = messages.value[messages.value.length - 1]
        if (last && last.id === assistantId && !last.content.trim()) {
          last.content = streamErrorMessage || '生成失败，请重试。'
        }
        finalizeStream()
      }
    } else {
      loading.value = true
      try {
        const { data } = await sendMessageApi({ groupId, content, model: modelId, attachments })
        if (data?.message) {
          messages.value.push(data.message)
        } else if (typeof data?.content === 'string') {
          messages.value.push({
            id: data?.logId || `assistant-${Date.now()}`,
            role: 'assistant',
            content: data.content,
          })
        }
      } finally {
        if (localDraftGroupId.value === groupId) {
          localDraftGroupId.value = null
        }
        loading.value = false
      }
    }
  }

  function setCurrentGroup(group: ChatGroup | null) {
    currentGroup.value = group
    messages.value = []
  }

  async function updateGroupTitle(groupId: string, title: string) {
    const { data } = await updateGroupTitleApi(groupId, title)
    const idx = groups.value.findIndex((g) => g.id === groupId)
    if (idx >= 0) {
      const target = groups.value[idx]
      if (target) {
        groups.value[idx] = { ...target, title: data.title }
      }
    }
    if (currentGroup.value?.id === groupId) {
      currentGroup.value = { ...currentGroup.value, title: data.title }
    }
    return data
  }

  function clearMessages() {
    messages.value = []
    localDraftGroupId.value = null
  }

  function stopStream() {
    streamController.value?.abort()
    streamController.value = null
    streaming.value = false
    localDraftGroupId.value = null
  }

  return {
    groups,
    currentGroup,
    messages,
    loading,
    streaming,
    streamingContent,
    fetchGroups,
    createGroup,
    deleteGroup,
    fetchHistory,
    sendMessage,
    updateGroupTitle,
    setCurrentGroup,
    clearMessages,
    stopStream,
  }
})
