<script setup lang="ts">
import { computed } from "vue";
import type { ParseMode } from "../types";

const props = defineProps<{
  reason: "file" | "feature" | null;
  fileBytes: number;
  featureCount: number;
  parseMode: ParseMode;
}>();

const emit = defineEmits<{
  (e: "select", mode: ParseMode): void;
  (e: "close"): void;
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

const reasonText = computed(() => {
  if (props.reason === "file") {
    return `ZIP 용량이 ${formatBytes(props.fileBytes)}로 큽니다.`;
  }
  if (props.reason === "feature") {
    return `피처 수가 ${formatNumber(props.featureCount)}개로 많습니다.`;
  }
  return "대용량 데이터로 추정됩니다.";
});

const handleSelect = (mode: ParseMode) => {
  emit("select", mode);
};

const handleClose = () => {
  emit("close");
};
</script>

<template>
  <div class="modal-backdrop">
    <section class="modal-panel">
      <header class="modal-header">
        <div>
          <h3>Quick vs Full 모드를 선택해주세요</h3>
          <p>{{ reasonText }}</p>
          <small class="modal-hint">현재 설정: {{ props.parseMode === "quick" ? "Quick 미리보기" : "Full 분석" }}</small>
        </div>
        <button type="button" class="modal-close" aria-label="닫기" @click="handleClose">
          ✕
        </button>
      </header>

      <div class="modal-body">
        <article class="mode-card">
          <div>
            <h4>Quick 미리보기</h4>
            <p>샘플링 + 좌표 간략화 + 클러스터 기본값으로 4초 이내 결과를 보여줍니다.</p>
          </div>
          <ul>
            <li>최대 25,000 피처 샘플</li>
            <li>좌표 소수점 5자리 유지</li>
            <li>클러스터 ON · 컬럼 통계도 샘플 기반</li>
          </ul>
          <button type="button" class="reset-button" @click="handleSelect('quick')">
            Quick로 보기
          </button>
        </article>

        <article class="mode-card">
          <div>
            <h4>Full 분석</h4>
            <p>원본 그대로 모든 피처를 분석합니다. 시간이 더 걸릴 수 있어요.</p>
          </div>
          <ul>
            <li>전체 피처 수만큼 계산</li>
            <li>정확한 통계 · 지도 표현</li>
            <li>기다리는 동안 진행률이 표시됩니다.</li>
          </ul>
          <button type="button" class="reset-button reset-button--subtle" @click="handleSelect('full')">
            Full로 계속
          </button>
        </article>
      </div>
    </section>
  </div>
</template>
