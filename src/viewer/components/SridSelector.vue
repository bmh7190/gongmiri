<script setup lang="ts">
import type { SridCode } from "../types";
import { SRID_OPTIONS } from "../utils/srid";

const props = defineProps<{
  detected: SridCode | null | undefined;
  selected: SridCode | null;
}>();

const emit = defineEmits<{
  "update:selected": [SridCode];
}>();

const handleChange = (code: SridCode) => {
  emit("update:selected", code);
};
</script>

<template>
  <section class="srid-panel">
    <div class="columns-header">
      <h3>좌표계 (SRID)</h3>
      <small>
        <template v-if="props.detected">
          PRJ에서 {{ props.detected }} 추정
        </template>
        <template v-else>
          PRJ가 없거나 인식하지 못했어요.
        </template>
      </small>
    </div>

    <div class="srid-options">
      <label
        v-for="option in SRID_OPTIONS"
        :key="option.code"
        class="srid-option"
      >
        <input
          type="radio"
          name="srid"
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
  </section>
</template>

<style scoped>
.srid-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.srid-options {
  display: flex;
  flex-direction: column;
  gap: 8px;
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
