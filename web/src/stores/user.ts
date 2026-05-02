import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ProfileData } from '../api/auth'
import { login as loginApi, register as registerApi, getProfile } from '../api/auth'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<ProfileData | null>(null)
  const token = ref<string | null>(localStorage.getItem('token'))

  const isLoggedIn = computed(() => !!token.value)

  async function login(phone: string, password: string) {
    const { data } = await loginApi({ phone, password })
    const jwt = (data as { access_token?: string; token?: string; user?: unknown }).access_token
      || (data as { access_token?: string; token?: string; user?: unknown }).token
      || ''
    token.value = jwt || null
    userInfo.value = (data as { user?: ProfileData }).user as ProfileData
    if (jwt) localStorage.setItem('token', jwt)
    return data
  }

  async function register(username: string, phone: string, password: string, email?: string) {
    const { data } = await registerApi({ username, phone, password, email })
    const jwt = (data as { access_token?: string; token?: string; user?: unknown }).access_token
      || (data as { access_token?: string; token?: string; user?: unknown }).token
      || ''
    token.value = jwt || null
    userInfo.value = (data as { user?: ProfileData }).user as ProfileData
    if (jwt) localStorage.setItem('token', jwt)
    return data
  }

  function logout() {
    token.value = null
    userInfo.value = null
    localStorage.removeItem('token')
  }

  async function fetchProfile() {
    const { data } = await getProfile()
    userInfo.value = data
    return data
  }

  return {
    userInfo,
    token,
    isLoggedIn,
    login,
    register,
    logout,
    fetchProfile,
  }
})
