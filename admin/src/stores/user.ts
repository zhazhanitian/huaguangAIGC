import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { ProfileResult } from '../api/auth'
import { getProfile, login } from '../api/auth'
import type { LoginParams } from '../api/auth'

export const useUserStore = defineStore('user', () => {
  const userInfo = ref<ProfileResult | null>(null)
  const token = ref<string>(localStorage.getItem('admin_token') ?? '')

  async function loginAction(data: LoginParams) {
    const res = await login(data) as any
    const jwt = res?.access_token || res?.token || ''
    token.value = jwt
    localStorage.setItem('admin_token', jwt)
    if (res?.user) {
      userInfo.value = res.user as ProfileResult
    } else {
      await fetchProfile()
    }
  }

  async function fetchProfile() {
    const res = await getProfile()
    userInfo.value = res
  }

  function logout() {
    userInfo.value = null
    token.value = ''
    localStorage.removeItem('admin_token')
  }

  return {
    userInfo,
    token,
    login: loginAction,
    logout,
    fetchProfile,
  }
})
