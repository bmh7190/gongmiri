<script setup lang="ts">
import { computed } from "vue";
import type {
  CategoryStop,
  ColumnStat,
  SizeStop,
  VisualizationNumericScale,
  VisualizationSettings,
} from "../types";

const props = defineProps<{
  columns: ColumnStat[];
  visualization: VisualizationSettings;
  categoryLegend: CategoryStop[];
  numericLegend: { color: string; label: string }[];
  sizeLegend: { field: string; min: SizeStop; max: SizeStop } | null;
  hasPoints: boolean;
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
</script>

<template>
  <section class="visualization-panel">
    <div class="columns-header">
      <h3>간단 시각화</h3>
      <small>색상, 크기, 클러스터를 빠르게 전환해 보세요.</small>
    </div>

    <div class="viz-block">
      <div class="viz-block__header">
        <h4>색상 매핑</h4>
        <div class="toggle-group toggle-group--inline">
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

    <div class="viz-block">
      <div class="viz-block__header">
        <h4>포인트 크기</h4>
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

    <div class="viz-block">
      <div class="viz-block__header">
        <h4>클러스터링</h4>
        <button
          type="button"
          class="toggle toggle--small"
          :class="{ 'toggle--active': visualization.cluster }"
          :disabled="!hasPoints"
          @click="toggleCluster"
        >
          {{ visualization.cluster ? "ON" : "OFF" }}
        </button>
      </div>
      <p class="viz-hint">
        포인트가 많을 때 클러스터를 켜면 줌 레벨에 따라 자동으로 집계되고 개수 라벨이 표시됩니다.
      </p>
      <p v-if="!hasPoints" class="viz-hint viz-hint--warn">
        현재 데이터에는 포인트 지오메트리가 없습니다.
      </p>
    </div>
  </section>
</template>
