<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { measureTextWidth } from "../utils/text-measure";
import type {
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureId,
  EncodingOption,
} from "../types";

const ROW_HEIGHT = 30;
const HEADER_HEIGHT = ROW_HEIGHT;
const BUFFER_ROWS = 6;
const DEFAULT_HEIGHT = 360;
const MIN_COLUMN_WIDTH = 0;
const MIN_ID_COLUMN_WIDTH = 44;
const CELL_HORIZONTAL_PADDING = 14;

const props = defineProps<{
  collection: FeatureCollectionGeometry | null;
  columns: ColumnStat[];
  selectedId: FeatureId | null;
  encoding: EncodingOption;
  encodingChanging?: boolean;
  detectedEncoding?: EncodingOption;
  hasCpg?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", value: FeatureId): void;
  (e: "change-encoding", value: EncodingOption): void;
}>();

const viewportRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(DEFAULT_HEIGHT);
let resizeObserver: ResizeObserver | null = null;

const rows = computed(() => {
  const features = props.collection?.features ?? [];
  return features.map((feature, index) => ({
    id: String(feature.id ?? `row-${index}`) as FeatureId,
    properties: feature.properties ?? {},
  }));
});

const columnOrder = computed(() => {
  if (props.columns?.length) {
    return props.columns.map((col) => col.name).filter((name) => !!name);
  }
  const firstRow = rows.value[0]?.properties ?? {};
  return Object.keys(firstRow);
});

const columnWidths = computed(() => {
  const widths = new Map<string, number>();
  if (!columnOrder.value.length) return widths;
  for (const column of columnOrder.value) {
    const values = rows.value.map((row) => row.properties?.[column]);
    const maxWidth = measureMaxWidth([column, ...values]);
    widths.set(column, Math.max(MIN_COLUMN_WIDTH, Math.ceil(maxWidth + CELL_HORIZONTAL_PADDING)));
  }

  return widths;
});

const idColumnWidth = computed(() => {
  const maxIndexLabel = rows.value.length
    ? String(rows.value.length)
    : "0";
  const measured = measureTextWidth(maxIndexLabel);
  return Math.max(MIN_ID_COLUMN_WIDTH, Math.ceil(measured + CELL_HORIZONTAL_PADDING));
});

const rowTemplate = computed(() => {
  const dynamicColumns = columnOrder.value.length
    ? columnOrder.value.map((name) =>
      `${columnWidths.value.get(name) ?? MIN_COLUMN_WIDTH}px`,
    )
    : [`minmax(${MIN_COLUMN_WIDTH}px, 1fr)`];
  return [`${idColumnWidth.value}px`, ...dynamicColumns].join(" ");
});

const totalRows = computed(() => rows.value.length);
const totalHeight = computed(() => totalRows.value * ROW_HEIGHT);

const startIndex = computed(() =>
  Math.max(0, Math.floor(effectiveScrollTop.value / ROW_HEIGHT)),
);

const endIndex = computed(() =>
  Math.min(
    totalRows.value,
    startIndex.value +
      Math.ceil(
        Math.max(0, viewportHeight.value - HEADER_HEIGHT) / ROW_HEIGHT,
      ) +
      BUFFER_ROWS,
  ),
);

const visibleRows = computed(() =>
  rows.value.slice(startIndex.value, endIndex.value),
);

const translateY = computed(() => startIndex.value * ROW_HEIGHT);

const idIndexMap = computed(() => {
  const map = new Map<FeatureId, number>();
  rows.value.forEach((row, index) => {
    map.set(row.id, index);
  });
  return map;
});

const effectiveScrollTop = computed(() =>
  Math.max(0, scrollTop.value - HEADER_HEIGHT),
);

const handleScroll = () => {
  const viewport = viewportRef.value;
  if (!viewport) return;
  scrollTop.value = viewport.scrollTop;
};

const handleRowClick = (rowId: FeatureId) => {
  emit("select", rowId);
};

