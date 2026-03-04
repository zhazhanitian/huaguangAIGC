import request from './index'

export interface RegisterData {
  username: string
  phone: string
  password: string
  email?: string
}

export interface LoginData {
  phone: string
  password: string
}

export interface AuthResponse {
  access_token: string
  token?: string
  user: {
    id: string
    username: string
    phone: string
    email?: string | null
    role?: string
    balance?: number
  }
}

export interface ProfileData {
  id: string
  username: string
  phone: string
  email?: string | null
  avatar?: string
  balance?: number
  membership?: string
  membershipExpiredAt?: string | null
  sign?: string
  createdAt?: string
}

export function register(data: RegisterData) {
  return request.post<AuthResponse>('/auth/register', data)
}

export function login(data: LoginData) {
  return request.post<AuthResponse>('/auth/login', data)
}

export function getProfile() {
  return request.get<ProfileData>('/auth/profile')
}

export function updateProfile(data: Partial<Pick<ProfileData, 'username' | 'email' | 'avatar' | 'sign'>>) {
  return request.put('/auth/profile', data)
}

export function updatePassword(data: any) {
  return request.put('/auth/password', data)
}
