import axios, { type AxiosError } from 'axios'
import type { InternalAxiosRequestConfig } from 'axios'
import { Message } from '@arco-design/web-vue'

let getToken: (() => string) | null = null
let onUnauthorized: (() => void) | null = null

export function setupApiInterceptors(tokenGetter: () => string, unauthHandler: () => void) {
  getToken = tokenGetter
  onUnauthorized = unauthHandler
}

const instance = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
})

instance.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken?.()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

instance.interceptors.response.use(
  (response) => {
    // 后端返回 { code, message, data }，解包返回 data 层
    const res = response.data
    if (res && typeof res === 'object' && 'code' in res) {
      if (res.code === 200) {
        return res.data
      }
      Message.error(res.message || '请求失败')
      return Promise.reject(new Error(res.message))
    }
    return res
  },
  (error: AxiosError<{ message?: string; msg?: string }>) => {
    const status = error.response?.status
    const method = (error.config?.method || 'GET').toUpperCase()
    const url = `${error.config?.baseURL ?? ''}${error.config?.url ?? ''}`

    // Try to extract meaningful message from various backends:
    // - our wrapped { message }
    // - Nest default { statusCode, message, error }
    // - plain string / html
    const raw: any = error.response?.data
    let msg =
      raw?.message ??
      raw?.msg ??
      (Array.isArray(raw?.message) ? raw.message.join('; ') : undefined) ??
      raw?.error ??
      (typeof raw === 'string' ? raw : undefined) ??
      error.message ??
      '请求失败'

    if (typeof msg === 'string') {
      msg = msg.replace(/\s+/g, ' ').trim()
      if (msg.length > 160) msg = msg.slice(0, 160) + '...'
    }

    if (error.response?.status === 401) {
      onUnauthorized?.()
    } else {
      const prefix = status ? `${status} ` : ''
      // Show endpoint so user can screenshot and we can fix fast.
      Message.error(`${prefix}${method} ${url || '(unknown url)'}：${msg}`)
    }

    // Keep details in console for debugging.
    // eslint-disable-next-line no-console
    console.error('[API ERROR]', { status, method, url, data: raw, error })

    return Promise.reject(error)
  }
)

export default instance as {
  get<T = unknown>(url: string, config?: object): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: object): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: object): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: object): Promise<T>
  delete<T = unknown>(url: string, config?: object): Promise<T>
}
