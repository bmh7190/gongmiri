<script setup lang="ts">
import { computed, ref, shallowRef, watch, onBeforeUnmount, nextTick } from "vue";
import { iter } from "but-unzip";
import DropZone from "./components/DropZone.vue";
import ZipInspectionPanel from "./components/ZipInspectionPanel.vue";
import ResultPanel from "./components/ResultPanel.vue";
import SridModal from "./components/SridModal.vue";
import MapPanel from "./components/MapPanel.vue";
import DataGrid from "./components/DataGrid.vue";
import LargeDatasetModal from "./components/LargeDatasetModal.vue";
import LargeDatasetBanner from "./components/LargeDatasetBanner.vue";
import ParseProgressBar from "./components/ParseProgressBar.vue";
import {
  type FeatureCollectionGeometry,
  type FeatureGeometry,
  type ViewerResult,
  type ZipInspection,
  type ColumnStat,
  type ZipLayerStatus,
  type EncodingOption,
  type SridCode,
  type FeatureId,
  type VisualizationSettings,
  type VisualizationConfig,
  type ParseMode,
  type ParseProgress,
  type LargeDatasetState,
} from "./types";
import "./viewer.css";
import { detectSridFromPrj } from "./utils/srid";
import type { FeatureCollection, Geometry, Position } from "geojson";
import { logDebug, logWarn } from "./utils/logger";
import {
  buildCategoryStops,
  buildNumericStops,
  buildPointSizeStops,
  DEFAULT_POINT_SIZE_RANGE,
  normalizeSizeRange,
} from "./utils/visualization";

const isDragging = ref(false);
const isLoading = ref(false);
const errorMessage = ref("");
const result = ref<ViewerResult | null>(null);
const zipInspection = ref<ZipInspection | null>(null);
const encoding = ref<EncodingOption>("utf-8");
const encodingChanging = ref(false);
const sridChanging = ref(false);
const srid = ref<SridCode | null>(null);
type SridMode = "file" | "manual";
const sridMode = ref<SridMode>("file");
const sourceBuffer = ref<ArrayBuffer | null>(null);
const currentFileName = ref<string>("");
const hasParsedOnce = ref(false);
const currentCollection = shallowRef<FeatureCollectionGeometry | null>(null);
const sridModalVisible = ref(false);
const selectedFeatureId = ref<FeatureId | null>(null);
const hasFileLoaded = computed(() => hasParsedOnce.value);
const parseMode = ref<ParseMode>("full");
const parseProgress = ref<ParseProgress | null>(null);
const largeDataset = ref<LargeDatasetState>({
  fileBytes: 0,
  featureCount: 0,
  isLargeFile: false,
  isLargeFeature: false,
});
const largeModalVisible = ref(false);
const largeModalReason = ref<"file" | "feature" | null>(null);
const hasAcknowledgedLargeFile = ref(false);
const hasAcknowledgedLargeFeature = ref(false);

const LARGE_FILE_BYTES = 100 * 1024 * 1024;
const LARGE_FEATURE_THRESHOLD = 100_000;
const QUICK_SAMPLE_TARGET = 25_000;
const QUICK_COORD_DECIMALS = 5;

const createDefaultVisualization = (): VisualizationSettings => ({
  colorMode: "default",
  categoryField: null,
  numericField: null,
  numericScale: "quantile",
  pointSizeField: null,
  pointSizeRange: DEFAULT_POINT_SIZE_RANGE,
  cluster: false,
});

const visualizationSettings = ref<VisualizationSettings>(createDefaultVisualization());

const visualizationConfig = computed<VisualizationConfig>(() => {
  const settings = visualizationSettings.value;
  const collection = currentCollection.value;
  const categoryStops =
    settings.colorMode === "category" &&
    collection &&
    settings.categoryField
      ? buildCategoryStops(collection, settings.categoryField)
      : [];
  const numericResult =
    settings.colorMode === "continuous" &&
    collection &&
    settings.numericField
      ? buildNumericStops(collection, settings.numericField, settings.numericScale)
      : { stops: [], domain: null };
  const pointSizeStops =
    collection && settings.pointSizeField
      ? buildPointSizeStops(
          collection,
          settings.pointSizeField,
          settings.pointSizeRange,
        )
      : null;

  return {
    ...settings,
    categoryStops,
    numericStops: numericResult.stops,
    numericDomain: numericResult.domain,
    pointSizeStops,
  };
});

