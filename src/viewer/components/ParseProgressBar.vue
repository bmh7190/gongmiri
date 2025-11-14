<script setup lang="ts">
import type { ParseProgress } from "../types";

defineProps<{
  progress: ParseProgress;
}>();
</script>

<template>
  <div class="progress-card">
    <div class="progress-card__meta">
      <strong>{{ progress.label }}</strong>
      <span>{{ progress.percent }}%</span>
    </div>
    <div class="progress-line">
      <div
        class="progress-line__fill"
        :style="{ width: `${Math.min(progress.percent, 100)}%` }"
      />
    </div>
  </div>
</template>

<style scoped>
.progress-card {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 12px 16px;
  background: #ecfeff;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-card__meta {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: #0f172a;
}

.progress-line {
  height: 6px;
  border-radius: 999px;
  background: rgba(14, 165, 233, 0.2);
  overflow: hidden;
}

.progress-line__fill {
  height: 100%;
  border-radius: inherit;
  background: #0ea5e9;
  transition: width 0.2s ease;
}
</style>
