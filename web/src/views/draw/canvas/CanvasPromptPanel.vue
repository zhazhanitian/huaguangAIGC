<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Message } from '@arco-design/web-vue'
import { Grid3X3, Image as ImageIcon, Play, Plus, SlidersHorizontal, Video, X } from 'lucide-vue-next'

// 参数选项类型
type RatioOption = { value: string; label: string; icon: string }
type SizeOption = { value: string; label: string }

// 模型配置类型
interface ModelConfig {
  ratios: RatioOption[]
  sizes?: SizeOption[]
  resolutions?: SizeOption[]
  durations?: SizeOption[]
  maxRefImages?: number
}

const props = defineProps<{
  mode: 'image' | 'video'
  promptText: string
  model: string
  params: { size?: string; style?: string; ratio?: string; duration?: string }
  models: Array<{ id: string; name: string; tag?: string; color?: string }>
  modelConfig?: ModelConfig
}>()

const emit = defineEmits<{
  (e: 'update', patch: {
    mode?: 'image' | 'video'
    promptText?: string
    model?: string
  }): void
  (e: 'update-params', params: { size?: string; style?: string; ratio?: string; duration?: string }): void
  (e: 'update-ref-images', images: { id: string; file: File; url: string }[]): void
  (e: 'generate'): void
}>()

// 弹出框状态
const modePopoverVisible = ref(false)
const modelPopoverVisible = ref(false)
const paramsPopoverVisible = ref(false)

// 本地参数状态
const localSize = ref(props.params.size || '')
const localRatio = ref(props.params.ratio || '')
const localDuration = ref(props.params.duration || '')

// 参考图状态
const refImages = ref<{ id: string; file: File; url: string }[]>([])
const refInputRef = ref<HTMLInputElement | null>(null)
const refDragOver = ref(false)

// 最大参考图数量
const maxRefImages = computed(() => props.modelConfig?.maxRefImages ?? 0)

// 是否支持参考图
const supportsRefImages = computed(() => maxRefImages.value > 0)

// 监听 props 变化同步本地状态
watch(() => props.params, (newParams) => {
  if (newParams.size) localSize.value = newParams.size
  if (newParams.ratio) localRatio.value = newParams.ratio
  if (newParams.duration) localDuration.value = newParams.duration
}, { deep: true })

// 监听模型配置变化，自动选择第一个可用选项
watch(() => props.modelConfig, (config) => {
  if (!config) return
  if (config.sizes?.length && !localSize.value) {
    localSize.value = config.sizes[0]!.value
  }
  if (config.resolutions?.length && !localSize.value) {
    localSize.value = config.resolutions[0]!.value
  }
  if (config.ratios?.length && !localRatio.value) {
    localRatio.value = config.ratios[0]!.value
  }
  if (config.durations?.length && !localDuration.value) {
    localDuration.value = config.durations[0]!.value
  }
  // 清理超出限制的参考图
  while (refImages.value.length > (config.maxRefImages || 0)) {
    const target = refImages.value.pop()
    if (target) URL.revokeObjectURL(target.url)
  }
}, { immediate: true })

// 计算当前可用的参数选项
const availableSizes = computed(() => props.modelConfig?.sizes || [])
const availableResolutions = computed(() => props.modelConfig?.resolutions || [])
const availableRatios = computed(() => props.modelConfig?.ratios || [])
const availableDurations = computed(() => props.modelConfig?.durations || [])

// 是否显示参数按钮
const showParamsButton = computed(() => {
  if (props.mode === 'image') {
    return availableSizes.value.length > 0 || 
           availableResolutions.value.length > 0 || 
           availableRatios.value.length > 0
  } else {
    return availableResolutions.value.length > 0 || 
           availableRatios.value.length > 0 || 
           availableDurations.value.length > 0
  }
})

// 当前选中的模型信息
const currentModel = computed(() => props.models.find(m => m.id === props.model))

// 是否有选中的参数
const hasSelectedParams = computed(() => {
  return !!(localSize.value || localRatio.value || localDuration.value)
})

// 参数显示文本
const paramsDisplayText = computed(() => {
  if (localRatio.value) {
    return localRatio.value
  }
  if (localSize.value) {
    return localSize.value
  }
  if (localDuration.value) {
    return localDuration.value
  }
  return ''
})

// 处理模式切换
function handleModeSelect(newMode: 'image' | 'video') {
  emit('update', { mode: newMode })
  modePopoverVisible.value = false
}

// 处理模型切换
function handleModelSelect(modelId: string) {
  emit('update', { model: modelId })
  modelPopoverVisible.value = false
}

// 处理提示词输入
function handlePromptInput(event: Event) {
  const target = event.target as HTMLTextAreaElement
  emit('update', { promptText: target.value })
}

