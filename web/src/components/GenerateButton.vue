<script setup lang="ts">
const props = defineProps<{
  loading?: boolean
  disabled?: boolean
  text?: string
  loadingText?: string
}>()

const emit = defineEmits<{
  (e: 'click'): void
}>()
</script>

<template>
  <a-button
    type="primary"
    long
    size="large"
    :loading="props.loading"
    :disabled="props.disabled"
    class="gen-btn"
    @click="emit('click')"
  >
    {{ props.loading ? (props.loadingText || '生成中...') : (props.text || '开始生成') }}
  </a-button>
</template>

<style scoped>
.gen-btn {
  font-weight: 500;
  border-radius: var(--radius-md);
  min-height: 44px;
}
</style>
