<script setup lang="ts">
import { ref, reactive, onMounted, computed } from 'vue'
import { Message } from '@arco-design/web-vue'
import {
  IconSettings,
  IconStar,
  IconLock,
  IconSafe,
  IconCheck,
  IconRefresh,
} from '@arco-design/web-vue/es/icon'
import { getAllConfigs, setConfig, type ConfigItem } from '../api/config'

interface ConfigField {
  key: string
  label: string
  description: string
  type: 'text' | 'number' | 'switch' | 'password' | 'textarea'
  defaultVal: string | number | boolean
  placeholder?: string
}

interface ConfigSection {
  id: string
  title: string
  subtitle: string
  icon: any
  iconColor: string
  fields: ConfigField[]
}

const sections: ConfigSection[] = [
  {
    id: 'site',
    title: '站点设置',
    subtitle: '网站基本信息与全局开关',
    icon: IconSettings,
    iconColor: '#4080FF',
    fields: [
      { key: 'siteName', label: '站点名称', description: '显示在页面标题和 Logo 旁的网站名', type: 'text', defaultVal: '华光管理后台系统', placeholder: '例如：华光管理后台系统' },
      { key: 'siteDescription', label: '站点描述', description: '用于 SEO 和分享预览的网站简介', type: 'textarea', defaultVal: '', placeholder: '一句话描述你的平台' },
      { key: 'maintenanceMode', label: '维护模式', description: '开启后前端将显示维护公告，用户无法使用生成功能', type: 'switch', defaultVal: false },
      { key: 'registerEnabled', label: '开放注册', description: '关闭后新用户将无法注册账号', type: 'switch', defaultVal: true },
    ],
  },
  {
    id: 'points',
    title: '积分设置',
    subtitle: '新用户赠送积分与各功能消耗积分',
    icon: IconStar,
    iconColor: '#FBBF24',
    fields: [
      { key: 'defaultPoints', label: '注册赠送积分', description: '新用户注册时自动获得的积分数量', type: 'number', defaultVal: 100, placeholder: '100' },
      { key: 'POINTS_PER_CHAT', label: '对话消耗', description: '每次人工智能对话扣除的积分', type: 'number', defaultVal: 1, placeholder: '1' },
      { key: 'POINTS_PER_DRAW', label: '绘画消耗', description: '每次生成图片扣除的积分', type: 'number', defaultVal: 5, placeholder: '5' },
      { key: 'POINTS_PER_VIDEO', label: '视频消耗', description: '每次生成视频扣除的积分', type: 'number', defaultVal: 10, placeholder: '10' },
      { key: 'POINTS_PER_MUSIC', label: '音乐消耗', description: '每次生成音乐扣除的积分', type: 'number', defaultVal: 5, placeholder: '5' },
      { key: 'POINTS_PER_3D', label: '3D 消耗', description: '每次生成 3D 模型扣除的积分', type: 'number', defaultVal: 10, placeholder: '10' },
    ],
  },
  {
    id: 'api',
    title: 'API 密钥',
    subtitle: '各人工智能服务商的接口地址与密钥',
    icon: IconLock,
    iconColor: '#00B42A',
    fields: [
      { key: 'GRS_API_URL', label: 'GrsAI 接口地址', description: 'GrsAI 服务的 Host 地址', type: 'text', defaultVal: 'https://grsai.dakka.com.cn', placeholder: 'https://grsai.dakka.com.cn' },
      { key: 'GRS_API_KEY', label: 'GrsAI API Key', description: 'GrsAI 的 Bearer Token', type: 'password', defaultVal: '', placeholder: 'sk-xxxx' },
      { key: 'APIMART_API_URL', label: 'Apimart 接口地址', description: 'Apimart 服务的 Host 地址', type: 'text', defaultVal: 'https://api.apimart.ai', placeholder: 'https://api.apimart.ai' },
      { key: 'APIMART_API_KEY', label: 'Apimart API Key', description: 'Apimart 的 Bearer Token', type: 'password', defaultVal: '', placeholder: 'sk-xxxx' },
      { key: 'KIE_API_KEY', label: 'Kie AI API Key', description: 'Kie 人工智能 音乐服务的 API Key', type: 'password', defaultVal: '', placeholder: 'xxxxxxxx' },
      { key: 'TENCENT_SECRET_ID', label: '腾讯云 SecretId', description: '腾讯云 API 的 SecretId，用于 3D 模型生成', type: 'password', defaultVal: '', placeholder: 'AKIDxxxx' },
      { key: 'TENCENT_SECRET_KEY', label: '腾讯云 SecretKey', description: '腾讯云 API 的 SecretKey', type: 'password', defaultVal: '', placeholder: 'xxxxxxxx' },
    ],
  },
  {
    id: 'security',
    title: '安全设置',
    subtitle: 'JWT 令牌与访问控制',
    icon: IconSafe,
    iconColor: '#f87171',
    fields: [
      { key: 'JWT_EXPIRE_HOURS', label: 'Token 有效期（小时）', description: '用户登录后 JWT 令牌的有效时长', type: 'number', defaultVal: 72, placeholder: '72' },
      { key: 'MAX_LOGIN_ATTEMPTS', label: '登录尝试上限', description: '连续失败后锁定账号的最大尝试次数，0 表示不限制', type: 'number', defaultVal: 0, placeholder: '0 = 不限制' },
    ],
  },
]

