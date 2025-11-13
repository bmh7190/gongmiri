<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  LngLatLike,
  MapLayerMouseEvent,
  MapGeoJSONFeature,
} from "maplibre-gl";
import type { FeatureCollectionGeometry, FeatureGeometry, FeatureId, SridCode } from "../types";
import type { Geometry, Position } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import SridSelector from "./SridSelector.vue";
import { logDebug } from "../utils/logger";

const props = defineProps<{
  collection: FeatureCollectionGeometry | null;
  srid: SridCode | null;
  sridMode: "file" | "manual";
  detectedSrid: SridCode | null;
  hasPrj: boolean;
  prjText?: string | null;
  selectedFeatureId: FeatureId | null;
}>();

const emit = defineEmits<{
  (e: "update:srid", value: SridCode): void;
  (e: "use-file-projection"): void;
  (e: "feature-focus", value: FeatureId | null): void;
}>();

const SOURCE_ID = "gongmiri-preview-source";
const POINT_LAYER_ID = "gongmiri-points";
const LINE_LAYER_ID = "gongmiri-lines";
const POLYGON_FILL_LAYER_ID = "gongmiri-polygons";
const POLYGON_OUTLINE_LAYER_ID = "gongmiri-polygon-outline";
const DEFAULT_CENTER: LngLatLike = [127.0276, 37.4979];
const DEFAULT_ZOOM = 5;
const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const EMPTY_COLLECTION: FeatureCollectionGeometry = {
  type: "FeatureCollection",
  features: [],
};

const mapContainer = ref<HTMLDivElement | null>(null);
type MapHandle = Parameters<maplibregl.Popup["addTo"]>[0];

const mapInstance = ref<MapHandle | null>(null);
const isMapReady = ref(false);
const popupRef = ref<maplibregl.Popup | null>(null);
const showSridPanel = ref(false);
const showPrjText = ref(false);
const activeFeatureId = ref<FeatureId | null>(null);

const hasFeatures = computed(
  () => Boolean(props.collection?.features?.length),
);

const sridStatusLabel = computed(() => {
  if (props.sridMode === "manual") {
    return props.srid ? `수동 · EPSG:${props.srid}` : "수동 · SRID 필요";
  }
  if (props.detectedSrid) {
    return `PRJ · EPSG:${props.detectedSrid}`;
  }
  return "PRJ 원본";
});

const initMap = () => {
  if (!mapContainer.value || mapInstance.value) return;
  const map = new maplibregl.Map({
    container: mapContainer.value,
    style: MAP_STYLE_URL,
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    attributionControl: false,
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
  map.addControl(new maplibregl.AttributionControl({ compact: true }));

  map.on("load", () => {
    map.addSource(SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
      promoteId: "id",
    });
    addLayers(map);
    registerInteractions(map);
    isMapReady.value = true;
    syncCollection();
  });

  mapInstance.value = map;
};

const destroyMap = () => {
  popupRef.value?.remove();
  popupRef.value = null;
  mapInstance.value?.remove();
  mapInstance.value = null;
  isMapReady.value = false;
  activeFeatureId.value = null;
};

const addLayers = (map: MapHandle) => {
  map.addLayer({
    id: POLYGON_FILL_LAYER_ID,
    type: "fill",
    source: SOURCE_ID,
    paint: {
      "fill-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#fbbf24",
        "#0ea5e9",
      ],
      "fill-opacity": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        0.35,
        0.2,
      ],
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: POLYGON_OUTLINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#f59e0b",
        "#0284c7",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2,
        1.2,
      ],
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#f59e0b",
        "#f97316",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2,
        1.2,
      ],
    },
    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
  });

  map.addLayer({
    id: POINT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        6,
        4,
      ],
      "circle-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#facc15",
        "#22c55e",
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#92400e",
        "#065f46",
      ],
    },
    filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
  });
};

const registerInteractions = (map: MapHandle) => {
  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
    focusOnFeature(event);
    showPopup(feature, event.lngLat);
    if (feature.id !== undefined && feature.id !== null) {
      emit("feature-focus", String(feature.id));
    }
  };

  const hoverCursor = (enter: boolean) => {
    if (!mapInstance.value) return;
    mapInstance.value.getCanvas().style.cursor = enter ? "pointer" : "";
  };

  const interactiveLayers = [
    POINT_LAYER_ID,
    LINE_LAYER_ID,
    POLYGON_FILL_LAYER_ID,
    POLYGON_OUTLINE_LAYER_ID,
  ];

  for (const layerId of interactiveLayers) {
    map.on("click", layerId, handleClick);
    map.on("mouseenter", layerId, () => hoverCursor(true));
    map.on("mouseleave", layerId, () => hoverCursor(false));
  }
};

const focusOnFeature = (event: MapLayerMouseEvent) => {
  if (!mapInstance.value) return;
  mapInstance.value.easeTo({
    center: event.lngLat,
    duration: 600,
  });
};

