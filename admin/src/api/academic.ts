import request from './index'

export interface College {
  id: string
  name: string
}

export interface Grade {
  id: string
  name: string
  collegeId: string
}

export interface Major {
  id: string
  name: string
  collegeId: string
  gradeId: string
}

export interface Clazz {
  id: string
  name: string
  collegeId: string
  gradeId: string
  majorId: string
}

/** 从可能被包装的响应中取出数组，保证列表接口始终返回数组 */
function unwrapList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res
  if (res && typeof res === 'object' && 'data' in (res as object)) {
    const d = (res as { data: unknown }).data
    return Array.isArray(d) ? d : []
  }
  return []
}

export async function getColleges(): Promise<College[]> {
  const res = await request.get<College[] | { code: number; data: College[] }>('/academic/colleges')
  return unwrapList<College>(res)
}

export function createCollege(data: { name: string }) {
  return request.post<College>('/academic/colleges', data)
}

export function updateCollege(id: string, data: { name: string }) {
  return request.put<College>(`/academic/colleges/${id}`, data)
}

export function deleteCollege(id: string) {
  return request.delete(`/academic/colleges/${id}`)
}

function compactParams<T extends Record<string, unknown>>(params?: T): T | undefined {
  if (!params) return undefined as any
  const result: Record<string, unknown> = {}
  Object.keys(params).forEach((key) => {
    const v = (params as Record<string, unknown>)[key]
    if (v !== undefined && v !== null && v !== '') {
      result[key] = v
    }
  })
  return result as T
}

export async function getGrades(params?: { collegeId?: string }): Promise<Grade[]> {
  const res = await request.get<Grade[] | { code: number; data: Grade[] }>('/academic/grades', {
    params: compactParams(params),
  })
  return unwrapList<Grade>(res)
}

export function createGrade(data: { name: string; collegeId: string }) {
  return request.post<Grade>('/academic/grades', data)
}

export function updateGrade(id: string, data: { name: string }) {
  return request.put<Grade>(`/academic/grades/${id}`, data)
}

export function deleteGrade(id: string) {
  return request.delete(`/academic/grades/${id}`)
}

export async function getMajors(params?: { collegeId?: string; gradeId?: string }): Promise<Major[]> {
  const res = await request.get<Major[] | { code: number; data: Major[] }>('/academic/majors', {
    params: compactParams(params),
  })
  return unwrapList<Major>(res)
}

export function createMajor(data: { name: string; collegeId: string; gradeId: string }) {
  return request.post<Major>('/academic/majors', data)
}

export function updateMajor(id: string, data: { name: string }) {
  return request.put<Major>(`/academic/majors/${id}`, data)
}

export function deleteMajor(id: string) {
  return request.delete(`/academic/majors/${id}`)
}

export async function getClasses(params?: { collegeId?: string; gradeId?: string; majorId?: string }): Promise<Clazz[]> {
  const res = await request.get<Clazz[] | { code: number; data: Clazz[] }>('/academic/classes', {
    params: compactParams(params),
  })
  return unwrapList<Clazz>(res)
}

export function createClass(data: {
  name: string
  collegeId: string
  gradeId: string
  majorId: string
}) {
  return request.post<Clazz>('/academic/classes', data)
}

export function updateClass(id: string, data: { name: string }) {
  return request.put<Clazz>(`/academic/classes/${id}`, data)
}

export function deleteClass(id: string) {
  return request.delete(`/academic/classes/${id}`)
}

