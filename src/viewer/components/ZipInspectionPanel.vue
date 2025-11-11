<script setup lang="ts">
import type { EncodingOption, ZipInspection } from "../types";

const props = defineProps<{
  inspection: ZipInspection;
  encoding: EncodingOption;
}>();

const emit = defineEmits<{
  "change-encoding": [EncodingOption];
}>();

const selectEncoding = (value: EncodingOption) => {
  emit("change-encoding", value);
};
</script>

<template>
  <section class="inspection-panel">
    <div class="columns-header">
      <h3>ZIP 구성 검사</h3>
      <small>필수: SHP/DBF/SHX · 참고: PRJ/CPG</small>
    </div>
    <div class="inspection-meta">
      <div class="meta-item">
        <span class="meta-label">CPG</span>
        <span :class="['meta-value', props.inspection.hasCpg ? 'text-ok' : 'text-warn']">
          {{ props.inspection.hasCpg ? "존재" : "없음" }}
        </span>
      </div>
      <div class="meta-item">
        <span class="meta-label">PRJ</span>
        <span :class="['meta-value', props.inspection.hasPrj ? 'text-ok' : 'text-muted']">
          {{ props.inspection.hasPrj ? "존재" : "없음" }}
        </span>
      </div>
    </div>
    <div class="encoding-toggle">
      <span>
        DBF 인코딩
        <small v-if="props.inspection.detectedEncoding" class="detected-badge">
          {{ props.inspection.detectedEncoding.toUpperCase() }} 감지
        </small>
      </span>
      <div class="toggle-group">
        <button
          type="button"
          :class="['toggle', props.encoding === 'utf-8' ? 'toggle--active' : '']"
          @click="selectEncoding('utf-8')"
        >
          UTF-8
        </button>
        <button
          type="button"
          :class="['toggle', props.encoding === 'cp949' ? 'toggle--active' : '']"
          @click="selectEncoding('cp949')"
        >
          CP949
        </button>
      </div>
    </div>
    <ul class="layer-list">
      <li v-for="layer in props.inspection.layers" :key="layer.name">
        <div class="layer-info">
          <strong>{{ layer.name }}</strong>
          <span v-if="layer.missingEssential.length" class="missing-text">
            {{ layer.missingEssential.join(", ") }} 없음
          </span>
        </div>
        <div class="chip-row">
          <span class="chip" :class="{ 'chip--ok': layer.hasShp, 'chip--warn': !layer.hasShp }">.shp</span>
          <span class="chip" :class="{ 'chip--ok': layer.hasDbf, 'chip--warn': !layer.hasDbf }">.dbf</span>
          <span class="chip" :class="{ 'chip--ok': layer.hasShx, 'chip--warn': !layer.hasShx }">.shx</span>
          <span class="chip" :class="{ 'chip--ok': layer.hasPrj, 'chip--muted': !layer.hasPrj }">.prj</span>
          <span class="chip" :class="{ 'chip--ok': layer.hasCpg, 'chip--muted': !layer.hasCpg }">.cpg</span>
        </div>
      </li>
    </ul>
  </section>
</template>
