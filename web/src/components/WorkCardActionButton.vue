<script setup lang="ts">
withDefaults(
  defineProps<{
    title?: string
    danger?: boolean
    disabled?: boolean
    active?: boolean
    stop?: boolean
    size?: number
    shape?: 'circle' | 'pill'
  }>(),
  {
    danger: false,
    disabled: false,
    active: false,
    stop: true,
    size: 30,
    shape: 'circle',
  },
)

const emit = defineEmits<{
  (e: 'click', ev: MouseEvent): void
}>()

function onClick(ev: MouseEvent) {
  if (ev.defaultPrevented) return
  if ((ev.currentTarget as HTMLButtonElement | null)?.disabled) return
  emit('click', ev)
}
</script>

<template>
  <button
    class="wca-btn"
    :class="{ danger, active, pill: shape === 'pill' }"
    :disabled="disabled"
    :title="title"
    :style="{ width: shape === 'pill' ? 'auto' : `${size}px`, height: `${size}px` }"
    @click="stop ? ($event.stopPropagation(), onClick($event)) : onClick($event)"
  >
    <slot />
  </button>
</template>

<style scoped>
.wca-btn {
  position: relative;
  display:flex;
  align-items:center;
  justify-content:center;
  gap:6px;
  padding:0;
  border:none;
  border-radius:50%;
  background:rgba(255,255,255,0.14);
  color:#fff;
  cursor:pointer;
  transition:all var(--duration-fast);
  user-select:none;
}
.wca-btn:hover:not(:disabled) { background:rgba(255,255,255,0.2); transform:translateY(-1px); }
.wca-btn:disabled { opacity:0.5; cursor:not-allowed; transform:none; }

.wca-btn.danger:hover:not(:disabled) { background:rgba(245, 63, 63, 0.5); }
.wca-btn.active { background:rgba(22, 93, 255, 0.2); box-shadow:0 0 0 1px rgba(22, 93, 255, 0.1) inset; }

.wca-btn.pill {
  border-radius:999px;
  padding:0 12px;
  min-width:64px;
  white-space: nowrap;
}

/* 触屏设备：扩大可点击面积，避免难点到 */
@media (hover: none) {
  .wca-btn {
    min-width: 40px;
    min-height: 40px;
  }
  .wca-btn.pill {
    min-height: 40px;
    padding: 0 14px;
  }
}
</style>

