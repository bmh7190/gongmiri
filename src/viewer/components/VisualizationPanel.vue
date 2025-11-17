<script setup lang="ts">
import { computed } from "vue";
import type {
  CategoryStop,
  ColumnStat,
  NumericLegendEntry,
  SizeLegend,
  VisualizationNumericScale,
  VisualizationSettings,
} from "../types";

const props = defineProps<{
  columns: ColumnStat[];
  visualization: VisualizationSettings;
  categoryLegend: CategoryStop[];
  numericLegend: NumericLegendEntry[];
  sizeLegend: SizeLegend;
  hasPoints: boolean;
  embedded?: boolean;
}>();

const emit = defineEmits<{
  (e: "update-visualization", value: Partial<VisualizationSettings>): void;
}>();

const textColumns = computed(() =>
  props.columns.filter((column) => column.dataType === "string"),
);

const numericColumns = computed(() =>
  props.columns.filter((column) => column.dataType === "number"),
);

const colorModeOptions: Array<{ label: string; value: VisualizationSettings["colorMode"] }> = [
  { label: "기본", value: "default" },
  { label: "범주 색상", value: "category" },
  { label: "연속 색상", value: "continuous" },
];

const numericScaleOptions: Array<{ label: string; value: VisualizationNumericScale }> = [
  { label: "분위수(5)", value: "quantile" },
  { label: "등간격", value: "equal" },
];

const handleColorMode = (mode: VisualizationSettings["colorMode"]) => {
  emit("update-visualization", { colorMode: mode });
};

const handleCategoryField = (value: string) => {
  emit("update-visualization", {
    categoryField: value || null,
    colorMode: value ? "category" : "default",
  });
};

const handleNumericField = (value: string) => {
  emit("update-visualization", {
    numericField: value || null,
    colorMode: value ? "continuous" : "default",
  });
};

const handleScaleChange = (value: VisualizationNumericScale) => {
  emit("update-visualization", { numericScale: value });
};

const handleSizeField = (value: string) => {
  emit("update-visualization", { pointSizeField: value || null });
};

const handleSizeRangeChange = (type: "min" | "max", value: number) => {
  if (Number.isNaN(value)) return;
  const range = props.visualization.pointSizeRange;
  const next: [number, number] =
    type === "min" ? [value, range[1]] : [range[0], value];
  emit("update-visualization", { pointSizeRange: next });
};

const toggleCluster = () => {
  if (!props.hasPoints) return;
  emit("update-visualization", { cluster: !props.visualization.cluster });
};

const colorModeHasDetail = computed(
  () => props.visualization.colorMode !== "default",
);

const panelClasses = computed(() => ({
  "visualization-panel": true,
  "visualization-panel--embedded": props.embedded,
}));
</script>

