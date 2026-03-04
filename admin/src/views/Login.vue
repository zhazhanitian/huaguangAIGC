<script setup lang="ts">
import { ref, reactive, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { FormInstance } from '@arco-design/web-vue'
import { IconUser, IconLock, IconThunderbolt } from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const formRef = ref<FormInstance>()
const errorText = ref('')

const form = reactive({
  email: '',
  password: '',
})

const rules = {
  email: [
    { required: true, message: '请输入邮箱', trigger: 'blur' },
    { type: 'email', message: '请输入有效邮箱', trigger: 'blur' },
  ],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

async function handleLogin() {
  const errors = await formRef.value?.validate()
  if (errors) return
  loading.value = true
  errorText.value = ''
  try {
    await userStore.login({ email: form.email, password: form.password })
    Message.success('登录成功')
    const redirect = (route.query.redirect as string) ?? '/dashboard'
    router.push(redirect)
  } catch (e: any) {
    // 拦截器会弹 Message，这里补一条“就地错误文案”，更符合表单体验
    const msg = String(e?.message || '')
    errorText.value = msg.includes('401')
      ? '账号或密码不正确，或无管理员权限'
      : '登录失败，请检查账号、密码与网络状态'
  } finally {
    loading.value = false
  }
}

watch(
  () => [form.email, form.password],
  () => {
    if (errorText.value) errorText.value = ''
  },
)
</script>

<template>
  <div class="login-page">
    <div class="mesh-bg">
      <div class="blob blob-1" />
      <div class="blob blob-2" />
      <div class="blob blob-3" />
    </div>
    <div class="login-card glow-breathe">
      <div class="login-header">
        <div class="login-icon">
          <IconThunderbolt />
        </div>
        <h1 class="title">华光管理后台系统</h1>
        <p class="subtitle">请使用管理员账号登录</p>
      </div>
      <a-form ref="formRef" :model="form" :rules="rules" layout="vertical" size="large" class="login-form">
        <a-form-item field="email">
          <a-input v-model="form.email" placeholder="请输入管理员邮箱" allow-clear autocomplete="email" class="login-input">
            <template #prefix>
              <IconUser :size="18" class="input-icon" />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item field="password">
          <a-input-password v-model="form.password" placeholder="请输入密码" autocomplete="current-password"
            class="login-input" @keyup.enter="handleLogin">
            <template #prefix>
              <IconLock :size="18" class="input-icon" />
            </template>
          </a-input-password>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" size="large" :loading="loading" class="submit-btn btn-glow" @click="handleLogin">
            {{ loading ? '登录中...' : '登录' }}
          </a-button>
        </a-form-item>
        <div v-if="errorText" class="error-tip">
          {{ errorText }}
        </div>
      </a-form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  position: relative;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--sp-6);
  z-index: 1;
}

.login-card {
  position: relative;
  width: 100%;
  max-width: 420px;
  padding: var(--sp-10);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  backdrop-filter: var(--glass-blur);
  box-shadow: var(--shadow-lg);
  z-index: 1;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: var(--sp-8);
}

.login-icon {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-lg);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 28px;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.24), rgba(64, 128, 255, 0.18));
  color: #B2D4FF;
  margin-bottom: var(--sp-4);
}

.title {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 700;
  text-align: center;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: var(--sp-2) 0 0;
  font-size: 0.9rem;
  color: var(--text-3);
  text-align: center;
}

.login-form :deep(.arco-form-item) {
  margin-bottom: var(--sp-5);
}

.login-input :deep(.arco-input-wrapper),
.login-input :deep(.arco-input-password) {
  background: var(--bg-surface-2) !important;
  border: 1px solid var(--border-2) !important;
  border-radius: var(--radius-md) !important;
  transition: all var(--duration-normal) var(--ease-out);
}

.login-input :deep(.arco-input-wrapper:focus-within),
.login-input :deep(.arco-input-password:focus-within) {
  border-color: var(--border-focus) !important;
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.12) !important;
}

.input-icon {
  color: var(--text-3);
}

.submit-btn {
  width: 100%;
  height: 48px;
  font-size: 1rem;
  font-weight: 600;
  border-radius: var(--radius-md);
  background: var(--gradient-primary);
  border: none;
  transition: all var(--duration-normal) var(--ease-out);
}

.submit-btn:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.error-tip {
  margin-top: -8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: rgba(245, 63, 63, 0.08);
  border: 1px solid rgba(245, 63, 63, 0.18);
  color: #fecaca;
  font-size: 13px;
}
</style>
