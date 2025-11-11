<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from "vue";
import { iter } from "but-unzip";
import DropZone from "./components/DropZone.vue";
import ZipInspectionPanel from "./components/ZipInspectionPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import SridSelector from "./components/SridSelector.vue";
import AttributePreview from "./components/AttributePreview.vue";
import {
  type FeatureCollectionGeometry,
  type FeatureGeometry,
  type ViewerResult,
  type ZipInspection,
  type ColumnStat,
  type ZipLayerStatus,
  type EncodingOption,
  type SridCode,
} from "./types";
import "./viewer.css";
import { detectSridFromPrj } from "./utils/srid";
import type { FeatureCollection } from "geojson";

const isDragging = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const result = ref<ViewerResult | null>(null);
const zipInspection = ref<ZipInspection | null>(null);
const encoding = ref<EncodingOption>("utf-8");
const srid = ref<SridCode | null>(null);
const sourceBuffer = ref<ArrayBuffer | null>(null);
const currentFileName = ref<string>("");
const hasParsedOnce = ref(false);
const currentCollection = ref<FeatureCollectionGeometry | null>(null);
const hasFileLoaded = computed(() => Boolean(sourceBuffer.value));
const sampleProperties = computed<Record<string, unknown> | null>(() => {
  const feature = currentCollection.value?.features?.[0];
  return feature?.properties ?? null;
});

let parseRunId = 0;

type WorkerMessage =
  | { id: number; status: "success"; collection: FeatureCollection }
  | { id: number; status: "error"; message: string };

const parserWorker = new Worker(
  new URL("./workers/parser.ts", import.meta.url),
  { type: "module" },
);

let workerJobId = 0;
const workerResolvers = new Map<
  number,
  {
    resolve: (value: FeatureCollection) => void;
    reject: (reason?: unknown) => void;
  }
>();

parserWorker.addEventListener("message", (event: MessageEvent<WorkerMessage>) => {
  const data = event.data;
  const entry = workerResolvers.get(data.id);
  if (!entry) return;
  workerResolvers.delete(data.id);
  if (data.status === "success") {
    entry.resolve(data.collection);
  } else {
    entry.reject(new Error(data.message));
  }
});

const parseWithWorker = (
  buffer: ArrayBuffer,
  encoding: EncodingOption,
  sridCode: SridCode | null,
) => {
  const id = ++workerJobId;
  const promise = new Promise<FeatureCollection>((resolve, reject) => {
    workerResolvers.set(id, { resolve, reject });
  });
  parserWorker.postMessage(
    {
      id,
      buffer,
      encoding,
      srid: sridCode,
    },
  );
  return promise;
};

onBeforeUnmount(() => {
  parserWorker.terminate();
  workerResolvers.clear();
});

const resetDragState = () => {
  isDragging.value = false;
};

const handleDragState = (state: boolean) => {
  isDragging.value = state;
};