// 处理参数更新
function handleSizeChange(value: string) {
  localSize.value = value
  emit('update-params', { size: value })
}

function handleRatioChange(value: string) {
  localRatio.value = value
  emit('update-params', { ratio: value })
}

function handleDurationChange(value: string) {
  localDuration.value = value
  emit('update-params', { duration: value })
}

// 参考图上传处理
function handleRefSelect(e: Event) {
  const files = (e.target as HTMLInputElement).files
  if (!files) return
  addRefFiles(Array.from(files))
  if (refInputRef.value) refInputRef.value.value = ''
}

function handleRefDrop(e: DragEvent) {
  e.preventDefault()
  refDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files) return
  addRefFiles(Array.from(files))
}

function addRefFiles(files: File[]) {
  if (!supportsRefImages.value) {
    Message.warning('当前模型不支持参考图')
    return
  }
  const imageFiles = files.filter(f => f.type.startsWith('image/'))
  if (!imageFiles.length) {
    Message.warning('请选择图片文件')
    return
  }
  const remaining = maxRefImages.value - refImages.value.length
  if (remaining <= 0) {
    Message.warning(`最多上传 ${maxRefImages.value} 张参考图`)
    return
  }
  const toAdd = imageFiles.slice(0, remaining)
  for (const file of toAdd) {
    const url = URL.createObjectURL(file)
    refImages.value.push({ id: `ref-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, file, url })
  }
  if (imageFiles.length > remaining) {
    Message.info(`已达上限，仅添加了 ${remaining} 张`)
  }
  emit('update-ref-images', refImages.value)
}

function removeRefImage(id: string) {
  const idx = refImages.value.findIndex(r => r.id === id)
  if (idx >= 0) {
    const target = refImages.value[idx]
    if (target) URL.revokeObjectURL(target.url)
    refImages.value.splice(idx, 1)
  }
  emit('update-ref-images', refImages.value)
}

// 生成
function handleGenerate() {
  emit('generate')
}
</script>

<template>
  <section class="prompt-panel">
    <!-- 参考图区域（在输入框上方） -->
    <div v-if="supportsRefImages" class="ref-section">
      <!-- 已上传的缩略图 -->
      <div v-if="refImages.length > 0" class="ref-thumbs">
        <div v-for="img in refImages" :key="img.id" class="ref-thumb">
          <img :src="img.url" alt="" />
          <button class="ref-remove" @click="removeRefImage(img.id)">
            <X :size="10" />
          </button>
        </div>
        <!-- 添加更多按钮 -->
        <button
          v-if="refImages.length < maxRefImages"
          class="ref-add-btn"
          @click="refInputRef?.click()"
        >
          <Plus :size="16" />
        </button>
        <span class="ref-count">{{ refImages.length }}/{{ maxRefImages }}</span>
      </div>
      <!-- 添加图片按钮（没有图片时） -->
      <button
        v-else
        class="ref-upload-btn"
        aria-label="添加参考图"
        title="添加参考图"
        @click="refInputRef?.click()"
        @dragover.prevent="refDragOver = true"
        @dragleave="refDragOver = false"
        @drop="handleRefDrop"
      >
        <Plus :size="18" />
      </button>
      <input
        ref="refInputRef"
        type="file"
        accept="image/*"
        multiple
        style="display: none"
        @change="handleRefSelect"
      />
    </div>

    <!-- 输入区域 -->
    <div class="input-container">
      <textarea
        :value="promptText"
        placeholder="描述你想要生成的内容..."
        class="prompt-input"
        rows="3"
        @input="handlePromptInput"
      />
    </div>

    <!-- 底部工具栏 -->
    <div class="toolbar">
      <!-- 左侧：模式选择 -->
      <div class="toolbar-left">
        <a-popover
          v-model:popup-visible="modePopoverVisible"
          trigger="click"
          position="top"
          popup-container="body"
          :unmount-on-close="true"
          content-class="canvas-elegant-popover"
          :content-style="{ padding: '6px' }"
        >
          <button class="tool-btn mode-btn" :class="{ active: true }">
            <ImageIcon v-if="mode === 'image'" :size="16" />
            <Video v-else :size="16" />
          </button>
          <template #content>
            <div class="popover-menu">
              <div
                class="arco-dropdown-option ui-option mode-option-entry"
                :class="{ 'arco-dropdown-option-active': mode === 'image' }"
                @click="handleModeSelect('image')"
              >
                <ImageIcon :size="16" />
                <span class="ui-option-title">图像生成</span>
              </div>
              <div
                class="arco-dropdown-option ui-option mode-option-entry"
                :class="{ 'arco-dropdown-option-active': mode === 'video' }"
                @click="handleModeSelect('video')"
              >
                <Video :size="16" />
                <span class="ui-option-title">视频生成</span>
              </div>
            </div>
          </template>
        </a-popover>
      </div>

      <!-- 右侧：模型、参数、生成 -->
      <div class="toolbar-right">
        <!-- 模型选择 -->
        <a-popover
          v-model:popup-visible="modelPopoverVisible"
          trigger="click"
          position="top"
          popup-container="body"
          :unmount-on-close="true"
          content-class="canvas-elegant-popover"
          :content-style="{ padding: '6px', minWidth: '210px' }"
        >
          <button class="tool-btn model-btn" :class="{ 'has-model': currentModel }" :title="currentModel?.name || '选择模型'">
            <span v-if="currentModel?.color" class="btn-model-dot" :style="{ background: currentModel.color }" />
            <Grid3X3 v-else :size="16" />
          </button>
          <template #content>
            <div class="popover-menu model-menu">
              <div
                v-for="m in models"
                :key="m.id"
                class="arco-dropdown-option ui-option model-option-entry"
                :class="{ 'arco-dropdown-option-active': model === m.id }"
                @click="handleModelSelect(m.id)"
              >
                <span v-if="m.color" class="ui-option-dot" :style="{ background: m.color }" />
                <div class="ui-option-main">
                  <div class="ui-option-header">
                    <span class="ui-option-title">{{ m.name }}</span>
                    <span v-if="m.tag" class="ui-option-badge">{{ m.tag }}</span>
                  </div>
                </div>
              </div>
            </div>
          </template>
        </a-popover>

        <!-- 参数设置（仅在有可用参数时显示） -->
        <a-popover
          v-if="showParamsButton"
          v-model:popup-visible="paramsPopoverVisible"
          trigger="click"
          position="top"
          popup-container="body"
          :unmount-on-close="true"
          content-class="canvas-elegant-popover"
          :content-style="{ padding: '8px', minWidth: '180px' }"
        >
          <button class="tool-btn params-btn" :class="{ 'has-params': hasSelectedParams }" title="参数设置">
            <span v-if="hasSelectedParams" class="params-display">{{ paramsDisplayText }}</span>
            <SlidersHorizontal v-else :size="16" />
          </button>
          <template #content>
            <div class="params-panel">
              <!-- 图像模式参数 -->
              <template v-if="mode === 'image'">
                <div v-if="availableSizes.length > 0" class="param-section">
                  <div class="param-title">分辨率</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableSizes"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localSize === opt.value }"
                      @click="handleSizeChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <div v-else-if="availableResolutions.length > 0" class="param-section">
                  <div class="param-title">分辨率</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableResolutions"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localSize === opt.value }"
                      @click="handleSizeChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <div v-if="availableRatios.length > 0" class="param-section">
                  <div class="param-title">比例</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableRatios"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localRatio === opt.value }"
                      @click="handleRatioChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
              </template>

              <!-- 视频模式参数 -->
              <template v-else>
                <div v-if="availableResolutions.length > 0" class="param-section">
                  <div class="param-title">分辨率</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableResolutions"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localSize === opt.value }"
                      @click="handleSizeChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <div v-if="availableRatios.length > 0" class="param-section">
                  <div class="param-title">比例</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableRatios"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localRatio === opt.value }"
                      @click="handleRatioChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
                <div v-if="availableDurations.length > 0" class="param-section">
                  <div class="param-title">时长</div>
                  <div class="param-row">
                    <button
                      v-for="opt in availableDurations"
                      :key="opt.value"
                      class="param-pill"
                      :class="{ active: localDuration === opt.value }"
                      @click="handleDurationChange(opt.value)"
                    >
                      {{ opt.label }}
                    </button>
                  </div>
                </div>
              </template>
            </div>
          </template>
        </a-popover>

        <!-- 生成按钮 -->
        <button
          class="generate-btn"
          :disabled="!promptText?.trim()"
          title="生成"
          @click="handleGenerate"
        >
          <Play :size="16" />
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.prompt-panel {
  position: relative;
  margin-top: auto;
  border-top: 1px solid var(--border-2);
  padding-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 参考图区域 */
.ref-section {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ref-thumbs {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.ref-thumb {
  position: relative;
  width: 36px;
  height: 36px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--border-2);
  transition: border-color 0s ease;
}

.ref-thumb:hover {
  border-color: var(--primary);
}

.ref-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ref-remove {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: rgba(245, 63, 63, 0.9);
  border: none;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0s ease;
}

.ref-thumb:hover .ref-remove {
  opacity: 1;
}

.ref-remove:hover {
  background: #F53F3F;
}

.ref-add-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: 1px dashed var(--border-2);
  background: var(--bg-surface-2);
  color: var(--primary-light);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0s ease;
}

.ref-add-btn:hover {
  border-color: var(--primary);
  color: #B2D4FF;
  background: rgba(22, 93, 255, 0.1);
}

.ref-count {
  font-size: 11px;
  color: var(--text-3);
  margin-left: 4px;
}

.ref-upload-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px dashed var(--border-2);
  background: var(--bg-surface-2);
  color: var(--primary-light);
  cursor: pointer;
  transition: all 0s ease;
}

.ref-upload-btn:hover {
  border-color: var(--primary);
  color: #B2D4FF;
  background: rgba(22, 93, 255, 0.1);
}

/* 输入区域 */
.input-container {
  position: relative;
}

.prompt-input {
  width: 100%;
  min-height: 80px;
  max-height: 200px;
  padding: 14px 16px;
  background: var(--bg-surface-3);
  border: 1px solid var(--border-2);
  border-radius: 14px;
  color: var(--text-1);
  font-size: 14px;
  line-height: 1;
  resize: none;
  transition: border-color 0s ease, box-shadow 0s ease;
}

.prompt-input:hover {
  border-color: var(--border-3);
}

.prompt-input:focus {
  outline: none;
  border-color: var(--primary);
}

.prompt-input::placeholder {
  color: var(--text-3);
}

/* 工具栏 */
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 4px;
}

.toolbar-left,
.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.popover-menu {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 128px;
}

.popover-menu.model-menu {
  min-width: 200px;
  max-height: 260px;
  overflow-y: auto;
}

.mode-option-entry,
.model-option-entry {
  align-items: center;
  min-height: 34px;
  padding: 7px 10px;
  border-radius: 8px;
  color: var(--text-2);
  transition: background 0.12s, color 0.12s;
}

.mode-option-entry:hover,
.model-option-entry:hover {
  background: var(--color-fill-2);
  color: var(--text-1);
}

.mode-option-entry.arco-dropdown-option-active,
.model-option-entry.arco-dropdown-option-active {
  background: rgba(22, 93, 255, 0.12);
  color: var(--primary, #165DFF);
}

/* 工具按钮 */
.tool-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--color-fill-1, rgba(255,255,255,0.04));
  border: none;
  border-radius: 8px;
  color: var(--text-2);
  font-size: 18px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.tool-btn:hover {
  background: var(--color-fill-2);
  color: var(--text-1);
}

.tool-btn.active {
  background: rgba(22, 93, 255, 0.1);
  color: var(--primary, #165DFF);
}

/* 生成按钮 */
.generate-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: var(--primary, #165DFF);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 18px;
  cursor: pointer;
  transition: opacity 0.12s;
}

.generate-btn:hover:not(:disabled) {
  opacity: 0.85;
}

.generate-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

/* 模型按钮颜色点 */
.model-btn.has-model {
  background: var(--color-fill-1, rgba(255,255,255,0.04));
}

.btn-model-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

/* 参数按钮显示 */
.params-btn.has-params {
  width: auto;
  min-width: 36px;
  padding: 0 10px;
  background: rgba(22, 93, 255, 0.08);
}

.params-display {
  font-size: 12px;
  font-weight: 500;
  color: var(--primary, #165DFF);
  white-space: nowrap;
}

/* 参数面板 */
.params-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px;
}

.param-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.param-title {
  font-size: 11px;
  color: var(--text-3);
  font-weight: 500;
  padding-left: 2px;
}

.param-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.param-pill {
  padding: 5px 10px;
  border-radius: 6px;
  border: none;
  background: var(--color-fill-1);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.param-pill:hover {
  background: var(--color-fill-2);
  color: var(--text-1);
}

.param-pill.active {
  background: var(--primary, #165DFF);
  color: #fff !important;
  font-weight: 500;
}

/* --- Popover 全局覆盖：极简无边框 --- */
:global(.canvas-elegant-popover.arco-popover),
:global(.canvas-elegant-popover .arco-popover-popup-content) {
  border: none !important;
  box-shadow: none !important;
}

:global(.canvas-elegant-popover .arco-popover-content) {
  border-radius: 12px !important;
  border: none !important;
  background: var(--color-bg-5, #1d1d1f) !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18) !important;
  backdrop-filter: none !important;
}

:global(body[arco-theme='light'] .canvas-elegant-popover .arco-popover-content) {
  background: #fff !important;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
}

:global(.canvas-elegant-popover .arco-popover-content-inner) {
  padding: 4px !important;
}

:global(.canvas-elegant-popover .arco-popover-arrow) {
  display: none !important;
}

/* Light 模式对比度补丁（仅必要项） */
:global(body[arco-theme='light']) .ref-add-btn:hover,
:global(body[arco-theme='light']) .ref-upload-btn:hover {
  color: var(--primary-dark);
}
:global(body[arco-theme='light']) .arco-dropdown-option-active,
:global(body[arco-theme='light']) .params-display,
:global(body[arco-theme='light']) .param-option-override.active {
  color: var(--text-1) !important;
}
</style>
