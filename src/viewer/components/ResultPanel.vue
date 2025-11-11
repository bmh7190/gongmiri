<script setup lang="ts">
import type { ViewerResult } from "../types";

const props = defineProps<{
  result: ViewerResult;
}>();

const formatPercent = (value: number) => `${value.toFixed(1)}%`;
</script>

<template>
  <section class="result-panel">
    <div class="summary-cards">
      <article>
        <p class="label">파일명</p>
        <strong class="value">{{ props.result.fileName }}</strong>
      </article>
      <article>
        <p class="label">피처 수</p>
        <strong class="value">{{ props.result.featureCount }}</strong>
      </article>
      <article>
        <p class="label">지오메트리</p>
        <strong class="value">
          {{ props.result.geometryTypes.length ? props.result.geometryTypes.join(", ") : "없음" }}
        </strong>
      </article>
    </div>

    <div class="columns-header">
      <h3>컬럼 채움 정도</h3>
      <small>채워진 비율이 낮은 컬럼부터 정렬했어요.</small>
    </div>

    <div class="column-table">
      <table>
        <thead>
          <tr>
            <th>컬럼</th>
            <th>채움률</th>
            <th>빈 값</th>
            <th>샘플</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="col in props.result.columns"
            :key="col.name"
            :class="{ 'is-empty': col.fillRate < 30 }"
          >
            <td>{{ col.name || "(이름 없음)" }}</td>
            <td>{{ formatPercent(col.fillRate) }}</td>
            <td>{{ col.empty }}</td>
            <td>
              <span v-if="col.samples.length">{{ col.samples.join(", ") }}</span>
              <span v-else>샘플 없음</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
