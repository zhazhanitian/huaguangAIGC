import request from './index'

export interface LoginParams {
  phone: string
  password: string
}

export interface LoginResult {
  token: string
  user?: {
    id: number
    username: string
    role: string
    phone: string
    email?: string
  }
}

export interface ProfileResult {
  id: number
  username: string
  phone: string
  email?: string
  role: string
  avatar?: string
}

/** 后端路由: POST /api/auth/admin/login（仅管理员，普通用户返回 401） */
export function login(data: LoginParams) {
  return request.post<LoginResult>('/auth/admin/login', data)
}

/** 后端路由: GET /api/auth/profile */
export function getProfile() {
  return request.get<ProfileResult>('/auth/profile')
}
