import { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, MapLayerMouseEvent } from "maplibre-gl";
import type {
  FeatureCollectionGeometry,
  FeatureId,
  VisualizationConfig,
} from "../../domain/types";
import { extractPointCollection, CATEGORY_OTHER_COLOR } from "../../domain/visualization";
import { computeBounds } from "../../domain/feature-collection";
import { createQuickPreview } from "../../domain/quick-preview";
import {
  createTileSet,
  registerTileProtocol,
  releaseTileSet,
  TILE_LAYER_NAME,
  TILE_MAX_ZOOM,
} from "./tile-protocol";

const SOURCE_ID = "gongmiri-react-data";
const SELECTED_SOURCE_ID = "gongmiri-react-selection";
const POLYGON_FILL = "gongmiri-react-polygons";
const POLYGON_LINE = "gongmiri-react-polygon-lines";
const LINE = "gongmiri-react-lines";
const POINT = "gongmiri-react-points";
const SELECTED_POLYGON = "gongmiri-react-selected-polygons";
const SELECTED_LINE = "gongmiri-react-selected-lines";
const SELECTED_POINT = "gongmiri-react-selected-points";
const CLUSTER_SOURCE = "gongmiri-react-clusters";
const CLUSTER_CIRCLES = "gongmiri-react-cluster-circles";
const CLUSTER_LABELS = "gongmiri-react-cluster-labels";
const CLUSTER_POINTS = "gongmiri-react-cluster-points";
const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json";

const EMPTY: FeatureCollectionGeometry = {
  type: "FeatureCollection",
  features: [],
};

type UseMapLibreOptions = {
  collection: FeatureCollectionGeometry | null;
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
  popupTitle: string;
  visualization: VisualizationConfig;
};

const buildColor = (
  visualization: VisualizationConfig,
  fallback: string,
): maplibregl.ExpressionSpecification | string => {
  if (
    visualization.colorMode === "category" &&
    visualization.categoryField &&
    visualization.categoryStops.length
  ) {
    const regular = visualization.categoryStops.filter((stop) => !stop.isOther);
    const other = visualization.categoryStops.find((stop) => stop.isOther)?.color
      ?? CATEGORY_OTHER_COLOR;
    return [
      "match",
      ["to-string", ["coalesce", ["get", visualization.categoryField], ""]],
      ...regular.flatMap((stop) => [stop.value, stop.color]),
      other,
    ] as maplibregl.ExpressionSpecification;
  }
  if (
    visualization.colorMode === "continuous" &&
    visualization.numericField &&
    visualization.numericStops.length > 1 &&
    visualization.numericDomain
  ) {
    return [
      "interpolate",
      ["linear"],
      ["coalesce", ["to-number", ["get", visualization.numericField]], visualization.numericDomain[0]],
      ...visualization.numericStops.flatMap((stop) => [stop.value, stop.color]),
    ] as maplibregl.ExpressionSpecification;
  }
  return fallback;
};

const createPopupContent = (
  title: string,
  properties: Record<string, unknown>,
) => {
  const root = document.createElement("div");
  root.className = "react-map-popup";
  const heading = document.createElement("strong");
  heading.textContent = title;
  root.append(heading);
  const list = document.createElement("dl");
  for (const [name, value] of Object.entries(properties)) {
    if (value === null || value === undefined || name === "id") continue;
    const term = document.createElement("dt");
    term.textContent = name;
    const description = document.createElement("dd");
    description.textContent = String(value);
    description.title = String(value);
    list.append(term, description);
  }
  root.append(list);
  return root;
};

