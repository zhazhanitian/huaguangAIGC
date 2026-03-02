<script setup lang="ts">
import type { Component } from 'vue'

defineProps<{
  icon?: Component
  title: string
  description?: string
  actionText?: string
}>()

const emit = defineEmits<{
  action: []
}>()
</script>

<template>
  <div class="empty-state">
    <div v-if="icon" class="empty-icon">
      <component :is="icon" :size="64" />
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <a-button
      v-if="actionText"
      type="primary"
      class="empty-action btn-glow"
      @click="emit('action')"
    >
      {{ actionText }}
    </a-button>
  </div>
</template>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: 100%;
  margin: auto;
  box-sizing: border-box;
  padding: clamp(20px, 6vh, var(--sp-12));
  text-align: center;
  animation: fadeInEmpty var(--duration-slow) var(--ease-out);
}

@keyframes fadeInEmpty {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.empty-icon {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: var(--sp-6);
  color: var(--primary);
  opacity: 0;
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-xl);
  backdrop-filter: var(--glass-blur);
}

.empty-title {
  margin: 0 0 var(--sp-2);
  font-size: 1.125rem;
  font-weight: 600;
  color: var(--text-1);
}

.empty-desc {
  margin: 0 0 var(--sp-6);
  font-size: 0.75rem;
  color: var(--text-3);
  max-width: 280px;
  line-height: 1;
}

.empty-action {
  border-radius: var(--radius-md);
  background: var(--gradient-primary);
  border: none;
  transition: transform var(--duration-fast) var(--ease-spring),
    box-shadow var(--duration-normal) var(--ease-out);
}

.empty-action:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}
</style>