<template>
  <section :class="panelClasses">
    <div v-if="!embedded" class="columns-header">
      <h3>간단 시각화</h3>
      <small>색상, 크기, 클러스터를 빠르게 전환해 보세요.</small>
    </div>

    <div
      class="viz-block"
      :class="{ 'viz-block--embedded': embedded }"
    >
      <div
        class="viz-block__header"
        :class="{ 'viz-block__header--embedded': embedded && colorModeHasDetail }"
      >
        <template v-if="embedded">
          <span class="viz-inline-title">색상 옵션</span>
        </template>
        <h4 v-else>색상 매핑</h4>
        <div class="toggle-group toggle-group--inline viz-toggle-group">
          <button
            v-for="option in colorModeOptions"
            :key="option.value"
            type="button"
            class="toggle toggle--small"
            :class="{ 'toggle--active': visualization.colorMode === option.value }"
            @click="handleColorMode(option.value)"
          >
            {{ option.label }}
          </button>
        </div>
      </div>

      <div
        v-if="visualization.colorMode === 'category'"
        class="viz-control"
      >
        <label for="category-field">범주 컬럼</label>
        <select
          id="category-field"
          :value="visualization.categoryField ?? ''"
          @change="handleCategoryField(($event.target as HTMLSelectElement).value)"
        >
          <option value="">선택 안 함</option>
          <option
            v-for="column in textColumns"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name || "(이름 없음)" }}
          </option>
        </select>
        <p v-if="!textColumns.length" class="viz-hint">
          텍스트 컬럼이 없어 범주 색상맵을 만들 수 없습니다.
        </p>
      </div>

      <div
        v-else-if="visualization.colorMode === 'continuous'"
        class="viz-control"
      >
        <label for="numeric-field">숫자 컬럼</label>
        <select
          id="numeric-field"
          :value="visualization.numericField ?? ''"
          @change="handleNumericField(($event.target as HTMLSelectElement).value)"
        >
          <option value="">선택 안 함</option>
          <option
            v-for="column in numericColumns"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name || "(이름 없음)" }}
          </option>
        </select>
        <label class="viz-inline-label" for="numeric-scale">스케일</label>
        <select
          id="numeric-scale"
          :value="visualization.numericScale"
          @change="handleScaleChange(($event.target as HTMLSelectElement).value as VisualizationNumericScale)"
        >
          <option
            v-for="option in numericScaleOptions"
            :key="option.value"
            :value="option.value"
          >
            {{ option.label }}
          </option>
        </select>
        <p v-if="!numericColumns.length" class="viz-hint">
          숫자 컬럼이 없어 연속 색상맵을 만들 수 없습니다.
        </p>
      </div>

      <div v-if="visualization.colorMode === 'category' && categoryLegend.length" class="viz-legend">
        <p class="viz-legend__title">범례</p>
        <ul>
          <li
            v-for="entry in categoryLegend"
            :key="entry.value"
          >
            <span
              class="viz-swatch"
              :style="{ backgroundColor: entry.color }"
            />
            <span class="viz-legend__label">
              {{ entry.value }} · {{ (entry.ratio * 100).toFixed(1) }}%
            </span>
          </li>
        </ul>
      </div>

      <div v-else-if="visualization.colorMode === 'continuous' && numericLegend.length" class="viz-legend">
        <p class="viz-legend__title">범례</p>
        <ul>
          <li
            v-for="entry in numericLegend"
            :key="entry.color"
          >
            <span
              class="viz-swatch"
              :style="{ backgroundColor: entry.color }"
            />
            <span class="viz-legend__label">{{ entry.label }}</span>
          </li>
        </ul>
      </div>
    </div>

    <p
      v-if="!hasPoints"
      class="viz-hint viz-hint--warn"
    >
      포인트 지오메트리가 없어 크기·클러스터 옵션이 숨겨졌습니다.
    </p>

    <div
      class="viz-block"
      :class="{ 'viz-block--embedded': embedded }"
      v-if="hasPoints"
    >
      <div
        class="viz-block__header"
        :class="{ 'viz-block__header--embedded': embedded }"
      >
        <template v-if="embedded">
          <span class="viz-inline-title">포인트 크기</span>
        </template>
        <h4 v-else>포인트 크기</h4>
      </div>
      <div class="viz-control">
        <label for="size-field">숫자 컬럼</label>
        <select
          id="size-field"
          :value="visualization.pointSizeField ?? ''"
          @change="handleSizeField(($event.target as HTMLSelectElement).value)"
        >
          <option value="">선택 안 함</option>
          <option
            v-for="column in numericColumns"
            :key="column.name"
            :value="column.name"
          >
            {{ column.name || "(이름 없음)" }}
          </option>
        </select>
      </div>
      <div
        v-if="visualization.pointSizeField"
        class="viz-control viz-control--range"
      >
        <label>
          최소 반경(px)
          <input
            type="number"
            min="2"
            max="40"
            :value="visualization.pointSizeRange[0]"
            @input="handleSizeRangeChange('min', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
        <label>
          최대 반경(px)
          <input
            type="number"
            min="4"
            max="60"
            :value="visualization.pointSizeRange[1]"
            @input="handleSizeRangeChange('max', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
      <div v-if="sizeLegend" class="viz-legend viz-legend--size">
        <p class="viz-legend__title">크기 범례</p>
        <div class="size-legend-row">
          <div class="size-legend__item">
            <span
              class="size-dot"
              :style="{ width: `${sizeLegend.min.radius * 2}px`, height: `${sizeLegend.min.radius * 2}px` }"
            />
            <small>{{ sizeLegend.min.value.toFixed(2) }}</small>
          </div>
          <div class="size-legend__item">
            <span
              class="size-dot"
              :style="{ width: `${sizeLegend.max.radius * 2}px`, height: `${sizeLegend.max.radius * 2}px` }"
            />
            <small>{{ sizeLegend.max.value.toFixed(2) }}</small>
          </div>
        </div>
      </div>
    </div>

    <div
      v-if="hasPoints"
      class="viz-block"
      :class="{ 'viz-block--embedded': embedded }"
    >
      <div
        class="viz-block__header"
        :class="{ 'viz-block__header--embedded': embedded }"
      >
        <template v-if="embedded">
          <span class="viz-inline-title">클러스터링</span>
        </template>
        <h4 v-else>클러스터링</h4>
        <button
          type="button"
          class="toggle toggle--small cluster-toggle"
          :class="{ 'toggle--active': visualization.cluster }"
          @click="toggleCluster"
        >
          {{ visualization.cluster ? "ON" : "OFF" }}
        </button>
      </div>
      <p class="viz-hint">
        포인트가 많을 때 클러스터를 켜면 줌 레벨에 따라 자동으로 집계되고 개수 라벨이 표시됩니다.
      </p>
    </div>
  </section>
