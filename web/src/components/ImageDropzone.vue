<script setup lang="ts">
/**
 * ImageDropzone — 统一图片/视频上传拖放区组件
 *
 * 尺寸（size）：
 *  - 'sm'  88px  行排列，极简  → 视频首尾帧、角色图等小槽位
 *  - 'md'  80px  行排列，带副文字 → 3D / MAPI 参考图等中等区域
 *  - 'lg'  220px 列排列，大图标 + 文字 + hint → 生图主参考图区域
 *
 * Props:
 *  - label     主要提示文字（默认 "上传"）
 *  - hint      副文字（仅 md/lg 展示）
 *  - uploading 上传中状态：文字变为 "上传中…" 且点击无效
 *  - disabled  禁用状态：灰显 + 禁止交互
 *  - accept    文件类型（默认 "image/*"）
 *  - multiple  是否多选
 *  - size      尺寸变体 'sm' | 'md' | 'lg'
 *
 * Emits:
 *  - select(files: File[])  用户选择或拖入文件后触发，由父组件处理实际上传
 */
import { ref } from 'vue'
import { IconPlus } from '@arco-design/web-vue/es/icon'

const props = withDefaults(defineProps<{
  label?: string
  hint?: string
  uploading?: boolean
  disabled?: boolean
  accept?: string
  multiple?: boolean
  size?: 'sm' | 'md' | 'lg'
}>(), {
  label: '上传',
  uploading: false,
  disabled: false,
  accept: 'image/*',
  multiple: false,
  size: 'md',
})

const emit = defineEmits<{
  (e: 'select', files: File[]): void
}>()

const inputRef = ref<HTMLInputElement>()
const dragover = ref(false)

const iconSize = { sm: 15, md: 15, lg: 36 }

function handleClick() {
  if (props.uploading || props.disabled) return
  inputRef.value?.click()
}

function handleChange(ev: Event) {
  const files = Array.from((ev.target as HTMLInputElement).files ?? [])
  if (files.length) emit('select', files)
  ;(ev.target as HTMLInputElement).value = ''
}

function handleDragover(ev: DragEvent) {
  if (props.disabled || props.uploading) return
  ev.preventDefault()
  dragover.value = true
}

function handleDragleave() {
  dragover.value = false
}

function handleDrop(ev: DragEvent) {
  ev.preventDefault()
  dragover.value = false
  if (props.disabled || props.uploading) return
  const all = Array.from(ev.dataTransfer?.files ?? [])
  const accept = props.accept ?? 'image/*'
  const files = all.filter(f => {
    if (accept === 'image/*') return f.type.startsWith('image/')
    if (accept === 'video/*') return f.type.startsWith('video/')
    return true
  })
  if (files.length) emit('select', files)
}
</script>

<template>
  <div
    class="idz"
    :class="[`idz--${size}`, { 'idz--dragover': dragover, 'idz--uploading': uploading, 'idz--disabled': disabled }]"
    @click="handleClick"
    @dragover="handleDragover"
    @dragleave="handleDragleave"
    @drop="handleDrop"
  >
    <span class="idz-icon">
      <IconPlus :size="iconSize[size]" />
    </span>
    <span class="idz-label">{{ uploading ? '上传中…' : label }}</span>
    <span v-if="hint && size !== 'sm'" class="idz-hint">{{ hint }}</span>

    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="idz-input"
      @change="handleChange"
    />
  </div>
</template>

<style scoped>
/* ===== 基础布局 ===== */
.idz {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  border: 1px dashed var(--border-2, rgba(255, 255, 255, 0.12));
  border-radius: 8px;
  background: var(--color-fill-1, rgba(255, 255, 255, 0.02));
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.14s ease, border-color 0.14s ease, background 0.14s ease, box-shadow 0.14s ease;
  user-select: none;
}

/* ── 尺寸变体 ── */
.idz--sm {
  gap: 5px;
  height: 88px;
  flex-direction: row;
  font-size: 0.74rem;
  font-weight: 500;
}

.idz--md {
  gap: 6px;
  height: 80px;
  flex-direction: row;
  font-size: 0.76rem;
  font-weight: 500;
  flex-wrap: wrap;
}

.idz--lg {
  gap: 8px;
  height: 220px;
  flex-direction: column;
  font-size: 0.84rem;
  text-align: center;
  padding: 16px;
}

/* ── 交互状态 ── */
.idz:hover,
.idz--dragover {
  color: var(--primary-light, #5b8df0);
  border-color: var(--primary, #165dff);
  background: rgba(22, 93, 255, 0.05);
}

.idz--dragover {
  box-shadow: 0 0 14px rgba(22, 93, 255, 0.12);
}

.idz--uploading {
  cursor: default;
  opacity: 0.75;
}

.idz--disabled {
  opacity: 0.4;
  pointer-events: none;
}

/* ── 图标 ── */
.idz-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.idz--lg .idz-icon {
  width: 44px;
  height: 44px;
  border-radius: 10px;
  border: 1px solid rgba(22, 93, 255, 0.36);
  background: rgba(22, 93, 255, 0.12);
  color: var(--primary-light, #5b8df0);
}

/* ── 文字 ── */
.idz-label {
  line-height: 1.3;
}

.idz-hint {
  width: 100%;
  font-size: 0.76rem;
  color: var(--text-4);
  line-height: 1.25;
}

/* ── md 多行时 hint 居中 ── */
.idz--md .idz-hint {
  font-size: 0.72rem;
  margin-top: -2px;
}

/* ── 隐藏原生 input ── */
.idz-input {
  display: none;
}
</style>
