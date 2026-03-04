import request from './index'

export interface User {
  id: string
  username: string
  phone: string
  email?: string
  role: 'user' | 'admin' | 'super'
  status: 'active' | 'banned'
  balance?: number
  createdAt?: string
}

export interface UserListParams {
  page?: number
  pageSize?: number
  keyword?: string
  role?: 'user' | 'admin' | 'super'
  status?: 'active' | 'banned'
  startDate?: string
  endDate?: string
}

export interface UserListResult {
  list: User[]
  total: number
}

export interface UpdateUserData {
  email?: string
  username?: string
  role?: 'user' | 'admin' | 'super'
  status?: 'active' | 'banned'
  balance?: number
}

export interface CreateUserData {
  phone: string
  email?: string
  password: string
  username: string
  role?: 'user' | 'admin' | 'super'
  status?: 'active' | 'banned'
  balance?: number
}

/** 后端路由: GET /api/user */
export function getUsers(params?: UserListParams) {
  return request.get<UserListResult>('/user', { params })
}

/** 后端路由: GET /api/user/:id */
export function getUser(id: string) {
  return request.get<User>(`/user/${id}`)
}

/** 后端路由: PUT /api/user/:id */
export function updateUser(id: string, data: UpdateUserData) {
  return request.put<User>(`/user/${id}`, data)
}

/** 后端路由: POST /api/user */
export function createUser(data: CreateUserData) {
  return request.post<User>('/user', data)
}

/** 后端路由: PUT /api/user/:id/status */
export function setUserStatus(id: string, status: 'active' | 'banned') {
  return request.put<User>(`/user/${id}/status`, { status })
}

/** 后端路由: DELETE /api/user/:id */
export function deleteUser(id: string) {
  return request.delete(`/user/${id}`)
}
