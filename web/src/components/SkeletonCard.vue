<script setup lang="ts">
/**
 * SkeletonCard - 可复用的骨架加载卡片
 * Usage: <SkeletonCard /> | <SkeletonCard :lines="3" /> | <SkeletonCard variant="circle" />
 */
withDefaults(
  defineProps<{
    width?: string | number
    height?: string | number
    borderRadius?: string | number
    /** 矩形 | 圆形 | 文本行 */
    variant?: 'rectangle' | 'circle' | 'text'
    /** 文本行数量（variant=text 时生效） */
    lines?: number
  }>(),
  {
    width: '100%',
    height: '120px',
    borderRadius: 'var(--radius-md)',
    variant: 'rectangle',
    lines: 3,
  }
)
</script>

<template>
  <div
    class="skeleton-card"
    :class="[`skeleton-${variant}`]"
    :style="{
      width: typeof width === 'number' ? `${width}px` : width,
      height: variant === 'text' ? 'auto' : (typeof height === 'number' ? `${height}px` : height),
      borderRadius: typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius,
    }"
  >
    <!-- 矩形 / 圆形：单块骨架 -->
    <div
      v-if="variant === 'rectangle' || variant === 'circle'"
      class="skeleton-block skeleton"
      :class="{ 'skeleton-circle': variant === 'circle' }"
    />
    <!-- 文本行：多行骨架 -->
    <template v-else>
      <div
        v-for="i in lines"
        :key="i"
        class="skeleton-line skeleton"
        :style="{
          width: i === lines && lines > 1 ? '70%' : '100%',
        }"
      />
    </template>
  </div>
</template>

<style scoped>
.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.skeleton-block {
  width: 100%;
  height: 100%;
  min-height: 20px;
}

.skeleton-block.skeleton-circle {
  width: 100%;
  aspect-ratio: 1;
  border-radius: var(--radius-full);
}

.skeleton-line {
  height: 14px;
  border-radius: var(--radius-sm);
}

.skeleton-line:last-child {
  align-self: flex-start;
}
</style>
