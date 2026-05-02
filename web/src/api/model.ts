import request from './index'

export type ModelType = 'text' | 'image' | 'video' | 'music' | '3d'

export interface Model {
  id: string
  modelName: string
  displayName?: string | null
  name?: string
  description?: string
  provider?: string
  type?: ModelType
  isActive?: boolean | number
  isPublic?: boolean | number
  source?: string
  capabilityTags?: string | null
  maxTokens?: number
  temperature?: number
  deductPoints?: number
}

export function getModels(params?: { type?: ModelType }): Promise<Model[]> {
  return request
    .get<Model[]>('/model/list', { params })
    .then((res: any) => (Array.isArray(res?.data) ? res.data : res))
}
