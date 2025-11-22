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
        </div>
        <button type="button" class="modal-close" aria-label="닫기" @click="handleClose">
          ✕
        </button>
      </header>

      <div class="modal-body">
        <article
          class="mode-card"
          :class="{ 'mode-card--active': props.parseMode === 'quick' }"
          role="button"
          tabindex="0"
          @click="handleSelect('quick')"
          @keydown.enter.prevent="handleSelect('quick')"
          @keydown.space.prevent="handleSelect('quick')"
        >
          <div>
            <h4>Quick 미리보기</h4>
            <p>샘플링 + 좌표 간략화 + 클러스터 기본값으로 4초 이내 결과를 보여줍니다.</p>
          </div>
          <ul>
            <li>최대 25,000 피처 샘플</li>
            <li>좌표 소수점 5자리 유지</li>
            <li>클러스터 ON · 컬럼 통계도 샘플 기반</li>
          </ul>
        </article>

        <article
          class="mode-card"
          :class="{ 'mode-card--active': props.parseMode === 'full' }"
          role="button"
          tabindex="0"
          @click="handleSelect('full')"
          @keydown.enter.prevent="handleSelect('full')"
          @keydown.space.prevent="handleSelect('full')"
        >
          <div>
            <h4>Full 분석</h4>
            <p>원본 그대로 모든 피처를 분석합니다. 시간이 더 걸릴 수 있어요.</p>
          </div>
          <ul>
            <li>전체 피처 수만큼 계산</li>
            <li>정확한 통계 · 지도 표현</li>
            <li>기다리는 동안 진행률이 표시됩니다.</li>
          </ul>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(15, 23, 42, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 20px;
  box-sizing: border-box;
}

.modal-panel {
  width: min(520px, 100%);
  background: #fff;
  border-radius: 16px;
  box-shadow: 0 30px 60px rgba(15, 23, 42, 0.25);
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 24px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.modal-header h3 {
  margin: 0;
  font-size: 18px;
}

.modal-header p {
  margin: 6px 0 0;
  color: #4b5563;
  font-size: 14px;
  line-height: 1.4;
}

.modal-hint {
  display: block;
  margin-top: 4px;
  color: #6b7280;
  font-size: 12px;
}

.modal-close {
  border: none;
  background: transparent;
  font-size: 18px;
  cursor: pointer;
  color: #6b7280;
}

.modal-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 380px;
  overflow-y: auto;
}

.mode-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  background: #f9fafb;
  cursor: pointer;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.mode-card h4 {
  margin: 0;
  font-size: 15px;
}

.mode-card p {
  margin: 4px 0 0;
  font-size: 13px;
  color: #4b5563;
}

.mode-card ul {
  margin: 0;
  padding-left: 18px;
  color: #4b5563;
  font-size: 12px;
  line-height: 1.5;
}

.mode-card:hover,
.mode-card:focus-visible {
  border-color: #2563eb;
  background: #eef2ff;
  outline: none;
}

.mode-card--active {
  border-color: #e5e7eb;
  background: #f9fafb;
}
</style>
