<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, toRaw, watch } from "vue";
import * as maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  LngLatLike,
  MapLayerMouseEvent,
  MapGeoJSONFeature,
} from "maplibre-gl";
import type {
  CategoryStop,
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureGeometry,
  FeatureId,
  NumericLegendEntry,
  SridCode,
  VisualizationConfig,
  VisualizationSettings,
  SizeLegend,
} from "../types";
import type { Geometry, Position } from "geojson";
import "maplibre-gl/dist/maplibre-gl.css";
import VisualizationPanel from "./VisualizationPanel.vue";
import { logDebug } from "../utils/logger";
import { SRID_OPTIONS } from "../utils/srid";
import { CATEGORY_OTHER_COLOR, extractPointCollection } from "../utils/visualization";

const chevronDownIcon = new URL(
  "../../assets/icons/chevron-down.svg",
  import.meta.url,
).href;

const props = defineProps<{
  collection: FeatureCollectionGeometry | null;
  srid: SridCode | null;
  sridMode: "file" | "manual";
  detectedSrid: SridCode | null;
  hasPrj: boolean;
  prjText?: string | null;
  selectedFeatureId: FeatureId | null;
  visualization: VisualizationConfig;
  visualizationSettings: VisualizationSettings;
  columns: ColumnStat[];
  categoryLegend: CategoryStop[];
  numericLegend: NumericLegendEntry[];
  sizeLegend: SizeLegend;
  hasPointGeometry: boolean;
  sridChanging?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:srid", value: SridCode): void;
  (e: "use-file-projection"): void;
  (e: "feature-focus", value: FeatureId | null): void;
  (e: "update-visualization", value: Partial<VisualizationSettings>): void;
}>();

const SOURCE_ID = "gongmiri-preview-source";
const SELECTED_SOURCE_ID = "gongmiri-selected-feature";
const POINT_LAYER_ID = "gongmiri-points";
const LINE_LAYER_ID = "gongmiri-lines";
const POLYGON_FILL_LAYER_ID = "gongmiri-polygons";
const POLYGON_OUTLINE_LAYER_ID = "gongmiri-polygon-outline";
const SELECTED_POLYGON_FILL_LAYER_ID = "gongmiri-selected-polygons";
const SELECTED_POLYGON_OUTLINE_LAYER_ID = "gongmiri-selected-polygon-outline";
const SELECTED_LINE_LAYER_ID = "gongmiri-selected-lines";
const SELECTED_POINT_LAYER_ID = "gongmiri-selected-points";
const CLUSTER_SOURCE_ID = "gongmiri-cluster-source";
const CLUSTER_LAYER_ID = "gongmiri-cluster-layer";
const CLUSTER_COUNT_LAYER_ID = "gongmiri-cluster-count";
const CLUSTER_POINT_LAYER_ID = "gongmiri-cluster-points";
const DEFAULT_CENTER: LngLatLike = [127.0276, 37.4979];
const DEFAULT_ZOOM = 5;
const MAP_STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";
const DEFAULT_COLORS = {
  polygonFill: "#0ea5e9",
  polygonOutline: "#0284c7",
  line: "#f97316",
  point: "#22c55e",
};
const DEFAULT_POINT_RADIUS = 4;
const SELECTION_COLORS = {
  polygonFill: "#f31260",
  polygonOutline: "#be185d",
  line: "#f31260",
  pointFill: "#f31260",
  pointStroke: "#9d174d",
};

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
const showVisualizationPanel = ref(false);
const pointLayerAvailable = ref(false);

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
    map.addSource(SELECTED_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
    });
    map.addSource(CLUSTER_SOURCE_ID, {
      type: "geojson",
      data: EMPTY_COLLECTION,
      promoteId: "id",
      cluster: true,
      clusterMaxZoom: 11,
      clusterRadius: 50,
    });
    addLayers(map);
    addSelectedLayers(map);
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
      "fill-color": DEFAULT_COLORS.polygonFill,
      "fill-opacity": 0.2,
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: POLYGON_OUTLINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": DEFAULT_COLORS.polygonOutline,
      "line-width": 1.2,
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: LINE_LAYER_ID,
    type: "line",
    source: SOURCE_ID,
    paint: {
      "line-color": DEFAULT_COLORS.line,
      "line-width": 1.2,
    },
    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
  });

  map.addLayer({
    id: POINT_LAYER_ID,
    type: "circle",
    source: SOURCE_ID,
    paint: {
      "circle-radius": DEFAULT_POINT_RADIUS,
      "circle-color": DEFAULT_COLORS.point,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#065f46",
    },
    filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
  });

  map.addLayer({
    id: CLUSTER_LAYER_ID,
    type: "circle",
    source: CLUSTER_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": [
        "step",
        ["get", "point_count"],
        "#60a5fa",
        50,
        "#2563eb",
        200,
        "#1d4ed8",
      ],
      "circle-radius": [
        "step",
        ["get", "point_count"],
        16,
        50,
        22,
        200,
        28,
      ],
      "circle-stroke-width": 1,
      "circle-stroke-color": "#1e3a8a",
    },
  });

  map.addLayer({
    id: CLUSTER_COUNT_LAYER_ID,
    type: "symbol",
    source: CLUSTER_SOURCE_ID,
    filter: ["has", "point_count"],
    layout: {
      "text-field": ["get", "point_count_abbreviated"],
      "text-font": ["Noto Sans Regular", "Arial Unicode MS Regular"],
      "text-size": 12,
      "visibility": "none",
    },
    paint: {
      "text-color": "#f8fafc",
    },
  });

  map.addLayer({
    id: CLUSTER_POINT_LAYER_ID,
    type: "circle",
    source: CLUSTER_SOURCE_ID,
    filter: ["!", ["has", "point_count"]],
    layout: { visibility: "none" },
    paint: {
      "circle-radius": DEFAULT_POINT_RADIUS,
      "circle-color": DEFAULT_COLORS.point,
      "circle-stroke-width": 1,
      "circle-stroke-color": "#065f46",
    },
  });
};

