import type { Geometry, Position } from "geojson";
import type {
  FeatureCollectionGeometry,
  FeatureGeometry,
} from "./types";

export const QUICK_PREVIEW_LIMIT = 25_000;

const roundPosition = (position: Position): Position =>
  position.map((value) =>
    typeof value === "number" ? Number(value.toFixed(5)) : value,
  );

const roundGeometry = (geometry: Geometry): Geometry => {
  switch (geometry.type) {
    case "Point":
      return { ...geometry, coordinates: roundPosition(geometry.coordinates) };
    case "MultiPoint":
    case "LineString":
      return { ...geometry, coordinates: geometry.coordinates.map(roundPosition) };
    case "MultiLineString":
    case "Polygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((ring) => ring.map(roundPosition)),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: geometry.coordinates.map((polygon) =>
          polygon.map((ring) => ring.map(roundPosition)),
        ),
      };
    case "GeometryCollection":
      return {
        ...geometry,
        geometries: geometry.geometries.map(roundGeometry),
      };
  }
};

const cloneFeature = (feature: FeatureGeometry): FeatureGeometry => ({
  type: "Feature",
  id: feature.id,
  properties: { ...(feature.properties ?? {}) },
  geometry: roundGeometry(feature.geometry),
});

export const createQuickPreview = (
  collection: FeatureCollectionGeometry,
  target = QUICK_PREVIEW_LIMIT,
): FeatureCollectionGeometry => {
  const features = collection.features ?? [];
  if (features.length <= target) {
    return { type: "FeatureCollection", features: features.map(cloneFeature) };
  }
  const sampled: FeatureGeometry[] = [];
  const stride = features.length / target;
  for (let sampleIndex = 0; sampleIndex < target; sampleIndex += 1) {
    const feature = features[Math.floor(sampleIndex * stride)];
    if (feature) sampled.push(cloneFeature(feature));
  }
  return { type: "FeatureCollection", features: sampled };
};
