<script setup lang="ts">
import type { ZipInspection } from "../types";

defineProps<{
  inspection: ZipInspection;
}>();
</script>

<template>
  <section class="inspection-panel">
    <div class="columns-header">
      <h3>ZIP 구성 검사</h3>
      <small>필수: SHP/DBF/SHX · 참고: PRJ/CPG</small>
    </div>
    <ul class="layer-list">
      <li v-for="layer in inspection.layers" :key="layer.name">
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