const addDataLayers = (map: maplibregl.Map) => {
  const geometryFilter = (type: "Polygon" | "LineString" | "Point") =>
    ["==", ["geometry-type"], type] as maplibregl.FilterSpecification;

  map.addLayer({
    id: POLYGON_FILL,
    type: "fill",
    source: SOURCE_ID,
    "source-layer": TILE_LAYER_NAME,
    filter: geometryFilter("Polygon"),
    paint: { "fill-color": "#38bdf8", "fill-opacity": 0.28 },
  });
  map.addLayer({
    id: POLYGON_LINE,
    type: "line",
    source: SOURCE_ID,
    "source-layer": TILE_LAYER_NAME,
    filter: geometryFilter("Polygon"),
    paint: { "line-color": "#0369a1", "line-width": 1.25 },
  });
  map.addLayer({
    id: LINE,
    type: "line",
    source: SOURCE_ID,
    "source-layer": TILE_LAYER_NAME,
    filter: geometryFilter("LineString"),
    paint: { "line-color": "#f97316", "line-width": 1.5 },
  });
  map.addLayer({
    id: POINT,
    type: "circle",
    source: SOURCE_ID,
    "source-layer": TILE_LAYER_NAME,
    filter: geometryFilter("Point"),
    paint: {
      "circle-color": "#16a34a",
      "circle-radius": 4,
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: CLUSTER_CIRCLES,
    type: "circle",
    source: CLUSTER_SOURCE,
    filter: ["has", "point_count"],
    layout: { visibility: "none" },
    paint: {
      "circle-color": ["step", ["get", "point_count"], "#60a5fa", 50, "#2563eb", 200, "#1d4ed8"],
      "circle-radius": ["step", ["get", "point_count"], 16, 50, 22, 200, 28],
      "circle-stroke-color": "#1e3a8a",
      "circle-stroke-width": 1,
    },
  });
  map.addLayer({
    id: CLUSTER_LABELS,
    type: "symbol",
    source: CLUSTER_SOURCE,
    filter: ["has", "point_count"],
    layout: {
      visibility: "none",
      "text-field": ["get", "point_count_abbreviated"],
      "text-size": 12,
    },
    paint: { "text-color": "#fff" },
  });
  map.addLayer({
    id: CLUSTER_POINTS,
    type: "circle",
    source: CLUSTER_SOURCE,
    filter: ["!", ["has", "point_count"]],
    layout: { visibility: "none" },
    paint: {
      "circle-color": "#16a34a",
      "circle-radius": 4,
      "circle-stroke-color": "#f8fafc",
      "circle-stroke-width": 1,
    },
  });

  map.addLayer({
    id: SELECTED_POLYGON,
    type: "fill",
    source: SELECTED_SOURCE_ID,
    filter: geometryFilter("Polygon"),
    paint: { "fill-color": "#db2777", "fill-opacity": 0.4 },
  });
  map.addLayer({
    id: SELECTED_LINE,
    type: "line",
    source: SELECTED_SOURCE_ID,
    filter: geometryFilter("LineString"),
    paint: { "line-color": "#be185d", "line-width": 3 },
  });
  map.addLayer({
    id: SELECTED_POINT,
    type: "circle",
    source: SELECTED_SOURCE_ID,
    filter: geometryFilter("Point"),
    paint: {
      "circle-color": "#db2777",
      "circle-radius": 7,
      "circle-stroke-color": "#831843",
      "circle-stroke-width": 2,
    },
  });
};

export const useMapLibre = ({
  collection,
  selectedId,
  onSelect,
  popupTitle,
  visualization,
}: UseMapLibreOptions) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const tileKeyRef = useRef<string | null>(null);
  const onSelectRef = useRef(onSelect);
  const popupTitleRef = useRef(popupTitle);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const lastSelectedRef = useRef(selectedId);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    onSelectRef.current = onSelect;
    popupTitleRef.current = popupTitle;
  }, [onSelect, popupTitle]);

  useEffect(() => {
    if (!containerRef.current) return;
    registerTileProtocol();
    const initialTiles = createTileSet(EMPTY);
    tileKeyRef.current = initialTiles.key;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      center: [127.0276, 37.4979],
      zoom: 5,
      attributionControl: false,
    });
    mapRef.current = map;
    let styleLoaded = false;
    const styleTimeout = window.setTimeout(() => {
      if (!styleLoaded) setError("Basemap style loading timed out.");
    }, 12_000);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), "top-right");
    map.addControl(new maplibregl.AttributionControl({ compact: true }));

    map.on("error", (event) => {
      if (!styleLoaded && event.error) setError(event.error.message);
    });
    map.on("load", () => {
      styleLoaded = true;
      window.clearTimeout(styleTimeout);
      setError("");
      map.addSource(SOURCE_ID, {
        type: "vector",
        tiles: [initialTiles.url],
        minzoom: 0,
        maxzoom: TILE_MAX_ZOOM,
        promoteId: "id",
      });
      map.addSource(SELECTED_SOURCE_ID, { type: "geojson", data: EMPTY });
      map.addSource(CLUSTER_SOURCE, {
        type: "geojson",
        data: EMPTY,
        cluster: true,
        clusterMaxZoom: 11,
        clusterRadius: 50,
      });
      addDataLayers(map);

      const click = (event: MapLayerMouseEvent) => {
        const feature = event.features?.[0];
        const id = feature?.id;
        if (id !== undefined && id !== null) onSelectRef.current(String(id));
        if (feature) {
          popupRef.current?.remove();
          popupRef.current = new maplibregl.Popup({
            closeButton: true,
            closeOnMove: false,
            maxWidth: "340px",
          })
            .setLngLat(event.lngLat)
            .setDOMContent(
              createPopupContent(
                popupTitleRef.current,
                feature.properties ?? {},
              ),
            )
            .addTo(map);
        }
      };
      for (const layer of [POLYGON_FILL, LINE, POINT, CLUSTER_POINTS]) {
        map.on("click", layer, click);
        map.on("mouseenter", layer, () => { map.getCanvas().style.cursor = "pointer"; });
        map.on("mouseleave", layer, () => { map.getCanvas().style.cursor = ""; });
      }
      map.on("click", CLUSTER_CIRCLES, async (event) => {
        const clusterId = event.features?.[0]?.properties?.cluster_id;
        if (typeof clusterId !== "number") return;
        const source = map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined;
        if (!source) return;
        const zoom = await source.getClusterExpansionZoom(clusterId);
        map.easeTo({ center: event.lngLat, zoom, duration: 450 });
      });
      setReady(true);
    });

    return () => {
      window.clearTimeout(styleTimeout);
      popupRef.current?.remove();
      popupRef.current = null;
      map.remove();
      releaseTileSet(tileKeyRef.current);
      mapRef.current = null;
      tileKeyRef.current = null;
      setReady(false);
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !collection) return;
    const source = map.getSource(SOURCE_ID) as
      | (maplibregl.VectorTileSource & { setTiles?: (tiles: string[]) => void })
      | undefined;
    const nextTiles = createTileSet(collection);
    source?.setTiles?.([nextTiles.url]);
    releaseTileSet(tileKeyRef.current);
    tileKeyRef.current = nextTiles.key;
    const clusterSource = map.getSource(CLUSTER_SOURCE) as GeoJSONSource | undefined;
    const clusterCollection =
      collection.features.length > 25_000
        ? createQuickPreview(collection, 25_000)
        : collection;
    clusterSource?.setData(extractPointCollection(clusterCollection));

    const bounds = computeBounds(collection);
    if (bounds) {
      map.fitBounds(bounds, { padding: 44, maxZoom: 14, duration: 650 });
    }
  }, [collection, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const color = buildColor(visualization, "#16a34a");
    const polygonColor = buildColor(visualization, "#38bdf8");
    const lineColor = buildColor(visualization, "#f97316");
    map.setPaintProperty(POINT, "circle-color", color);
    map.setPaintProperty(CLUSTER_POINTS, "circle-color", color);
    map.setPaintProperty(POLYGON_FILL, "fill-color", polygonColor);
    map.setPaintProperty(LINE, "line-color", lineColor);

    const sizeStops = visualization.pointSizeStops;
    const radius =
      visualization.pointSizeField && sizeStops && sizeStops.length >= 2
        ? [
            "interpolate",
            ["linear"],
            ["coalesce", ["to-number", ["get", visualization.pointSizeField]], sizeStops[0]!.value],
            ...sizeStops.flatMap((stop) => [stop.value, stop.radius]),
          ] as maplibregl.ExpressionSpecification
        : 4;
    map.setPaintProperty(POINT, "circle-radius", radius);
    map.setPaintProperty(CLUSTER_POINTS, "circle-radius", radius);

    const clusterVisibility = visualization.cluster ? "visible" : "none";
    const pointVisibility = visualization.cluster ? "none" : "visible";
    map.setLayoutProperty(POINT, "visibility", pointVisibility);
    map.setLayoutProperty(CLUSTER_CIRCLES, "visibility", clusterVisibility);
    map.setLayoutProperty(CLUSTER_LABELS, "visibility", clusterVisibility);
    map.setLayoutProperty(CLUSTER_POINTS, "visibility", clusterVisibility);
  }, [ready, visualization]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource(SELECTED_SOURCE_ID) as GeoJSONSource | undefined;
    const feature = collection?.features.find(
      (candidate) => String(candidate.id ?? "") === selectedId,
    );
    source?.setData(
      feature
        ? { type: "FeatureCollection", features: [feature] }
        : EMPTY,
    );
    const selectionChanged = lastSelectedRef.current !== selectedId;
    lastSelectedRef.current = selectedId;
    if (selectionChanged && feature) {
      const bounds = computeBounds({
        type: "FeatureCollection",
        features: [feature],
      });
      if (bounds) {
        const [[minX, minY], [maxX, maxY]] = bounds;
        if (minX === maxX && minY === maxY) {
          map.easeTo({
            center: [minX, minY],
            zoom: Math.max(map.getZoom(), 10),
            duration: 450,
          });
        } else {
          map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 450 });
        }
      }
    }
  }, [collection, ready, selectedId]);

  return { containerRef, ready, error };
};