const addSelectedLayers = (map: MapHandle) => {
  map.addLayer({
    id: SELECTED_POLYGON_FILL_LAYER_ID,
    type: "fill",
    source: SELECTED_SOURCE_ID,
    paint: {
      "fill-color": SELECTION_COLORS.polygonFill,
      "fill-opacity": 0.3,
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: SELECTED_POLYGON_OUTLINE_LAYER_ID,
    type: "line",
    source: SELECTED_SOURCE_ID,
    paint: {
      "line-color": SELECTION_COLORS.polygonOutline,
      "line-width": 1.2,
    },
    filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
  });

  map.addLayer({
    id: SELECTED_LINE_LAYER_ID,
    type: "line",
    source: SELECTED_SOURCE_ID,
    paint: {
      "line-color": SELECTION_COLORS.line,
      "line-width": 1.2,
    },
    filter: ["match", ["geometry-type"], ["LineString", "MultiLineString"], true, false],
  });

  map.addLayer({
    id: SELECTED_POINT_LAYER_ID,
    type: "circle",
    source: SELECTED_SOURCE_ID,
    paint: {
      "circle-radius": DEFAULT_POINT_RADIUS,
      "circle-color": SELECTION_COLORS.pointFill,
      "circle-stroke-width": 1,
      "circle-stroke-color": SELECTION_COLORS.pointStroke,
    },
    filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
  });
};

const registerInteractions = (map: MapHandle) => {
  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature) return;
    const featureCenter = getFeatureCenter(feature) ?? event.lngLat;
    focusOnFeature(featureCenter);
    showPopup(feature, featureCenter);
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
    CLUSTER_POINT_LAYER_ID,
  ];

  for (const layerId of interactiveLayers) {
    map.on("click", layerId, handleClick);
    map.on("mouseenter", layerId, () => hoverCursor(true));
    map.on("mouseleave", layerId, () => hoverCursor(false));
  }

  const handleClusterClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0];
    if (!feature?.properties) return;
    const clusterId = feature.properties.cluster_id;
    if (typeof clusterId !== "number") return;
    const source = map.getSource(CLUSTER_SOURCE_ID) as (GeoJSONSource & {
      getClusterExpansionZoom?: (
        id: number,
        callback: (error?: Error | null, zoom?: number) => void,
      ) => void;
    }) | null;
    if (!source?.getClusterExpansionZoom) return;
    source.getClusterExpansionZoom(clusterId, (error?: Error | null, zoom?: number) => {
      if (error || zoom === undefined) return;
      map.easeTo({
        center: event.lngLat,
        zoom,
        duration: 500,
      });
    });
  };

  map.on("click", CLUSTER_LAYER_ID, handleClusterClick);
  map.on("mouseenter", CLUSTER_LAYER_ID, () => hoverCursor(true));
  map.on("mouseleave", CLUSTER_LAYER_ID, () => hoverCursor(false));
};