const showPopup = (feature: MapGeoJSONFeature, position: LngLatLike) => {
  popupRef.value?.remove();
  const html = buildPopupHtml(feature);
  const targetMap = mapInstance.value;
  if (!targetMap) return;
  popupRef.value = new maplibregl.Popup({ closeButton: true })
    .setLngLat(position)
    .setHTML(html)
    // MapLibre typings expect their internal Map$1 type; cast to never to satisfy TS.
    .addTo(targetMap as never);
};

const buildPopupHtml = (feature: MapGeoJSONFeature): string => {
  const props = feature.properties ?? {};
  const rows = Object.entries(props)
    .slice(0, 6)
    .map(([key, value]) => {
      const safeKey = escapeHtml(key);
      const safeValue = escapeHtml(formatValue(value));
      return `<div class="popup-row"><strong>${safeKey}</strong><span>${safeValue}</span></div>`;
    })
    .join("");

  return `
    <div class="map-popup">
      <h4>속성 요약</h4>
      ${rows || "<em>값이 없습니다</em>"}
    </div>
  `;
};

const escapeHtml = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const formatValue = (value: unknown): string => {
  if (value === null || value === undefined) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const syncCollection = () => {
  if (!isMapReady.value || !mapInstance.value) return;
  const map = mapInstance.value;
  const source = map.getSource(SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  const data = (props.collection ? toRaw(props.collection) : EMPTY_COLLECTION) as FeatureCollectionGeometry;
  source.setData(data);
  logDebug("mapPanel:data", {
    features: data.features?.length ?? 0,
    sridMode: props.sridMode,
  });

  updateLayerVisibility(data);
  if (hasFeatures.value && props.collection) {
    fitToBounds(data);
  } else {
    resetView();
  }
  applyFeatureState(props.selectedFeatureId ?? null);
};

const updateLayerVisibility = (collection: FeatureCollectionGeometry) => {
  const map = mapInstance.value;
  if (!map) return;
  toggleLayer(POLYGON_FILL_LAYER_ID, hasGeometry(collection, ["Polygon", "MultiPolygon"]));
  toggleLayer(POLYGON_OUTLINE_LAYER_ID, hasGeometry(collection, ["Polygon", "MultiPolygon"]));
  toggleLayer(LINE_LAYER_ID, hasGeometry(collection, ["LineString", "MultiLineString"]));
  toggleLayer(POINT_LAYER_ID, hasGeometry(collection, ["Point", "MultiPoint"]));
};

const toggleLayer = (layerId: string, visible: boolean) => {
  const map = mapInstance.value;
  if (!map?.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
};

const toggleSridPanel = () => {
  showSridPanel.value = !showSridPanel.value;
};

const handleSridChange = (code: SridCode) => {
  emit("update:srid", code);
};

const handleUseFileProjection = () => {
  emit("use-file-projection");
};

const applyFeatureState = (featureId: FeatureId | null) => {
  if (!mapInstance.value) return;
  if (activeFeatureId.value) {
    try {
      mapInstance.value.setFeatureState(
        { source: SOURCE_ID, id: activeFeatureId.value },
        { selected: false },
      );
    } catch (error) {
      logDebug("mapPanel:clear-state", error);
    }
  }
  if (featureId) {
    try {
      mapInstance.value.setFeatureState(
        { source: SOURCE_ID, id: featureId },
        { selected: true },
      );
    } catch (error) {
      logDebug("mapPanel:set-state", error);
    }
  }
  activeFeatureId.value = featureId;
};

const focusFeatureById = (featureId: FeatureId | null) => {
  if (!featureId || !mapInstance.value) return;
  const feature = props.collection?.features?.find((item) => item.id === featureId);
  if (!feature?.geometry) return;
  const bounds = computeBounds({
    type: "FeatureCollection",
    features: [feature as FeatureGeometry],
  });
  if (!bounds) return;
  const [[minX, minY], [maxX, maxY]] = bounds;
  const isPoint = minX === maxX && minY === maxY;
  if (isPoint) {
    mapInstance.value.easeTo({
      center: [minX, minY],
      duration: 500,
      zoom: Math.max(mapInstance.value.getZoom(), 9),
    });
    return;
  }
  mapInstance.value.fitBounds(bounds, {
    padding: 40,
    maxZoom: 13,
    duration: 500,
  });
};

const hasGeometry = (
  collection: FeatureCollectionGeometry,
  types: string[],
): boolean => {
  const set = new Set(types);
  for (const feature of collection.features ?? []) {
    const type = feature.geometry?.type;
    if (type && set.has(type)) {
      return true;
    }
    if (type?.startsWith("Multi")) {
      const base = type.replace("Multi", "");
      if (set.has(base)) return true;
    }
  }
  return false;
};

const fitToBounds = (collection: FeatureCollectionGeometry) => {
  if (!mapInstance.value) return;
  const bounds = computeBounds(collection);
  if (!bounds) return;
  const [[minX, minY], [maxX, maxY]] = bounds;
  const isDegenerate = minX === maxX && minY === maxY;
  const padding = isDegenerate ? 0.05 : 0;
  const adjustedBounds: [[number, number], [number, number]] = isDegenerate
    ? [
        [minX - padding, minY - padding],
        [maxX + padding, maxY + padding],
      ]
    : bounds;

  mapInstance.value.fitBounds(adjustedBounds, {
    padding: 32,
    maxZoom: 14,
    duration: 700,
  });
};

const computeBounds = (
  collection: FeatureCollectionGeometry,
): [[number, number], [number, number]] | null => {
  let minX: number | null = null;
  let minY: number | null = null;
  let maxX: number | null = null;
  let maxY: number | null = null;

  const update = (position: Position) => {
    const x = position[0];
    const y = position[1];
    if (typeof x !== "number" || typeof y !== "number") return;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (minX === null) {
      minX = x;
    } else {
      minX = Math.min(minX, x);
    }
    if (minY === null) {
      minY = y;
    } else {
      minY = Math.min(minY, y);
    }
    if (maxX === null) {
      maxX = x;
    } else {
      maxX = Math.max(maxX, x);
    }
    if (maxY === null) {
      maxY = y;
    } else {
      maxY = Math.max(maxY, y);
    }
  };

  for (const feature of collection.features ?? []) {
    if (!feature.geometry) continue;
    visitGeometry(feature.geometry, update);
  }

  if (minX === null || minY === null || maxX === null || maxY === null) {
    return null;
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
};

const visitGeometry = (geometry: Geometry, visit: (position: Position) => void) => {
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates as Position);
      break;
    case "MultiPoint":
    case "LineString":
      for (const coord of geometry.coordinates as Position[]) visit(coord);
      break;
    case "MultiLineString":
    case "Polygon":
      for (const ring of geometry.coordinates as Position[][]) {
        for (const coord of ring) visit(coord);
      }
      break;
    case "MultiPolygon":
      for (const polygon of geometry.coordinates as Position[][][]) {
        for (const ring of polygon) {
          for (const coord of ring) visit(coord);
        }
      }
      break;
    case "GeometryCollection":
      for (const child of geometry.geometries ?? []) {
        visitGeometry(child, visit);
      }
      break;
    default:
      break;
  }
};

const resetView = () => {
  if (!mapInstance.value) return;
  mapInstance.value.easeTo({
    center: DEFAULT_CENTER,
    zoom: DEFAULT_ZOOM,
    duration: 500,
  });
};

onMounted(() => {
  initMap();
});

onBeforeUnmount(() => {
  destroyMap();
});

watch(
  () => props.collection,
  () => {
    syncCollection();
  },
);

watch(
  () => props.selectedFeatureId,
  (next, prev) => {
    if (!isMapReady.value) return;
    applyFeatureState(next ?? null);
    if (next && next !== prev) {
      focusFeatureById(next);
    }
  },
);
</script>

<template>
  <section class="map-panel">
    <div class="map-panel__header">
      <div>
        <h3>지도 미리보기</h3>
        <small>
          <template v-if="hasFeatures">
            피처를 클릭하면 간단한 팝업과 함께 해당 위치로 이동합니다.
          </template>
          <template v-else>
            ZIP을 불러오면 공간 분포를 확인할 수 있습니다.
          </template>
        </small>
      </div>
      <div class="map-panel__actions">
        <span class="map-panel__srid-pill">{{ sridStatusLabel }}</span>
        <button
          type="button"
          class="map-panel__srid-toggle"
          @click="toggleSridPanel"
        >
          {{ showSridPanel ? "좌표계 닫기" : "좌표계 설정" }}
        </button>
      </div>
    </div>
    <transition name="fade">
      <div v-if="showSridPanel" class="map-panel__srid-panel">
        <SridSelector
          :detected="props.detectedSrid"
          :selected="props.srid"
          @update:selected="handleSridChange"
        />
        <div class="srid-panel__actions">
          <button
            type="button"
            class="reset-button reset-button--subtle"
            :disabled="!props.hasPrj || props.sridMode === 'file'"
            @click="handleUseFileProjection"
          >
            PRJ 원본 사용
          </button>
          <button
            v-if="props.prjText"
            type="button"
            class="srid-panel__toggle"
            @click="showPrjText = !showPrjText"
          >
            {{ showPrjText ? "PRJ 숨기기" : "PRJ 전문 보기" }}
          </button>
        </div>
        <pre v-if="showPrjText && props.prjText" class="srid-panel__prj">{{ props.prjText }}</pre>
      </div>
    </transition>
    <div class="map-panel__canvas">
      <div ref="mapContainer" class="map-panel__map" />
      <div v-if="!hasFeatures" class="map-panel__empty">
        <p>표시할 피처가 없습니다.</p>
      </div>
    </div>
  </section>
</template>
