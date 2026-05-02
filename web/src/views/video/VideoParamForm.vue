<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  InputNumber as AInputNumber,
  Switch as ASwitch,
} from '@arco-design/web-vue'
import { IconDown } from '@arco-design/web-vue/es/icon'
import {
  buildDefaultVideoSchemaValue,
  resolveVideoSchema,
  type VideoField,
} from './video-schemas'

const props = defineProps<{
  model: string
  value: Record<string, unknown>
}>()

const emit = defineEmits<{
  (e: 'update:value', value: Record<string, unknown>): void
}>()

const schema = computed(() => resolveVideoSchema(props.model))
const local = ref<Record<string, unknown>>({})
const advancedOpen = ref(false)

watch(
  () => props.model,
  (next, prev) => {
    if (next === prev) return
    const defaults = buildDefaultVideoSchemaValue(next)
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

function readField(field: VideoField) {
  return local.value[field.key]
}

function writeField(field: VideoField, value: unknown) {
  const next = { ...local.value, [field.key]: value }
  local.value = next
  emit('update:value', next)
}

function isVisible(field: VideoField) {
  if (!field.visibleWhen) return true
  return field.visibleWhen(local.value)
}

const basicFields = computed(() =>
  (schema.value?.fields || []).filter((f) => f.group !== 'advanced' && isVisible(f)),
)
const advancedFields = computed(() =>
  (schema.value?.fields || []).filter((f) => f.group === 'advanced' && isVisible(f)),
)

/** 为数字字段生成 label（可带单位） */
const numberUnitMap: Record<string, string> = {
  duration: '秒',
  face_limit: '面',
}
function labelWithUnit(field: VideoField): string {
  if (field.type !== 'input-number') return field.label
  const unit = numberUnitMap[field.key]
  return unit ? `${field.label}（${unit}）` : field.label
}
</script>

<template>
  <div v-if="schema" class="pf">
    <!-- 基础字段 -->
    <template v-for="field in basicFields" :key="field.key">
      <!-- 开关：单行 label + switch -->
      <div v-if="field.type === 'switch'" class="pf-row pf-row-inline">
        <label class="pf-label" :title="field.help || ''">
          {{ field.label }}
        </label>
        <ASwitch
          size="small"
          :model-value="!!readField(field)"
          @update:model-value="(v: unknown) => writeField(field, v)"
        />
      </div>

      <!-- 分段按钮 -->
      <div v-else-if="field.type === 'radio-button'" class="pf-row">
        <label class="pf-label" :title="field.help || ''">
          {{ field.label }}
        </label>
        <div
          class="pf-seg"
          :class="{ wrap: field.options.length > 3, duration: field.key === 'duration' }"
        >
          <button
            v-for="opt in field.options"
            :key="String(opt.value)"
            type="button"
            class="pf-seg-btn"
            :class="{ active: readField(field) === opt.value }"
            @click="writeField(field, opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </div>

      <!-- 下拉选择 -->
      <div v-else-if="field.type === 'select'" class="pf-row">
        <label class="pf-label" :title="field.help || ''">
          {{ field.label }}
        </label>
        <a-select
          size="small"
          :model-value="readField(field)"
          class="pf-select"
          @update:model-value="(v: unknown) => writeField(field, v)"
        >
          <a-option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">
            {{ opt.label }}
          </a-option>
        </a-select>
      </div>

      <!-- 数字输入 -->
      <div v-else-if="field.type === 'input-number'" class="pf-row">
        <label class="pf-label" :title="field.help || ''">
          {{ labelWithUnit(field) }}
        </label>
        <AInputNumber
          size="small"
          :model-value="readField(field) as number | null"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 1"
          :placeholder="field.placeholder ?? ''"
          class="pf-number"
          @update:model-value="(v: unknown) => writeField(field, v)"
        />
      </div>
    </template>

    <!-- 更多选项 -->
    <template v-if="advancedFields.length">
      <button
        type="button"
        class="pf-more"
        :class="{ open: advancedOpen }"
        @click="advancedOpen = !advancedOpen"
      >
        <span>{{ advancedOpen ? '收起' : '更多选项' }}</span>
        <IconDown :size="11" class="pf-more-icon" :class="{ rotate: advancedOpen }" />
      </button>

      <template v-if="advancedOpen">
        <template v-for="field in advancedFields" :key="field.key">
          <div v-if="field.type === 'switch'" class="pf-row pf-row-inline">
            <label class="pf-label" :title="field.help || ''">
              {{ field.label }}
            </label>
            <ASwitch
              size="small"
              :model-value="!!readField(field)"
              @update:model-value="(v: unknown) => writeField(field, v)"
            />
          </div>

          <div v-else-if="field.type === 'radio-button'" class="pf-row">
            <label class="pf-label" :title="field.help || ''">
              {{ field.label }}
            </label>
            <div
              class="pf-seg"
              :class="{ wrap: field.options.length > 3, duration: field.key === 'duration' }"
            >
              <button
                v-for="opt in field.options"
                :key="String(opt.value)"
                type="button"
                class="pf-seg-btn"
                :class="{ active: readField(field) === opt.value }"
                @click="writeField(field, opt.value)"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div v-else-if="field.type === 'select'" class="pf-row">
            <label class="pf-label" :title="field.help || ''">
              {{ field.label }}
            </label>
            <a-select
              size="small"
              :model-value="readField(field)"
              class="pf-select"
              @update:model-value="(v: unknown) => writeField(field, v)"
            >
              <a-option v-for="opt in field.options" :key="String(opt.value)" :value="opt.value">
                {{ opt.label }}
              </a-option>
            </a-select>
          </div>

          <div v-else-if="field.type === 'input-number'" class="pf-row">
            <label class="pf-label" :title="field.help || ''">
              {{ labelWithUnit(field) }}
            </label>
            <AInputNumber
              size="small"
              :model-value="readField(field) as number | null"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              :placeholder="field.placeholder ?? ''"
              class="pf-number"
              @update:model-value="(v: unknown) => writeField(field, v)"
            />
          </div>
        </template>
      </template>
    </template>
  </div>
</template>

<style scoped>
.pf {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 字段行 ===== */
.pf-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.pf-row-inline {
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.pf-label {
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-3);
  letter-spacing: 0;
  text-transform: none;
  cursor: default;
}

.pf-row-inline .pf-label {
  flex: 1;
  min-width: 0;
}

/* ===== 分段控件（Radio）===== */
.pf-seg {
  display: flex;
  gap: 2px;
  padding: 2px;
  border-radius: 7px;
  background: var(--color-fill-1, rgba(255, 255, 255, 0.04));
  border: 1px solid var(--border-1, rgba(255, 255, 255, 0.06));
}

.pf-seg.wrap {
  flex-wrap: wrap;
}

.pf-seg-btn {
  flex: 1;
  min-width: 0;
  padding: 5px 8px;
  background: transparent;
  border: none;
  border-radius: 5px;
  color: var(--text-3);
  font-size: 0.74rem;
  font-weight: 500;
  cursor: pointer;
  transition: color .14s ease, background .14s ease;
  text-align: center;
  white-space: nowrap;
}

.pf-seg-btn:hover {
  color: var(--text-1);
}

.pf-seg-btn.active {
  color: var(--text-1);
  background: var(--bg-surface-3, rgba(255, 255, 255, 0.08));
  box-shadow: inset 0 0 0 1px var(--border-2, rgba(255, 255, 255, 0.1));
}

.pf-seg.wrap .pf-seg-btn {
  flex: 0 0 calc(50% - 2px);
}

/* 时长选项：每行固定 4 个，平均分布；超出自动换行 */
.pf-seg.duration {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 2px;
}

.pf-seg.duration .pf-seg-btn {
  width: 100%;
  padding: 5px 8px;
}

/* ===== Select ===== */
.pf-select {
  width: 100%;
}

.pf-select :deep(.arco-select-view) {
  background: var(--color-fill-1, rgba(255, 255, 255, 0.04)) !important;
  border: 1px solid var(--border-1, rgba(255, 255, 255, 0.08)) !important;
  border-radius: 6px !important;
  min-height: 30px !important;
}

.pf-select :deep(.arco-select-view):hover {
  border-color: var(--border-3, rgba(255, 255, 255, 0.18)) !important;
}

/* ===== Input Number ===== */
.pf-number {
  width: 100%;
}

.pf-number :deep(.arco-input-wrapper) {
  background: var(--color-fill-1, rgba(255, 255, 255, 0.04)) !important;
  border: 1px solid var(--border-1, rgba(255, 255, 255, 0.08)) !important;
  border-radius: 6px !important;
  min-height: 30px !important;
}

.pf-number :deep(.arco-input-wrapper):hover {
  border-color: var(--border-3, rgba(255, 255, 255, 0.18)) !important;
}

/* ===== 更多选项 ===== */
.pf-more {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 0;
  align-self: flex-start;
  background: transparent;
  border: none;
  color: var(--text-3);
  font-size: 0.74rem;
  font-weight: 500;
  cursor: pointer;
  transition: color .14s ease;
}

.pf-more:hover {
  color: var(--text-1);
}

.pf-more.open {
  color: var(--text-1);
}

.pf-more-icon {
  transition: transform .18s ease;
}

.pf-more-icon.rotate {
  transform: rotate(180deg);
}
</style>
