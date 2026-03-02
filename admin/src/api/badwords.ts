import request from './index'

export interface BadWord {
  id: string
  word: string
  level: 'low' | 'medium' | 'high'
  category: string | null
  isActive: boolean
  createdAt: string
}

export interface ViolationLog {
  id: string
  userId: string | null
  username?: string  // 用户名（关联查询）
  content: string
  matchedWord: string
  action: 'warn' | 'block' | 'ban'
  createdAt: string
}

export interface BadWordListResponse {
  list: BadWord[]
  total: number
  page: number
  pageSize: number
  categories: string[]
}

export interface ViolationLogListResponse {
  list: ViolationLog[]
  total: number
  page: number
  pageSize: number
}

export interface BadWordStats {
  total: number
  lowCount: number
  mediumCount: number
  highCount: number
}

export interface FilterParams {
  keyword?: string
  level?: 'low' | 'medium' | 'high'
  category?: string
  isActive?: boolean
  page?: number
  pageSize?: number
}

export function getBadWords(params: FilterParams = {}) {
  return request.get<BadWordListResponse>('/badwords/words', {
    params: {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 50,
      keyword: params.keyword,
      level: params.level,
      category: params.category,
      isActive: params.isActive !== undefined ? String(params.isActive) : undefined,
    },
  })
}

export function getStats() {
  return request.get<BadWordStats>('/badwords/stats')
}

export function getBadWordById(id: string) {
  return request.get<BadWord>(`/badwords/word/${id}`)
}

export function addBadWord(data: { word: string; level?: 'low' | 'medium' | 'high'; category?: string }) {
  return request.post<BadWord>('/badwords/word', data)
}

export function updateBadWord(id: string, data: { word?: string; level?: 'low' | 'medium' | 'high'; category?: string; isActive?: boolean }) {
  return request.put<BadWord>(`/badwords/word/${id}`, data)
}

export function deleteBadWord(id: string) {
  return request.delete(`/badwords/word/${id}`)
}

export function getViolationLogs(page = 1, pageSize = 20) {
  return request.get<ViolationLogListResponse>('/badwords/violations', {
    params: { page, pageSize },
  })
}