const focusOnFeature = (target: LngLatLike) => {
  if (!mapInstance.value) return;
  mapInstance.value.easeTo({
    center: target,
    duration: 600,
  });
};

const showPopup = (feature: MapGeoJSONFeature, position: LngLatLike) => {
  popupRef.value?.remove();
  const html = buildPopupHtml(feature);
  const targetMap = mapInstance.value;
  if (!targetMap) return;
  popupRef.value = new maplibregl.Popup({
    closeButton: true,
    closeOnMove: false,
    offset: 12,
    maxWidth: "280px",
    anchor: "center",
  })
    .setLngLat(position)
    .setHTML(html)
    // MapLibre typings expect their internal Map$1 type; cast to never to satisfy TS.
    .addTo(targetMap as never);
};

const buildPopupHtml = (feature: MapGeoJSONFeature): string => {
  const props = feature.properties ?? {};
  const rows = Object.entries(props)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 6)
    .map(([key, value]) => {
      const safeKey = escapeHtml(key);
      const safeValue = escapeHtml(formatValue(value));
      return `
        <tr class="popup-row">
          <th scope="row" class="popup-row__label">${safeKey}</th>
          <td class="popup-row__value">${safeValue}</td>
        </tr>
      `;
    })
    .join("");

  return `
    <div class="map-popup">
      <header class="map-popup__header">
        <h4>속성 요약</h4>
      </header>
      ${rows
        ? `
          <div class="map-popup__table-wrapper">
            <table class="popup-table">
              <colgroup>
                <col class="popup-table__col popup-table__col--key" />
                <col class="popup-table__col popup-table__col--value" />
              </colgroup>
              <tbody>
                ${rows}
              </tbody>
            </table>
          </div>
        `
        : '<div class="map-popup__empty">표시할 속성이 없습니다</div>'}
    </div>
  `;
};

const getFeatureCenter = (feature: MapGeoJSONFeature): LngLatLike | null => {
  const geometry = feature.geometry as Geometry | undefined;
  if (!geometry) return null;
  if (geometry.type === "Point") {
    return geometry.coordinates as LngLatLike;
  }
  const positions = getGeometryPositions(geometry);
  if (!positions.length) return null;
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const position of positions) {
    const [lng, lat] = position;
    if (typeof lng !== "number" || typeof lat !== "number") continue;
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  if (!Number.isFinite(minLng) || !Number.isFinite(minLat) || !Number.isFinite(maxLng) || !Number.isFinite(maxLat)) {
    return null;
  }
  return [
    (minLng + maxLng) / 2,
    (minLat + maxLat) / 2,
  ] as LngLatLike;
};

const getGeometryPositions = (geometry: Geometry): Position[] => {
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(getGeometryPositions);
  }
  return collectPositions(geometry.coordinates);
};

const collectPositions = (input: unknown): Position[] => {
  if (isPosition(input)) {
    return [input];
  }
  if (Array.isArray(input)) {
    return (input as unknown[]).flatMap((value) => collectPositions(value));
  }
  return [];
};

const isPosition = (value: unknown): value is Position => {
  return (
    Array.isArray(value)
    && value.length >= 2
    && typeof value[0] === "number"
    && typeof value[1] === "number"
  );
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
  const clusterSource = map.getSource(CLUSTER_SOURCE_ID) as GeoJSONSource | undefined;
  if (clusterSource) {
    const pointCollection = extractPointCollection(
      (props.collection ? toRaw(props.collection) : EMPTY_COLLECTION) as FeatureCollectionGeometry,
    );
    clusterSource.setData(pointCollection);
  }
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
  updateSelectedFeatureSource(props.selectedFeatureId ?? null);
  applyVisualization();
};

