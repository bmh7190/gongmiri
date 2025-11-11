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
