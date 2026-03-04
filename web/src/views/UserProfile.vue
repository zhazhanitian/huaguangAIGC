<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { Message } from '@arco-design/web-vue'
import type { RequestOption } from '@arco-design/web-vue'
import { IconEdit, IconPoweroff, IconLock, IconStar, IconDashboard, IconUpload } from '@arco-design/web-vue/es/icon'
import { useUserStore } from '../stores/user'
import { updateProfile, updatePassword } from '../api/auth'
import { uploadFile } from '../api/upload'

const router = useRouter()
const userStore = useUserStore()
const loading = ref(true)
const saving = ref(false)
const editing = ref(false)
const activeSection = ref('profile')
const formRef = ref()
const form = ref({ username: '', email: '', avatar: '', signature: '' })
const heroParallaxY = ref(0)
const prefersReducedMotion = ref(false)

const rules = {
  username: [
    { required: true, message: '请输入用户名' },
    { min: 2, max: 20, message: '长度在 2 - 20 个字符' }
  ],
  email: [
    { required: true, message: '请输入邮箱' },
    { type: 'email', message: '请输入正确的邮箱格式' }
  ],
  signature: [
    { maxLength: 100, message: '个性签名不能超过 100 个字符' }
  ]
}

let motionMediaQuery: MediaQueryList | null = null
let rafId = 0

function updateParallaxPosition() {
  if (prefersReducedMotion.value) {
    heroParallaxY.value = 0
    return
  }
  const scrollTop = window.scrollY || 0
  heroParallaxY.value = Math.min(22, scrollTop * 0.08)
}

function handleScrollParallax() {
  if (rafId) return
  rafId = window.requestAnimationFrame(() => {
    updateParallaxPosition()
    rafId = 0
  })
}

function handleMotionPreferenceChange(event: MediaQueryListEvent) {
  prefersReducedMotion.value = event.matches
  updateParallaxPosition()
}

const heroParallaxStyle = computed(() => ({
  '--hero-shift': `${heroParallaxY.value.toFixed(2)}px`,
}))

onMounted(async () => {
  try { const d = await userStore.fetchProfile(); syncForm(d) } catch { }
  finally { loading.value = false }

  motionMediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
  prefersReducedMotion.value = motionMediaQuery.matches
  motionMediaQuery.addEventListener('change', handleMotionPreferenceChange)
  window.addEventListener('scroll', handleScrollParallax, { passive: true })
  updateParallaxPosition()
})

onBeforeUnmount(() => {
  motionMediaQuery?.removeEventListener('change', handleMotionPreferenceChange)
  window.removeEventListener('scroll', handleScrollParallax)
  if (rafId) {
    window.cancelAnimationFrame(rafId)
    rafId = 0
  }
})

function syncForm(d: any) {
  form.value = {
    username: d?.username ?? '',
    email: d?.email ?? '',
    avatar: d?.avatar ?? '',
    signature: d?.sign ?? ''
  }
}

async function handleSave() {
  const errors = await formRef.value?.validate()
  if (errors) return
  saving.value = true
  try {
    await updateProfile({
      username: form.value.username,
      email: form.value.email,
      avatar: form.value.avatar,
      sign: form.value.signature
    })
    const d = await userStore.fetchProfile()
    syncForm(d)
    editing.value = false
    Message.success('已保存')
  } catch (e: any) {
    Message.error(e.response?.data?.message || e.message || '保存失败')
  } finally {
    saving.value = false
  }
}

function handleLogout() {
  userStore.logout()
  router.push('/login')
}

// Upload Avatar Logic
const customRequest = (option: RequestOption) => {
  const { onError, onSuccess, fileItem } = option
  const task = uploadFile(fileItem.file as File)
  task.then(res => {
    form.value.avatar = res.data.url
    onSuccess(res.data)
  }).catch(err => {
    onError(err)
  })
  return {
    abort() {
      // no-op
    }
  }
}

