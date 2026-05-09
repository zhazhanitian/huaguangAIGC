import request from './index'

export interface ConfigItem {
  id?: number
  configKey: string
  configVal: string
  isPublic?: boolean
  description?: string
  createdAt?: string
}

/** 后端路由: GET /api/config/all */
export function getAllConfigs() {
  return request.get<ConfigItem[]>('/config/all')
}

/** 后端路由: POST /api/config/set */
export function setConfig(data: { configKey: string; configVal: string; description?: string }) {
  return request.post('/config/set', data)
}
