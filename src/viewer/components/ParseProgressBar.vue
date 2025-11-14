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