const updateLayerVisibility = (collection: FeatureCollectionGeometry) => {
  const map = mapInstance.value;
  if (!map) return;
  const polygonsVisible = hasGeometry(collection, ["Polygon", "MultiPolygon"]);
  const linesVisible = hasGeometry(collection, ["LineString", "MultiLineString"]);
  toggleLayer(POLYGON_FILL_LAYER_ID, polygonsVisible);
  toggleLayer(POLYGON_OUTLINE_LAYER_ID, polygonsVisible);
  toggleLayer(LINE_LAYER_ID, linesVisible);
  pointLayerAvailable.value = hasGeometry(collection, ["Point", "MultiPoint"]);
  applyClusterVisibility();
};

const toggleLayer = (layerId: string, visible: boolean) => {
  const map = mapInstance.value;
  if (!map?.getLayer(layerId)) return;
  map.setLayoutProperty(layerId, "visibility", visible ? "visible" : "none");
};

const setPaintPropertySafe = (layerId: string, property: string, value: unknown) => {
  const map = mapInstance.value;
  if (!map?.getLayer(layerId)) return;
  map.setPaintProperty(layerId, property, value);
};

const applyVisualization = () => {
  if (!isMapReady.value) return;
  applyColorVisualization();
  applyPointSizeVisualization();
  applyClusterVisibility();
};

const applyColorVisualization = () => {
  const fillColor = buildColorExpression(DEFAULT_COLORS.polygonFill);
  const outlineColor = buildColorExpression(DEFAULT_COLORS.polygonOutline);
  const lineColor = buildColorExpression(DEFAULT_COLORS.line);
  const pointColor = buildColorExpression(DEFAULT_COLORS.point);

  setPaintPropertySafe(
    POLYGON_FILL_LAYER_ID,
    "fill-color",
    fillColor,
  );
  setPaintPropertySafe(
    POLYGON_OUTLINE_LAYER_ID,
    "line-color",
    outlineColor,
  );
  setPaintPropertySafe(
    LINE_LAYER_ID,
    "line-color",
    lineColor,
  );
  setPaintPropertySafe(
    POINT_LAYER_ID,
    "circle-color",
    pointColor,
  );
  setPaintPropertySafe(
    CLUSTER_POINT_LAYER_ID,
    "circle-color",
    pointColor,
  );
};

const buildColorExpression = (
  fallback: string,
): maplibregl.ExpressionSpecification | string => {
  const visualization = props.visualization;
  if (
    visualization.colorMode === "category" &&
    visualization.categoryField &&
    visualization.categoryStops.length
  ) {
    return buildCategoryExpression(
      visualization.categoryField,
      visualization.categoryStops,
      fallback,
    );
  }
  if (
    visualization.colorMode === "continuous" &&
    visualization.numericField &&
    visualization.numericStops.length
  ) {
    return buildContinuousExpression(
      visualization.numericField,
      visualization.numericStops,
      visualization.numericDomain,
      fallback,
    );
  }
  return fallback;
};

const buildCategoryExpression = (
  field: string,
  stops: VisualizationConfig["categoryStops"],
  fallback: string,
): maplibregl.ExpressionSpecification | string => {
  const entries = stops.filter((stop) => !stop.isOther);
  if (!entries.length) return fallback;
  const otherColor =
    stops.find((stop) => stop.isOther)?.color ?? CATEGORY_OTHER_COLOR;
  const expression: Array<string | maplibregl.ExpressionSpecification> = [
    "match",
    ["to-string", ["coalesce", ["get", field], ""]],
  ];
  for (const stop of entries) {
    expression.push(stop.value, stop.color);
  }
  expression.push(otherColor);
  return expression as maplibregl.ExpressionSpecification;
};

const buildContinuousExpression = (
  field: string,
  stops: VisualizationConfig["numericStops"],
  domain: [number, number] | null,
  fallback: string,
): maplibregl.ExpressionSpecification | string => {
  if (stops.length === 1) {
    return stops[0]!.color;
  }
  if (!domain) return fallback;
  const interpolate: maplibregl.ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["coalesce", ["to-number", ["get", field]], domain[0]!],
    ...stops.flatMap((stop) => [stop.value, stop.color]),
  ];
  return [
    "case",
    ["has", field],
    interpolate,
    fallback,
  ];
};

