import api from './index'

export interface TaskLogQuery {
  page?: number
  pageSize?: number
  userKeyword?: string
  status?: string
  taskType?: string
  provider?: string
  startDate?: string
  endDate?: string
}

export interface PageResult<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface UserInfo {
  username?: string
  userEmail?: string
  userPhone?: string
}

export interface DrawTaskLog extends UserInfo {
  id: string
  userId: string
  taskType: string
  provider: string
  prompt: string
  negativePrompt: string | null
  imageUrl: string | null
  status: string
  progress: number
  errorMessage: string | null
  params: Record<string, unknown> | null
  deductPoints: number
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface VideoTaskLog extends UserInfo {
  id: string
  userId: string
  taskType: string
  provider: string
  prompt: string
  imageUrl: string | null
  videoUrl: string | null
  status: string
  progress: number
  errorMessage: string | null
  duration: number | null
  params: Record<string, unknown> | null
  deductPoints: number
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface MusicTaskLog extends UserInfo {
  id: string
  userId: string
  title: string
  prompt: string
  style: string | null
  audioUrl: string | null
  coverUrl: string | null
  duration: number | null
  status: string
  progress: number
  errorMessage: string | null
  provider: string
  params: Record<string, unknown> | null
  deductPoints: number
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface Model3dTaskLog extends UserInfo {
  id: string
  userId: string
  taskType: string
  provider: string
  prompt: string
  inputImageUrl: string | null
  resultModelUrl: string | null
  resultPreviewUrl: string | null
  status: string
  progress: number
  errorMessage: string | null
  params: Record<string, unknown> | null
  deductPoints: number
  isPublic: boolean
  createdAt: string
  updatedAt: string
}

export interface ChatTaskLog extends UserInfo {
  id: string
  userId: string
  groupId: string
  role: string
  content: string
  model: string
  tokens: number
  promptTokens: number
  completionTokens: number
  status: string
  createdAt: string
}

export interface TaskLogStats {
  totalTasks: number
  totalPoints: number
  draw: { tasks: number; points: number }
  canvas: { tasks: number; points: number }
  video: { tasks: number; points: number }
  music: { tasks: number; points: number }
  model3d: { tasks: number; points: number }
  chat: { tasks: number; points: number }
}

export const getTaskLogStats = () =>
  api.get<TaskLogStats>('/admin/task-logs/stats')

export const getDrawTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<DrawTaskLog>>('/admin/task-logs/draw', { params })

export const getCanvasTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<DrawTaskLog>>('/admin/task-logs/canvas', { params })

export const getVideoTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<VideoTaskLog>>('/admin/task-logs/video', { params })

export const getMusicTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<MusicTaskLog>>('/admin/task-logs/music', { params })

export const getModel3dTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<Model3dTaskLog>>('/admin/task-logs/model3d', { params })

export const getChatTaskLogs = (params: TaskLogQuery) =>
  api.get<PageResult<ChatTaskLog>>('/admin/task-logs/chat', { params })

// ─── 导出 Excel ─────────────────────────────────────────────────────────────

type ExportTab = 'draw' | 'canvas' | 'video' | 'music' | 'model3d' | 'chat'

export async function exportTaskLogs(tab: ExportTab, params: Omit<TaskLogQuery, 'page' | 'pageSize'>) {
  const blob = await api.get<Blob>(`/admin/task-logs/export/${tab}`, {
    params,
    responseType: 'blob',
  })
  const tabNameMap: Record<ExportTab, string> = {
    draw: '生图记录',
    canvas: '画布记录',
    video: '生视频记录',
    music: '生音乐记录',
    model3d: '生3D记录',
    chat: '对话记录',
  }
  const url = URL.createObjectURL(blob as unknown as Blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${tabNameMap[tab]}_${new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
