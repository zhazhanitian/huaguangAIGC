<script setup lang="ts">
import { ref, reactive } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import { IconUser, IconLock } from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../stores/user'

const router = useRouter()
const route = useRoute()
const userStore = useUserStore()

const loading = ref(false)
const form = reactive({
  phone: '',
  password: '',
})

const rules = {
  phone: [
    { required: true, message: '请输入手机号' },
    { minLength: 5, maxLength: 20, message: '手机号格式不正确' },
  ],
  password: [
    { required: true, message: '请输入密码' },
    { minLength: 6, message: '密码至少 6 位' },
  ],
}

const formRef = ref()

async function handleLogin() {
  if (!formRef.value) return
  try {
    const errors = await formRef.value.validate()
    if (errors) return
    loading.value = true
    await userStore.login(form.phone, form.password)
    Message.success('登录成功')
    const redirect = (route.query.redirect as string) || '/chat'
    router.push(redirect)
  } catch (err: unknown) {
    const msg =
      (err as { response?: { data?: { message?: string } } })?.response?.data
        ?.message || '登录失败'
    Message.error(msg)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <div class="mesh-bg">
      <div class="blob blob-1" />
      <div class="blob blob-2" />
      <div class="blob blob-3" />
    </div>
    <div class="login-card glow-breathe">
      <h1 class="title">华光人工智能</h1>
      <p class="subtitle">智能对话 · 创意无限</p>
      <a-form ref="formRef" :model="form" :rules="rules" layout="vertical" class="login-form">
        <a-form-item field="phone">
          <a-input v-model="form.phone" type="tel" placeholder="手机号" size="large" :disabled="loading"
            class="login-input">
            <template #prefix>
              <IconUser :size="18" class="input-icon" />
            </template>
          </a-input>
        </a-form-item>
        <a-form-item field="password">
          <a-input-password v-model="form.password" placeholder="密码" size="large" :disabled="loading"
            class="login-input" @keyup.enter="handleLogin">
            <template #prefix>
              <IconLock :size="18" class="input-icon" />
            </template>
          </a-input-password>
        </a-form-item>
        <a-form-item>
          <a-button type="primary" size="large" :loading="loading" class="submit-btn btn-glow" @click="handleLogin">
            登录
          </a-button>
        </a-form-item>
      </a-form>
      <p class="footer">
        还没有账号？
        <router-link to="/register">立即注册</router-link>
      </p>
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

.title {
  margin: 0 0 var(--sp-2);
  font-size: 2rem;
  font-weight: 700;
  text-align: center;
  background: var(--gradient-primary);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  margin: 0 0 var(--sp-8);
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
  box-shadow: 0 0 0 3px rgba(22, 93, 255, 0.15);
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

.footer {
  margin: var(--sp-6) 0 0;
  text-align: center;
  font-size: 0.9rem;
  color: var(--text-3);
}

.footer a {
  color: var(--primary-light);
  text-decoration: none;
  transition: color var(--duration-fast);
}

.footer a:hover {
  color: var(--accent-cyan);
}
</style>