const applyPointSizeVisualization = () => {
  const radiusExpression = buildRadiusExpression();
  setPaintPropertySafe(POINT_LAYER_ID, "circle-radius", radiusExpression);
  setPaintPropertySafe(CLUSTER_POINT_LAYER_ID, "circle-radius", radiusExpression);
};

const buildRadiusExpression = (): maplibregl.ExpressionSpecification | number => {
  const stops = props.visualization.pointSizeStops;
  const field = props.visualization.pointSizeField;
  if (!stops || !field || stops.length < 2) {
    return DEFAULT_POINT_RADIUS;
  }
  const interpolate: maplibregl.ExpressionSpecification = [
    "interpolate",
    ["linear"],
    ["coalesce", ["to-number", ["get", field]], stops[0]!.value],
    ...stops.flatMap((stop) => [stop.value, stop.radius]),
  ];
  return interpolate;
};

const applyClusterVisibility = () => {
  const canShowPoints = pointLayerAvailable.value;
  const enabled = canShowPoints && props.visualization.cluster;
  toggleLayer(POINT_LAYER_ID, canShowPoints && !enabled);
  toggleLayer(CLUSTER_LAYER_ID, enabled);
  toggleLayer(CLUSTER_COUNT_LAYER_ID, enabled);
  toggleLayer(CLUSTER_POINT_LAYER_ID, enabled);
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

const toggleVisualizationOptions = () => {
  if (!hasFeatures.value) return;
  showVisualizationPanel.value = !showVisualizationPanel.value;
};

const handleVisualizationUpdate = (value: Partial<VisualizationSettings>) => {
  emit("update-visualization", value);
};

const applyFeatureState = (featureId: FeatureId | null) => {
  updateSourceSelection(SOURCE_ID, activeFeatureId.value, featureId);
  updateSourceSelection(CLUSTER_SOURCE_ID, activeFeatureId.value, featureId);
  activeFeatureId.value = featureId;
};

const setSelectedFeatureGeometry = (feature: FeatureGeometry | null) => {
  if (!mapInstance.value) return;
  const source = mapInstance.value.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
  if (!source) return;
  if (!feature) {
    source.setData(EMPTY_COLLECTION);
    return;
  }
  const plainFeature = JSON.parse(JSON.stringify(feature)) as FeatureGeometry;
  source.setData({
    type: "FeatureCollection",
    features: [plainFeature],
  });
};

const updateSelectedFeatureSource = (featureId: FeatureId | null) => {
  if (!featureId || !props.collection?.features?.length) {
    setSelectedFeatureGeometry(null);
    return;
  }
  const feature = props.collection.features.find(
    (item) => String(item.id ?? "") === featureId,
  );
  if (!feature?.geometry) {
    setSelectedFeatureGeometry(null);
    return;
  }
  setSelectedFeatureGeometry(toRaw(feature) as FeatureGeometry);
};

const updateSourceSelection = (
  sourceId: string,
  previous: FeatureId | null,
  next: FeatureId | null,
) => {
  if (!mapInstance.value) return;
  if (previous) {
    try {
      mapInstance.value.setFeatureState(
        { source: sourceId, id: previous },
        { selected: false },
      );
    } catch (error) {
      logDebug("mapPanel:clear-state", error);
    }
  }
  if (next) {
    try {
      mapInstance.value.setFeatureState(
        { source: sourceId, id: next },
        { selected: true },
      );
    } catch (error) {
      logDebug("mapPanel:set-state", error);
    }
  }
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
  () => props.visualization,
  () => {
    applyVisualization();
  },
  { deep: true },
);

watch(
  () => props.collection,
  () => {
    syncCollection();
    if (!hasFeatures.value) {
      showVisualizationPanel.value = false;
    }
  },
);

watch(
  () => props.selectedFeatureId,
  (next, prev) => {
    if (!isMapReady.value) return;
    applyFeatureState(next ?? null);
    updateSelectedFeatureSource(next ?? null);
    if (next && next !== prev) {
      focusFeatureById(next);
    }
  },
);

watch(hasFeatures, (present) => {
  if (!present) {
    showVisualizationPanel.value = false;
  }
});
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
        <button
          type="button"
          class="map-panel__srid-pill"
          @click="toggleSridPanel"
        >
          <span>{{ sridStatusLabel }}</span>
          <span class="map-panel__srid-caret" :class="{ 'map-panel__srid-caret--open': showSridPanel }">
            <img
              class="map-panel__chevron"
              :src="chevronDownIcon"
              alt=""
              aria-hidden="true"
            />
          </span>
        </button>
        <transition name="fade">
          <div
            v-if="showSridPanel"
            class="map-panel__srid-dropdown"
          >
            <ul class="srid-dropdown__list">
              <li
                v-for="option in SRID_OPTIONS"
                :key="option.code"
              >
                <button
                  type="button"
                  class="srid-option-button"
                  :class="{ 'srid-option-button--active': props.srid === option.code }"
                  @click="handleSridChange(option.code)"
                >
                  EPSG:{{ option.code }}
                </button>
              </li>
            </ul>
            <div class="srid-panel__actions">
              <button
                type="button"
                class="srid-option-button srid-option-button--action"
                :disabled="!props.hasPrj || props.sridMode === 'file'"
                @click="handleUseFileProjection"
              >
                PRJ 원본 사용
              </button>
              <button
                v-if="props.prjText"
                type="button"
                class="srid-option-button srid-option-button--action"
                @click="showPrjText = !showPrjText"
              >
                {{ showPrjText ? "PRJ 숨기기" : "PRJ 전문 보기" }}
              </button>
            </div>
            <pre v-if="showPrjText && props.prjText" class="srid-panel__prj">{{ props.prjText }}</pre>
          </div>
        </transition>
      </div>
    </div>
    <div class="map-panel__canvas">
      <div ref="mapContainer" class="map-panel__map" />
      <div v-if="props.sridChanging" class="map-panel__overlay">
        <div class="map-panel__overlay-content">
          <span class="map-panel__spinner" aria-hidden="true"></span>
          <span>좌표계 적용 중…</span>
        </div>
      </div>
      <div v-if="!hasFeatures" class="map-panel__empty">
        <p>표시할 피처가 없습니다.</p>
      </div>
    </div>
    <div class="map-panel__viz">
      <button
        type="button"
        class="map-panel__viz-toggle"
        :class="{ 'map-panel__viz-toggle--open': showVisualizationPanel }"
        :disabled="!hasFeatures"
        @click="toggleVisualizationOptions"
      >
        <span>시각화 옵션</span>
        <span class="map-panel__srid-caret" :class="{ 'map-panel__srid-caret--open': showVisualizationPanel }">
          <img
            class="map-panel__chevron map-panel__chevron--viz"
            :src="chevronDownIcon"
            alt=""
            aria-hidden="true"
          />
        </span>
      </button>
      <transition name="slide-down">
        <div
          v-if="showVisualizationPanel"
          class="map-panel__viz-panel"
        >
          <VisualizationPanel
            embedded
            :columns="props.columns"
            :visualization="props.visualizationSettings"
            :category-legend="props.categoryLegend"
            :numeric-legend="props.numericLegend"
            :size-legend="props.sizeLegend"
            :has-points="props.hasPointGeometry"
            @update-visualization="handleVisualizationUpdate"
          />
        </div>
      </transition>
    </div>
  </section>
</template>

<style scoped>
.map-panel {
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #fff;
}

.map-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.map-panel__header h3 {
  margin: 0;
  font-size: 16px;
}

.map-panel__header small {
  color: #6b7280;
}

.map-panel__actions {
  display: flex;
  gap: 8px;
  align-items: center;
  position: relative;
}

.map-panel__srid-pill {
  border: 1px solid #d1d5db;
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 12px;
  color: #111827;
  background: #fff;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.map-panel__srid-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: #6b7280;
  transition: transform 0.2s ease, color 0.2s ease;
}

.map-panel__srid-caret--open {
  transform: rotate(180deg);
  color: #111827;
}

.map-panel__chevron {
  width: 14px;
  height: 14px;
  display: block;
}

.map-panel__chevron {
  width: 14px;
  height: 14px;
  display: block;
}

.map-panel__srid-dropdown {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  width: 180px;
  border-radius: 12px;
  border: 1px solid rgba(107, 114, 128, 0.3);
  background: #fff;
  padding: 10px;
  box-shadow: 0 12px 24px rgba(15, 23, 42, 0.12);
  z-index: 15;
}

.srid-dropdown__list {
  list-style: none;
  margin: 0 0 8px;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.srid-option-button {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 6px 10px;
  background: #fff;
  text-align: left;
  font-size: 12px;
  color: #111827;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
}

.srid-option-button--active {
  border-color: #111827;
  background: #111827;
  color: #fff;
}

.srid-option-button--action {
  justify-content: center;
  font-weight: 600;
}

.srid-panel__actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}

.srid-panel__prj {
  margin-top: 8px;
  padding: 8px;
  background: #1f2937;
  color: #f3f4f6;
  font-size: 12px;
  line-height: 1.4;
  border-radius: 8px;
  max-height: 140px;
  overflow: auto;
}

.map-panel__canvas {
  position: relative;
  border-radius: 12px;
  overflow: hidden;
  min-height: 360px;
  background: #e5e7eb;
}

.map-panel__map {
  width: 100%;
  height: 360px;
  border-radius: 12px;
}

.map-panel__overlay {
  position: absolute;
  inset: 0;
  background: rgba(255, 255, 255, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 5;
  pointer-events: none;
}

.map-panel__overlay-content {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #0f172a;
  font-family: "Pretendard SemiBold", system-ui, sans-serif;
}

.map-panel__spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #cbd5e1;
  border-top-color: #2563eb;
  border-radius: 50%;
  animation: map-panel-spin 0.9s linear infinite;
}

@keyframes map-panel-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

:deep(.map-panel__map .maplibregl-canvas-container) {
  border-radius: 12px;
  overflow: hidden;
}

.map-panel__empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.82);
  color: #6b7280;
  font-size: 14px;
  text-align: center;
  padding: 16px;
}

