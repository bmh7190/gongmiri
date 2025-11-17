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
  description: string;
  missing: boolean;
};

const essentialChips = computed<ChipStatus[]>(() => {
  const layers = props.inspection.layers;
  const hasAll = (key: keyof (typeof layers)[number]) =>
    layers.length ? layers.every((layer) => layer[key]) : false;
  const allHaveSpatialIndex = layers.length
    ? layers.every(
        (layer) =>
          layer.hasQix ||
          (layer.hasSbn && layer.hasSbx),
      )
    : false;

  return [
    {
      label: ".shp",
      status: hasAll("hasShp") ? "ok" : "warn",
      description: "지오메트리",
      missing: !hasAll("hasShp"),
    },
    {
      label: ".dbf",
      status: hasAll("hasDbf") ? "ok" : "warn",
      description: "속성 테이블",
      missing: !hasAll("hasDbf"),
    },
    {
      label: ".shx",
      status: hasAll("hasShx") ? "ok" : "warn",
      description: "레코드 인덱스",
      missing: !hasAll("hasShx"),
    },
    {
      label: ".prj",
      status: hasAll("hasPrj") ? "ok" : "muted",
      description: "좌표계",
      missing: !hasAll("hasPrj"),
    },
    {
      label: ".cpg",
      status: hasAll("hasCpg") ? "ok" : "muted",
      description: "인코딩",
      missing: !hasAll("hasCpg"),
    },
    {
      label: ".qix/.sbn",
      status: allHaveSpatialIndex ? "ok" : "muted",
      description: "공간 인덱스",
      missing: !allHaveSpatialIndex,
    },
  ];
});

const featureCountLabel = computed(() => {
  if (props.featureCount === null) return "집계 중";
  return props.featureCount.toLocaleString();
});

const geometryBadges = computed(() => {
  if (!props.geometryTypes.length) return ["지오메트리 없음"];
  return props.geometryTypes;
});
</script>

<template>
  <section class="inspection-panel">
    <header class="inspection-panel__header">
      <h3>데이터 구성 요약</h3>
    </header>

    <div class="dataset-summary">
      <article class="summary-card">
        <p class="summary-label">피처 수</p>
        <strong class="summary-value">{{ featureCountLabel }}</strong>
      </article>

      <article class="summary-card">
        <p class="summary-label">감지된 타입</p>
        <div class="geometry-badges">
          <span
            v-for="type in geometryBadges"
            :key="type"
            class="geometry-chip"
          >
            {{ type }}
          </span>
        </div>
      </article>
    </div>

    <div class="chip-row chip-row--solid">
      <div
        v-for="chip in essentialChips"
        :key="chip.label"
        class="chip chip--pill"
        :class="{
          'chip--ok': chip.status === 'ok',
          'chip--warn': chip.status === 'warn',
          'chip--muted': chip.status === 'muted'
        }"
      >
        <div class="chip__label">
          <span class="chip__dot" :class="{ 'chip__dot--missing': chip.missing }" />
          {{ chip.label }}
        </div>
        <small>{{ chip.description }}</small>
      </div>
    </div>
  </section>
</template>

<style scoped>
.inspection-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
}

.inspection-panel__header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.inspection-panel__header h3 {
  margin: 0;
  font-size: 16px;
  color: #111827;
}

.dataset-summary {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
}

.summary-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 14px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.summary-label {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.summary-value {
  font-size: 20px;
  color: #111827;
}

.summary-hint {
  font-size: 11px;
  color: #9ca3af;
}

.geometry-badges {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.geometry-chip {
  padding: 2px 10px;
  border-radius: 999px;
  font-size: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  color: #1f2937;
}

.chip-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chip-group__label {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.chip-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.chip-row--solid {
  background: #fff;
  border-radius: 12px;
  padding: 0;
  gap: 8px;
}

.chip {
  border-radius: 12px;
  padding: 10px 12px;
  font-size: 12px;
  border: 1px solid #e5e7eb;
  color: #111827;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 72px;
  background: #fff;
}

.chip--pill {
  text-align: left;
}

.chip-row--solid .chip {
  border-color: transparent;
}

.chip--ok {
  border-color: #34d399;
}

.chip--warn {
  border-color: #f87171;
}

.chip--muted {
  border-color: #d1d5db;
  color: #6b7280;
}

.chip__label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}

.chip__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
}

.chip__dot--missing {
  background: #ef4444;
}
</style>
