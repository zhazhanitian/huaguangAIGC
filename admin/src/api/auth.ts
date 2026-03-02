import request from './index'

export interface LoginParams {
  email: string
  password: string
}

export interface LoginResult {
  token: string
  user?: {
    id: number
    username: string
    role: string
    email?: string
  }
}

export interface ProfileResult {
  id: number
  username: string
  email?: string
  role: string
  avatar?: string
}

/** 后端路由: POST /api/auth/login */
export function login(data: LoginParams) {
  return request.post<LoginResult>('/auth/login', data)
}

/** 后端路由: GET /api/auth/profile */
export function getProfile() {
  return request.get<ProfileResult>('/auth/profile')
}
