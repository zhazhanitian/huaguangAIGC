<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { useUserStore } from '../stores/user'
import {
  IconDashboard,
  IconUser,
  IconSettings,
  IconApps,
  IconEdit,
  IconPoweroff,
  IconUserGroup,
  IconMenuFold,
  IconMenuUnfold,
  IconCloud,
  IconLock,
  IconSafe,
} from '@arco-design/web-vue/es/icon'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()
const collapsed = ref(false)

const adminName = computed(() => userStore.userInfo?.username ?? '管理员')

const menuSections = [
  {
    label: '数据',
    items: [
      { path: '/dashboard', label: '数据概览', icon: IconDashboard },
    ],
  },
  {
    label: '管理',
    items: [
      { path: '/users', label: '用户管理', icon: IconUser },
      { path: '/models', label: '模型管理', icon: IconApps },
      { path: '/apikeys', label: 'API Key', icon: IconLock },
      { path: '/canvas', label: '画布管理', icon: IconEdit },
    ],
  },
  {
    label: '系统',
    items: [
      { path: '/config', label: '系统配置', icon: IconSettings },
      { path: '/ops', label: '运维监控', icon: IconCloud },
      { path: '/badwords', label: '敏感词管理', icon: IconSafe },
    ],
  },
]

const breadcrumbItems = computed(() => {
  const path = route.path
  const names: Record<string, string> = {
    '/dashboard': '数据概览',
    '/users': '用户管理',
    '/models': '模型管理',
    '/apikeys': 'API Key 管理',
    '/config': '系统配置',
    '/ops': '运维监控',
    '/canvas': '画布管理',
    '/badwords': '敏感词管理',
  }
  return [
    { path: '/dashboard', label: '管理后台' },
    ...(names[path] ? [{ path, label: names[path] }] : []),
  ]
})

function isActive(path: string) {
  return route.path === path
}

function navigate(path: string) {
  router.push(path)
}

function handleLogout() {
  userStore.logout()
  router.push('/login')
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

function comingSoon() {
  Message.info('该功能正在规划中')
}
</script>

<template>
  <div class="admin-layout">
    <div class="mesh-bg" aria-hidden="true">
      <div class="blob blob-1" />
      <div class="blob blob-2" />
      <div class="blob blob-3" />
    </div>

    <aside class="sidebar" :class="{ collapsed }">
      <!-- Logo -->
      <div class="sb-logo" @click="navigate('/dashboard')">
        <div class="sb-logo-mark">
          <IconApps />
        </div>
        <transition name="fade-text">
          <div v-if="!collapsed" class="sb-logo-text">
            <span class="sb-logo-title">华光管理后台系统</span>
            <span class="sb-logo-sub">Admin Console</span>
          </div>
        </transition>
      </div>

      <!-- Navigation -->
      <nav class="sb-nav">
        <div v-for="section in menuSections" :key="section.label" class="sb-group">
          <div v-if="!collapsed" class="sb-group-label">{{ section.label }}</div>
          <div v-else class="sb-group-divider" />
          <a-tooltip v-for="item in section.items" :key="item.path" :content="item.label" position="right"
            :disabled="!collapsed" mini>
            <div class="sb-item" :class="{ active: isActive(item.path) }" @click="navigate(item.path)">
              <span class="sb-item-icon">
                <component :is="item.icon" />
              </span>
              <span v-if="!collapsed" class="sb-item-label">{{ item.label }}</span>
            </div>
          </a-tooltip>
        </div>
      </nav>

      <!-- Footer -->
      <div class="sb-footer">
        <transition name="fade-text">
          <div v-if="!collapsed" class="sb-user">
            <a-avatar :size="32" class="sb-user-avatar">
              {{ adminName?.charAt(0) ?? 'A' }}
            </a-avatar>
            <div class="sb-user-info">
              <div class="sb-user-name">{{ adminName }}</div>
              <div class="sb-user-role">管理员</div>
            </div>
          </div>
        </transition>
        <a-tooltip content="折叠侧栏" position="right" :disabled="!collapsed" mini>
          <button class="sb-toggle" @click="toggleCollapse">
            <component :is="collapsed ? IconMenuUnfold : IconMenuFold" />
          </button>
        </a-tooltip>
      </div>
    </aside>

    <div class="main-wrapper">
      <header class="header">
        <div class="header-left">
          <a-breadcrumb class="breadcrumb">
            <a-breadcrumb-item v-for="(item, idx) in breadcrumbItems" :key="item.path">
              <router-link v-if="idx < breadcrumbItems.length - 1" :to="item.path">
                {{ item.label }}
              </router-link>
              <span v-else>{{ item.label }}</span>
            </a-breadcrumb-item>
          </a-breadcrumb>
        </div>
        <div class="header-right">
          <a-dropdown trigger="hover" position="br">
            <a-button type="text" class="avatar-trigger">
              <a-avatar :size="34" class="avatar">
                {{ adminName?.charAt(0) ?? 'A' }}
              </a-avatar>
              <span class="admin-name">{{ adminName }}</span>
            </a-button>
            <template #content>
              <a-doption @click="comingSoon">
                <IconUserGroup /> 个人资料
              </a-doption>
              <a-doption @click="comingSoon">
                <IconSettings /> 设置
              </a-doption>
              <a-doption @click="handleLogout">
                <IconPoweroff /> 退出登录
              </a-doption>
            </template>
          </a-dropdown>
        </div>
      </header>
      <main class="content">
        <div class="content-shell">
          <router-view v-slot="{ Component }">
            <transition name="fade-slide" mode="out-in">
              <component :is="Component" />
            </transition>
          </router-view>
        </div>
      </main>
    </div>
  </div>
</template>

<style scoped>
/* ===== Layout ===== */
.admin-layout {
  display: flex;
  min-height: 100vh;
  background: var(--bg-body);
  position: relative;
}

.admin-layout>* {
  position: relative;
  z-index: 1;
}

.mesh-bg {
  position: fixed;
  inset: 0;
  overflow: hidden;
  z-index: 0;
  pointer-events: none;
}

.mesh-bg .blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(90px);
  opacity: 0.15;
  animation: meshMove 20s ease-in-out infinite;
}

