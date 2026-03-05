import request from './index'

export type ModelType = 'text' | 'image' | 'video' | 'music' | '3d'

export interface Model {
  id: string
  modelName: string
  provider: 'openai' | 'claude' | 'deepseek' | 'custom'
  type?: ModelType
  isActive: boolean
  description?: string | null
  deductPoints?: number
  maxTokens?: number
  temperature?: number
  topP?: number | null
  order?: number
  apiKey?: string | null
  baseUrl?: string | null
  keys?: ModelKey[]
}

export interface ModelKey {
  id: string
  apiKey: string
  baseUrl?: string
  weight?: number
  isActive: boolean
  usageCount?: number
}

export interface CreateModelData {
  modelName: string
  provider?: 'openai' | 'claude' | 'deepseek' | 'custom'
  type?: ModelType
  isActive?: boolean
  description?: string
  deductPoints?: number
  maxTokens?: number
  temperature?: number
  topP?: number
  apiKey?: string
  baseUrl?: string
  order?: number
}

export interface UpdateModelData {
  modelName?: string
  provider?: 'openai' | 'claude' | 'deepseek' | 'custom'
  type?: ModelType
  isActive?: boolean
  description?: string
  deductPoints?: number
  maxTokens?: number
  temperature?: number
  topP?: number | null
  apiKey?: string
  baseUrl?: string
  order?: number
}

export interface CreateModelKeyData {
  modelId: string
  apiKey: string
  baseUrl?: string
  weight?: number
  isActive?: boolean
}

export interface UpdateModelKeyData {
  apiKey?: string
  baseUrl?: string
  weight?: number
  isActive?: boolean
}

/** 后端路由: GET /api/model/admin/list */
export function getModels() {
  return request.get<Model[]>('/model/admin/list')
}

/** 后端路由: POST /api/model/admin/create */
export function createModel(data: CreateModelData) {
  return request.post<Model>('/model/admin/create', data)
}

/** 后端路由: PUT /api/model/admin/update/:id */
export function updateModel(id: string, data: UpdateModelData) {
  return request.put<Model>(`/model/admin/update/${id}`, data)
}

/** 后端路由: DELETE /api/model/admin/delete/:id */
export function deleteModel(id: string) {
  return request.delete(`/model/admin/delete/${id}`)
}

/** 后端路由: POST /api/model/admin/key/create */
export function createModelKey(data: CreateModelKeyData) {
  return request.post<ModelKey>('/model/admin/key/create', data)
}

/** 后端路由: PUT /api/model/admin/key/update/:id */
export function updateModelKey(id: string, data: UpdateModelKeyData) {
  return request.put<ModelKey>(`/model/admin/key/update/${id}`, data)
}

/** 后端路由: DELETE /api/model/admin/key/delete/:id */
export function deleteModelKey(id: string) {
  return request.delete(`/model/admin/key/delete/${id}`)
}

/** 后端路由: POST /api/model/admin/sync-presets */
export function syncPresetModels() {
  return request.post<{
    created: number
    updated: number
    total: number
  }>('/model/admin/sync-presets')
}
