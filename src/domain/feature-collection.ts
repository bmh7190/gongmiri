import type { Geometry, Position } from "geojson";
import type {
  FeatureCollectionGeometry,
  FeatureId,
} from "./types";

export const ensureFeatureIds = (collection: FeatureCollectionGeometry) => {
  for (const [index, feature] of (collection.features ?? []).entries()) {
    const candidate =
      feature.id ??
      feature.properties?.OBJECTID ??
      feature.properties?.id ??
      feature.properties?.ID ??
      `feature-${index}`;
    const id: FeatureId = String(candidate);
    feature.id = id;
    feature.properties = { ...(feature.properties ?? {}), id };
  }
  return collection;
};

const visitGeometry = (
  geometry: Geometry,
  visit: (position: Position) => void,
) => {
  switch (geometry.type) {
    case "Point":
      visit(geometry.coordinates);
      break;
    case "MultiPoint":
    case "LineString":
      geometry.coordinates.forEach(visit);
      break;
    case "MultiLineString":
    case "Polygon":
      geometry.coordinates.forEach((ring) => ring.forEach(visit));
      break;
    case "MultiPolygon":
      geometry.coordinates.forEach((polygon) =>
        polygon.forEach((ring) => ring.forEach(visit)),
      );
      break;
    case "GeometryCollection":
      geometry.geometries.forEach((child) => visitGeometry(child, visit));
      break;
  }
};

export const computeBounds = (
  collection: FeatureCollectionGeometry,
): [[number, number], [number, number]] | null => {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of collection.features ?? []) {
    if (!feature.geometry) continue;
    visitGeometry(feature.geometry, (position) => {
      const [x, y] = position;
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x!);
      minY = Math.min(minY, y!);
      maxX = Math.max(maxX, x!);
      maxY = Math.max(maxY, y!);
    });
  }

  return Number.isFinite(minX)
    ? [[minX, minY], [maxX, maxY]]
    : null;
};