const ensureRowVisible = (rowId: FeatureId | null) => {
  if (!rowId) return;
  const viewport = viewportRef.value;
  if (!viewport) return;
  const index = idIndexMap.value.get(rowId);
  if (index === undefined) return;
  const top = index * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  if (top < effectiveScrollTop.value) {
    viewport.scrollTop = top + HEADER_HEIGHT;
  } else if (
    bottom >
    effectiveScrollTop.value + viewport.clientHeight - HEADER_HEIGHT
  ) {
    viewport.scrollTop = bottom - viewport.clientHeight + HEADER_HEIGHT;
  }
};

const formatCellValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

const setEncoding = (value: EncodingOption) => {
  if (props.encoding === value) return;
  emit("change-encoding", value);
};

const stringifyValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") {
    return Number.isInteger(value) ? value.toString() : value.toFixed(3);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

const measureMaxWidth = (values: unknown[]): number => {
  let max = 0;
  for (const value of values) {
    const text = stringifyValue(value);
    const width = measureTextWidth(text);
    if (width > max) max = width;
  }
  return max;
};

const setupResizeObserver = () => {
  const viewport = viewportRef.value;
  if (!viewport) return;
  viewportHeight.value = viewport.clientHeight || DEFAULT_HEIGHT;
  if (resizeObserver) return;
  resizeObserver = new ResizeObserver(() => {
    if (!viewportRef.value) return;
    viewportHeight.value = viewportRef.value.clientHeight || DEFAULT_HEIGHT;
  });
  resizeObserver.observe(viewport);
};

onMounted(() => {
  setupResizeObserver();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => props.selectedId,
  (next) => {
    ensureRowVisible(next ?? null);
  },
);

watch(
  () => rows.value.length,
  () => {
    const viewport = viewportRef.value;
    if (!viewport) return;
    viewport.scrollTop = 0;
    scrollTop.value = 0;
    setupResizeObserver();
  },
  { flush: "post" },
);
</script>

<template>
  <section class="data-grid" :class="{ 'data-grid--empty': !rows.length }">
    <div class="columns-header columns-header--with-action">
      <div class="columns-header__meta">
        <h3>DB 테이블</h3>
        <small>{{ rows.length ? `${totalRows.toLocaleString()}행 · 가상 스크롤` : "표시할 행이 없습니다." }}</small>
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
        <button
          type="button"
          class="toggle"
          :class="{ 'toggle--active': props.encoding === 'euc-kr' }"
          @click="setEncoding('euc-kr')"
        >
          EUC-KR
        </button>
      </div>
    </div>

    <div v-if="rows.length" class="data-grid__viewport-wrapper">
      <div ref="viewportRef" class="data-grid__viewport" @scroll="handleScroll">
          <div
            class="data-grid__header-row"
            :style="{ gridTemplateColumns: rowTemplate }"
          >
            <span
              class="data-grid__cell data-grid__cell--head data-grid__cell--id"
                aria-label="Row number"
            ></span>
            <span
              v-for="column in columnOrder"
              :key="column"
              class="data-grid__cell data-grid__cell--head"
            >
              {{ column || "(이름 없음)" }}
            </span>
          </div>
          <div class="data-grid__spacer" :style="{ height: `${totalHeight}px` }">
            <div class="data-grid__virtual" :style="{ transform: `translateY(${translateY}px)` }">
              <button
                v-for="(row, localIndex) in visibleRows"
                :key="row.id"
                type="button"
                class="data-grid__row"
                :class="{
                  'data-grid__row--selected': props.selectedId === row.id,
                  'data-grid__row--striped': (startIndex + localIndex) % 2 === 1,
                }"
                :style="{ gridTemplateColumns: rowTemplate }"
                @click="handleRowClick(row.id)"
              >
                <span class="data-grid__cell data-grid__cell--id">
                  {{ startIndex + localIndex + 1 }}
                </span>
                <span
                  v-for="column in columnOrder"
                  :key="`${row.id}-${column}`"
                  class="data-grid__cell"
                  :title="formatCellValue(row.properties[column])"
                >
                  {{ formatCellValue(row.properties[column]) }}
                </span>
              </button>
            </div>
          </div>
      </div>
      <div v-if="props.encodingChanging" class="data-grid__overlay">
        <div class="data-grid__overlay-content">
          <span class="data-grid__spinner" aria-hidden="true"></span>
          <span>인코딩 변경 중…</span>
        </div>
      </div>
    </div>

    <div v-else class="data-grid__empty-state">
      <p class="data-grid__placeholder">
        ZIP을 로드하면 속성 테이블이 이곳에 나타납니다.
      </p>
    </div>
  </section>
