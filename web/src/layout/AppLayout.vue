<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import { computed, onMounted, watch } from 'vue'
import { connectRealtime, disconnectRealtime } from '../realtime/socket'
import huaguangLogo from '../assets/huaguang-logo.png'
import {
  IconMessage,
  IconImage,
  IconEdit,
  IconVideoCamera,
  IconMusic,
  IconApps,
  IconUser,
  IconSettings,
} from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../stores/user'
import { useThemeStore, type ThemeMode } from '../stores/theme'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const themeStore = useThemeStore()

onMounted(async () => {
  if (!userStore.token || userStore.userInfo) return
  try {
    await userStore.fetchProfile()
  } catch {
    // ignore profile fetch failure in layout
  }
})

// Keep a single realtime connection for the whole app (only when logged in).
watch(
  () => userStore.token,
  (t) => {
    if (t) connectRealtime()
    else disconnectRealtime()
  },
  { immediate: true },
)

const navItems = [
  { path: '/chat', icon: IconMessage, title: '对话' },
  { path: '/draw', icon: IconImage, title: '绘画' },
  { path: '/canvas', icon: IconEdit, title: '画布' },
  { path: '/video', icon: IconVideoCamera, title: '视频' },
  { path: '/music', icon: IconMusic, title: '音乐' },
  { path: '/model3d', icon: IconApps, title: '3D' },
  { path: '/user', icon: IconUser, title: '个人' },
]

const themeLabel = computed(() => {
  if (themeStore.mode === 'system') return '跟随系统'
  if (themeStore.mode === 'light') return '浅色模式'
  return '深色模式'
})

function isActive(path: string) {
  return route.path === path || (path !== '/chat' && route.path.startsWith(path))
}

function goTo(path: string) {
  router.push(path)
}

function handleThemeSelect(value: string | number) {
  if (value !== 'system' && value !== 'light' && value !== 'dark') return
  themeStore.setMode(value as ThemeMode)
}
</script>

<template>
  <div class="app-layout">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-icon" @click="goTo('/home')">
          <img class="brand-logo-img" :src="huaguangLogo" alt="华光 logo" />
        </div>
      </div>
      <nav class="nav-items">
        <a-tooltip
          v-for="item in navItems"
          :key="item.path"
          :content="item.title"
          position="right"
        >
          <div
            class="nav-item"
            :class="{ active: isActive(item.path) }"
            @click="goTo(item.path)"
          >
            <span v-if="isActive(item.path)" class="nav-indicator" />
            <component :is="item.icon" :size="22" />
          </div>
        </a-tooltip>
      </nav>
      <div class="sidebar-footer">
        <a-tooltip :content="`主题：${themeLabel}`" position="right">
          <a-dropdown position="right" @select="handleThemeSelect">
            <div class="nav-item theme-switch" :class="{ active: themeStore.mode !== 'system' }">
              <IconSettings :size="18" />
            </div>
            <template #content>
              <a-doption value="system">跟随系统</a-doption>
              <a-doption value="light">浅色模式</a-doption>
              <a-doption value="dark">深色模式</a-doption>
            </template>
          </a-dropdown>
        </a-tooltip>
        <div class="divider" />
        <a-tooltip content="个人中心" position="right">
          <a-avatar
            :key="userStore.userInfo?.avatar || 'avatar-fallback'"
            :size="36"
            class="user-avatar"
            :image-url="userStore.userInfo?.avatar || undefined"
            @click="goTo('/user')"
          >
            {{ userStore.userInfo?.username?.charAt(0)?.toUpperCase() || 'U' }}
          </a-avatar>
        </a-tooltip>
      </div>
    </aside>
    <main class="main-content">
      <router-view v-slot="{ Component }">
        <transition name="fade-slide" mode="out-in">
          <component :is="Component" />
        </transition>
      </router-view>
    </main>
  </div>
</template>

<style scoped>
.app-layout {
  display: flex;
  height: 100vh;
  background: var(--bg-body);
}

.sidebar {
  width: 68px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--sp-4) 0;
  background: var(--bg-surface-1);
  border-right: 1px solid var(--border-1);
}

.brand {
  margin-bottom: var(--sp-6);
}

.brand-icon {
  width: 42px;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border-radius: var(--radius-md);
  box-shadow: none;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275), box-shadow 0.4s ease;
}

.brand-icon:hover {
  transform: translateY(-2px) scale(1.05);
  box-shadow: 0 4px 12px rgba(22, 93, 255, 0.4);
}

.brand-logo-img {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  object-fit: cover;
  display: block;
}

.nav-items {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-2);
}

.nav-item {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    color var(--duration-normal) var(--ease-out),
    background var(--duration-normal) var(--ease-out),
    transform var(--duration-fast) var(--ease-spring);
}

.nav-item:hover {
  color: var(--text-1);
  background: var(--bg-surface-2);
  transform: scale(1.05);
}

.nav-item.active {
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.1);
  box-shadow: 0 0 20px rgba(22, 93, 255, 0.2);
}

.theme-switch {
  width: 36px;
  height: 36px;
}

.nav-indicator {
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 24px;
  background: var(--gradient-primary);
  border-radius: 0 2px 2px 0;
  box-shadow: 0 0 8px rgba(22, 93, 255, 0.1);
}

.sidebar-footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp-4);
  padding-top: var(--sp-4);
}

.divider {
  width: 32px;
  height: 1px;
  background: var(--border-1);
}

.user-avatar {
  cursor: pointer;
  background: var(--gradient-primary);
  color: #fff;
  transition: transform var(--duration-fast) var(--ease-spring);
}

.user-avatar:hover {
  transform: scale(1);
}

.main-content {
  flex: 1;
  min-width: 0;
  overflow: auto;
  position: relative;
}
</style>
