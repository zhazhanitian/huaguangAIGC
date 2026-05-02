import { io, type Socket } from 'socket.io-client'
import { ref } from 'vue'

export type TaskModuleKey = 'draw' | 'video' | 'music' | 'model3d'
export type TaskEventType = 'task.created' | 'task.updated' | 'task.completed' | 'task.failed'

export type TaskEventPayload = {
  module: TaskModuleKey
  type: TaskEventType
  taskId: string
  status: string
  progress?: number
  errorMessage?: string | null
  updatedAt?: string

  provider?: string | null
  taskType?: string | null

  imageUrl?: string | null
  videoUrl?: string | null
  audioUrl?: string | null
  coverUrl?: string | null
  resultModelUrl?: string | null
  resultPreviewUrl?: string | null
  thumbnailUrl?: string | null
}

const socketRef = ref<Socket | null>(null)
export const realtimeConnected = ref(false)
export const realtimeLastError = ref<string | null>(null)

function getToken() {
  return localStorage.getItem('token') || ''
}

export function ensureSocket() {
  if (socketRef.value) return socketRef.value

  const s = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: false,
    auth: {
      token: getToken(),
    },
    withCredentials: true,
  })

  s.on('connect', () => {
    realtimeConnected.value = true
    realtimeLastError.value = null
  })
  s.on('disconnect', () => {
    realtimeConnected.value = false
  })
  s.on('connect_error', (err) => {
    realtimeConnected.value = false
    realtimeLastError.value = err instanceof Error ? err.message : String(err)
  })

  socketRef.value = s
  return s
}

export function connectRealtime() {
  const s = ensureSocket()
  // refresh token for reconnect
  const token = getToken()
  // No token: avoid noisy connect/disconnect loops.
  if (!token) return s
  s.auth = { token }
  if (!s.connected) s.connect()
  return s
}

export function disconnectRealtime() {
  const s = socketRef.value
  if (s && s.connected) s.disconnect()
}

export function onTaskEvent(cb: (payload: TaskEventPayload) => void) {
  const s = ensureSocket()
  const handler = (payload: TaskEventPayload) => cb(payload)
  const events: TaskEventType[] = ['task.created', 'task.updated', 'task.completed', 'task.failed']
  events.forEach((e) => s.on(e, handler))
  return () => {
    events.forEach((e) => s.off(e, handler))
  }
}

