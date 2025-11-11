<script setup lang="ts">
const props = defineProps<{
  isDragging: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  "drop-file": [DragEvent];
  "drag-state": [boolean];
}>();

const handleDrop = (event: DragEvent) => {
  event.preventDefault();
  emit("drop-file", event);
  emit("drag-state", false);
};

const handleDragEnter = (event: DragEvent) => {
  event.preventDefault();
  emit("drag-state", true);
};

const handleDragLeave = (event: DragEvent) => {
  event.preventDefault();
  emit("drag-state", false);
};

const handleDragOver = (event: DragEvent) => {
  event.preventDefault();
};
</script>

<template>
  <div
    class="drop-zone"
    :class="{
      'drop-zone--active': props.isDragging,
      'drop-zone--loading': props.isLoading
    }"
    @drop="handleDrop"
    @dragenter="handleDragEnter"
    @dragleave="handleDragLeave"
    @dragover="handleDragOver"
  >
    <span v-if="props.isLoading">분석 중…</span>
    <span v-else>ZIP 파일 놓기</span>
  </div>
</template>
