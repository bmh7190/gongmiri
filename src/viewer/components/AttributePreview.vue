<script setup lang="ts">
import { computed } from "vue";
import type { EncodingOption } from "../types";

const props = defineProps<{
  properties: Record<string, unknown>;
  encoding: EncodingOption;
  detectedEncoding?: EncodingOption;
  hasCpg?: boolean;
}>();

const emit = defineEmits<{
  "change-encoding": [EncodingOption];
}>();

const rows = computed(() => Object.entries(props.properties).slice(0, 12));

const setEncoding = (value: EncodingOption) => {
  if (props.encoding === value) return;
  emit("change-encoding", value);
};
</script>

<template>
  <section class="attribute-panel">
    <div class="columns-header">
      <h3>속성 미리보기</h3>
      <small>첫 번째 피처 기준 · 최대 12개 필드</small>
    </div>

    <div class="encoding-controls">
      <div>
        <p class="label">DBF 인코딩</p>
        <small>
          <template v-if="props.detectedEncoding">
            CPG에서 {{ props.detectedEncoding.toUpperCase() }} 감지
          </template>
          <template v-else-if="props.hasCpg">
            CPG 파일 존재 · 기본값 사용
          </template>
          <template v-else>
            CPG 없음 · 직접 선택하세요
          </template>
        </small>
      </div>
      <div class="toggle-group">
        <button
          type="button"
          class="toggle"
          :class="{ 'toggle--active': props.encoding === 'utf-8' }"
          @click="setEncoding('utf-8')"
        >
          UTF-8
        </button>
        <button
          type="button"
          class="toggle"
          :class="{ 'toggle--active': props.encoding === 'cp949' }"
          @click="setEncoding('cp949')"
        >
          CP949
        </button>
      </div>
    </div>

    <div class="attribute-table">
      <table>
        <tbody>
          <tr v-for="[key, value] in rows" :key="key">
            <th>{{ key }}</th>
            <td>{{ value ?? "—" }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
