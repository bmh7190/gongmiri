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