.map-panel__viz {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.map-panel__viz-toggle {
  width: 100%;
  border: 1px solid #d1d5db;
  border-radius: 12px;
  background: #fff;
  color: #0f172a;
  padding: 10px 14px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.2s ease, background 0.2s ease, opacity 0.2s ease;
}

.map-panel__viz-toggle:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.map-panel__viz-toggle--open {
  border-color: #0f172a;
  background: #0f172a;
  color: #f8fafc;
}

.map-panel__viz-toggle--open .map-panel__srid-caret {
  color: #fef3c7;
}

.map-panel__viz-toggle .map-panel__srid-caret {
  width: 22px;
  height: 22px;
  color: inherit;
}

.map-panel__chevron--viz {
  width: 20px;
  height: 20px;
}

.map-panel__viz-panel {
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  max-height: 420px;
  overflow: auto;
}

.slide-down-enter-active,
.slide-down-leave-active {
  transition: transform 0.25s ease, opacity 0.25s ease;
}

.slide-down-enter-from,
.slide-down-leave-to {
  transform: translateY(-6px);
  opacity: 0;
}

.map-popup {
  font-size: 12px;
  min-width: 320px;
  max-width: 440px;
  background: #fff;
  border-radius: 12px;
  box-shadow:
    0 24px 55px rgba(15, 23, 42, 0.18),
    0 8px 18px rgba(15, 23, 42, 0.16);
  border: 1px solid rgba(148, 163, 184, 0.4);
  overflow: hidden;
}

.map-popup__header {
  padding: 10px 14px;
  border-bottom: 1px solid #e2e8f0;
  background: linear-gradient(90deg, rgba(59, 130, 246, 0.15), rgba(99, 102, 241, 0.12));
}

.map-popup__header h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #0f172a;
}

.map-popup__table-wrapper {
  background: #fff;
}

.map-popup__empty {
  color: #94a3b8;
  text-align: center;
  padding: 16px;
}

.popup-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.popup-table__col--key {
  width: 40%;
}

.popup-table__col--value {
  width: 60%;
}

.popup-table tbody tr {
  border-bottom: 1px solid #e2e8f0;
}

.popup-table tbody tr:nth-child(odd) {
  background: #f8fafc;
}

.popup-table tbody tr:last-child {
  border-bottom: none;
}

.popup-row__label,
.popup-row__value {
  padding: 10px 14px;
  vertical-align: top;
}

.popup-row__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #475569;
}

.popup-row__value {
  font-size: 12px;
  color: #0f172a;
  line-height: 1.5;
  word-break: break-word;
}
</style>
