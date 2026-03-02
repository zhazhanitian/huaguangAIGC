import request from './index'

export interface CanvasProject {
  id: string
  userId: string
  name: string
  description?: string | null
  nodeCount?: number
  updatedAt?: string
  createdAt?: string
}

export interface CanvasProjectListResponse {
  list: CanvasProject[]
  total: number
  page: number
  pageSize: number
}

export interface CanvasNode {
  id: string
  projectId: string
  title: string
  prompt: string
  status: string
  progress?: number | null
  resultUrl?: string | null
  previewUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface CanvasProjectDetailResponse {
  project: CanvasProject
  nodes: CanvasNode[]
}

export function getCanvasProjects(page = 1, pageSize = 20) {
  return request.get<CanvasProjectListResponse>('/canvas/admin/projects', {
    params: { page, pageSize },
  })
}

export function getCanvasProjectDetail(projectId: string) {
  return request.get<CanvasProjectDetailResponse>(`/canvas/project/${projectId}`)
}
