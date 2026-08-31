import type { FeatureCollectionGeometry, FeatureId } from "./types";
import proj4 from "proj4";
import type { Geometry, Position } from "geojson";

const WGS84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";

export const selectExportCollection = (
  collection: FeatureCollectionGeometry,
  ids: Iterable<FeatureId> | null,
): FeatureCollectionGeometry => {
  if (ids === null) return collection;
  const selected = new Set(ids);
  return {
    type: "FeatureCollection",
    features: collection.features.filter((feature) =>
      selected.has(String(feature.id)),
    ),
  };
};

const transformPosition = (position: Position, targetProjection: string): Position => {
  const [x, y, ...rest] = position;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [...position];
  const [nextX, nextY] = proj4(WGS84, targetProjection, [x!, y!]);
  return [nextX, nextY, ...rest];
};

const transformGeometry = (geometry: Geometry, targetProjection: string): Geometry => {
  switch (geometry.type) {
    case "Point":
      return { ...geometry, coordinates: transformPosition(geometry.coordinates, targetProjection) };
    case "MultiPoint":
    case "LineString":
      return { ...geometry, coordinates: geometry.coordinates.map((position) => transformPosition(position, targetProjection)) };
    case "MultiLineString":
    case "Polygon":
      return { ...geometry, coordinates: geometry.coordinates.map((ring) => ring.map((position) => transformPosition(position, targetProjection))) };
    case "MultiPolygon":
      return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map((position) => transformPosition(position, targetProjection)))) };
    case "GeometryCollection":
      return { ...geometry, geometries: geometry.geometries.map((child) => transformGeometry(child, targetProjection)) };
  }
};

export const prepareExportCollection = (
  collection: FeatureCollectionGeometry,
  fields: string[],
  targetProjection: string | null,
): FeatureCollectionGeometry => {
  const included = new Set(fields);
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature) => ({
      ...feature,
      geometry: targetProjection
        ? transformGeometry(feature.geometry, targetProjection)
        : structuredClone(feature.geometry),
      properties: Object.fromEntries(
        Object.entries(feature.properties ?? {}).filter(([name]) => included.has(name)),
      ),
    })),
  };
};

const csvValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

const escapeCsv = (value: unknown): string => {
  const text = csvValue(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const createCsv = (collection: FeatureCollectionGeometry): string => {
  const columns = Array.from(new Set(
    collection.features.flatMap((feature) =>
      Object.keys(feature.properties ?? {}),
    ),
  ));
  const header = ["feature_id", ...columns].map(escapeCsv).join(",");
  const rows = collection.features.map((feature) => [
    escapeCsv(feature.id ?? ""),
    ...columns.map((column) => escapeCsv(feature.properties?.[column])),
  ].join(","));
  return `\uFEFF${[header, ...rows].join("\r\n")}`;
};

export const createGeoJson = (
  collection: FeatureCollectionGeometry,
): string => JSON.stringify(collection, null, 2);