const collectionHasPointGeometry = (
  collection: FeatureCollectionGeometry | null,
): boolean =>
  collection?.features?.some((feature) => {
    const type = feature.geometry?.type;
    return type === "Point" || type === "MultiPoint";
  }) ?? false;

const hasPointGeometry = computed(() =>
  collectionHasPointGeometry(currentCollection.value),
);

const categoryLegend = computed(() => visualizationConfig.value.categoryStops);

const numberFormatter = new Intl.NumberFormat(undefined, {
  maximumFractionDigits: 2,
});

const formatLegendValue = (value: number): string => numberFormatter.format(value);

const numericLegend = computed(() => {
  const { numericStops, numericDomain } = visualizationConfig.value;
  if (!numericDomain || !numericStops.length) return [];
  if (numericStops.length === 1) {
    return [
      {
        color: numericStops[0]!.color,
        label: `= ${formatLegendValue(numericStops[0]!.value)}`,
      },
    ];
  }
  return numericStops.map((stop, index) => {
    const next = numericStops[index + 1];
    if (index === 0 && next) {
      return {
        color: stop.color,
        label: `≤ ${formatLegendValue(next.value)}`,
      };
    }
    if (!next) {
      return {
        color: stop.color,
        label: `≥ ${formatLegendValue(stop.value)}`,
      };
    }
    return {
      color: stop.color,
      label: `${formatLegendValue(stop.value)} – ${formatLegendValue(next.value)}`,
    };
  });
});

const sizeLegend = computed(() => {
  const stops = visualizationConfig.value.pointSizeStops;
  if (!stops || !stops.length || !visualizationConfig.value.pointSizeField) {
    return null;
  }
  const first = stops[0]!;
  const last = stops[stops.length - 1]!;
  return {
    field: visualizationConfig.value.pointSizeField,
    min: first,
    max: last,
  };
});

const parseStats = ref({ total: 0, displayed: 0 });

const isLargeDataset = computed(
  () => largeDataset.value.isLargeFile || largeDataset.value.isLargeFeature,
);

const shouldShowLargeBanner = computed(
  () => isLargeDataset.value || parseMode.value === "quick",
);

const updateVisualization = (partial: Partial<VisualizationSettings>) => {
  const next: VisualizationSettings = {
    ...visualizationSettings.value,
    ...partial,
  };
  if (partial.pointSizeRange) {
    next.pointSizeRange = normalizeSizeRange(partial.pointSizeRange);
  }
  visualizationSettings.value = next;
};

const toggleParseMode = async (mode: ParseMode) => {
  if (parseMode.value === mode) return;
  parseMode.value = mode;
  if (!sourceBuffer.value) return;
  await runParse(sourceBuffer.value);
};

const openLargeModal = (reason: "file" | "feature") => {
  largeModalReason.value = reason;
  largeModalVisible.value = true;
};

const handleLargeModalSelect = async (mode: ParseMode) => {
  const previousMode = parseMode.value;
  const reason = largeModalReason.value;
  parseMode.value = mode;
  if (reason === "file") {
    hasAcknowledgedLargeFile.value = true;
    hasAcknowledgedLargeFeature.value = true;
  }
  if (reason === "feature") {
    hasAcknowledgedLargeFeature.value = true;
  }
  largeModalVisible.value = false;
  largeModalReason.value = null;
  if (!sourceBuffer.value) return;
  const shouldReparse = reason === "file" || previousMode !== mode;
  if (!shouldReparse) return;
  await runParse(sourceBuffer.value);
};

const closeLargeModal = () => {
  const reason = largeModalReason.value;
  const wasFilePrompt = reason === "file" && !hasParsedOnce.value;
  largeModalVisible.value = false;
  largeModalReason.value = null;
  if (wasFilePrompt) {
    resetViewer();
  }
};

