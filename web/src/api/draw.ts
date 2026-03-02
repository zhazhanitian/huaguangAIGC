import request from './index'

export type DrawTaskSource = 'draw' | 'canvas'

export interface CreateDrawTaskData {
  source?: DrawTaskSource
  provider?: string
  taskType?: string
  prompt: string
  negativePrompt?: string
  size?: string
  style?: string
  sourceImageUrl?: string
  params?: Record<string, unknown>
}

export interface DrawTask {
  id: string
  provider?: string
  taskType?: string
  prompt?: string
  negativePrompt?: string
  status: 'pending' | 'processing' | 'completed' | 'done' | 'failed'
  progress?: number
  imageUrl?: string
  resultUrl?: string
  thumbnailUrl?: string
  errorMessage?: string
  error?: string
  isPublic?: boolean | number
  params?: Record<string, unknown>
  createdAt?: string
}

export interface DrawTaskListResponse {
  list: DrawTask[]
  total: number
  page: number
  pageSize: number
}

export interface GalleryItem {
  id: string
  imageUrl: string
  prompt?: string
  authorName?: string
  authorId?: string
  isPublic?: boolean
  createdAt?: string
}

export interface GalleryResponse {
  list: GalleryItem[]
  total: number
  page: number
  pageSize: number
}

export function createDrawTask(data: CreateDrawTaskData) {
  return request.post<DrawTask>('/draw/task', data)
}

export function getMyTasks(page = 1, pageSize = 20, source: DrawTaskSource = 'draw') {
  return request.get<DrawTaskListResponse>('/draw/tasks', {
    params: { page, pageSize, source },
  })
}

export function getTasksStatusBatch(ids: string[]) {
  return request.get<DrawTask[]>('/draw/tasks/status', {
    params: { ids: (ids || []).join(',') },
  })
}

export function getGallery(page = 1, pageSize = 20) {
  return request.get<GalleryResponse>('/draw/gallery', {
    params: { page, pageSize },
  })
}

export function getTaskStatus(id: string) {
  return request.get<DrawTask>(`/draw/task/${id}`)
}

export function togglePublic(id: string) {
  return request.put(`/draw/task/${id}/public`)
}

export function deleteTask(id: string) {
  return request.delete(`/draw/task/${id}`)
}

export function retryTask(id: string) {
  return request.post<DrawTask>(`/draw/task/${id}/retry`)
}

export function retryAllFailedTasks(source: DrawTaskSource = 'draw') {
  return request.post<{ totalFailed: number; retried: number; skipped: number }>('/draw/tasks/retry-failed', null, {
    params: { source },
  })
}
