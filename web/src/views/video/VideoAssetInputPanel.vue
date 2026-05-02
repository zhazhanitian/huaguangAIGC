<script setup lang="ts">
import { computed, ref } from 'vue'
import { Message, Modal } from '@arco-design/web-vue'
import { IconClose, IconPlus } from '@arco-design/web-vue/es/icon'
import { uploadFile } from '../../api/upload'
import type { VideoAssetFile, VideoRefImage } from './video-asset-types'
import type { VideoInputMode } from './video-schemas'
import ImageDropzone from '../../components/ImageDropzone.vue'

const props = defineProps<{
  model: string
  inputMode: VideoInputMode
  canUseFrameMode: boolean
  canUseRefMode: boolean
  maxRef: number
  prompt: string
  firstFrameFile: VideoAssetFile | null
  lastFrameFile: VideoAssetFile | null
  refImages: VideoRefImage[]
  motionRoleImage: VideoAssetFile | null
  motionVideoFile: VideoAssetFile | null
  klingV26TailFrameFile: VideoAssetFile | null
}>()

const emit = defineEmits<{
  (e: 'update:prompt', value: string): void
  (e: 'update:firstFrameFile', value: VideoAssetFile | null): void
  (e: 'update:lastFrameFile', value: VideoAssetFile | null): void
  (e: 'update:refImages', value: VideoRefImage[]): void
  (e: 'update:motionRoleImage', value: VideoAssetFile | null): void
  (e: 'update:motionVideoFile', value: VideoAssetFile | null): void
  (e: 'update:klingV26TailFrameFile', value: VideoAssetFile | null): void
}>()

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024
const refInputRef = ref<HTMLInputElement>()
const frameUploading = ref(false)
const refUploading = ref(false)

const isKlingV26Image2VideoModel = computed(() => props.model === 'kling-v2-6-image2video')
const isHailuoModel = computed(() => props.model === 'hailuo-2.3')
const isDoubaoSeedanceImageModel = computed(() => props.model === 'doubao-seedance-image')
const isSingleRefPanel = computed(() => isHailuoModel.value || isDoubaoSeedanceImageModel.value)

