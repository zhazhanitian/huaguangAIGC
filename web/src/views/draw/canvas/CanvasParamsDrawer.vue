<script setup lang="ts">
const props = defineProps<{
  open: boolean
  params: { size?: string; style?: string }
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'update', params: { size?: string; style?: string }): void
}>()

function handleInput(key: 'size' | 'style', value: string) {
  emit('update', { [key]: value })
}
</script>

<template>
  <a-drawer
    v-model:visible="open"
    title="参数设置"
    width="360px"
    placement="right"
    :footer="true"
    unmount-on-close
    @cancel="emit('close')"
    @ok="emit('close')"
  >
    <div class="drawer-body">
      <a-form layout="vertical" :model="params">
        <a-form-item label="输出尺寸">
          <a-input
            :value="params.size || ''"
            placeholder="例如: 1024x1024"
            @update:model-value="handleInput('size', $event)"
          />
        </a-form-item>
        <a-form-item label="风格关键词">
          <a-input
            :value="params.style || ''"
            placeholder="例如: 油画风格, 写实"
            @update:model-value="handleInput('style', $event)"
          />
        </a-form-item>
      </a-form>
    </div>
    <template #footer>
      <a-button @click="emit('close')">取消</a-button>
      <a-button type="primary" @click="emit('close')">完成</a-button>
    </template>
  </a-drawer>
</template>

<style scoped>
.drawer-body {
  padding: 16px 0;
}
.drawer-body :deep(.arco-form-item-label-col) {
  padding-bottom: 8px;
}
.drawer-body :deep(.arco-form-item) {
  margin-bottom: 16px;
}
</style>
