<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  InputNumber as AInputNumber,
  Slider as ASlider,
  Switch as ASwitch,
  Message,
} from '@arco-design/web-vue'
import { IconPlus, IconClose } from '@arco-design/web-vue/es/icon'
import ImageDropzone from '../../components/ImageDropzone.vue'
import {
  buildDefaultFormValue,
  getByPath,
  resolveMapiImageSchema,
  setByPath,
  type MapiImageField,
  type MapiImageSchema,
} from './mapi-image-schemas'
import { uploadFile } from '../../api/upload'

export interface MapiRefImage {
  id: string
  file?: File
  url: string
}

const props = defineProps<{
  modelName: string
  value: Record<string, unknown>
  refImages: MapiRefImage[]
  rawMetadata?: string | null
}>()

const emit = defineEmits<{
  (e: 'update:value', value: Record<string, unknown>): void
  (e: 'update:refImages', value: MapiRefImage[]): void
}>()

/* ── Schema ─────────────────────────────────── */

const schema = computed<MapiImageSchema | null>(() => resolveMapiImageSchema(props.modelName))

const local = ref<Record<string, unknown>>({ ...props.value })

watch(
  () => props.modelName,
  (next, prev) => {
    if (next === prev) return
    const defaults = schema.value ? buildDefaultFormValue(schema.value) : {}
    local.value = defaults
    emit('update:value', defaults)
  },
  { immediate: true },
)

watch(
  () => props.value,
  (v) => { if (v !== local.value) local.value = { ...v } },
  { deep: true },
)

/* ── Helpers ─────────────────────────────────── */

function readField(field: MapiImageField): unknown {
  return getByPath(local.value, field.key)
}

function writeField(field: MapiImageField, value: unknown) {
  const next = { ...local.value }
  setByPath(next, field.key, value)
  local.value = next
  emit('update:value', next)
}

function writeByKey(key: string, value: unknown) {
  const next = { ...local.value }
  setByPath(next, key, value)
  local.value = next
  emit('update:value', next)
}

/* ── Custom size ─────────────────────────────── */

const customWidth = ref(2048)
const customHeight = ref(2048)

watch(() => props.modelName, () => { customWidth.value = 2048; customHeight.value = 2048 }, { immediate: true })

function pickPreset(presetField: string, preset: string) {
  const parts = preset.toLowerCase().split('x')
  const w = Number(parts[0]); const h = Number(parts[1])
  if (w > 0 && h > 0) { customWidth.value = w; customHeight.value = h }
  writeByKey(presetField, preset)
}

function applyCustomDimension(presetField: string) {
  const w = Math.max(256, customWidth.value || 2048)
  const h = Math.max(256, customHeight.value || 2048)
  writeByKey(presetField, `${w}x${h}`)
}

/* ── Field visibility ────────────────────────── */

const customSizeMap = computed(() => {
  const map = new Map<string, Extract<MapiImageField, { type: 'custom-size' }>>()
  schema.value?.fields.forEach((f) => {
    if (f.type === 'custom-size') map.set(f.presetField, f as Extract<MapiImageField, { type: 'custom-size' }>)
  })
  return map
})

const basicFields = computed(() => {
  if (!schema.value) return []
  return schema.value.fields.filter((f) => {
    if (f.type === 'custom-size') return false
    if (f.group === 'advanced') return false
    if (f.visibleWhen && !f.visibleWhen(local.value)) return false
    return true
  })
})

const advancedFields = computed(() => {
  if (!schema.value) return []
  return schema.value.fields.filter((f) => {
    if (f.type === 'custom-size') return false
    if (f.group !== 'advanced') return false
    if (f.visibleWhen && !f.visibleWhen(local.value)) return false
    return true
  })
})

/* ── Advanced toggle ─────────────────────────── */

const advancedOpen = ref(false)

/* ── Ref image uploader ──────────────────────── */

const uploading = ref(false)
const MAX_SIZE = 10 * 1024 * 1024

const refMax = computed<number>(() => {
  const f = schema.value?.fields.find((x) => x.type === 'ref-images') as Extract<MapiImageField, { type: 'ref-images' }> | undefined
  return f?.max ?? 0
})

const fileInputRef = ref<HTMLInputElement | null>(null)

async function handlePickFiles(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  await addFiles(Array.from(files))
  if (fileInputRef.value) fileInputRef.value.value = ''
}

async function addFiles(files: File[]) {
  if (refMax.value <= 0) { Message.warning('当前模型不支持参考图'); return }
  const images = files.filter((f) => f.type.startsWith('image/'))
  if (!images.length) { Message.warning('请选择图片文件'); return }
  const remaining = refMax.value - props.refImages.length
  if (remaining <= 0) { Message.warning(`最多 ${refMax.value} 张`); return }
  uploading.value = true
  const next = [...props.refImages]
  for (const file of images.slice(0, remaining)) {
    if (file.size > MAX_SIZE) { Message.error(`「${file.name}」超过 10MB`); continue }
    try {
      const { data } = await uploadFile(file)
      if (!data?.url) throw new Error('no url')
      next.push({ id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file, url: data.url })
    } catch { Message.error('上传失败') }
  }
  uploading.value = false
  emit('update:refImages', next)
}

