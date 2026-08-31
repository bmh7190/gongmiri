import { ensureFeatureIds } from "./feature-collection";
import { createQuickPreview } from "./quick-preview";
import { summarizeCollection } from "./summarize-collection";
import type {
  FeatureCollectionGeometry,
  ParseMode,
  ParsedDataset,
} from "./types";

export const AUTO_QUICK_THRESHOLDS = {
  fileBytes: 100 * 1024 * 1024,
  features: 100_000,
  coordinates: 500_000,
} as const;

type DatasetScale = {
  fileBytes: number;
  features: number;
  coordinates: number;
};

export const shouldUseQuickMode = (scale: DatasetScale): boolean =>
  scale.fileBytes >= AUTO_QUICK_THRESHOLDS.fileBytes
  || scale.features >= AUTO_QUICK_THRESHOLDS.features
  || scale.coordinates >= AUTO_QUICK_THRESHOLDS.coordinates;

type PrepareDatasetOptions = {
  fileBytes?: number;
  allowAutoQuick?: boolean;
  totalFeatures?: number;
  coordinateCount?: number;
  preSampled?: boolean;
  effectiveMode?: ParseMode;
};

const countNestedCoordinates = (coordinates: unknown): number => {
  if (!Array.isArray(coordinates)) return 0;
  if (
    coordinates.length >= 2
    && typeof coordinates[0] === "number"
    && typeof coordinates[1] === "number"
  ) {
    return 1;
  }
  return coordinates.reduce<number>(
    (total, child) => total + countNestedCoordinates(child),
    0,
  );
};

export const countCollectionCoordinates = (
  collection: FeatureCollectionGeometry,
): number => collection.features.reduce((total, feature) => {
  const geometry = feature.geometry;
  if (!geometry) return total;
  if (geometry.type === "GeometryCollection") {
    return total + geometry.geometries.reduce(
      (geometryTotal, child) => geometryTotal
        + (child.type === "GeometryCollection"
          ? countCollectionCoordinates({
              type: "FeatureCollection",
              features: [{ type: "Feature", geometry: child, properties: {} }],
            })
          : countNestedCoordinates(child.coordinates)),
      0,
    );
  }
  return total + countNestedCoordinates(geometry.coordinates);
}, 0);

export const prepareParsedDataset = (
  collection: FeatureCollectionGeometry,
  fileName: string,
  requestedMode: ParseMode,
  options: PrepareDatasetOptions = {},
): ParsedDataset => {
  const normalized = ensureFeatureIds(collection);
  const totalFeatures = options.totalFeatures ?? normalized.features.length;
  const coordinateCount = options.coordinateCount ?? countCollectionCoordinates(normalized);
  const autoQuick = Boolean(options.allowAutoQuick) && shouldUseQuickMode({
    fileBytes: options.fileBytes ?? 0,
    features: totalFeatures,
    coordinates: coordinateCount,
  });
  const mode: ParseMode = options.effectiveMode
    ?? (requestedMode === "quick" || autoQuick ? "quick" : "full");
  const displayed = mode === "quick" && !options.preSampled
    ? createQuickPreview(normalized)
    : normalized;
  return {
    collection: displayed,
    result: summarizeCollection(displayed, fileName),
    totalFeatures,
    displayedFeatures: displayed.features.length,
    coordinateCount,
    mode,
  };
};
