<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  InputNumber as AInputNumber,
  Switch as ASwitch,
} from '@arco-design/web-vue'
import {
  buildDefaultModel3dParams,
  resolveModel3dSchema,
  type Model3dField,
} from './model3d-schemas'

const props = defineProps<{
  provider: string
  taskType: 'text2model' | 'img2model'
  value: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:value', value: Record<string, unknown>): void
}>()

const schema = computed(() => resolveModel3dSchema(props.provider))
const local = ref<Record<string, unknown>>({})
const advancedOpen = ref(false)

watch(
  () => props.provider,
  (next, prev) => {
    if (next === prev) return
    const defaults = buildDefaultModel3dParams(next)
    local.value = defaults
    emit('update:value', defaults)
    advancedOpen.value = false
  },
  { immediate: true },
)

watch(
  () => props.value,
  (value) => {
    local.value = { ...(value || {}) }
  },
  { immediate: true, deep: true },
)

function readField(field: Model3dField) {
  return local.value[field.key]
}

function writeField(field: Model3dField, value: unknown) {
  const next = { ...local.value, [field.key]: value }
  local.value = next
  emit('update:value', next)
}

function isVisible(field: Model3dField) {
  if (!field.visibleWhen) return true
  return field.visibleWhen(local.value, {
    taskType: props.taskType,
    provider: props.provider,
  })
}

const basicFields = computed(() =>
  (schema.value?.fields || []).filter((field) => field.group !== 'advanced' && isVisible(field)),
)

const advancedFields = computed(() =>
  (schema.value?.fields || []).filter((field) => field.group === 'advanced' && isVisible(field)),
)
</script>

<template>
  <template v-if="schema">
    <!-- 公共字段渲染宏：basic 和 advanced 共用同一套 template，消除重复 -->
    <template v-for="field in basicFields" :key="field.key">
      <section class="pf-field">
        <!-- radio-button -->
        <template v-if="field.type === 'radio-button'">
          <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
          <div class="pf-seg">
            <button
              v-for="opt in field.options"
              :key="String(opt.value)"
              class="pf-seg-btn"
              :class="{ active: readField(field) === opt.value }"
              @click="writeField(field, opt.value)"
            >{{ opt.label }}</button>
          </div>
        </template>

        <!-- select -->
        <template v-else-if="field.type === 'select'">
          <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
          <a-select
            :model-value="readField(field)"
            class="pf-select"
            @update:model-value="(v: unknown) => writeField(field, v)"
          >
            <a-option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">
              {{ opt.label }}
            </a-option>
          </a-select>
        </template>

        <!-- switch -->
        <template v-else-if="field.type === 'switch'">
          <div class="pf-switch-row">
            <label class="pf-label pf-label--inline" :title="(field as any).help">{{ field.label }}</label>
            <ASwitch
              size="small"
              :model-value="!!readField(field)"
              @update:model-value="(v: unknown) => writeField(field, v)"
            />
            <span class="pf-switch-state">{{ readField(field) ? (field as any).onText || '开' : (field as any).offText || '关' }}</span>
          </div>
        </template>

        <!-- input-number -->
        <template v-else-if="field.type === 'input-number'">
          <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
          <AInputNumber
            :model-value="readField(field) as number | null"
            :min="(field as any).min"
            :max="(field as any).max"
            :step="(field as any).step ?? 1"
            :placeholder="(field as any).placeholder"
            class="pf-select"
            @update:model-value="(v: unknown) => writeField(field, v)"
          />
        </template>
      </section>
    </template>

    <!-- 高级参数折叠区 -->
    <section v-if="advancedFields.length" class="pf-adv">
      <button class="pf-adv-toggle" @click="advancedOpen = !advancedOpen">
        <span>高级参数</span>
        <span class="pf-adv-state">{{ advancedOpen ? '收起 ▲' : '展开 ▼' }}</span>
      </button>

      <template v-if="advancedOpen">
        <template v-for="field in advancedFields" :key="field.key">
          <section class="pf-field">
            <template v-if="field.type === 'radio-button'">
              <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
              <div class="pf-seg">
                <button
                  v-for="opt in field.options"
                  :key="String(opt.value)"
                  class="pf-seg-btn"
                  :class="{ active: readField(field) === opt.value }"
                  @click="writeField(field, opt.value)"
                >{{ opt.label }}</button>
              </div>
            </template>

            <template v-else-if="field.type === 'select'">
              <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
              <a-select
                :model-value="readField(field)"
                class="pf-select"
                @update:model-value="(v: unknown) => writeField(field, v)"
              >
                <a-option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">
                  {{ opt.label }}
                </a-option>
              </a-select>
            </template>

            <template v-else-if="field.type === 'switch'">
              <div class="pf-switch-row">
                <label class="pf-label pf-label--inline" :title="(field as any).help">{{ field.label }}</label>
                <ASwitch
                  size="small"
                  :model-value="!!readField(field)"
                  @update:model-value="(v: unknown) => writeField(field, v)"
                />
                <span class="pf-switch-state">{{ readField(field) ? (field as any).onText || '开' : (field as any).offText || '关' }}</span>
              </div>
            </template>

            <template v-else-if="field.type === 'input-number'">
              <label class="pf-label" :title="(field as any).help">{{ field.label }}</label>
              <AInputNumber
                :model-value="readField(field) as number | null"
                :min="(field as any).min"
                :max="(field as any).max"
                :step="(field as any).step ?? 1"
                :placeholder="(field as any).placeholder"
                class="pf-select"
                @update:model-value="(v: unknown) => writeField(field, v)"
              />
            </template>
          </section>
        </template>
      </template>
    </section>
  </template>
</template>

<style scoped>
/* ── 字段容器 ─────────────────────────────────── */
.pf-field {
  margin-bottom: 14px;
}

/* ── Label ─────────────────────────────────────── */
.pf-label {
  display: block;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 6px;
  cursor: default;
}

/* label 有 help 时给一个下划线虚线提示可悬浮查看 */
.pf-label[title] {
  text-decoration-line: underline;
  text-decoration-style: dotted;
  text-decoration-color: var(--text-4);
  text-underline-offset: 3px;
}

.pf-label--inline {
  margin-bottom: 0;
  flex: 1;
}

/* ── Segmented (radio-button) ──────────────────── */
.pf-seg {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.pf-seg-btn {
  flex: 1 1 0;
  min-width: 0;
  padding: 5px 8px;
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  background: var(--bg-surface-2);
  color: var(--text-3);
  font-size: 0.78rem;
  cursor: pointer;
  text-align: center;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.pf-seg-btn.active {
  border-color: var(--border-3);
  background: var(--bg-surface-3);
  color: var(--text-1);
}

/* ── Select ────────────────────────────────────── */
.pf-select {
  width: 100%;
}

/* ── Switch ────────────────────────────────────── */
.pf-switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.pf-switch-state {
  font-size: 0.75rem;
  color: var(--text-4);
}

/* ── Advanced block ────────────────────────────── */
.pf-adv {
  border-top: 1px solid var(--border-1);
  padding-top: 10px;
  margin-top: 6px;
}

.pf-adv-toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 0;
  background: transparent;
  color: var(--text-3);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  padding: 0 0 10px;
}

.pf-adv-state {
  font-size: 0.7rem;
  color: var(--text-4);
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}
</style>