</template>

<style scoped>
.visualization-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  background: #fff;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.visualization-panel--embedded {
  border: none;
  padding: 0;
  background: transparent;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.visualization-panel--embedded :deep(svg) {
  width: 12px;
  height: 12px;
}

.viz-block {
  border: 1px solid #f3f4f6;
  border-radius: 12px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: #f9fafb;
}

.viz-block__header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
}

.viz-block__header--embedded {
  padding-bottom: 4px;
  border-bottom: 1px solid #f3f4f6;
}

.viz-inline-title {
  font-weight: 600;
  font-size: 13px;
  color: #111827;
}

.viz-block--embedded {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 12px;
  background: #fff;
}

.viz-block__header h4 {
  margin: 0;
  font-size: 14px;
}

.viz-toggle-group {
  display: grid;
  grid-template-columns: repeat(3, minmax(60px, 1fr));
  grid-auto-flow: column;
  gap: 6px;
  width: fit-content;
  max-width: 210px;
}

.viz-toggle-group :deep(.toggle--small) {
  width: 100%;
  justify-content: center;
}

.cluster-toggle {
  min-width: 60px;
  max-width: 70px;
  text-align: center;
  justify-content: center;
  width: 100%;
}

.viz-control {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
}

.viz-control label {
  font-weight: 600;
  font-size: 12px;
  color: #374151;
}

.viz-control select,
.viz-control input[type="number"] {
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 6px 8px;
  font-size: 12px;
  background: #fff;
}

.viz-control--range {
  flex-direction: row;
  gap: 12px;
}

.viz-control--range label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.viz-inline-label {
  font-weight: 600;
  margin-top: 4px;
}

.viz-hint {
  margin: 0;
  color: #6b7280;
  font-size: 12px;
}

.viz-hint--warn {
  color: #b91c1c;
}

.viz-legend {
  border-top: 1px solid #e5e7eb;
  padding-top: 8px;
}

.viz-legend__title {
  margin: 0 0 6px;
  font-size: 12px;
  color: #374151;
  font-weight: 600;
}

.viz-legend ul {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.viz-swatch {
  width: 16px;
  height: 16px;
  border-radius: 4px;
  display: inline-block;
  margin-right: 6px;
  border: 1px solid rgba(0, 0, 0, 0.08);
}

.viz-legend__label {
  font-size: 12px;
  color: #374151;
}

.viz-legend--size {
  border: none;
  padding: 0;
}

.size-legend-row {
  display: flex;
  justify-content: space-between;
  gap: 16px;
}

.size-legend__item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  color: #4b5563;
  font-size: 12px;
}

.size-dot {
  display: inline-flex;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.7);
  border: 1px solid rgba(14, 116, 144, 0.8);
}
</style>