function normalizeUploadUrl(rawUrl: string) {
  if (!rawUrl) return rawUrl
  if (rawUrl.startsWith('http')) return rawUrl
  return `${window.location.origin}${rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`}`
}

async function uploadImageFile(file: File): Promise<string> {
  if (file.size > MAX_UPLOAD_SIZE) {
    Message.error({ content: '图片超过 10MB 限制', duration: 4000 })
    throw new Error('SIZE')
  }
  const { data } = await uploadFile(file)
  const url = data?.url || ''
  if (!url) throw new Error('未返回地址')
  return normalizeUploadUrl(url)
}

function showUploadError(err: any) {
  if ((err as Error).message === 'SIZE') return
  const msg = err?.response?.data?.message || err?.message || ''
  const status = err?.response?.status
  if (status === 400) {
    Modal.error({ title: '⚠️ 图片不合规', content: msg || '请更换图片后重试', okText: '我知道了' })
  } else {
    Message.error({ content: msg || '上传失败', duration: 4000 })
  }
}

function clearFrame(type: 'first' | 'last') {
  if (type === 'first') emit('update:firstFrameFile', null)
  else emit('update:lastFrameFile', null)
}

async function addRefImages(files: File[]) {
  const imgs = files.filter((f) => f.type.startsWith('image/'))
  if (!imgs.length) { Message.warning('请选择图片'); return }
  const left = props.maxRef - props.refImages.length
  if (left <= 0) { Message.warning(`最多 ${props.maxRef} 张参考图`); return }
  refUploading.value = true
  const next = [...props.refImages]
  for (const f of imgs.slice(0, left)) {
    try {
      const serverUrl = await uploadImageFile(f)
      next.push({ id: `r${Date.now()}${Math.random().toString(36).slice(2, 5)}`, file: f, url: serverUrl })
    } catch (err) {
      showUploadError(err)
    }
  }
  refUploading.value = false
  emit('update:refImages', next)
}

function removeRef(id: string) {
  emit('update:refImages', props.refImages.filter((r) => r.id !== id))
}

function handleRefSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (files) addRefImages(Array.from(files))
  ;(e.target as HTMLInputElement).value = ''
}

function clearMotionVideo() {
  emit('update:motionVideoFile', null)
}

function clearMotionImage() {
  emit('update:motionRoleImage', null)
}

function clearKlingV26TailFrame() {
  emit('update:klingV26TailFrameFile', null)
}

/* ── ImageDropzone 适配函数（接收 File[] 并复用上传逻辑） ── */

async function handleFirstFrameFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  frameUploading.value = true
  try {
    const serverUrl = await uploadImageFile(file)
    emit('update:firstFrameFile', { url: serverUrl, file })
  } catch (err) {
    showUploadError(err)
  } finally {
    frameUploading.value = false
  }
}

async function handleLastFrameFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  frameUploading.value = true
  try {
    const serverUrl = await uploadImageFile(file)
    emit('update:lastFrameFile', { url: serverUrl, file })
  } catch (err) {
    showUploadError(err)
  } finally {
    frameUploading.value = false
  }
}

async function handleKlingV26TailFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  try {
    const serverUrl = await uploadImageFile(file)
    emit('update:klingV26TailFrameFile', { url: serverUrl, file })
  } catch (err) {
    showUploadError(err)
  }
}

async function handleMotionRoleFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  try {
    const serverUrl = await uploadImageFile(file)
    emit('update:motionRoleImage', { url: serverUrl, file })
  } catch (err) {
    showUploadError(err)
  }
}

function handleMotionVideoFiles(files: File[]) {
  const file = files[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  emit('update:motionVideoFile', { url, file })
}
</script>

<template>
  <section class="ap">
    <!-- 提示词（始终展示，最高优先级） -->
    <div class="ap-field ap-prompt">
      <label class="ap-label">
        <span>提示词</span>
        <span class="ap-count">{{ (prompt || '').length }}</span>
      </label>
      <a-textarea
        :model-value="prompt"
        :auto-size="{ minRows: 4, maxRows: 8 }"
        placeholder="描述你想生成的视频内容"
        class="ap-textarea"
        @update:model-value="(v) => emit('update:prompt', String(v || ''))"
      />
    </div>

    <!-- 首尾帧 -->
    <div v-if="inputMode === 'frame' && canUseFrameMode" class="ap-grid">
      <div class="ap-slot">
        <label class="ap-label">
          <span>首帧</span>
          <span class="ap-req">*</span>
        </label>
        <div v-if="firstFrameFile" class="ap-preview">
          <img :src="firstFrameFile.url" />
          <button class="ap-clear" @click="clearFrame('first')">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传"
          accept="image/*"
          :uploading="frameUploading"
          @select="handleFirstFrameFiles"
        />
      </div>

      <div class="ap-slot">
        <label class="ap-label"><span>尾帧</span></label>
        <div v-if="lastFrameFile" class="ap-preview">
          <img :src="lastFrameFile.url" />
          <button class="ap-clear" @click="clearFrame('last')">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传"
          accept="image/*"
          :uploading="frameUploading"
          @select="handleLastFrameFiles"
        />
      </div>
    </div>

    <!-- 多参考图 -->
    <div
      v-if="inputMode === 'ref' && canUseRefMode && !isKlingV26Image2VideoModel && !isSingleRefPanel"
      class="ap-field"
    >
      <label class="ap-label">
        <span>参考图</span>
        <span class="ap-count">{{ refImages.length }} / {{ maxRef }}</span>
      </label>
      <div v-if="refImages.length > 0" class="ap-thumbs">
        <div v-for="r in refImages" :key="r.id" class="ap-thumb">
          <img :src="r.url" />
          <button class="ap-thumb-del" @click="removeRef(r.id)">
            <IconClose :size="11" />
          </button>
        </div>
        <button
          v-if="refImages.length < maxRef"
          class="ap-thumb-add"
          @click="refInputRef?.click()"
        >
          <IconPlus :size="18" />
        </button>
        <!-- 隐藏 input：供"添加更多"按钮使用 -->
        <input ref="refInputRef" type="file" accept="image/*" multiple class="hidden-input" @change="handleRefSelect" />
      </div>
      <ImageDropzone
        v-else
        size="sm"
        label="上传参考图"
        accept="image/*"
        multiple
        :uploading="refUploading"
        @select="addRefImages"
      />
    </div>

    <!-- Kling v2.6 图生（首+尾） -->
    <div v-if="isKlingV26Image2VideoModel && inputMode === 'ref'" class="ap-grid">
      <div class="ap-slot">
        <label class="ap-label">
          <span>首帧</span>
          <span class="ap-req">*</span>
        </label>
        <div v-if="refImages.length > 0" class="ap-preview">
          <img :src="refImages[0]!.url" />
          <button class="ap-clear" @click="removeRef(refImages[0]!.id)">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传"
          accept="image/*"
          @select="addRefImages"
        />
      </div>

      <div class="ap-slot">
        <label class="ap-label"><span>尾帧</span></label>
        <div v-if="klingV26TailFrameFile" class="ap-preview">
          <img :src="klingV26TailFrameFile.url" />
          <button class="ap-clear" @click="clearKlingV26TailFrame">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传"
          accept="image/*"
          @select="handleKlingV26TailFiles"
        />
      </div>
    </div>

    <!-- Hailuo / Doubao 单图参考 -->
    <div v-if="isSingleRefPanel && inputMode === 'ref'" class="ap-field">
      <label class="ap-label">
        <span>参考图</span>
        <span class="ap-req">*</span>
      </label>
      <div v-if="refImages.length > 0" class="ap-preview ap-preview-tall">
        <img :src="refImages[0]!.url" />
        <button class="ap-clear" @click="removeRef(refImages[0]!.id)">
          <IconClose :size="11" />
        </button>
      </div>
      <ImageDropzone
        v-else
        size="lg"
        label="上传参考图"
        hint="支持 JPG / PNG / WebP，单张 ≤10MB"
        accept="image/*"
        :uploading="refUploading"
        @select="addRefImages"
      />
    </div>

    <!-- 动作控制 -->
    <div v-if="inputMode === 'motion'" class="ap-grid">
      <div class="ap-slot">
        <label class="ap-label">
          <span>角色图</span>
          <span class="ap-req">*</span>
        </label>
        <div v-if="motionRoleImage" class="ap-preview">
          <img :src="motionRoleImage.url" />
          <button class="ap-clear" @click="clearMotionImage">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传"
          accept="image/*"
          @select="handleMotionRoleFiles"
        />
      </div>

      <div class="ap-slot">
        <label class="ap-label">
          <span>动作视频</span>
          <span class="ap-req">*</span>
        </label>
        <div v-if="motionVideoFile" class="ap-preview">
          <video :src="motionVideoFile.url" muted preload="metadata" />
          <button class="ap-clear" @click="clearMotionVideo">
            <IconClose :size="11" />
          </button>
        </div>
        <ImageDropzone
          v-else
          size="sm"
          label="上传视频"
          accept="video/*"
          @select="handleMotionVideoFiles"
        />
      </div>
    </div>
  </section>
</template>

<style scoped>
.ap {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ===== 通用字段 ===== */
.ap-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ap-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.74rem;
  font-weight: 500;
  color: var(--text-3);
  text-transform: none;
  letter-spacing: 0;
}

.ap-req {
  color: #ff6b6b;
  font-weight: 700;
}

.ap-count {
  margin-left: auto;
  font-size: 0.7rem;
  color: var(--text-4);
  font-variant-numeric: tabular-nums;
}

/* ===== 提示词 ===== */
.ap-textarea :deep(.arco-textarea-wrapper) {
  background: var(--color-fill-1, rgba(255, 255, 255, 0.04)) !important;
  border: 1px solid var(--border-1, rgba(255, 255, 255, 0.08)) !important;
  border-radius: 8px !important;
}

.ap-textarea :deep(.arco-textarea) {
  font-size: 0.82rem !important;
  line-height: 1.6 !important;
}

/* ===== 双栏槽 ===== */
.ap-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.ap-slot {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

/* 拖放区已由 ImageDropzone 组件接管 */

/* ===== 预览 ===== */
.ap-preview {
  position: relative;
  width: 100%;
  height: 140px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-1);
  background: var(--bg-surface-3, rgba(0, 0, 0, 0.2));
}

.ap-preview-tall {
  height: 200px;
}

.ap-preview img,
.ap-preview video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ap-clear {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 999px;
  border: none;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .15s ease;
}

.ap-clear:hover {
  background: rgba(245, 63, 63, 0.85);
}

/* ===== 参考图网格 ===== */
.ap-thumbs {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.ap-thumb {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid var(--border-1);
  background: var(--bg-surface-3, rgba(0, 0, 0, 0.2));
}

.ap-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ap-thumb-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 16px;
  height: 16px;
  border-radius: 999px;
  border: none;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  cursor: pointer;
  opacity: 0;
  transition: opacity .16s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ap-thumb:hover .ap-thumb-del {
  opacity: 1;
}

.ap-thumb-add {
  aspect-ratio: 1 / 1;
  border-radius: 6px;
  border: 1px dashed var(--border-2, rgba(255, 255, 255, 0.1));
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color .14s ease, border-color .14s ease;
}

.ap-thumb-add:hover {
  color: var(--text-1);
  border-color: var(--border-3, rgba(255, 255, 255, 0.22));
}

.hidden-input {
  display: none;
}
</style>