const applyQuickPreview = (
  collection: FeatureCollectionGeometry,
): FeatureCollectionGeometry => {
  const features = collection.features ?? [];
  if (features.length <= QUICK_SAMPLE_TARGET) {
    return {
      type: "FeatureCollection",
      features: features.map((feature) => cloneFeatureWithRoundedGeometry(feature)),
    };
  }
  const stride = Math.max(1, Math.floor(features.length / QUICK_SAMPLE_TARGET));
  const sampled: FeatureGeometry[] = [];
  for (let index = 0; index < features.length; index += stride) {
    if (sampled.length >= QUICK_SAMPLE_TARGET) break;
    const feature = features[index];
    if (!feature) continue;
    sampled.push(cloneFeatureWithRoundedGeometry(feature));
  }
  return {
    type: "FeatureCollection",
    features: sampled,
  };
};

const cloneFeatureWithRoundedGeometry = (
  feature: FeatureGeometry,
): FeatureGeometry => ({
  type: "Feature",
  geometry: roundGeometry(feature.geometry),
  properties: feature.properties ? { ...feature.properties } : {},
  id: feature.id,
});

const roundGeometry = (geometry: Geometry): Geometry => {
  switch (geometry.type) {
    case "Point":
      return {
        ...geometry,
        coordinates: roundPosition(geometry.coordinates as Position),
      };
    case "MultiPoint":
    case "LineString":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[]).map((coord) =>
          roundPosition(coord),
        ),
      };
    case "MultiLineString":
    case "Polygon":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[][]).map((ring) =>
          ring.map((coord) => roundPosition(coord)),
        ),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[][][]).map((polygon) =>
          polygon.map((ring) => ring.map((coord) => roundPosition(coord))),
        ),
      };
    case "GeometryCollection":
      return {
        ...geometry,
        geometries: geometry.geometries?.map((child) => roundGeometry(child)) ?? [],
      };
    default:
      return geometry;
  }
};

const roundPosition = (position: Position): Position => {
  return position.map((value) =>
    typeof value === "number"
      ? Number(value.toFixed(QUICK_COORD_DECIMALS))
      : value,
  ) as Position;
};

const sanitizeVisualizationSelections = () => {
  const columns = result.value?.columns ?? [];
  const columnNames = new Set(columns.map((column) => column.name));
  const next: VisualizationSettings = { ...visualizationSettings.value };
  let changed = false;

  if (next.categoryField && !columnNames.has(next.categoryField)) {
    next.categoryField = null;
    if (next.colorMode === "category") {
      next.colorMode = "default";
    }
    changed = true;
  }

  if (next.numericField && !columnNames.has(next.numericField)) {
    next.numericField = null;
    if (next.colorMode === "continuous") {
      next.colorMode = "default";
    }
    changed = true;
  }

  if (next.pointSizeField && !columnNames.has(next.pointSizeField)) {
    next.pointSizeField = null;
    changed = true;
  }

  if (next.cluster && !hasPointGeometry.value) {
    next.cluster = false;
    changed = true;
  }

  if (changed) {
    visualizationSettings.value = next;
  }
};

let parseRunId = 0;

type WorkerMessage =
  | { id: number; status: "success"; collection: FeatureCollection }
  | { id: number; status: "error"; message: string }
  | { id: number; status: "progress"; label: string; percent: number };

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
  if (data.status === "progress") {
    parseProgress.value = {
      label: data.label,
      percent: data.percent,
    };
    return;
  }
  const entry = workerResolvers.get(data.id);
  if (!entry) return;
  workerResolvers.delete(data.id);
  if (data.status === "success") {
    parseProgress.value = null;
    entry.resolve(data.collection);
  } else {
    parseProgress.value = null;
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
  sridMode.value = "file";
  sridChanging.value = false;
  encoding.value = "utf-8";
  encodingChanging.value = false;
  currentFileName.value = "";
  currentCollection.value = null;
  hasParsedOnce.value = false;
  sridModalVisible.value = false;
  selectedFeatureId.value = null;
  parseMode.value = "full";
  parseProgress.value = null;
  largeDataset.value = {
    fileBytes: 0,
    featureCount: 0,
    isLargeFile: false,
    isLargeFeature: false,
  };
  largeModalVisible.value = false;
  largeModalReason.value = null;
  hasAcknowledgedLargeFile.value = false;
  hasAcknowledgedLargeFeature.value = false;
  parseStats.value = { total: 0, displayed: 0 };
  visualizationSettings.value = createDefaultVisualization();
};

const onDrop = async (event: DragEvent) => {
  event.preventDefault();
  resetDragState();

  const file = event.dataTransfer?.files?.[0];
  if (!file) {
    errorMessage.value = "드롭한 파일을 찾지 못했습니다.";
    return;
  }
  await processFile(file);
};

