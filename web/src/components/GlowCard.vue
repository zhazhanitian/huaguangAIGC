<script setup lang="ts">
withDefaults(
  defineProps<{
    glowColor?: string
  }>(),
  {
    glowColor: 'var(--primary)',
  }
)
</script>

<template>
  <div class="glow-card" :style="{ '--glow-color': glowColor }">
    <slot />
  </div>
</template>

<style scoped>
.glow-card {
  position: relative;
  padding: var(--sp-6);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  border-radius: var(--radius-lg);
  backdrop-filter: var(--glass-blur);
  transition:
    transform var(--duration-normal) var(--ease-spring),
    box-shadow var(--duration-normal) var(--ease-out),
    border-color var(--duration-normal) var(--ease-out);
}

.glow-card:hover {
  transform: translateY(-2px);
  border-color: color-mix(in srgb, var(--glow-color) 40%, transparent);
  box-shadow:
    var(--shadow-md),
    0 0 24px color-mix(in srgb, var(--glow-color) 15%, transparent);
}
</style>
