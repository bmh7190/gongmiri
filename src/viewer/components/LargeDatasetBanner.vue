<script setup lang="ts">
import { computed } from "vue";
import type { ParseMode } from "../types";

const props = defineProps<{
  parseMode: ParseMode;
  fileBytes: number;
  totalFeatures: number;
  displayedFeatures: number;
  isLargeFile: boolean;
  isLargeFeature: boolean;
}>();

const emit = defineEmits<{
  (e: "select-mode", mode: ParseMode): void;
}>();

const formatBytes = (bytes: number): string => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const formatNumber = (value: number): string => {
  if (!value) return "0";
  if (value >= 10000) {
    return `${(value / 10000).toFixed(1)}만`.replace(".0", "");
  }
  return value.toLocaleString();
};

const reductionSummary = computed(() => {
  if (!props.totalFeatures || props.displayedFeatures >= props.totalFeatures) {
    return null;
  }
  const ratio = props.displayedFeatures / props.totalFeatures;
  return `${Math.round(ratio * 100)}% 샘플`;
});

const badges = computed(() => {
  const items: string[] = [];
  if (props.isLargeFile) {
    items.push(`파일 ${formatBytes(props.fileBytes)}`);
  }
  if (props.isLargeFeature) {
    items.push(`피처 ${formatNumber(props.totalFeatures)}개`);
  }
  if (props.parseMode === "quick" && reductionSummary.value) {
    items.push(`Quick · ${reductionSummary.value}`);
  }
  return items;
});

const modeDescription = computed(() =>
  props.parseMode === "quick"
    ? "샘플링·클러스터 중심으로 빠르게 미리보기"
    : "전체 데이터를 그대로 읽어 정확한 통계 제공",
);

const featureSummary = computed(() => {
  if (!props.totalFeatures) return "";
  if (props.parseMode === "quick" && props.displayedFeatures) {
    return `표시 ${props.displayedFeatures.toLocaleString()} / 원본 ${props.totalFeatures.toLocaleString()}`;
  }
  return `총 ${props.totalFeatures.toLocaleString()} 피처`;
});

const handleSelect = (mode: ParseMode) => {
  emit("select-mode", mode);
};
</script>

<template>
  <section class="large-banner">
    <div>
      <div class="large-banner__badges">
        <span
          v-for="badge in badges"
          :key="badge"
          class="large-banner__badge"
        >
          {{ badge }}
        </span>
      </div>
      <h3>대용량 데이터 보호 모드</h3>
      <p>{{ modeDescription }}</p>
      <small v-if="featureSummary" class="large-banner__hint">{{ featureSummary }}</small>
    </div>
    <div class="large-banner__actions">
      <button
        type="button"
        class="mode-button"
        :class="{ 'mode-button--active': parseMode === 'quick' }"
        @click="handleSelect('quick')"
      >
        Quick 미리보기
      </button>
      <button
        type="button"
        class="mode-button"
        :class="{ 'mode-button--active': parseMode === 'full' }"
        @click="handleSelect('full')"
      >
        Full 분석
      </button>
    </div>
  </section>
</template>