function removeImage(id: string) {
  emit('update:refImages', props.refImages.filter((r) => r.id !== id))
}
</script>

<template>
  <div v-if="schema" class="mapi-params">

    <!-- ── 基础参数 ── -->
    <template v-for="field in basicFields" :key="field.key">

      <!-- 选项按钮组 -->
      <section v-if="field.type === 'radio-button'" class="form-group">
        <label class="group-label">{{ field.label }}</label>
        <div class="dur-row" :class="{ 'dur-row-wrap': field.options.length > 3 }">
          <button
            v-for="opt in field.options"
            :key="opt.value"
            type="button"
            class="dur-btn"
            :class="{ active: readField(field) === opt.value }"
            @click="writeField(field, opt.value)"
          >{{ opt.label }}</button>
        </div>

        <!-- 内联自定义尺寸 -->
        <div
          v-if="customSizeMap.has(field.key) && readField(field) === customSizeMap.get(field.key)?.customTrigger"
          class="custom-size-row"
        >
          <div class="custom-presets">
            <button
              v-for="p in customSizeMap.get(field.key)!.presets"
              :key="p"
              type="button"
              class="dur-btn dur-btn-sm"
              :class="{ active: (getByPath(local, field.key) as string) === p }"
              @click="pickPreset(field.key, p)"
            >{{ p }}</button>
          </div>
          <div class="custom-dim-row">
            <AInputNumber
              v-model="customWidth"
              :min="256" :max="8192" :step="64"
              hide-button
              class="dim-input"
              @change="() => applyCustomDimension(field.key)"
            />
            <span class="dim-sep">×</span>
            <AInputNumber
              v-model="customHeight"
              :min="256" :max="8192" :step="64"
              hide-button
              class="dim-input"
              @change="() => applyCustomDimension(field.key)"
            />
            <span class="dim-hint">px</span>
          </div>
        </div>
      </section>

      <!-- 数值输入 -->
      <section v-else-if="field.type === 'input-number'" class="form-group">
        <label class="group-label">{{ field.label }}</label>
        <AInputNumber
          :model-value="readField(field) as number | null"
          :min="field.min"
          :max="field.max"
          :step="field.step ?? 1"
          :placeholder="field.placeholder ?? ''"
          class="num-input"
          @update:model-value="(v: unknown) => writeField(field, v)"
        />
      </section>

      <!-- 滑块 -->
      <section v-else-if="field.type === 'slider'" class="form-group">
        <div class="group-label-row">
          <label class="group-label">{{ field.label }}</label>
          <span class="fl-count">{{ readField(field) }}</span>
        </div>
        <ASlider
          :model-value="readField(field) as number"
          :min="field.min"
          :max="field.max"
          :step="field.step"
          :marks="field.marks"
          :show-ticks="true"
          class="param-slider"
          @update:model-value="(v: unknown) => writeField(field, v)"
        />
      </section>

      <!-- 开关 -->
      <section v-else-if="field.type === 'switch'" class="form-group">
        <div class="switch-row">
          <label class="group-label switch-label">{{ field.label }}</label>
          <ASwitch
            size="small"
            :model-value="!!readField(field)"
            @update:model-value="(v: unknown) => writeField(field, v)"
          />
          <span
            v-if="field.badge && (!field.badge.activeOnly || !!readField(field))"
            class="badge-warn"
          >{{ field.badge.text }}</span>
        </div>
      </section>

      <!-- 参考图 -->
      <section v-else-if="field.type === 'ref-images'" class="form-group">
        <div class="group-label-row">
          <label class="group-label">{{ field.label }}</label>
          <span class="fl-count">{{ refImages.length }} / {{ refMax }}</span>
        </div>
        <ImageDropzone
          v-if="!refImages.length"
          size="md"
          label="添加参考图"
          accept="image/*"
          multiple
          :uploading="uploading"
          :disabled="refMax === 0"
          @select="addFiles"
        />
        <div v-else class="ref-grid">
          <div v-for="img in refImages" :key="img.id" class="ref-thumb">
            <img :src="img.url" :alt="img.id" />
            <button type="button" class="ref-del" @click="removeImage(img.id)"><IconClose /></button>
          </div>
          <div v-if="refImages.length < refMax" class="ref-add" @click="fileInputRef?.click()">
            <IconPlus />
          </div>
        </div>
        <!-- 隐藏 input：供"添加更多"按钮使用 -->
        <input
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          style="display:none"
          @change="handlePickFiles"
        />
      </section>

    </template>

    <!-- ── 高级设置 ── -->
    <div v-if="advancedFields.length" class="advanced-section">
      <button type="button" class="advanced-toggle" @click="advancedOpen = !advancedOpen">
        <span>高级设置</span>
        <svg class="toggle-chevron" :class="{ open: advancedOpen }" width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </button>
      <div v-if="advancedOpen" class="advanced-body">
        <template v-for="field in advancedFields" :key="field.key">

          <section v-if="field.type === 'radio-button'" class="form-group">
            <label class="group-label">{{ field.label }}</label>
            <div class="dur-row">
              <button
                v-for="opt in field.options"
                :key="opt.value"
                type="button"
                class="dur-btn dur-btn-sm"
                :class="{ active: readField(field) === opt.value }"
                @click="writeField(field, opt.value)"
              >{{ opt.label }}</button>
            </div>
          </section>

          <section v-else-if="field.type === 'input-number'" class="form-group">
            <label class="group-label">{{ field.label }}</label>
            <AInputNumber
              :model-value="readField(field) as number | null"
              :min="field.min"
              :max="field.max"
              :step="field.step ?? 1"
              :placeholder="field.placeholder ?? ''"
              class="num-input"
              @update:model-value="(v: unknown) => writeField(field, v)"
            />
          </section>

          <section v-else-if="field.type === 'switch'" class="form-group">
            <div class="switch-row">
              <label class="group-label switch-label">{{ field.label }}</label>
              <ASwitch
                size="small"
                :model-value="!!readField(field)"
                @update:model-value="(v: unknown) => writeField(field, v)"
              />
            </div>
          </section>

        </template>
      </div>
    </div>

  </div>
