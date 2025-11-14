<script setup lang="ts">
import { computed } from "vue";
import type { ZipInspection } from "../types";

const props = defineProps<{
  inspection: ZipInspection;
  featureCount: number | null;
  geometryTypes: string[];
}>();

type ChipStatus = {
  label: string;
  status: "ok" | "warn" | "muted";
};

const essentialChips = computed<ChipStatus[]>(() => {
  const layers = props.inspection.layers;
  const hasAll = (key: keyof (typeof layers)[number]) =>
    layers.length ? layers.every((layer) => layer[key]) : false;

  return [
    { label: ".shp", status: hasAll("hasShp") ? "ok" : "warn" },
    { label: ".dbf", status: hasAll("hasDbf") ? "ok" : "warn" },
    { label: ".shx", status: hasAll("hasShx") ? "ok" : "warn" },
    { label: ".prj", status: hasAll("hasPrj") ? "ok" : "muted" },
    { label: ".cpg", status: hasAll("hasCpg") ? "ok" : "muted" },
  ];
});
</script>

<template>
  <section class="inspection-panel inspection-panel--compact">
    <div class="columns-header">
      <h3>데이터 구성 요약</h3>
      <small>필수 · 참고 확장자 상태</small>
    </div>

    <div class="chip-row chip-row--solid">
      <span
        v-for="chip in essentialChips"
        :key="chip.label"
        class="chip chip--pill"
        :class="{
          'chip--ok': chip.status === 'ok',
          'chip--warn': chip.status === 'warn',
          'chip--muted': chip.status === 'muted'
        }"
      >
        {{ chip.label }}
      </span>
    </div>

    <div class="dataset-meta" v-if="featureCount !== null">
      <div>
        <p class="label">피처 수</p>
        <strong class="value">{{ featureCount }}</strong>
      </div>
      <div>
        <p class="label">지오메트리</p>
        <strong class="value">
          {{ geometryTypes.length ? geometryTypes.join(", ") : "없음" }}
        </strong>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inspection-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 200px;
  overflow: auto;
}

.inspection-panel--compact {
  max-height: none;
  gap: 8px;
}

.chip-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row--solid {
  background: #f9fafb;
  border-radius: 999px;
  padding: 6px 10px;
  gap: 8px;
}

.chip {
  border-radius: 999px;
  padding: 2px 10px;
  font-size: 12px;
  border: 1px solid #d1d5db;
  color: #4b5563;
}

.chip--pill {
  min-width: 48px;
  text-align: center;
}

.chip-row--solid .chip {
  border-color: transparent;
  min-width: 48px;
  text-align: center;
}

.chip--ok {
  background: #ecfdf5;
  border-color: #34d399;
  color: #047857;
}

.chip--warn {
  background: #fef2f2;
  border-color: #fca5a5;
  color: #b91c1c;
}

.chip--muted {
  opacity: 0.5;
}

.dataset-meta {
  display: flex;
  gap: 16px;
  padding-top: 8px;
}

.dataset-meta .value {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: #111827;
  word-break: break-all;
}
</style>
