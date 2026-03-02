import request from './index'

export interface CreateMusicTaskData {
  provider?: 'suno' | 'custom'
  model: 'V4' | 'V4_5' | 'V4_5PLUS' | 'V4_5ALL' | 'V5'
  customMode: boolean
  instrumental: boolean
  title?: string
  prompt: string
  style?: string
  negativeTags?: string
  vocalGender?: 'm' | 'f'
  styleWeight?: number
  weirdnessConstraint?: number
  audioWeight?: number
  personaId?: string
  personaModel?: 'style_persona' | 'voice_persona'
}

export interface MusicTask {
  id: string
  title: string
  prompt: string
  style?: string | null
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress: number
  audioUrl?: string | null
  coverUrl?: string | null
  duration?: number | null
  errorMessage?: string | null
  params?: Record<string, unknown> | null
  createdAt: string
  updatedAt?: string
}

export interface MusicTaskListResponse {
  list: MusicTask[]
  total: number
  page: number
  pageSize: number
}

export interface MusicGalleryItem {
  id: string
  audioUrl: string
  coverUrl?: string
  title?: string
  style?: string
  authorName?: string
  authorId?: string
  prompt?: string
  duration?: number
  createdAt?: string
}

export interface MusicGalleryResponse {
  list: MusicGalleryItem[]
  total: number
  page: number
  pageSize: number
}

export function createMusicTask(data: CreateMusicTaskData) {
  return request.post<MusicTask>('/music/create', data)
}

export function getMyTasks(page = 1, pageSize = 20) {
  return request.get<MusicTaskListResponse>('/music/tasks', {
    params: { page, pageSize },
  })
}

export function getTasksStatusBatch(ids: string[]) {
  return request.get<MusicTask[]>('/music/tasks/status', {
    params: { ids: (ids || []).join(',') },
  })
}

export function getGallery(page = 1, pageSize = 20) {
  return request.get<MusicGalleryResponse>('/music/gallery', {
    params: { page, pageSize },
  })
}

export function getTaskStatus(id: string) {
  return request.get<MusicTask>(`/music/task/${id}`)
}

export function retryMusicTask(id: string) {
  return request.post<MusicTask>(`/music/task/${id}/retry`)
}

export function deleteMusicTask(id: string) {
  return request.delete(`/music/task/${id}`)
}

export type KieMusicOperation =
  | 'generate'
  | 'extend'
  | 'lyrics'
  | 'timestampLyrics'
  | 'replaceSection'
  | 'mashup'
  | 'createVideo'
  | 'separateVocals'
  | 'convertWav'
  | 'generateMidi'
  | 'uploadExtend'
  | 'uploadCover'
  | 'addVocals'
  | 'addInstrumental'
  | 'generatePersona'

export function runKieOperation(operation: KieMusicOperation, payload: Record<string, unknown>) {
  return request.post<Record<string, unknown>>(`/music/kie/run/${operation}`, payload)
}

export function queryKieOperation(operation: KieMusicOperation, taskId: string) {
  return request.get<Record<string, unknown>>(`/music/kie/query/${operation}`, {
    params: { taskId },
  })
}