</template>

<style scoped>
/* ── 整体容器 ── */
.mapi-params {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

/* ── 参数区块（复用 DrawLayout 的 form-group 节奏） ── */
.form-group {
  margin-bottom: 0;
}

/* ── 标签（与 .group-label 完全一致） ── */
.group-label {
  display: block;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-3);
  margin-bottom: var(--sp-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.group-label-row {
  display: flex;
  align-items: center;
  margin-bottom: var(--sp-2);
}

.group-label-row .group-label {
  margin-bottom: 0;
  flex: 1;
}

.fl-count {
  font-size: 0.72rem;
  color: var(--text-4);
}

/* ── 选项按钮组（复用 .dur-row / .dur-btn） ── */
.dur-row {
  display: flex;
  gap: var(--sp-2);
}

.dur-row-wrap {
  flex-wrap: wrap;
}

.dur-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: var(--sp-2);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid var(--border-1);
  border-radius: var(--radius-sm);
  color: var(--text-4);
  font-size: 0.82rem;
  cursor: pointer;
  text-align: center;
  transition: all var(--duration-fast);
  white-space: nowrap;
}

.dur-btn:hover {
  border-color: var(--border-3);
  color: var(--text-3);
  background: rgba(255, 255, 255, 0.04);
}

.dur-btn.active {
  border-color: var(--primary-light);
  background: linear-gradient(135deg, rgba(22, 93, 255, 0.32), rgba(64, 128, 255, 0.2));
  color: #ffffff;
  box-shadow: 0 0 0 1px rgba(22, 93, 255, 0.22) inset;
}

.dur-btn-sm {
  flex: none;
  padding: var(--sp-1) var(--sp-3);
  font-size: 0.78rem;
}

/* ── 自定义尺寸内联 ── */
.custom-size-row {
  margin-top: var(--sp-2);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.custom-presets {
  display: flex;
  gap: var(--sp-1);
  flex-wrap: wrap;
}

.custom-dim-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.dim-input {
  width: 96px;
}

.dim-sep {
  font-size: 13px;
  color: var(--text-4);
}

.dim-hint {
  font-size: 0.72rem;
  color: var(--text-4);
}

/* ── 数值输入 ── */
.num-input {
  width: 120px;
}

/* ── 滑块 ── */
.param-slider {
  width: 100%;
}

/* ── 开关行 ── */
.switch-row {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
}

.switch-label {
  margin-bottom: 0;
  flex: 1;
}

.badge-warn {
  font-size: 0.7rem;
  color: var(--warning);
  border: 1px solid rgba(255, 125, 0, 0.3);
  background: rgba(255, 125, 0, 0.08);
  padding: 1px 6px;
  border-radius: var(--radius-full);
  line-height: 1.6;
}

/* ── 参考图区域 ── */
/* 参考图空状态已由 ImageDropzone 组件接管 */

.ref-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(68px, 1fr));
  gap: var(--sp-2);
}

.ref-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border-2);
  background: var(--bg-surface-3);
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.ref-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: none;
  background: rgba(0,0,0,0.55);
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  font-size: 10px;
  transition: background var(--duration-fast);
}

.ref-del:hover {
  background: var(--danger);
}

.ref-add {
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  border: 1px dashed var(--border-2);
  background: var(--bg-surface-2);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-4);
  font-size: 16px;
  transition: all var(--duration-fast);
}

.ref-add:hover {
  border-color: var(--primary-light);
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.04);
}

/* ── 高级设置折叠 ── */
.advanced-section {
  margin-top: var(--sp-1);
}

.advanced-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: var(--sp-2) 0;
  background: none;
  border: none;
  border-top: 1px solid var(--border-1);
  color: var(--text-4);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition: color var(--duration-fast);
}

.advanced-toggle:hover {
  color: var(--text-2);
}

.toggle-chevron {
  margin-left: auto;
  transition: transform var(--duration-fast);
  flex-shrink: 0;
}

.toggle-chevron.open {
  transform: rotate(180deg);
}

.advanced-body {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  padding-top: var(--sp-2);
}
</style>
