<script setup lang="ts">
import { ref } from "vue";

const props = defineProps<{
  isDragging: boolean;
  isLoading: boolean;
}>();

const emit = defineEmits<{
  "drop-file": [DragEvent];
  "drag-state": [boolean];
  "select-file": [File];
}>();

const fileInput = ref<HTMLInputElement | null>(null);

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

const triggerFileDialog = () => {
  fileInput.value?.click();
};

const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) {
    emit("select-file", file);
  }
  input.value = "";
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
    <div class="drop-zone__content">
      <span v-if="props.isLoading">분석 중…</span>
      <template v-else>
        <p class="drop-zone__title">ZIP 파일을 드래그하거나</p>
        <div class="drop-zone__actions">
          <button type="button" class="drop-zone__button" @click="triggerFileDialog">
            파일 선택하기
          </button>
          <small>.zip만 선택됩니다</small>
        </div>
      </template>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".zip,application/zip"
      class="sr-only"
      @change="handleFileChange"
    />
  </div>
</template>
