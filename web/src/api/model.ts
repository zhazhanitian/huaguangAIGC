import request from './index'

export interface Model {
  id: string
  modelName: string
  name?: string
  provider?: string
  isActive?: boolean | number
  maxTokens?: number
  temperature?: number
  deductPoints?: number
}

export function getModels() {
  return request.get<Model[]>('/model/list')
}
