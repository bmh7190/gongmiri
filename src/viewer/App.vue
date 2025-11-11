<script setup lang="ts">
import { computed, ref } from "vue";
import type { FeatureCollection, Feature, Geometry } from "geojson";
import shp from "shpjs";

type ColumnStat = {
  name: string;
  filled: number;
  empty: number;
  fillRate: number;
  samples: string[];
};

type ViewerResult = {
  fileName: string;
  featureCount: number;
  geometryTypes: string[];
  columns: ColumnStat[];
};

const isDragging = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const result = ref<ViewerResult | null>(null);

const prevent = (e: DragEvent) => {
  e.preventDefault();
  if (e.type === "dragenter") isDragging.value = true;
  if (e.type === "dragleave") isDragging.value = false;
};

const resetDragState = () => {
  isDragging.value = false;
};

const onDrop = async (event: DragEvent) => {
  event.preventDefault();
  resetDragState();

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    errorMessage.value = "드롭한 파일을 찾지 못했습니다.";
    return;
  }
  if (!/\.zip$/i.test(file.name)) {
    errorMessage.value = "ZIP 파일을 올려주세요.";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";
  result.value = null;

  try {
    const buffer = await file.arrayBuffer();
    const geojson = await shp(buffer);
    const collection = normalizeCollection(geojson);
    result.value = summarizeCollection(collection, file.name);
  } catch (err) {
    console.error("[gongmiri] parse error", err);
    errorMessage.value = "SHP/DBF를 읽는 중 문제가 발생했습니다.";
  } finally {
    isLoading.value = false;
  }
};

const normalizeCollection = (
  geojson: unknown,
): FeatureCollection<Geometry> => {
  if (
    geojson &&
    typeof geojson === "object" &&
    "type" in geojson &&
    geojson.type === "FeatureCollection"
  ) {
    return geojson as FeatureCollection<Geometry>;
  }

  if (Array.isArray(geojson)) {
    const mergedFeatures: Feature<Geometry>[] = [];
    for (const item of geojson) {
      if (item?.type === "FeatureCollection") {
        mergedFeatures.push(...(item.features as Feature<Geometry>[]));
      }
    }
    if (mergedFeatures.length > 0) {
      return {
        type: "FeatureCollection",
        features: mergedFeatures,
      };
    }
  }

  throw new Error("지원하지 않는 GeoJSON 형식입니다.");
};

const summarizeCollection = (
  collection: FeatureCollection<Geometry>,
  fileName: string,
): ViewerResult => {
  const features: Feature<Geometry>[] = collection.features ?? [];
  const allColumns = new Set<string>();

  for (const feature of features) {
    if (feature.properties) {
      Object.keys(feature.properties).forEach((key) => allColumns.add(key));
    }
  }

  const columns = Array.from(allColumns).map<ColumnStat>((name) => {
    let filled = 0;
    let empty = 0;
    const samples: string[] = [];

    for (const feature of features) {
      const value = feature.properties?.[name];
      const isEmpty =
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "");

      if (isEmpty) {
        empty += 1;
      } else {
        filled += 1;
        if (samples.length < 3) samples.push(String(value));
      }
    }

    const fillRate = features.length
      ? (filled / features.length) * 100
      : 0;

    return {
      name,
      filled,
      empty,
      fillRate,
      samples,
    };
  });

  columns.sort((a, b) => a.fillRate - b.fillRate);

  const geometryTypeSet = new Set<string>();
  for (const feature of features) {
    geometryTypeSet.add(feature.geometry?.type ?? "NULL");
  }
  const geometryTypes = Array.from(geometryTypeSet.values()).sort();

  return {
    fileName,
    featureCount: features.length,
    geometryTypes,
    columns,
  };
};

const formatPercent = (value: number) => `${value.toFixed(1)}%`;

const statusMessage = computed(() => {
  if (isLoading.value) return "ZIP을 해석하는 중입니다…";
  if (errorMessage.value) return errorMessage.value;
  if (result.value) return `${result.value.fileName} 분석 완료`;
  return "Shapefile ZIP을 드래그하거나 선택하세요.";
});
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <h2>공미리 — 공간데이터 미리보기</h2>
      <p>{{ statusMessage }}</p>
    </header>

    <div
      class="drop-zone"
      @drop="onDrop"
      @dragenter="prevent"
      @dragover="prevent"
      @dragleave="prevent"
      :class="{ 'drop-zone--active': isDragging, 'drop-zone--loading': isLoading }"
    >
      <span v-if="isLoading">분석 중…</span>
      <span v-else>ZIP 파일 놓기</span>
    </div>

    <section v-if="result" class="result-panel">
      <div class="summary-cards">
        <article>
          <p class="label">파일명</p>
          <strong class="value">{{ result.fileName }}</strong>
        </article>
        <article>
          <p class="label">피처 수</p>
          <strong class="value">{{ result.featureCount }}</strong>
        </article>
        <article>
          <p class="label">지오메트리</p>
          <strong class="value">
            {{ result.geometryTypes.length ? result.geometryTypes.join(", ") : "없음" }}
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
            <tr v-for="col in result.columns" :key="col.name" :class="{ 'is-empty': col.fillRate < 30 }">
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

    <p v-else-if="errorMessage" class="error-text">
      {{ errorMessage }}
    </p>
  </div>
</template>

<style scoped>
.popup-container {
  width: 420px;
  min-height: 420px;
  max-height: 520px;
  padding: 24px;
  background: #fff;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.header h2 {
  margin: 0;
  font-size: 20px;
}

.header p {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 14px;
}

.drop-zone {
  flex: 1;
  border: 2px dashed #9ca3af;
  border-radius: 12px;
  padding: 32px;
  text-align: center;
  color: #6b7280;
  background: #f9fafb;
  display: flex;
  align-items: center;
  justify-content: center;
}

.drop-zone:hover {
  border-color: #2563eb;
  background: #eff6ff;
  color: #1d4ed8;
}

.drop-zone--active {
  border-color: #2563eb;
  background: #e0edff;
}

.drop-zone--loading {
  border-style: solid;
  color: #1f2937;
}

.result-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  max-height: 360px;
  overflow: auto;
}

.summary-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.summary-cards article {
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 12px;
  background: #f9fafb;
}

.label {
  margin: 0;
  font-size: 12px;
  color: #6b7280;
}

.value {
  display: block;
  margin-top: 6px;
  font-size: 14px;
  color: #111827;
  word-break: break-all;
}

.columns-header {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.columns-header h3 {
  margin: 0;
  font-size: 16px;
}

.columns-header small {
  color: #6b7280;
}

.column-table {
  overflow: auto;
}

.column-table table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.column-table th,
.column-table td {
  text-align: left;
  padding: 8px;
  border-bottom: 1px solid #e5e7eb;
}

.column-table th {
  font-weight: 600;
  color: #4b5563;
}

.column-table tr.is-empty td {
  background: #fef2f2;
  color: #991b1b;
}

.error-text {
  margin: 0;
  color: #dc2626;
}
</style>