.mesh-bg .blob-1 {
  width: 520px;
  height: 520px;
  background: #165DFF;
  top: -12%;
  left: -8%;
}

.mesh-bg .blob-2 {
  width: 420px;
  height: 420px;
  background: #4080FF;
  bottom: -14%;
  right: -8%;
  animation-delay: -7s;
}

.mesh-bg .blob-3 {
  width: 360px;
  height: 360px;
  background: #14C9C9;
  top: 45%;
  left: 52%;
  animation-delay: -14s;
}

/* ===== Sidebar shell ===== */
.sidebar {
  width: 240px;
  min-width: 240px;
  background: var(--bg-surface-1);
  border-right: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.28s cubic-bezier(0.16, 1, 0.3, 1), min-width 0.28s cubic-bezier(0.16, 1, 0.3, 1);
  overflow: hidden;
}

.sidebar.collapsed {
  width: 68px;
  min-width: 68px;
}

/* ===== Logo ===== */
.sb-logo {
  height: 64px;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 0 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  cursor: pointer;
  flex-shrink: 0;
}

.sidebar.collapsed .sb-logo {
  justify-content: center;
  padding: 0;
}

.sb-logo-mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.24), rgba(64, 128, 255, 0.16));
  color: #B2D4FF;
  font-size: 18px;
  flex-shrink: 0;
}

.sb-logo-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sb-logo-title {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.02em;
  background: linear-gradient(135deg, #4080FF, #14C9C9);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.sb-logo-sub {
  font-size: 10px;
  color: var(--text-4);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

/* ===== Nav ===== */
.sb-nav {
  flex: 1;
  padding: 12px 10px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.sb-group {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sb-group+.sb-group {
  margin-top: 8px;
}

.sb-group-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-4);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  padding: 8px 10px 4px;
  user-select: none;
}

.sb-group-divider {
  height: 1px;
  margin: 6px 12px 8px;
  background: rgba(255, 255, 255, 0.06);
}

/* --- Menu item --- */
.sb-item {
  display: flex;
  align-items: center;
  gap: 12px;
  height: 44px;
  padding: 0 12px;
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-3);
  transition: all 0.2s ease;
  user-select: none;
  position: relative;
}

.sidebar.collapsed .sb-item {
  justify-content: center;
  padding: 0;
}

.sb-item:hover {
  background: rgba(255, 255, 255, 0.05);
  color: var(--text-1);
}

.sb-item.active {
  background: rgba(22, 93, 255, 0.12);
  color: var(--text-1);
}

.sb-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  border-radius: 0 4px 4px 0;
  background: linear-gradient(180deg, #4080FF, #14C9C9);
}

.sb-item-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
  transition: all 0.2s ease;
}

.sb-item.active .sb-item-icon {
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.22), rgba(64, 128, 255, 0.14));
  border-color: rgba(22, 93, 255, 0.24);
  color: #B2D4FF;
  box-shadow: 0 0 12px rgba(22, 93, 255, 0.18);
}

.sb-item:hover .sb-item-icon {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.10);
}

.sb-item-label {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

/* ===== Footer ===== */
.sb-footer {
  padding: 12px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sidebar.collapsed .sb-footer {
  justify-content: center;
}

.sb-user {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sb-user-avatar {
  background: var(--gradient-primary) !important;
  color: #fff;
  flex-shrink: 0;
  font-weight: 700;
}

.sb-user-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.sb-user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-user-role {
  font-size: 11px;
  color: var(--text-4);
}

.sb-toggle {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
  color: var(--text-3);
  cursor: pointer;
  transition: all 0.2s ease;
  font-size: 16px;
  flex-shrink: 0;
}

.sb-toggle:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-1);
}

/* ===== Transition ===== */
.fade-text-enter-active {
  transition: opacity 0.2s ease 0.08s;
}

.fade-text-leave-active {
  transition: opacity 0.15s ease;
}

.fade-text-enter-from,
.fade-text-leave-to {
  opacity: 0;
}

/* ===== Main area ===== */
.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.header {
  height: 60px;
  background: var(--glass-bg);
  backdrop-filter: var(--glass-blur);
  border-bottom: 1px solid var(--glass-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--sp-6);
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
}

.breadcrumb :deep(.arco-breadcrumb-item) {
  color: var(--text-3);
  font-size: 14px;
}

.breadcrumb :deep(.arco-breadcrumb-item:last-child) {
  color: var(--text-1);
}

.breadcrumb :deep(a) {
  color: var(--text-2);
}

.breadcrumb :deep(a:hover) {
  color: var(--primary-light);
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.avatar-trigger {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  color: var(--text-2);
}

.avatar {
  background: var(--gradient-primary) !important;
  color: #fff;
  font-weight: 700;
}

.admin-name {
  font-size: 14px;
  color: var(--text-2);
}

.content {
  flex: 1;
  padding: var(--sp-6);
  overflow: auto;
}

.content-shell {
  max-width: 1240px;
  margin: 0 auto;
  width: 100%;
}
</style>
