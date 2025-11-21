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
        </div>
      </template>
    </div>
    <input
      ref="fileInput"
      type="file"
      accept=".zip,application/zip"
      class="drop-zone__file-input"
      @change="handleFileChange"
    />
  </div>
</template>

<style scoped>
.drop-zone {
  min-height: 260px;
  border: 2px dashed #9ca3af;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.2s, background 0.2s;
}

.drop-zone__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.drop-zone__title {
  margin: 0;
  font-size: 16px;
  color: #374151;
}

.drop-zone__actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: center;
}

.drop-zone__button {
  border: none;
  background: #111827;
  color: #fff;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
}

.drop-zone__button:hover {
  background: #1f2937;
}

.drop-zone:hover {
  border-color: #2563eb;
  background: #e0edff;
}

.drop-zone--active {
  border-color: #2563eb;
  background: #e0edff;
}

.drop-zone--loading {
  border-style: solid;
  color: #1f2937;
}

.drop-zone__file-input {
  display: none;
}
</style>
