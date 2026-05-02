import request from './index'

export interface ApiKey {
  id: string
  name: string
  provider: string
  apiKey: string
  baseUrl: string | null
  weight: number
  isActive: boolean
  usageCount: number
  remark: string | null
  createdAt: string
  updatedAt: string
}

export function getApiKeys() {
  return request.get<ApiKey[]>('/apikeys')
}

export function getActiveApiKeys() {
  return request.get<ApiKey[]>('/apikeys/active')
}

export function getApiKeysByProvider(provider: string) {
  return request.get<ApiKey[]>('/apikeys/by-provider', { params: { provider } })
}

export function createApiKey(data: {
  name: string
  provider: string
  apiKey: string
  baseUrl?: string
  weight?: number
  remark?: string
}) {
  return request.post<ApiKey>('/apikeys', data)
}

export function updateApiKey(id: string, data: Partial<ApiKey>) {
  return request.put<ApiKey>(`/apikeys/${id}`, data)
}

export function deleteApiKey(id: string) {
  return request.delete(`/apikeys/${id}`)
}
