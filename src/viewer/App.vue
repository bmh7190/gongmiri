<script setup lang="ts">
import { computed, ref } from "vue";
import shp from "shpjs";
import { iter } from "but-unzip";
import DropZone from "./components/DropZone.vue";
import ZipInspectionPanel from "./components/ZipInspectionPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import {
  type FeatureCollectionGeometry,
  type FeatureGeometry,
  type ViewerResult,
  type ZipInspection,
  type ColumnStat,
  type ZipLayerStatus,
  type EncodingOption,
} from "./types";
import "./viewer.css";

const isDragging = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const result = ref<ViewerResult | null>(null);
const zipInspection = ref<ZipInspection | null>(null);
const encoding = ref<EncodingOption>("utf-8");

const resetDragState = () => {
  isDragging.value = false;
};

const handleDragState = (state: boolean) => {
  isDragging.value = state;
};

const onDrop = async (event: DragEvent) => {
  event.preventDefault();
  resetDragState();

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    errorMessage.value = "드롭한 파일을 찾지 못했습니다.";
    return;
  }
  if (!/\.zip$/i.test(file.name)) {
    errorMessage.value = "ZIP 파일을 올려주세요.";
    return;
  }

  isLoading.value = true;
  errorMessage.value = "";
  result.value = null;
  zipInspection.value = null;

  try {
    const buffer = await file.arrayBuffer();
    const inspection = await inspectZipEntries(buffer);
    zipInspection.value = inspection;
    if (inspection.detectedEncoding) {
      encoding.value = inspection.detectedEncoding;
    }
    if (!inspection.hasValidLayer) {
      errorMessage.value =
        "필수 구성(SHP/DBF/SHX)이 포함된 레이어를 찾을 수 없습니다.";
      return;
    }
    const geojson = await shp(buffer);
    const collection = normalizeCollection(geojson);
    result.value = summarizeCollection(collection, file.name);
  } catch (err) {
    console.error("[gongmiri] parse error", err);
    errorMessage.value = "SHP/DBF를 읽는 중 문제가 발생했습니다.";
  } finally {
    isLoading.value = false;
  }
};

const normalizeCollection = (
  geojson: unknown,
): FeatureCollectionGeometry => {
  if (
    geojson &&
    typeof geojson === "object" &&
    "type" in geojson &&
    geojson.type === "FeatureCollection"
  ) {
      return geojson as FeatureCollectionGeometry;
  }

  if (Array.isArray(geojson)) {
    const mergedFeatures: FeatureGeometry[] = [];
    for (const item of geojson) {
      if (item?.type === "FeatureCollection") {
        mergedFeatures.push(...(item.features as FeatureGeometry[]));
      }
    }
    if (mergedFeatures.length > 0) {
      return {
        type: "FeatureCollection",
        features: mergedFeatures,
      };
    }
  }

  throw new Error("지원하지 않는 GeoJSON 형식입니다.");
};

const summarizeCollection = (
  collection: FeatureCollectionGeometry,
  fileName: string,
): ViewerResult => {
  const features: FeatureGeometry[] = collection.features ?? [];
  const allColumns = new Set<string>();

  for (const feature of features) {
    if (feature.properties) {
      Object.keys(feature.properties).forEach((key) => allColumns.add(key));
    }
  }

  const columns = Array.from(allColumns).map<ColumnStat>((name) => {
    let filled = 0;
    let empty = 0;
    const samples: string[] = [];

    for (const feature of features) {
      const value = feature.properties?.[name];
      const isEmpty =
        value === null ||
        value === undefined ||
        (typeof value === "string" && value.trim() === "");

      if (isEmpty) {
        empty += 1;
      } else {
        filled += 1;
        if (samples.length < 3) samples.push(String(value));
      }
    }

    const fillRate = features.length
      ? (filled / features.length) * 100
      : 0;

    return {
      name,
      filled,
      empty,
      fillRate,
      samples,
    };
  });

  columns.sort((a, b) => a.fillRate - b.fillRate);

  const geometryTypeSet = new Set<string>();
  for (const feature of features) {
    geometryTypeSet.add(feature.geometry?.type ?? "NULL");
  }
  const geometryTypes = Array.from(geometryTypeSet.values()).sort();

  return {
    fileName,
    featureCount: features.length,
    geometryTypes,
    columns,
  };
};

