import { createApp } from 'vue'
import ArcoVue from '@arco-design/web-vue'
import { Message, Notification } from '@arco-design/web-vue'
import '@arco-design/web-vue/dist/arco.css'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { setupApiInterceptors } from './api'
import { useUserStore } from './stores/user'
import './style.css'

function limitToastCount(api: Record<string, any>, methodNames: string[], maxCount: number) {
  const active: Array<{ close?: () => void }> = []
  for (const name of methodNames) {
    const orig = api[name]
    if (typeof orig !== 'function') continue
    api[name] = (...args: any[]) => {
      const handle = orig(...args)
      if (handle && typeof handle.close === 'function') {
        active.push(handle)
        if (active.length > maxCount) {
          try {
            active.shift()?.close?.()
          } catch {
            // ignore close failures
          }
        }
      }
      return handle
    }
  }
  if (typeof api.clear === 'function') {
    const origClear = api.clear.bind(api)
    api.clear = (...args: any[]) => {
      active.splice(0)
      return origClear(...args)
    }
  }
}

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)
app.use(router)

// Arco (this version) has no Message.config/maxCount; enforce max count by closing the oldest toast.
limitToastCount(Message as any, ['info', 'success', 'warning', 'error', 'loading', 'normal'], 3)
limitToastCount(Notification as any, ['info', 'success', 'warning', 'error'], 3)

setupApiInterceptors(
  () => useUserStore().token,
  () => {
    useUserStore().logout()
    router.replace('/login')
  }
)
app.use(ArcoVue)
app.mount('#app')

document.body.setAttribute('arco-theme', 'dark')
