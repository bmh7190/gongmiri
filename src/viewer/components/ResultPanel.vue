<script setup lang="ts">
import { computed } from "vue";
import type { ViewerResult } from "../types";

const props = defineProps<{
  result: ViewerResult;
}>();

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
const formatRatioPercent = (ratio: number | null) =>
  ratio === null ? "—" : `${(ratio * 100).toFixed(1)}%`;

const formatDataType = (type: string) => {
  switch (type) {
    case "number":
      return "숫자";
    case "string":
      return "문자";
    case "boolean":
      return "불리언";
    case "mixed":
      return "혼합";
    case "null":
      return "값 없음";
    default:
      return "기타";
  }
};

const densityColumns = computed(() => props.result.columns);
</script>

<template>
  <section class="result-panel">
    <div class="columns-header">
      <h3>컬럼 채움 정도</h3>
      <small>막대 색이 채움률을 나타내요.</small>
    </div>

    <div class="density-grid">
      <article
        v-for="col in densityColumns"
        :key="col.name"
        class="density-card"
      >
        <div class="density-header">
          <strong>{{ col.name || "(이름 없음)" }}</strong>
          <span class="density-type">{{ formatDataType(col.dataType) }}</span>
        </div>
        <p class="density-meta density-meta--top">
          <span>{{ formatPercent(col.fillRate) }}</span>
          <span v-if="col.uniqueRatio !== null">
            고유 {{ formatRatioPercent(col.uniqueRatio) }}
          </span>
        </p>
        <div class="density-bar">
          <div
            class="density-bar__fill"
            :class="{
              'density-bar__fill--low': col.fillRate < 30,
              'density-bar__fill--medium': col.fillRate >= 30 && col.fillRate < 70,
            }"
            :style="{ width: `${col.fillRate}%` }"
          />
        </div>
        <p class="density-meta density-meta--counts">
          <span>채움 {{ col.filled }}</span>
          <span>빈 값 {{ col.empty }}</span>
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.result-panel {
  flex: 1;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow: auto;
}

.density-grid {
  --density-card-height: 115px;
  --density-card-gap: 12px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  grid-auto-rows: minmax(var(--density-card-height), auto);
  gap: var(--density-card-gap);
  height: calc(
    (var(--density-card-height) + var(--density-card-gap)) * 3 - var(--density-card-gap)
  );
  overflow-y: auto;
  padding-right: 4px;
}

.density-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.density-header {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #111827;
}

.density-type {
  font-size: 12px;
  color: #6b7280;
}

.density-bar {
  height: 8px;
  border-radius: 999px;
  background: #e5e7eb;
  overflow: hidden;
}

.density-bar__fill {
  height: 100%;
  background: #0ea5e9;
  border-radius: inherit;
}

.density-bar__fill--low {
  background: #f43f5e;
}

.density-bar__fill--medium {
  background: #f59e0b;
}

.density-meta {
  margin: 0;
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #4b5563;
}

.density-meta--top {
  font-weight: 600;
}

.density-meta--counts {
  font-weight: 600;
}
</style>
