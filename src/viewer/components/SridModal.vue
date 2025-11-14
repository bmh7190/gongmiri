<script setup lang="ts">
import type { SridCode } from "../types";
import { SRID_OPTIONS } from "../utils/srid";

const props = defineProps<{
  selected: SridCode | null;
}>();

const emit = defineEmits<{
  "update:selected": [SridCode];
  confirm: [];
  cancel: [];
}>();

const handleChange = (code: SridCode) => {
  emit("update:selected", code);
};

const handleConfirm = () => {
  emit("confirm");
};

const handleCancel = () => {
  emit("cancel");
};
</script>

<template>
  <div class="modal-backdrop">
    <section class="modal-panel">
      <header class="modal-header">
        <div>
          <h3>좌표계를 선택해주세요</h3>
          <p>PRJ 정보를 찾지 못했어요. 데이터가 어떤 좌표계를 사용하는지 확인 후 선택해야 정확히 재투영할 수 있습니다.</p>
        </div>
        <button type="button" class="modal-close" aria-label="닫기" @click="handleCancel">
          ✕
        </button>
      </header>

      <div class="modal-body">
        <label
          v-for="option in SRID_OPTIONS"
          :key="option.code"
          class="srid-option srid-option--modal"
        >
          <input
            type="radio"
            name="srid-modal"
            :value="option.code"
            :checked="props.selected === option.code"
            @change="handleChange(option.code)"
          />
          <div class="srid-option__meta">
            <strong>{{ option.name }}</strong>
            <p>{{ option.description }}</p>
          </div>
        </label>
      </div>

      <footer class="modal-actions">
        <button type="button" class="reset-button reset-button--subtle" @click="handleCancel">
          나중에 다시
        </button>
        <button
          type="button"
          class="reset-button"
          :disabled="!props.selected"
          @click="handleConfirm"
        >
          선택 완료
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 20px;
  box-sizing: border-box;
}

.modal-panel {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-header p {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.4;
}

.modal-close {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 280px;
  overflow-y: auto;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.srid-option--modal {
  border-color: #e5e7eb;
}

.srid-option {
  display: flex;
  gap: 12px;
  border: 1px solid #d1d5db;
  border-radius: 10px;
  padding: 10px;
  cursor: pointer;
  align-items: flex-start;
}

.srid-option input[type="radio"] {
  margin-top: 4px;
}

.srid-option__meta strong {
  display: block;
  font-size: 13px;
  margin-bottom: 2px;
  color: #111827;
}

.srid-option__meta p {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}
</style>