const statusMessage = computed(() => {
  if (isLoading.value) return "ZIP을 해석하는 중입니다…";
  if (errorMessage.value) return errorMessage.value;
  if (result.value) return `${result.value.fileName} 분석 완료`;
  return "Shapefile ZIP을 드래그하거나 선택하세요.";
});

const inspectZipEntries = async (buffer: ArrayBuffer): Promise<ZipInspection> => {
  const bytes = new Uint8Array(buffer);
  const layers = new Map<string, ZipLayerStatus>();
  let hasCpg = false;
  let hasPrj = false;
  let detectedEncoding: EncodingOption | undefined;


  const mark = (layerName: string, ext: string) => {
    const existing =
      layers.get(layerName) ??
      {
        name: layerName,
        hasShp: false,
        hasDbf: false,
        hasShx: false,
        hasPrj: false,
        hasCpg: false,
        missingEssential: [],
      };

    switch (ext) {
      case "shp":
        existing.hasShp = true;
        break;
      case "dbf":
        existing.hasDbf = true;
        break;
      case "shx":
        existing.hasShx = true;
        break;
      case "prj":
        existing.hasPrj = true;
        break;
      case "cpg":
        existing.hasCpg = true;
        break;
      default:
        break;
    }

    layers.set(layerName, existing);
  };

  for (const entry of iter(bytes)) {
    const normalized = entry.filename.replace(/\\/g, "/");
    const leaf = normalized.split("/").pop();
    if (!leaf) continue;
    const match = leaf.match(/^(.+)\.(shp|dbf|shx|prj|cpg)$/i);
    if (!match) continue;
    const rawName = match[1];
    const extension = match[2];
    if (!rawName || !extension) continue;
    const extLower = extension.toLowerCase();
    mark(rawName, extLower);
    if (extLower === "cpg") {
      hasCpg = true;
      if (!detectedEncoding) {
        const text = await readEntryAsText(entry);
        detectedEncoding = parseEncodingLabel(text);
      }
    }
    if (extLower === "prj") hasPrj = true;
  }

  const finalized = Array.from(layers.values()).map((layer) => {
    const missing: string[] = [];
    if (!layer.hasShp) missing.push(".shp");
    if (!layer.hasDbf) missing.push(".dbf");
    if (!layer.hasShx) missing.push(".shx");
    return { ...layer, missingEssential: missing };
  });

  const hasValidLayer = finalized.some(
    (layer) =>
      layer.hasShp &&
      layer.hasDbf &&
      layer.hasShx,
  );

  return {
    layers: finalized,
    hasValidLayer,
    hasCpg,
    hasPrj,
    detectedEncoding,
  };
};

const readEntryAsText = async (entry: {
  read: () => Promise<Uint8Array> | Uint8Array;
}): Promise<string> => {
  const data = entry.read();
  const bytes = data instanceof Promise ? await data : data;
  const decoder = new TextDecoder();
  return decoder.decode(bytes).trim();
};

const parseEncodingLabel = (label: string): EncodingOption | undefined => {
  const normalized = label.toLowerCase();
  if (normalized.includes("949") || normalized.includes("ksc") || normalized.includes("euc-kr")) {
    return "cp949";
  }
  if (normalized.includes("utf-8") || normalized.includes("utf8")) {
    return "utf-8";
  }
  return undefined;
};
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <h2>공미리 — 공간데이터 미리보기</h2>
      <p>{{ statusMessage }}</p>
    </header>

    <DropZone
      :is-dragging="isDragging"
      :is-loading="isLoading"
      @drop-file="onDrop"
      @drag-state="handleDragState"
    />

    <ZipInspectionPanel
      v-if="zipInspection"
      :inspection="zipInspection"
      :encoding="encoding"
      @change-encoding="encoding = $event"
    />

    <ResultPanel
      v-if="result"
      :result="result"
    />

    <p v-else-if="errorMessage" class="error-text">
      {{ errorMessage }}
    </p>
  </div>
</template>
