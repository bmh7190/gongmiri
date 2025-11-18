<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type {
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureId,
  EncodingOption,
} from "../types";

const ROW_HEIGHT = 34;
const BUFFER_ROWS = 6;
const DEFAULT_HEIGHT = 360;

const props = defineProps<{
  collection: FeatureCollectionGeometry | null;
  columns: ColumnStat[];
  selectedId: FeatureId | null;
  encoding: EncodingOption;
  detectedEncoding?: EncodingOption;
  hasCpg?: boolean;
}>();

const emit = defineEmits<{
  (e: "select", value: FeatureId): void;
  (e: "change-encoding", value: EncodingOption): void;
}>();

const viewportRef = ref<HTMLElement | null>(null);
const headerScrollRef = ref<HTMLElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(DEFAULT_HEIGHT);
let resizeObserver: ResizeObserver | null = null;
let suppressScrollSync = false;

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

const rowTemplate = computed(() => {
  const dynamicColumns = columnOrder.value.length
    ? columnOrder.value.map(() => "minmax(140px, 1fr)")
    : ["minmax(140px, 1fr)"];
  return ["minmax(48px, 0.12fr)", ...dynamicColumns].join(" ");
});

const encodingHint = computed(() => {
  if (props.detectedEncoding) {
    return `CPG에서 ${props.detectedEncoding.toUpperCase()} 감지`;
  }
  if (props.hasCpg) {
    return "CPG 파일 존재 · 기본값 사용";
  }
  return "CPG 없음 · 직접 선택하세요";
});

const totalRows = computed(() => rows.value.length);
const totalHeight = computed(() => totalRows.value * ROW_HEIGHT);

const startIndex = computed(() =>
  Math.max(0, Math.floor(scrollTop.value / ROW_HEIGHT)),
);

const endIndex = computed(() =>
  Math.min(
    totalRows.value,
    startIndex.value + Math.ceil(viewportHeight.value / ROW_HEIGHT) + BUFFER_ROWS,
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

const handleScroll = () => {
  const viewport = viewportRef.value;
  if (!viewport) return;
  scrollTop.value = viewport.scrollTop;
  syncHeaderScrollFromBody();
};

const handleRowClick = (rowId: FeatureId) => {
  emit("select", rowId);
};

const handleHeaderScroll = () => {
  if (!headerScrollRef.value || !viewportRef.value) return;
  if (suppressScrollSync) return;
  suppressScrollSync = true;
  viewportRef.value.scrollLeft = headerScrollRef.value.scrollLeft;
  suppressScrollSync = false;
};

const ensureRowVisible = (rowId: FeatureId | null) => {
  if (!rowId) return;
  const viewport = viewportRef.value;
  if (!viewport) return;
  const index = idIndexMap.value.get(rowId);
  if (index === undefined) return;
  const top = index * ROW_HEIGHT;
  const bottom = top + ROW_HEIGHT;
  if (top < viewport.scrollTop) {
    viewport.scrollTop = top;
  } else if (bottom > viewport.scrollTop + viewport.clientHeight) {
    viewport.scrollTop = bottom - viewport.clientHeight;
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

const syncHeaderScrollFromBody = () => {
  if (!headerScrollRef.value || !viewportRef.value) return;
  if (suppressScrollSync) return;
  if (headerScrollRef.value.scrollLeft === viewportRef.value.scrollLeft) return;
  suppressScrollSync = true;
  headerScrollRef.value.scrollLeft = viewportRef.value.scrollLeft;
  suppressScrollSync = false;
};

onMounted(() => {
  const viewport = viewportRef.value;
  if (!viewport) return;
  viewportHeight.value = viewport.clientHeight || DEFAULT_HEIGHT;
  resizeObserver = new ResizeObserver(() => {
    if (!viewportRef.value) return;
    viewportHeight.value = viewportRef.value.clientHeight || DEFAULT_HEIGHT;
  });
  resizeObserver.observe(viewport);
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
    syncHeaderScrollFromBody();
  },
);
</script>

<template>
  <section class="data-grid" v-if="rows.length">
    <div class="columns-header">
      <h3>DB 테이블</h3>
      <small>{{ totalRows.toLocaleString() }}행 · 가상 스크롤</small>
    </div>

    <div class="encoding-controls">
      <div>
        <p class="label">DBF 인코딩</p>
        <small>{{ encodingHint }}</small>
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

    <div
      ref="headerScrollRef"
      class="data-grid__header-scroll"
      @scroll="handleHeaderScroll"
    >
      <div
        class="data-grid__header-row"
        :style="{ gridTemplateColumns: rowTemplate }"
      >
        <span class="data-grid__cell data-grid__cell--head data-grid__cell--id">
          #
        </span>
        <span
          v-for="column in columnOrder"
          :key="column"
          class="data-grid__cell data-grid__cell--head"
        >
          {{ column || "(이름 없음)" }}
        </span>
      </div>
    </div>

    <div
      ref="viewportRef"
      class="data-grid__viewport"
      @scroll="handleScroll"
    >
      <div
        class="data-grid__spacer"
        :style="{ height: `${totalHeight}px` }"
      >
        <div
          class="data-grid__virtual"
          :style="{ transform: `translateY(${translateY}px)` }"
        >
          <button
          v-for="(row, localIndex) in visibleRows"
          :key="row.id"
          type="button"
          class="data-grid__row"
          :class="{
            'data-grid__row--selected': props.selectedId === row.id,
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
  </section>

  <section v-else class="data-grid data-grid--empty">
    <div class="columns-header">
      <h3>DB 테이블</h3>
      <small>표시할 행이 없습니다.</small>
    </div>
    <p class="data-grid__placeholder">
      ZIP을 로드하면 속성 테이블이 이곳에 나타납니다.
    </p>
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
}

.data-grid__header-row,
.data-grid__row {
  display: grid;
  grid-template-columns: minmax(48px, 0.12fr) repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  align-items: center;
}

.data-grid__header-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  margin-bottom: 6px;
}

.data-grid__header-scroll::-webkit-scrollbar {
  display: none;
}

.data-grid__header-scroll {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.data-grid__cell {
  font-size: 12px;
  color: #1f2937;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.data-grid__cell--head {
  font-weight: 600;
  color: #4b5563;
}

.data-grid__cell--id {
  text-align: center;
}

.data-grid__viewport {
  overflow: auto;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  max-height: 420px;
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
  background: transparent;
  padding: 6px 8px;
  border-bottom: 1px solid #f3f4f6;
  text-align: left;
}

.data-grid__row:last-child {
  border-bottom: none;
}

.data-grid__row:hover {
  background: rgba(37, 99, 235, 0.08);
}

.data-grid__row--selected {
  background: rgba(14, 165, 233, 0.15);
  border-left: 3px solid #0ea5e9;
}

.data-grid--empty {
  align-items: flex-start;
}

.data-grid__placeholder {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}

.encoding-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}

.encoding-controls small {
  display: block;
  margin-top: 4px;
  color: #6b7280;
}
</style>