</template>

<style scoped>
.data-grid {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
  margin-bottom: 16px;
}

.data-grid__header-row,
.data-grid__row {
  display: grid;
  grid-template-columns: minmax(48px, 0.12fr) repeat(auto-fit, minmax(120px, 1fr));
  gap: 0;
  align-items: stretch;
  box-sizing: border-box;
  height: 30px;
}

.data-grid__cell {
  font-size: 12px;
  line-height: 16px;
  color: #1f2937;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  padding: 7px 7px;
  display: flex;
  align-items: center;
  box-sizing: border-box;
  border-right: 1px solid #e5e7eb;
  background: transparent;
}

.data-grid__cell--head {
  font-weight: 600;
  color: #374151;
  background: transparent;
}

.data-grid__header-row .data-grid__cell {
  background: #f8fafc;
  font-weight: 600;
  color: #374151;
}

.data-grid__header-row {
  position: sticky;
  top: 0;
  z-index: 2;
  background: #f8fafc;
  border-bottom: 1px solid #e5e7eb;
}

.data-grid__cell--id {
  text-align: center;
  font-weight: 600;
  color: #0f172a;
  justify-content: center;
}

.data-grid__header-row .data-grid__cell--id,
.data-grid__row .data-grid__cell--id {
  background: #f8fafc;
}

.data-grid__row .data-grid__cell:last-child,
.data-grid__header-row .data-grid__cell:last-child {
  border-right: 1px solid #e5e7eb;
}

.data-grid__viewport {
  overflow: auto;
  max-height: 420px;
  background: #fff;
  scrollbar-gutter: stable;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  position: relative;
}

.data-grid__spacer {
  position: relative;
}

.data-grid__virtual {
  position: absolute;
  left: 0;
  right: 0;
}

.data-grid__row {
  border: none;
  background: #fff;
  padding: 0;
  text-align: left;
  border-bottom: 1px solid #f3f4f6;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.data-grid__row--striped {
  background: #fff;
}

.data-grid__row:last-child {
  border-bottom: none;
}

.data-grid__row:hover {
  background: #eef2ff;
}

.data-grid__row--selected {
  background: #dbeafe;
}

.data-grid__viewport-wrapper {
  position: relative;
}

.data-grid--empty {
  justify-content: flex-start;
}

.data-grid__placeholder {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.data-grid__empty-state {
  border: 1px dashed #d1d5db;
  border-radius: 10px;
  padding: 32px;
  text-align: center;
  background: #f9fafb;
}

.data-grid__empty-state p {
  margin: 0;
}

.columns-header--with-action {
  display: flex;
  flex-direction: row;
  justify-content: flex-start;
  align-items: flex-end;
  gap: 12px;
}

.columns-header__meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex: 1;
}

.columns-header__meta h3 {
  margin: 0;
}

.columns-header--with-action .toggle-group {
  margin-left: auto;
  margin-top: 0;
  align-self: flex-end;
}

.data-grid__overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}

.data-grid__overlay-content {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  padding: 0;
  margin: 0;
  background: none;
  border: none;
  color: #111827;
  font-size: 13px;
  font-weight: 600;
  font-family: "Pretendard SemiBold", system-ui, sans-serif;
  box-shadow: none;
}

.data-grid__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #cbd5e1;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: data-grid-spin 0.9s linear infinite;
}

@keyframes data-grid-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

</style>