// Password Modal Logic
const pwdModalVisible = ref(false)
const pwdSaving = ref(false)
const pwdFormRef = ref()
const pwdForm = ref({ oldPassword: '', newPassword: '', confirmPassword: '' })
const pwdRules = {
  oldPassword: [{ required: true, message: '请输入原密码' }],
  newPassword: [
    { required: true, message: '请输入新密码' },
    { min: 6, message: '密码至少 6 位' }
  ],
  confirmPassword: [
    { required: true, message: '请确认新密码' },
    { validator: (value: string, cb: any) => { if (value !== pwdForm.value.newPassword) cb('两次输入的密码不一致'); else cb() } }
  ]
}

async function handlePwdSave() {
  const errors = await pwdFormRef.value?.validate()
  if (errors) return
  pwdSaving.value = true
  try {
    await updatePassword({ oldPassword: pwdForm.value.oldPassword, newPassword: pwdForm.value.newPassword })
    Message.success('密码修改成功，请重新登录')
    pwdModalVisible.value = false
    userStore.logout()
    router.push('/login')
  } catch (e: any) {
    Message.error(e.response?.data?.message || e.message || '修改密码失败')
  } finally {
    pwdSaving.value = false
  }
}

function openUpgrade() {
  Message.info('升级功能即将上线，敬请期待')
}

const initial = computed(() => userStore.userInfo?.username?.charAt(0)?.toUpperCase() || 'U')
const memberSince = computed(() => {
  const c = userStore.userInfo?.createdAt
  if (!c) return ''
  try {
    const d = new Date(c)
    return `${d.getFullYear()}年${d.getMonth() + 1}月加入`
  } catch {
    return ''
  }
})

