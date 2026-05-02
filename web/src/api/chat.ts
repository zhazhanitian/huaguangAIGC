import request from './index'

export interface ChatGroup {
  id: string
  title: string
  modelId?: string
  createdAt?: string
}

export interface SendMessageData {
  groupId: string
  content: string
  model?: string
  modelId?: string
  attachments?: MessageAttachment[]
}

export interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  createdAt?: string
  attachments?: MessageAttachment[]
}

export interface SendMessageResponse {
  message?: Message
  content?: string
  logId?: string
}

export interface MessageAttachment {
  id: string
  name: string
  type: 'image' | 'document'
  size?: string
  url?: string
  mimetype?: string
}

export interface HistoryResponse {
  list?: Message[]
  messages: Message[]
  total: number
  page: number
  pageSize: number
}

export function createGroup(data: { title?: string; modelName?: string }) {
  return request.post<ChatGroup>('/chat/group', data)
}

export function getGroups() {
  return request.get<ChatGroup[]>('/chat/groups')
}

export function deleteGroup(id: string) {
  return request.delete(`/chat/group/${id}`)
}

export function updateGroupTitle(id: string, title: string) {
  return request.put<ChatGroup>(`/chat/group/${id}/title`, { title })
}

export function sendMessage(data: SendMessageData) {
  return request.post<SendMessageResponse>('/chat/send', data)
}

export async function sendMessageStream(
  data: SendMessageData,
  onChunk: (text: string) => void,
  onDone?: () => void,
  onError?: (err: Error) => void,
  options?: { signal?: AbortSignal }
) {
  const token = localStorage.getItem('token')
  try {
    const response = await fetch('/api/chat/send-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(data),
      signal: options?.signal,
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('No response body')
    }

    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      buffer = events.pop() || ''

      for (const event of events) {
        const dataLines = event
          .split('\n')
          .map((line) => line.trimStart())
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())

        if (!dataLines.length) continue
        const dataStr = dataLines.join('\n')
        if (!dataStr || dataStr === '[DONE]') continue

        try {
          const parsed = JSON.parse(dataStr)
          if (typeof parsed === 'string') {
            if (parsed) onChunk(parsed)
          } else if (typeof parsed === 'object' && parsed !== null) {
            // 后端可能通过 SSE data 返回 { error: "..." }，此时应走 onError 而不是静默吞掉
            if ('error' in parsed && parsed.error) {
              throw new Error(String(parsed.error))
            }
            const content = parsed.choices?.[0]?.delta?.content ?? parsed.content ?? parsed.text ?? ''
            if (content) onChunk(content)
          }
        } catch {
          // 优先按错误对象处理；普通非 JSON 文本仍作为 chunk
          if (dataStr.trim()) {
            try {
              const maybeErr = JSON.parse(dataStr)
              if (maybeErr && typeof maybeErr === 'object' && 'error' in maybeErr && maybeErr.error) {
                throw new Error(String(maybeErr.error))
              }
            } catch (err) {
              if (err instanceof Error && err.message) {
                throw err
              }
            }
            onChunk(dataStr)
          }
        }
      }
    }

    onDone?.()
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      onDone?.()
      return
    }
    onError?.(err instanceof Error ? err : new Error(String(err)))
  }
}

export function getHistory(groupId: string, page = 1, pageSize = 20) {
  return request.get<HistoryResponse>(`/chat/history/${groupId}`, {
    params: { page, pageSize },
  })
}