const onFileSelect = async (file: File) => {
  await processFile(file);
};

const processFile = async (file: File) => {
  if (!/\.zip$/i.test(file.name)) {
    errorMessage.value = "ZIP 파일을 올려주세요.";
    return;
  }
  isLoading.value = true;
  errorMessage.value = "";
  result.value = null;
  zipInspection.value = null;
  srid.value = null;
  sridMode.value = "file";
  currentFileName.value = file.name;
  sourceBuffer.value = null;
  hasParsedOnce.value = false;
  selectedFeatureId.value = null;
  parseMode.value = "full";
  parseProgress.value = null;
  parseStats.value = { total: 0, displayed: 0 };
  largeDataset.value = {
    fileBytes: file.size,
    featureCount: 0,
    isLargeFile: file.size >= LARGE_FILE_BYTES,
    isLargeFeature: false,
  };
  hasAcknowledgedLargeFile.value = !largeDataset.value.isLargeFile;
  hasAcknowledgedLargeFeature.value = false;
  largeModalVisible.value = false;
  largeModalReason.value = null;

  try {
    const buffer = await file.arrayBuffer();
    sourceBuffer.value = buffer;
    const inspection = await inspectZipEntries(buffer);
    zipInspection.value = inspection;
    if (inspection.detectedEncoding) {
      encoding.value = inspection.detectedEncoding;
    }
    srid.value = inspection.detectedSridCode ?? null;
    sridMode.value = inspection.hasPrj ? "file" : "manual";
    if (!inspection.hasValidLayer) {
      errorMessage.value =
        "필수 구성(SHP/DBF/SHX)이 포함된 레이어를 찾을 수 없습니다.";
      return;
    }
    if (!inspection.hasPrj && srid.value === null) {
      sridModalVisible.value = true;
      return;
    }
    if (largeDataset.value.isLargeFile && !hasAcknowledgedLargeFile.value) {
      openLargeModal("file");
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

const UNIQUE_TRACK_LIMIT = 2000;

const toFeatureId = (value: unknown): FeatureId =>
  String(value ?? "");

const ensureFeatureIds = (collection: FeatureCollectionGeometry) => {
  collection.features?.forEach((feature, index) => {
    const candidate =
      feature.id ??
      feature.properties?.OBJECTID ??
      feature.properties?.id ??
      feature.properties?.ID ??
      `feature-${index}`;
    const normalized = toFeatureId(candidate);
    feature.id = normalized;
    if (!feature.properties) {
      feature.properties = { id: normalized };
    } else if (feature.properties.id === undefined || feature.properties.id === null) {
      feature.properties.id = normalized;
    }
  });
};

const hasFeatureId = (collection: FeatureCollectionGeometry, id: FeatureId | null): boolean => {
  if (!id) return false;
  return (
    collection.features?.some(
      (feature) => toFeatureId(feature.id) === id,
    ) ??
    false
  );
};

const detectValueType = (value: unknown): ColumnStat["dataType"] => {
  if (value === null || value === undefined) return "null";
  const type = typeof value;
  if (type === "number" && Number.isFinite(value as number)) return "number";
  if (type === "number") return "other";
  if (type === "string") return "string";
  if (type === "boolean") return "boolean";
  return "other";
};

const summarizeCollection = (
  collection: FeatureCollectionGeometry,
  fileName: string,
): ViewerResult => {
  const features: FeatureGeometry[] = collection.features ?? [];

  type ColumnAggregate = {
    filled: number;
    empty: number;
    samples: string[];
    observedTypes: Set<ColumnStat["dataType"]>;
    uniqueValues: Set<string>;
    uniqueOverflow: boolean;
    numeric: { min: number; max: number; sum: number; count: number } | null;
  };

  const aggregates = new Map<string, ColumnAggregate>();

  const registerValue = (name: string, value: unknown) => {
    const aggregate =
      aggregates.get(name) ??
      aggregates.set(name, {
        filled: 0,
        empty: 0,
        samples: [],
        observedTypes: new Set(),
        uniqueValues: new Set(),
        uniqueOverflow: false,
        numeric: null,
      }).get(name)!;

    const isEmpty =
      value === null ||
      value === undefined ||
      (typeof value === "string" && value.trim() === "");

    if (isEmpty) {
      aggregate.empty += 1;
      aggregate.observedTypes.add("null");
      return;
    }

    aggregate.filled += 1;
    const valueType = detectValueType(value);
    aggregate.observedTypes.add(valueType);
    if (aggregate.samples.length < 3) {
      aggregate.samples.push(String(value));
    }

    if (!aggregate.uniqueOverflow) {
      const key =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      aggregate.uniqueValues.add(key);
      if (aggregate.uniqueValues.size > UNIQUE_TRACK_LIMIT) {
        aggregate.uniqueOverflow = true;
      }
    }

    if (valueType === "number") {
      const numericValue = Number(value);
      if (!Number.isFinite(numericValue)) return;
      if (!aggregate.numeric) {
        aggregate.numeric = {
          min: numericValue,
          max: numericValue,
          sum: numericValue,
          count: 1,
        };
      } else {
        aggregate.numeric.min = Math.min(aggregate.numeric.min, numericValue);
        aggregate.numeric.max = Math.max(aggregate.numeric.max, numericValue);
        aggregate.numeric.sum += numericValue;
        aggregate.numeric.count += 1;
      }
    }
  };

  for (const feature of features) {
    const properties = feature.properties ?? {};
    for (const [name, value] of Object.entries(properties)) {
      registerValue(name, value);
    }
  }

  const columns: ColumnStat[] = Array.from(aggregates.entries()).map(
    ([name, aggregate]) => {
      const filled = aggregate.filled;
      const empty = aggregate.empty;
      const fillRate = features.length ? (filled / features.length) * 100 : 0;
      const observed = Array.from(aggregate.observedTypes).filter(
        (type) => type !== "null",
      );
      const dataType =
        filled === 0
          ? "null"
          : observed.length === 1
            ? observed[0]!
            : observed.length === 0
              ? "null"
              : "mixed";
      const uniqueCount = aggregate.uniqueOverflow
        ? null
        : aggregate.uniqueValues.size;
      const uniqueRatio =
        uniqueCount !== null && features.length
          ? uniqueCount / features.length
          : null;
      const numericSummary =
        aggregate.numeric && aggregate.numeric.count
          ? {
              min: aggregate.numeric.min,
              max: aggregate.numeric.max,
              mean: aggregate.numeric.sum / aggregate.numeric.count,
            }
          : null;

      return {
        name,
        filled,
        empty,
        fillRate,
        samples: aggregate.samples,
        dataType,
        uniqueCount,
        uniqueRatio,
        numericSummary,
      };
    },
  );

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

const runParse = async (
  buffer: ArrayBuffer,
  options?: { manageLoading?: boolean },
) => {
  const manageLoading = options?.manageLoading ?? true;
  const jobId = ++parseRunId;
  if (manageLoading) isLoading.value = true;
  const previousSelection = selectedFeatureId.value;
  try {
    const shouldOverride =
      sridMode.value === "manual" || !zipInspection.value?.hasPrj;
    const overrideCode = shouldOverride ? srid.value : null;
    logDebug("runParse:start", {
      jobId,
      shouldOverride,
      overrideCode,
      encoding: encoding.value,
    });
    const geojson = await parseWithWorker(buffer, encoding.value, overrideCode);
    if (jobId !== parseRunId) return;
    const collection = normalizeCollection(geojson);
    ensureFeatureIds(collection);
    const totalFeatures = collection.features?.length ?? 0;
    largeDataset.value = {
      ...largeDataset.value,
      featureCount: totalFeatures,
      isLargeFeature: totalFeatures >= LARGE_FEATURE_THRESHOLD,
    };
    parseStats.value = {
      total: totalFeatures,
      displayed: totalFeatures,
    };
    let workingCollection: FeatureCollectionGeometry = collection;
    if (parseMode.value === "quick") {
      workingCollection = applyQuickPreview(collection);
      ensureFeatureIds(workingCollection);
      parseStats.value = {
        total: totalFeatures,
        displayed: workingCollection.features?.length ?? 0,
      };
    }
    currentCollection.value = workingCollection;
    const summaryName =
      currentFileName.value ||
      zipInspection.value?.layers[0]?.name ||
      "파일";
    result.value = summarizeCollection(workingCollection, summaryName);
    errorMessage.value = "";
    const selectionSource = workingCollection;
    if (previousSelection && hasFeatureId(selectionSource, previousSelection)) {
      selectedFeatureId.value = previousSelection;
    } else {
      const firstId = selectionSource.features?.[0]?.id;
      selectedFeatureId.value = firstId ? toFeatureId(firstId) : null;
    }
    if (
      parseMode.value === "quick" &&
      collectionHasPointGeometry(workingCollection) &&
      !visualizationSettings.value.cluster
    ) {
      updateVisualization({ cluster: true });
    }
    if (
      largeDataset.value.isLargeFeature &&
      parseMode.value === "full" &&
      !hasAcknowledgedLargeFeature.value
    ) {
      openLargeModal("feature");
    }
    hasParsedOnce.value = true;
    logDebug("runParse:complete", {
      jobId,
      featureCount: workingCollection.features?.length ?? 0,
      geometrySample: workingCollection.features?.[0]?.geometry?.type ?? "n/a",
    });
  } catch (err) {
    if (jobId !== parseRunId) return;
    console.error("[gongmiri] worker parse error", err);
    errorMessage.value = "파싱 워커에서 오류가 발생했습니다.";
    result.value = null;
    logWarn("runParse:error", err);
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
      hasQix: false,
      hasSbn: false,
      hasSbx: false,
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
    case "qix":
      existing.hasQix = true;
      break;
    case "sbn":
      existing.hasSbn = true;
      break;
    case "sbx":
      existing.hasSbx = true;
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
    const match = leaf.match(/^(.+)\.(shp|dbf|shx|prj|cpg|qix|sbn|sbx)$/i);
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
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("utf-8") || normalized.includes("utf8")) {
    return "utf-8";
  }
  if (
    normalized.includes("euc-kr") ||
    normalized.includes("euckr") ||
    normalized.includes("ksc") ||
    normalized.includes("5601")
  ) {
    return "euc-kr";
  }
  if (
    normalized.includes("949") ||
    normalized.includes("ms949") ||
    normalized.includes("uhc")
  ) {
    return "cp949";
  }
  return undefined;
};

const triggerReparse = () => {
  if (!sourceBuffer.value) return Promise.resolve();
  return runParse(sourceBuffer.value);
};

const confirmSridSelection = async () => {
  if (!sourceBuffer.value || srid.value === null) {
    errorMessage.value = "SRID를 먼저 선택해주세요.";
    return;
  }
  sridMode.value = "manual";
  sridModalVisible.value = false;
  sridChanging.value = true;
  try {
    await runParse(sourceBuffer.value);
    await nextTick();
  } finally {
    sridChanging.value = false;
  }
};

watch(
  () => zipInspection.value?.detectedSridCode,
  (code) => {
    if (code && srid.value === null) {
      srid.value = code;
    }
  },
);

watch(encoding, async (next, prev) => {
  if (!hasParsedOnce.value) return;
  if (next === prev) return;
  encodingChanging.value = true;
  try {
    await triggerReparse();
  } finally {
    encodingChanging.value = false;
  }
});

watch(
  () => parseMode.value,
  (mode) => {
    if (mode === "quick") {
      hasAcknowledgedLargeFile.value = true;
      hasAcknowledgedLargeFeature.value = true;
    }
  },
);

watch(srid, async (next, prev) => {
  if (!hasParsedOnce.value) return;
  if (next === prev) return;
  const shouldOverride =
    sridMode.value === "manual" || !zipInspection.value?.hasPrj;
  if (!shouldOverride) return;
  sridChanging.value = true;
  try {
    await triggerReparse();
    await nextTick();
  } finally {
    sridChanging.value = false;
  }
});

watch(sridMode, async (mode, prev) => {
  if (!hasParsedOnce.value) return;
  if (mode === prev) return;
  sridChanging.value = true;
  try {
    await triggerReparse();
    await nextTick();
  } finally {
    sridChanging.value = false;
  }
});

const handleSridUpdate = (next: SridCode) => {
  srid.value = next;
  sridMode.value = "manual";
};

const resetToFileProjection = () => {
  if (!zipInspection.value?.hasPrj) return;
  sridMode.value = "file";
};

const prjSummary = computed(() => zipInspection.value?.prjText ?? "");

const handleGridSelection = (id: FeatureId) => {
  selectedFeatureId.value = id;
};

const handleFeatureFocusFromMap = (id: FeatureId | null) => {
  selectedFeatureId.value = id;
};

watch(
  [() => result.value?.columns, () => hasPointGeometry.value],
  () => {
    sanitizeVisualizationSelections();
  },
  { deep: true },
);
</script>

<template>
  <div class="popup-container">
    <header class="header">
      <div class="header-meta">
        <h2>공간데이터 미리보기</h2>
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
          v-if="!hasFileLoaded && !parseProgress"
          :is-dragging="isDragging"
          :is-loading="isLoading"
          @drop-file="onDrop"
          @drag-state="handleDragState"
          @select-file="onFileSelect"
        />

        <ParseProgressBar
          v-if="parseProgress && !hasFileLoaded"
          :progress="parseProgress"
        />

        <ZipInspectionPanel
          v-if="zipInspection && hasFileLoaded"
          :inspection="zipInspection"
          :feature-count="result?.featureCount ?? null"
          :geometry-types="result?.geometryTypes ?? []"
        />
      </div>

      <div class="panel-stack panel-stack--right">
        <LargeDatasetBanner
          v-if="shouldShowLargeBanner"
          :parse-mode="parseMode"
          :file-bytes="largeDataset.fileBytes"
          :total-features="parseStats.total"
          :displayed-features="parseStats.displayed"
          :is-large-file="largeDataset.isLargeFile"
          :is-large-feature="largeDataset.isLargeFeature"
          @select-mode="toggleParseMode"
        />

        <MapPanel
          v-if="hasFileLoaded"
          :collection="currentCollection"
          :srid="srid"
          :srid-mode="sridMode"
          :detected-srid="zipInspection?.detectedSridCode ?? null"
          :has-prj="zipInspection?.hasPrj ?? false"
          :prj-text="prjSummary"
          :selected-feature-id="selectedFeatureId"
          :visualization="visualizationConfig"
          :visualization-settings="visualizationSettings"
          :columns="result?.columns ?? []"
          :category-legend="categoryLegend"
          :numeric-legend="numericLegend"
          :size-legend="sizeLegend"
          :has-point-geometry="hasPointGeometry"
          :srid-changing="sridChanging"
          @update:srid="handleSridUpdate"
          @use-file-projection="resetToFileProjection"
          @feature-focus="handleFeatureFocusFromMap"
          @update-visualization="updateVisualization"
        />

        <ResultPanel
          v-if="result"
          :result="result"
          :encoding="encoding"
          :detected-encoding="zipInspection?.detectedEncoding"
          :has-cpg="zipInspection?.hasCpg"
          @change-encoding="encoding = $event"
        />

        <DataGrid
          v-if="currentCollection && result"
          :collection="currentCollection"
          :columns="result.columns"
          :selected-id="selectedFeatureId"
          :encoding="encoding"
          :encoding-changing="encodingChanging"
          :detected-encoding="zipInspection?.detectedEncoding"
          :has-cpg="zipInspection?.hasCpg"
          @select="handleGridSelection"
          @change-encoding="encoding = $event"
        />

        <div v-if="errorMessage" class="alert-card">
          <p>{{ errorMessage }}</p>
        </div>

        <div v-else-if="!result" class="placeholder-card">
          <h3>ZIP 파일을 드롭해 보세요</h3>
          <p>왼쪽에서 ZIP을 드래그하거나 파일을 선택하면 검사·파싱 진행바가 나타나고, 완료 후 지도와 속성 요약이 채워집니다.</p>
          <ul>
            <li>SHP/DBF/SHX, CPG/PRJ 유무를 먼저 검사</li>
            <li>인코딩·좌표계를 추정해 바로 적용</li>
            <li>지도/테이블 패널에서 내용 확인·탐색</li>
          </ul>
        </div>
      </div>
    </div>

    <SridModal
      v-if="sridModalVisible"
      :selected="srid"
      @update:selected="srid = $event"
      @confirm="confirmSridSelection"
      @cancel="resetViewer"
    />

    <LargeDatasetModal
      v-if="largeModalVisible"
      :reason="largeModalReason"
      :file-bytes="largeDataset.fileBytes"
      :feature-count="largeDataset.featureCount"
      :parse-mode="parseMode"
      @close="closeLargeModal"
      @select="handleLargeModalSelect"
    />
  </div>
</template>
