<script setup lang="ts">
import {
  IconCopy,
  IconRefresh,
  IconThumbUp,
  IconThumbDown,
} from '@arco-design/web-vue/es/icon'

defineProps<{
  messageId: string
  role: 'user' | 'assistant'
}>()

const emit = defineEmits<{
  copy: []
  regenerate: []
  thumbsUp: []
  thumbsDown: []
}>()
</script>

<template>
  <div class="message-actions">
    <a-tooltip v-if="role === 'user'" content="复制">
      <button type="button" class="action-btn" @click="emit('copy')">
        <IconCopy :size="16" />
      </button>
    </a-tooltip>
    <template v-else>
      <a-tooltip content="复制">
        <button type="button" class="action-btn" @click="emit('copy')">
          <IconCopy :size="16" />
        </button>
      </a-tooltip>
      <a-tooltip content="重新生成">
        <button type="button" class="action-btn" @click="emit('regenerate')">
          <IconRefresh :size="16" />
        </button>
      </a-tooltip>
      <a-tooltip content="有用">
        <button type="button" class="action-btn" @click="emit('thumbsUp')">
          <IconThumbUp :size="16" />
        </button>
      </a-tooltip>
      <a-tooltip content="无用">
        <button type="button" class="action-btn" @click="emit('thumbsDown')">
          <IconThumbDown :size="16" />
        </button>
      </a-tooltip>
    </template>
  </div>
</template>

<style scoped>
.message-actions {
  display: flex;
  align-items: center;
  gap: var(--sp-1);
  opacity: 0;
  transition: opacity var(--duration-fast) var(--ease-out);
}
/* 父级添加 .message-item 类，hover 时显示，见 style.css */

.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  color: var(--text-3);
  background: transparent;
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition:
    color var(--duration-fast),
    background var(--duration-fast);
}

.action-btn:hover {
  color: var(--primary-light);
  background: rgba(22, 93, 255, 0.12);
}
</style>