const memberStatus = computed(() => {
  const exp = (userStore.userInfo as any)?.membershipExpiredAt
  if (!exp) return { label: '普通用户', desc: '未开通会员', active: false }
  const d = new Date(exp)
  if (d.getTime() < Date.now()) return { label: '已过期', desc: '会员已到期', active: false }
  return { label: 'VIP', desc: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} 到期`, active: true }
})

const balance = computed(() => Number(userStore.userInfo?.balance ?? 0))
</script>

<template>
  <div class="up">
    <!-- HERO: 紧凑横幅 -->
    <div class="hero">
      <div class="hero-parallax" :style="heroParallaxStyle" aria-hidden="true">
        <span class="hero-orb hero-orb-primary"></span>
        <span class="hero-orb hero-orb-success"></span>
        <span class="hero-orb hero-orb-warning"></span>
      </div>
      <div class="hero-bg"></div>
      <div class="hero-row">
        <div class="av-ring">
          <div class="av-c">
            <img v-if="userStore.userInfo?.avatar" :src="userStore.userInfo.avatar" />
            <span v-else>{{ initial }}</span>
          </div>
        </div>
        <div class="hero-info">
          <h1>{{ userStore.userInfo?.username || '用户' }}</h1>
          <p>{{ userStore.userInfo?.email }}<span v-if="memberSince" class="since"> · {{ memberSince }}</span></p>
        </div>
        <a-popconfirm content="确定要退出登录吗？" type="warning" @ok="handleLogout">
          <a-button type="text" class="logout-btn">
            <IconPoweroff :size="14" /> 退出
          </a-button>
        </a-popconfirm>
      </div>
    </div>

    <!-- 主体 -->
    <div class="body">
      <!-- 统计卡片 -->
      <div class="stats">
        <a-card class="stat-card" :bordered="true">
          <div class="stat-content">
            <div class="stat-icon gold">
              <IconDashboard :size="24" />
            </div>
            <div class="stat-val">{{ balance.toLocaleString() }}</div>
            <div class="stat-lbl">积分余额</div>
          </div>
        </a-card>
        <a-card class="stat-card" :bordered="true">
          <div class="stat-content">
            <div class="stat-icon" :class="memberStatus.active ? 'purple' : 'gray'">
              <IconStar :size="24" />
            </div>
            <div class="stat-val">{{ memberStatus.label }}</div>
            <div class="stat-lbl">{{ memberStatus.desc }}</div>
            <a-button v-if="!memberStatus.active" class="upgrade-tag" type="text" size="mini"
              @click="openUpgrade">升级</a-button>
          </div>
        </a-card>
      </div>

      <!-- TAB -->
      <a-tabs v-model:active-key="activeSection" class="main-tabs">
        <a-tab-pane key="profile" title="个人资料">
          <div class="pnl">
            <div class="pnl-top">
              <h3>个人资料</h3>
              <a-button v-if="!editing" type="outline" @click="editing = true">
                <IconEdit :size="15" /> 编辑
              </a-button>
            </div>
            <a-form ref="formRef" :model="form" :rules="rules" layout="vertical">
              <a-row :gutter="16">
                <a-col :span="12">
                  <a-form-item field="username" label="用户名">
                    <a-input v-model="form.username" :disabled="!editing" placeholder="你的昵称" />
                  </a-form-item>
                </a-col>
                <a-col :span="12">
                  <a-form-item field="email" label="邮箱">
                    <a-input v-model="form.email" :disabled="!editing" type="email" placeholder="email@example.com" />
                  </a-form-item>
                </a-col>
                <a-col :span="24">
                  <a-form-item field="avatar" label="头像">
                    <div class="avatar-upload-row">
                      <a-avatar v-if="form.avatar" :size="64" :image-url="form.avatar" />
                      <a-avatar v-else :size="64" class="avatar-fallback">{{ initial }}</a-avatar>
                      <a-upload v-if="editing" :custom-request="customRequest" :show-file-list="false"
                        accept="image/png, image/jpeg, image/jpg, image/webp">
                        <template #upload-button>
                          <a-button type="outline">
                            <IconUpload /> 点击上传
                          </a-button>
                        </template>
                      </a-upload>
                    </div>
                  </a-form-item>
                </a-col>
                <a-col :span="24">
                  <a-form-item field="signature" label="个性签名">
                    <a-textarea v-model="form.signature" :disabled="!editing" :rows="3" placeholder="写下你的个性签名..."
                      show-word-limit :max-length="100" />
                  </a-form-item>
                </a-col>
              </a-row>
            </a-form>
            <div v-if="editing" class="acts">
              <a-button type="primary" :loading="saving" @click="handleSave">保存修改</a-button>
              <a-button @click="editing = false; syncForm(userStore.userInfo)">取消</a-button>
            </div>
          </div>
        </a-tab-pane>
        <a-tab-pane key="security" title="安全设置">
          <div class="pnl">
            <h3 class="ph">安全设置</h3>
            <a-list :bordered="false" class="security-list">
              <a-list-item>
                <a-list-item-meta>
                  <template #avatar>
                    <div class="rw-icon">
                      <IconLock :size="20" />
                    </div>
                  </template>
                  <template #title>修改密码</template>
                  <template #description>定期修改密码，保护账号安全</template>
                </a-list-item-meta>
                <template #actions>
                  <a-button type="outline" size="small" @click="pwdModalVisible = true">修改</a-button>
                </template>
              </a-list-item>
            </a-list>
          </div>
        </a-tab-pane>
        <a-tab-pane key="about" title="关于">
          <div class="pnl">
            <h3 class="ph">关于</h3>
            <p class="abt">华光人工智能 创作平台 — 集 人工智能 对话、绘画、视频、音乐于一体的智能创作工具。</p>
            <div class="abt-l">
              <a-tag color="gray">版本 1.0.0</a-tag>
              <a href="#" class="link">服务条款</a>
              <a href="#" class="link">隐私政策</a>
            </div>
          </div>
        </a-tab-pane>
      </a-tabs>
    </div>

    <!-- 修改密码弹窗 -->
    <a-modal v-model:visible="pwdModalVisible" title="修改密码" @cancel="pwdModalVisible = false" :footer="false">
      <a-form ref="pwdFormRef" :model="pwdForm" :rules="pwdRules" layout="vertical" @submit-success="handlePwdSave">
        <a-form-item field="oldPassword" label="原密码">
          <a-input-password v-model="pwdForm.oldPassword" placeholder="请输入原密码" />
        </a-form-item>
        <a-form-item field="newPassword" label="新密码">
          <a-input-password v-model="pwdForm.newPassword" placeholder="请输入新密码（至少6位）" />
        </a-form-item>
        <a-form-item field="confirmPassword" label="确认新密码">
          <a-input-password v-model="pwdForm.confirmPassword" placeholder="请再次输入新密码" />
        </a-form-item>
        <div class="modal-acts">
          <a-button @click="pwdModalVisible = false">取消</a-button>
          <a-button type="primary" html-type="submit" :loading="pwdSaving">确认修改</a-button>
        </div>
      </a-form>
    </a-modal>
  </div>
</template>

<style scoped>
.up {
  padding-bottom: 40px;
  --up-radius-panel: 14px;
  --up-gap-section: 20px;
  --up-shadow-hero: var(--shadow-sm);
  --up-shadow-panel: var(--shadow-sm);
  --up-shadow-card-hover: var(--shadow-md);
  --profile-accent-primary: var(--color-primary-6);
  --profile-accent-success: var(--color-success-6);
  --profile-accent-warning: var(--color-warning-6);
  --profile-text-secondary: var(--color-text-2);
  --profile-text-muted: var(--color-text-3);
  --profile-text-soft: var(--color-text-4);
  --profile-border-subtle: var(--color-border);
  --profile-border-strong: var(--color-border-2);
}

:global(body[arco-theme='light']) .up {
  --up-shadow-hero: 0 8px 24px rgba(15, 23, 42, 0.08);
  --up-shadow-panel: 0 4px 14px rgba(15, 23, 42, 0.08);
  --up-shadow-card-hover: 0 10px 24px rgba(15, 23, 42, 0.12);
  --profile-text-muted: #637180;
  --profile-text-soft: #546170;
  --profile-border-subtle: rgba(6, 23, 41, 0.16);
  --profile-border-strong: rgba(6, 23, 41, 0.22);
}

:global(body[arco-theme='dark']) .up {
  --up-shadow-hero: 0 12px 30px rgba(0, 0, 0, 0.32);
  --up-shadow-panel: 0 6px 18px rgba(0, 0, 0, 0.28);
  --up-shadow-card-hover: 0 12px 28px rgba(0, 0, 0, 0.42);
  --profile-text-muted: var(--color-text-3);
  --profile-text-soft: var(--color-text-4);
  --profile-border-subtle: var(--color-border);
  --profile-border-strong: var(--color-border-2);
}

/* === HERO: 紧凑横条 === */
.hero {
  position: relative;
  overflow: hidden;
  padding: clamp(18px, 2.6vw, 24px) clamp(16px, 3vw, 32px);
  margin: 0 auto;
  max-width: 1080px;
  border: 1px solid var(--profile-border-subtle);
  border-radius: var(--up-radius-panel);
  background:
    radial-gradient(circle at 92% -30%, color-mix(in srgb, var(--profile-accent-primary) 18%, transparent), transparent 50%),
    linear-gradient(180deg, var(--color-fill-1), var(--color-bg-1));
  box-shadow: var(--up-shadow-hero);
}

.hero-row {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 18px;
}

.hero-parallax {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
  overflow: hidden;
  --hero-shift: 0px;
}

.hero-orb {
  position: absolute;
  display: block;
  border-radius: 50%;
  transform: translate3d(0, calc(var(--hero-shift) * -1), 0);
  will-change: transform;
  opacity: 0.55;
}

.hero-orb-primary {
  width: 220px;
  height: 220px;
  top: -138px;
  right: 6%;
  background: radial-gradient(circle, color-mix(in srgb, var(--profile-accent-primary) 28%, transparent), transparent 72%);
}

.hero-orb-success {
  width: 200px;
  height: 200px;
  top: -132px;
  left: 14%;
  background: radial-gradient(circle, color-mix(in srgb, var(--profile-accent-success) 18%, transparent), transparent 72%);
}

.hero-orb-warning {
  width: 170px;
  height: 170px;
  top: 14px;
  right: 28%;
  background: radial-gradient(circle, color-mix(in srgb, var(--profile-accent-warning) 16%, transparent), transparent 72%);
}

.av-ring {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  padding: 2px;
  background: color-mix(in srgb, var(--profile-accent-primary) 32%, var(--color-bg-1));
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
}

.av-c {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: var(--color-bg-3);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  font-size: 24px;
  font-weight: 700;
  color: var(--profile-accent-primary);
}

.av-c img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.hero-info {
  flex: 1;
  min-width: 0;
}

.hero-info h1 {
  margin: 0;
  font-size: clamp(1.2rem, 1.05rem + 0.7vw, 1.5rem);
  line-height: 1.2;
  font-weight: 700;
  color: var(--color-text-1);
  text-wrap: balance;
}

.hero-info p {
  margin: 6px 0 0;
  font-size: 0.87rem;
  line-height: 1.5;
  color: var(--profile-text-muted);
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}

.since {
  color: var(--profile-text-soft);
}

.logout-btn {
  color: var(--profile-text-secondary);
}

.logout-btn:hover {
  color: var(--color-danger-6);
}

/* === 主体 === */
.body {
  padding: 20px 32px 0;
  max-width: 1080px;
  margin: 0 auto;
  display: grid;
  gap: var(--up-gap-section);
}

/* === 统计卡片 2 列 或 4 列 === */
.stats {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  margin-bottom: 0;
}

.stat-card {
  background: var(--color-bg-2);
  border: 1px solid var(--profile-border-subtle);
  border-radius: var(--up-radius-panel);
  transition:
    transform var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    background-color var(--duration-fast) var(--ease-out);
}

.stat-card:hover {
  border-color: var(--profile-border-strong);
  transform: translateY(-2px);
  box-shadow: var(--up-shadow-card-hover);
}

.stat-content {
  position: relative;
  padding: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stat-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 8px;
}

.gold {
  background: color-mix(in srgb, var(--profile-accent-warning) 18%, var(--color-bg-2));
  color: var(--profile-accent-warning);
}

.purple {
  background: color-mix(in srgb, var(--profile-accent-primary) 18%, var(--color-bg-2));
  color: var(--profile-accent-primary);
}

.gray {
  background: var(--color-fill-3);
  color: var(--color-text-2);
}

.teal {
  background: color-mix(in srgb, var(--profile-accent-success) 18%, var(--color-bg-2));
  color: var(--profile-accent-success);
}

.pink {
  background: color-mix(in srgb, var(--color-danger-6) 18%, var(--color-bg-2));
  color: var(--color-danger-6);
}

.stat-val {
  font-size: clamp(1.2rem, 1.08rem + 0.55vw, 1.45rem);
  font-weight: 700;
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}

.stat-lbl {
  font-size: 0.8rem;
  color: var(--profile-text-soft);
  line-height: 1.45;
}

.upgrade-tag {
  position: absolute;
  top: 10px;
  right: 10px;
  height: 26px;
  color: var(--profile-accent-primary);
  background: color-mix(in srgb, var(--profile-accent-primary) 10%, transparent);
  border-radius: 999px;
  padding: 0 10px;
  font-size: 12px;
  font-weight: 600;
}

.upgrade-tag:hover {
  background: color-mix(in srgb, var(--color-primary-6) 16%, transparent);
}

/* === TAB === */
.main-tabs :deep(.arco-tabs-nav) {
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 0;
}

.main-tabs :deep(.arco-tabs-content) {
  padding-top: 16px;
}

.main-tabs :deep(.arco-tabs-tab) {
  font-size: 0.92rem;
  padding: 12px 20px;
}

.main-tabs :deep(.arco-tabs-tab-active) {
  color: var(--profile-accent-primary);
  font-weight: 600;
}

.main-tabs :deep(.arco-tabs-tab-active .arco-tabs-tab-title::after) {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 20px;
  right: 20px;
  height: 2px;
  background: var(--profile-accent-primary);
  border-radius: 1px;
}

/* === 面板 === */
.pnl {
  padding: clamp(18px, 2.2vw, 24px);
  border-radius: var(--up-radius-panel);
  background: var(--color-bg-1);
  border: 1px solid var(--profile-border-subtle);
  margin-bottom: 0;
  box-shadow: var(--up-shadow-panel);
}

.pnl-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  gap: 10px;
}

.pnl-top h3,
.ph {
  margin: 0;
  font-size: 1.02rem;
  line-height: 1.45;
  letter-spacing: 0.01em;
  font-weight: 600;
  color: var(--color-text-1);
}

.acts {
  display: flex;
  gap: 12px;
  margin-top: 24px;
}

.avatar-upload-row {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.avatar-fallback {
  background: color-mix(in srgb, var(--profile-accent-primary) 16%, var(--color-bg-2));
  color: var(--profile-accent-primary);
}

.modal-acts {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  margin-top: 24px;
}

.pnl-top :deep(.arco-btn),
.acts :deep(.arco-btn),
.modal-acts :deep(.arco-btn),
.security-list :deep(.arco-btn) {
  height: 36px;
  border-radius: 10px;
  padding: 0 14px;
  font-weight: 500;
}

.acts :deep(.arco-btn-primary),
.modal-acts :deep(.arco-btn-primary) {
  min-width: 96px;
}

/* 安全 */
.security-list :deep(.arco-list-item) {
  padding: 16px 18px;
  background: var(--color-bg-1);
  border-radius: 12px;
  transition:
    background-color var(--duration-fast) var(--ease-out),
    border-color var(--duration-fast) var(--ease-out),
    box-shadow var(--duration-fast) var(--ease-out);
  border: 1px solid transparent;
  margin-bottom: 8px;
}

.security-list :deep(.arco-list-item:hover) {
  background: var(--color-bg-2);
  border-color: var(--profile-border-subtle);
  box-shadow: var(--up-shadow-panel);
}

.security-list :deep(.arco-list-item:not(:last-child)) {
  margin-bottom: 8px;
}

.rw-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--profile-accent-primary) 14%, var(--color-bg-1));
  color: var(--profile-accent-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.security-list :deep(.arco-list-item-meta-title) {
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-text-1);
}

.security-list :deep(.arco-list-item-meta-description) {
  font-size: 0.78rem;
  color: var(--profile-text-soft);
  margin-top: 2px;
}

/* 关于 */
.abt {
  font-size: 0.95rem;
  color: var(--profile-text-muted);
  line-height: 1.72;
  margin: 0 0 12px;
  max-width: 64ch;
}

.abt-l {
  display: flex;
  align-items: center;
  gap: 10px 12px;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: var(--profile-text-soft);
}

.abt-l .link {
  color: var(--profile-accent-primary);
  text-decoration: none;
  font-weight: 500;
}

.abt-l .link:hover {
  text-decoration: underline;
}

/* 响应式 */
@media(max-width: 900px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media(max-width: 600px) {
  .stats {
    grid-template-columns: repeat(2, 1fr);
  }

  .hero-row {
    flex-direction: column;
    text-align: center;
  }

  .hero-info h1 {
    font-size: 1.1rem;
  }

  .body,
  .hero {
    padding-left: 16px;
    padding-right: 16px;
  }

  .pnl-top {
    flex-wrap: wrap;
  }

  .acts,
  .modal-acts {
    width: 100%;
  }

  .acts :deep(.arco-btn),
  .modal-acts :deep(.arco-btn) {
    flex: 1;
  }
}

@media(max-width: 420px) {
  .stats {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-orb {
    transform: translate3d(0, 0, 0);
  }
}
</style>
