import request from './index'

export interface CreateVideoTaskData {
  taskType?: 'text2video' | 'img2video'
  provider?: string
  prompt: string
  imageUrl?: string
  duration?: number
  params?: Record<string, unknown>
}

export interface VideoTask {
  id: string
  provider?: string
  taskType?: 'text2video' | 'img2video'
  prompt?: string
  status: 'pending' | 'processing' | 'completed' | 'done' | 'failed'
  progress?: number
  videoUrl?: string
  resultUrl?: string
  thumbnailUrl?: string
  error?: string
  errorMessage?: string
  duration?: number
  params?: Record<string, unknown>
  createdAt?: string
  isPublic?: boolean
}

export interface VideoTaskListResponse {
  list: VideoTask[]
  total: number
  page: number
  pageSize: number
}

export interface VideoGalleryItem {
  id: string
  videoUrl: string
  thumbnailUrl?: string
  prompt?: string
  authorName?: string
  authorId?: string
  duration?: number
  createdAt?: string
}

export interface VideoGalleryResponse {
  list: VideoGalleryItem[]
  total: number
  page: number
  pageSize: number
}

export function createVideoTask(data: CreateVideoTaskData) {
  return request.post<VideoTask>('/video/create', data)
}

export function getMyTasks(page = 1, pageSize = 20) {
  return request.get<VideoTaskListResponse>('/video/tasks', {
    params: { page, pageSize },
  })
}

export function getTasksStatusBatch(ids: string[]) {
  return request.get<VideoTask[]>('/video/tasks/status', {
    params: { ids: (ids || []).join(',') },
  })
}

export function getGallery(page = 1, pageSize = 20) {
  return request.get<VideoGalleryResponse>('/video/gallery', {
    params: { page, pageSize },
  })
}

export function getTaskStatus(id: string) {
  return request.get<VideoTask>(`/video/task/${id}`)
}

export function retryTask(id: string) {
  return request.post<VideoTask>(`/video/task/${id}/retry`)
}

export function deleteTask(id: string) {
  return request.delete(`/video/task/${id}`)
}
