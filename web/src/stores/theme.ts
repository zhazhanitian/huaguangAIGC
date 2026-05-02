import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ResolvedTheme = 'light' | 'dark'

const STORAGE_KEY = 'theme-mode'

function isThemeMode(v: string | null): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark'
}

export const useThemeStore = defineStore('theme', () => {
  const initial = localStorage.getItem(STORAGE_KEY)
  const mode = ref<ThemeMode>(isThemeMode(initial) ? initial : 'system')
  const systemPrefersDark = ref<boolean>(window.matchMedia('(prefers-color-scheme: dark)').matches)
  const resolvedTheme = computed<ResolvedTheme>(() => {
    if (mode.value === 'system') return systemPrefersDark.value ? 'dark' : 'light'
    return mode.value
  })

  let mediaQuery: MediaQueryList | null = null
  let inited = false

  function applyTheme(theme = resolvedTheme.value) {
    document.body.setAttribute('arco-theme', theme)
    document.documentElement.style.colorScheme = theme
  }

  function setMode(next: ThemeMode) {
    mode.value = next
    localStorage.setItem(STORAGE_KEY, next)
    applyTheme()
  }

  function initTheme() {
    if (inited) {
      applyTheme()
      return
    }
    inited = true
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => {
      systemPrefersDark.value = event.matches
      if (mode.value === 'system') applyTheme()
    }
    mediaQuery.addEventListener('change', onChange)
    systemPrefersDark.value = mediaQuery.matches
    applyTheme()
  }

  return {
    mode,
    resolvedTheme,
    applyTheme,
    setMode,
    initTheme,
  }
})