const resetViewer = () => {
  parseRunId += 1;
  isLoading.value = false;
  errorMessage.value = "";
  sourceBuffer.value = null;
  zipInspection.value = null;
  result.value = null;
  srid.value = null;
  encoding.value = "utf-8";
  currentFileName.value = "";
  currentCollection.value = null;
  hasParsedOnce.value = false;
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
  srid.value = null;
  currentFileName.value = file.name;
  sourceBuffer.value = null;
  hasParsedOnce.value = false;

  try {
    const buffer = await file.arrayBuffer();
    sourceBuffer.value = buffer;
    const inspection = await inspectZipEntries(buffer);
    zipInspection.value = inspection;
    if (inspection.detectedEncoding) {
      encoding.value = inspection.detectedEncoding;
    }
    if (inspection.detectedSridCode) {
      srid.value = inspection.detectedSridCode;
    }
    if (!inspection.hasValidLayer) {
      errorMessage.value =
        "필수 구성(SHP/DBF/SHX)이 포함된 레이어를 찾을 수 없습니다.";
      return;
    }
    await runParse(buffer, { manageLoading: false });
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

const runParse = async (
  buffer: ArrayBuffer,
  options?: { manageLoading?: boolean },
) => {
  const manageLoading = options?.manageLoading ?? true;
  const jobId = ++parseRunId;
  if (manageLoading) isLoading.value = true;
  try {
    const geojson = await parseWithWorker(buffer, encoding.value, srid.value);
    if (jobId !== parseRunId) return;
    const collection = normalizeCollection(geojson);
    currentCollection.value = collection;
    const summaryName =
      currentFileName.value ||
      zipInspection.value?.layers[0]?.name ||
      "파일";
    result.value = summarizeCollection(collection, summaryName);
    hasParsedOnce.value = true;
    errorMessage.value = "";
  } catch (err) {
    if (jobId !== parseRunId) return;
    console.error("[gongmiri] worker parse error", err);
    errorMessage.value = "파싱 워커에서 오류가 발생했습니다.";
    result.value = null;
  } finally {
    if (manageLoading && jobId === parseRunId) {
      isLoading.value = false;
    }
  }
};

const inspectZipEntries = async (buffer: ArrayBuffer): Promise<ZipInspection> => {
  const bytes = new Uint8Array(buffer);
  const layers = new Map<string, ZipLayerStatus>();
  let hasCpg = false;
  let hasPrj = false;
  let detectedEncoding: EncodingOption | undefined;
  let detectedSridCode: SridCode | undefined;
  let prjText: string | undefined;


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
    if (extLower === "prj") {
      hasPrj = true;
      if (!prjText) {
        prjText = await readEntryAsText(entry);
        detectedSridCode = detectSridFromPrj(prjText);
      }
    }
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
    detectedSridCode,
    prjText,
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

const triggerReparse = () => {
  if (!sourceBuffer.value) return;
  runParse(sourceBuffer.value);
};

watch(
  () => zipInspection.value?.detectedSridCode,
  (code) => {
    if (code && srid.value === null) {
      srid.value = code;
    }
  },
);

watch(encoding, (next, prev) => {
  if (!hasParsedOnce.value) return;
  if (next === prev) return;
  triggerReparse();
});

watch(srid, (next, prev) => {
  if (!hasParsedOnce.value) return;
  if (next === prev) return;
  triggerReparse();
});
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <div class="header-meta">
        <h2>공미리 — 공간데이터 미리보기</h2>
        <p>{{ statusMessage }}</p>
      </div>
      <button
        v-if="hasFileLoaded"
        type="button"
        class="reset-button reset-button--header"
        @click="resetViewer"
      >
        새 ZIP 분석하기
      </button>
    </header>

    <div class="content-grid">
      <div class="panel-stack panel-stack--left">
        <DropZone
          v-if="!hasFileLoaded"
          :is-dragging="isDragging"
          :is-loading="isLoading"
          @drop-file="onDrop"
          @drag-state="handleDragState"
        />

        <ZipInspectionPanel
          v-if="zipInspection"
          :inspection="zipInspection"
          :feature-count="result?.featureCount ?? null"
          :geometry-types="result?.geometryTypes ?? []"
        />

        <SridSelector
          v-if="zipInspection"
          :detected="zipInspection.detectedSridCode ?? null"
          :selected="srid"
          @update:selected="srid = $event"
        />
      </div>

      <div class="panel-stack panel-stack--right">
        <ResultPanel
          v-if="result"
          :result="result"
          :encoding="encoding"
          :detected-encoding="zipInspection?.detectedEncoding"
          :has-cpg="zipInspection?.hasCpg"
          @change-encoding="encoding = $event"
        />

        <AttributePreview
          v-if="sampleProperties"
          :properties="sampleProperties"
          :encoding="encoding"
          :detected-encoding="zipInspection?.detectedEncoding"
          :has-cpg="zipInspection?.hasCpg"
          @change-encoding="encoding = $event"
        />

        <div v-else-if="errorMessage" class="alert-card">
          <p>{{ errorMessage }}</p>
        </div>

        <div v-else class="placeholder-card">
          <h3>ZIP 파일을 드롭해 보세요</h3>
          <p>다운로드한 Shapefile ZIP을 놓으면 구성 검사, 인코딩·좌표계 추정, 속성 요약이 순서대로 표시됩니다.</p>
          <ul>
            <li>SHP/DBF/SHX 조합이 모두 있는지 즉시 확인</li>
            <li>CPG/PRJ 유무와 추정 결과를 한눈에 체크</li>
            <li>추후 지도·속성 패널과 연동될 예정이에요</li>
          </ul>
        </div>
      </div>
    </div>
  </div>
</template>
