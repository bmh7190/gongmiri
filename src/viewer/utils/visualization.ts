import type {
  CategoryStop,
  FeatureCollectionGeometry,
  FeatureGeometry,
  SizeStop,
  VisualizationNumericScale,
} from "../types";

export const CATEGORY_PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f97316",
  "#a855f7",
  "#dc2626",
  "#0f766e",
  "#4f46e5",
  "#d97706",
  "#059669",
  "#ea580c",
  "#7c3aed",
  "#db2777",
];

export const CATEGORY_OTHER_COLOR = "#94a3b8";

export const CONTINUOUS_PALETTE = [
  "#eff6ff",
  "#bfdbfe",
  "#60a5fa",
  "#2563eb",
  "#1d4ed8",
];

export const DEFAULT_POINT_SIZE_RANGE: [number, number] = [4, 18];

type NumericStopsResult = {
  stops: { value: number; color: string }[];
  domain: [number, number] | null;
};

type PointCollection = FeatureCollectionGeometry;

export const buildCategoryStops = (
  collection: FeatureCollectionGeometry,
  field: string,
  limit = CATEGORY_PALETTE.length,
): CategoryStop[] => {
  const counts = new Map<string, number>();
  let total = 0;

  for (const feature of collection.features ?? []) {
    const value = feature.properties?.[field];
    if (value === null || value === undefined) continue;
    const key = String(value).trim();
    if (!key) continue;
    total += 1;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  if (!total || !counts.size) return [];

  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  const picks = sorted.slice(0, limit);
  const stops: CategoryStop[] = picks.map(([value, count], index) => ({
    value,
    count,
    ratio: count / total,
    color:
      CATEGORY_PALETTE[index % CATEGORY_PALETTE.length] ?? CATEGORY_PALETTE[0]!,
  }));

  const used = stops.reduce((acc, stop) => acc + stop.count, 0);
  if (used < total) {
    stops.push({
      value: "기타",
      count: total - used,
      ratio: (total - used) / total,
      color: CATEGORY_OTHER_COLOR,
      isOther: true,
    });
  }

  return stops;
};

export const buildNumericStops = (
  collection: FeatureCollectionGeometry,
  field: string,
  scale: VisualizationNumericScale,
  palette = CONTINUOUS_PALETTE,
): NumericStopsResult => {
  const values = collectNumericValues(collection, field);
  if (!values.length) return { stops: [], domain: null };
  if (values.length === 1) {
    return { stops: [{ value: values[0]!, color: palette[palette.length - 1]! }], domain: [values[0]!, values[0]!] };
  }
  const domain: [number, number] = [values[0]!, values[values.length - 1]!];
  const stops =
    scale === "equal"
      ? buildEqualStops(domain, palette)
      : buildQuantileStops(values, palette);
  return { stops, domain };
};

export const buildPointSizeStops = (
  collection: FeatureCollectionGeometry,
  field: string,
  range: [number, number],
): SizeStop[] | null => {
  const values = collectNumericValues(collection, field);
  if (!values.length) return null;
  const domain: [number, number] = [values[0]!, values[values.length - 1]!];
  if (domain[0] === domain[1]) return null;
  return [
    { value: domain[0], radius: range[0] },
    { value: domain[1], radius: range[1] },
  ];
};

export const normalizeSizeRange = (range: [number, number]): [number, number] => {
  const min = clamp(range[0], 2, 40);
  const max = clamp(range[1], 2, 60);
  if (min >= max) {
    return [min, min + 2];
  }
  return [min, max];
};

export const extractPointCollection = (
  collection: FeatureCollectionGeometry,
): PointCollection => {
  const points: FeatureGeometry[] = [];
  for (const feature of collection.features ?? []) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    if (geometry.type === "Point") {
      points.push(feature);
      continue;
    }
    if (geometry.type === "MultiPoint") {
      const coords = geometry.coordinates ?? [];
      coords.forEach((coordinate) => {
        points.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: coordinate,
          },
          properties: feature.properties ?? {},
          id: feature.id ?? undefined,
        });
      });
    }
  }
  return {
    type: "FeatureCollection",
    features: points,
  };
};

const collectNumericValues = (
  collection: FeatureCollectionGeometry,
  field: string,
): number[] => {
  const values: number[] = [];
  for (const feature of collection.features ?? []) {
    const value = feature.properties?.[field];
    if (value === null || value === undefined) continue;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) continue;
    values.push(numeric);
  }
  values.sort((a, b) => a - b);
  return values;
};

const buildEqualStops = (
  domain: [number, number],
  palette: string[],
): { value: number; color: string }[] => {
  const [min, max] = domain;
  if (min === max) {
    return [{ value: min, color: palette[palette.length - 1]! }];
  }
  const steps = palette.length - 1 || 1;
  const interval = (max - min) / steps;
  return palette.map((color, index) => ({
    color,
    value: min + interval * index,
  }));
};

const buildQuantileStops = (
  values: number[],
  palette: string[],
): { value: number; color: string }[] => {
  if (values.length === 0) return [];
  if (values.length === 1) {
    return [{ value: values[0]!, color: palette[palette.length - 1]! }];
  }
  const divisor = palette.length - 1 || 1;
  return palette.map((color, index) => ({
    color,
    value: quantile(values, index / divisor),
  }));
};

const quantile = (values: number[], percentile: number): number => {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0]!;
  const clamped = clamp(percentile, 0, 1);
  const position = (values.length - 1) * clamped;
  const base = Math.floor(position);
  const rest = position - base;
  const lower = values[base]!;
  const upper = values[Math.min(base + 1, values.length - 1)]!;
  return lower + (upper - lower) * rest;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(Math.max(value, min), max);