const allFieldKeys = sections.flatMap(s => s.fields.map(f => f.key))

const loading = ref(false)
const saveLoading = ref(false)
const activeSection = ref('site')
const configForm = reactive<Record<string, string | number | boolean>>({})
const savedSnapshot = ref<Record<string, string | number | boolean>>({})

for (const section of sections) {
  for (const f of section.fields) {
    configForm[f.key] = f.defaultVal
  }
}

const hasChanges = computed(() => {
  return allFieldKeys.some(k => String(configForm[k]) !== String(savedSnapshot.value[k] ?? ''))
})

function parseVal(raw: string, type: string): string | number | boolean {
  if (type === 'switch') return raw === 'true'
  if (type === 'number') { const n = Number(raw); return Number.isNaN(n) ? 0 : n }
  return raw
}

function toDbVal(val: string | number | boolean | undefined): string {
  return String(val ?? '')
}

async function fetchConfigs() {
  loading.value = true
  try {
    const res = await getAllConfigs()
    const list: ConfigItem[] = Array.isArray(res) ? res : []
    const map = new Map(list.map(c => [c.configKey, c.configVal]))

    for (const section of sections) {
      for (const f of section.fields) {
        if (map.has(f.key)) {
          configForm[f.key] = parseVal(map.get(f.key)!, f.type)
        }
      }
    }
    savedSnapshot.value = { ...configForm }
  } catch {
    Message.warning('配置加载失败，显示默认值')
  } finally {
    loading.value = false
  }
}

onMounted(fetchConfigs)

async function handleSave() {
  saveLoading.value = true
  try {
    const promises = allFieldKeys
      .filter(k => String(configForm[k]) !== String(savedSnapshot.value[k] ?? ''))
      .map(k => {
        const field = sections.flatMap(s => s.fields).find(f => f.key === k)
        return setConfig({
          configKey: k,
          configVal: toDbVal(configForm[k]),
          description: field?.description,
        })
      })

    if (promises.length === 0) {
      Message.info('没有需要保存的更改')
      saveLoading.value = false
      return
    }

    await Promise.all(promises)
    savedSnapshot.value = { ...configForm }
    Message.success(`已保存 ${promises.length} 项配置`)
  } catch {
    Message.error('保存失败，请重试')
  } finally {
    saveLoading.value = false
  }
}

function handleReset() {
  for (const k of allFieldKeys) {
    configForm[k] = savedSnapshot.value[k] ?? sections.flatMap(s => s.fields).find(f => f.key === k)?.defaultVal ?? ''
  }
  Message.info('已还原为上次保存的状态')
}
</script>

<template>
  <div class="cfg-page">
    <!-- Header -->
    <div class="glow-card cfg-header">
      <div class="cfg-header-left">
        <div class="cfg-header-icon">
          <IconSettings />
        </div>
        <div>
          <h2 class="cfg-title">系统配置</h2>
          <p class="cfg-subtitle">管理平台的全局设置、积分规则和 API 密钥</p>
        </div>
      </div>
      <div class="cfg-actions">
        <a-button :disabled="!hasChanges" @click="handleReset">
          <template #icon>
            <IconRefresh />
          </template>
          还原
        </a-button>
        <a-button type="primary" :loading="saveLoading" :disabled="!hasChanges" class="save-btn" @click="handleSave">
          <template #icon>
            <IconCheck />
          </template>
          {{ saveLoading ? '保存中...' : '保存更改' }}
        </a-button>
      </div>
    </div>

    <a-spin :loading="loading" class="cfg-spin">
      <div class="cfg-body">
        <!-- Section tabs -->
        <div class="glow-card cfg-tabs">
          <div v-for="s in sections" :key="s.id" class="cfg-tab" :class="{ active: activeSection === s.id }"
            @click="activeSection = s.id">
            <span class="cfg-tab-icon" :style="{ color: s.iconColor }">
              <component :is="s.icon" />
            </span>
            <span class="cfg-tab-text">
              <span class="cfg-tab-title">{{ s.title }}</span>
              <span class="cfg-tab-sub">{{ s.subtitle }}</span>
            </span>
          </div>
        </div>

        <!-- Form content -->
        <div class="glow-card cfg-form-area">
          <template v-for="s in sections" :key="s.id">
            <div v-show="activeSection === s.id" class="cfg-section">
              <div class="cfg-section-head">
                <span class="cfg-section-icon" :style="{ background: s.iconColor + '18', color: s.iconColor }">
                  <component :is="s.icon" />
                </span>
                <div>
                  <h3 class="cfg-section-title">{{ s.title }}</h3>
                  <p class="cfg-section-sub">{{ s.subtitle }}</p>
                </div>
              </div>
              <div class="cfg-fields">
                <div v-for="f in s.fields" :key="f.key" class="cfg-field">
                  <div class="cfg-field-info">
                    <label class="cfg-field-label">{{ f.label }}</label>
                    <p class="cfg-field-desc">{{ f.description }}</p>
                  </div>
                  <div class="cfg-field-control">
                    <!-- Switch -->
                    <a-switch v-if="f.type === 'switch'" v-model="configForm[f.key]" checked-color="#00B42A"
                      unchecked-color="rgba(255,255,255,0.12)">
                      <template #checked>开启</template>
                      <template #unchecked>关闭</template>
                    </a-switch>
                    <!-- Number -->
                    <a-input-number v-else-if="f.type === 'number'" v-model="configForm[f.key]"
                      :placeholder="f.placeholder" :min="0" class="cfg-input-num" />
                    <!-- Password -->
                    <a-input-password v-else-if="f.type === 'password'" v-model="(configForm[f.key] as any)"
                      :placeholder="f.placeholder" class="cfg-input" />
                    <!-- Textarea -->
                    <a-textarea v-else-if="f.type === 'textarea'" v-model="(configForm[f.key] as any)"
                      :placeholder="f.placeholder" :auto-size="{ minRows: 2, maxRows: 4 }" class="cfg-input" />
                    <!-- Text -->
                    <a-input v-else v-model="(configForm[f.key] as any)" :placeholder="f.placeholder"
                      class="cfg-input" />
                  </div>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </a-spin>
  </div>
