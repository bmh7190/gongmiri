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
