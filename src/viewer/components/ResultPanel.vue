<script setup lang="ts">
import { computed } from "vue";
import type { ViewerResult } from "../types";

const props = defineProps<{
  result: ViewerResult;
}>();

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

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
          <span>{{ formatPercent(col.fillRate) }}</span>
        </div>
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
        <p class="density-meta">
          <span>채움 {{ col.filled }}</span>
          <span>빈 값 {{ col.empty }}</span>
        </p>
      </article>
    </div>
  </section>
</template>