</template>

<style scoped>
.cfg-page {
  display: flex;
  flex-direction: column;
  gap: var(--sp-6);
}

.cfg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-4);
  padding: var(--sp-5) var(--sp-6);
}

.cfg-header-left {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
}

.cfg-header-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.24), rgba(64, 128, 255, 0.18));
  color: #B2D4FF;
  flex-shrink: 0;
}

.cfg-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-1);
  margin: 0;
}

.cfg-subtitle {
  font-size: 13px;
  color: var(--text-3);
  margin: 2px 0 0;
}

.cfg-actions {
  display: flex;
  gap: var(--sp-3);
  flex-shrink: 0;
}

.save-btn {
  background: var(--gradient-primary) !important;
  border: none;
}

.cfg-spin {
  width: 100%;
}

.cfg-body {
  display: flex;
  gap: var(--sp-5);
  min-height: 500px;
}

/* ===== Left tabs ===== */
.cfg-tabs {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--sp-3);
}

.cfg-tab {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-4);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: all var(--duration-normal) var(--ease-out);
  border: 1px solid transparent;
}

.cfg-tab:hover {
  background: rgba(255, 255, 255, 0.04);
}

.cfg-tab.active {
  background: rgba(255, 255, 255, 0.06);
  border-color: rgba(255, 255, 255, 0.10);
}

.cfg-tab-icon {
  font-size: 20px;
  flex-shrink: 0;
}

.cfg-tab-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.cfg-tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
}

.cfg-tab-sub {
  font-size: 11px;
  color: var(--text-4);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ===== Right form ===== */
.cfg-form-area {
  flex: 1;
  min-width: 0;
  padding: var(--sp-6) var(--sp-8);
}

.cfg-section-head {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  margin-bottom: var(--sp-6);
  padding-bottom: var(--sp-5);
  border-bottom: 1px solid var(--border-1);
}

.cfg-section-icon {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  flex-shrink: 0;
}

.cfg-section-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-1);
  margin: 0;
}

.cfg-section-sub {
  font-size: 12px;
  color: var(--text-3);
  margin: 2px 0 0;
}

.cfg-fields {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cfg-field {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-8);
  padding: var(--sp-4) 0;
  border-bottom: 1px solid var(--border-1);
}

.cfg-field:last-child {
  border-bottom: none;
}

.cfg-field-info {
  flex: 1;
  min-width: 0;
}

.cfg-field-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-1);
  display: block;
}

.cfg-field-desc {
  font-size: 12px;
  color: var(--text-4);
  margin: 2px 0 0;
  line-height: 1.5;
}

.cfg-field-control {
  flex-shrink: 0;
  width: 280px;
}

.cfg-input {
  width: 100%;
}

.cfg-input-num {
  width: 100%;
}

/* ===== Responsive ===== */
@media (max-width: 1024px) {
  .cfg-body {
    flex-direction: column;
  }

  .cfg-tabs {
    width: 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .cfg-tab {
    flex: 1;
    min-width: 200px;
  }

  .cfg-field {
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
  }

  .cfg-field-control {
    width: 100%;
  }
}

@media (max-width: 768px) {
  .cfg-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .cfg-actions {
    width: 100%;
  }

  .cfg-actions .arco-btn {
    flex: 1;
  }
}
</style>
