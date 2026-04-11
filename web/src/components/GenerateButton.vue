<script setup lang="ts">
import { useContestMode } from '../composables/useContestMode'

const props = defineProps<{
  loading?: boolean
  disabled?: boolean
  text?: string
  loadingText?: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()

const { isContestDisabled } = useContestMode()
</script>

<template>
  <a-button
    type="primary"
    long
    size="large"
    :loading="props.loading && !isContestDisabled"
    :disabled="props.disabled || isContestDisabled"
    :class="['gen-btn', { 'gen-btn--contest-disabled': isContestDisabled }]"
    @click="!isContestDisabled && emit('click')"
  >
    <template v-if="isContestDisabled">
      {{ (props.text || '开始生成') }}（比赛禁用）
    </template>
    <template v-else>
      {{ props.loading ? (props.loadingText || '生成中...') : (props.text || '开始生成') }}
    </template>
  </a-button>
</template>

<style scoped>
.gen-btn {
  font-weight: 500;
  border-radius: var(--radius-md);
  min-height: 44px;
}

/* 强制覆盖各页面 :deep 样式，确保比赛禁用时视觉置灰 */
.gen-btn--contest-disabled,
.gen-btn--contest-disabled:hover {
  opacity: 0.45 !important;
  cursor: not-allowed !important;
  transform: none !important;
  pointer-events: none;
}
</style>
