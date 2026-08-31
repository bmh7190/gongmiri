import type {
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureGeometry,
  ViewerResult,
} from "./types";

const UNIQUE_TRACK_LIMIT = 2_000;

const detectValueType = (value: unknown): ColumnStat["dataType"] => {
  if (value === null || value === undefined) return "null";
  const type = typeof value;
  if (type === "number" && Number.isFinite(value as number)) return "number";
  if (type === "number") return "other";
  if (type === "string") return "string";
  if (type === "boolean") return "boolean";
  return "other";
};

export const summarizeCollection = (
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
      const key = typeof value === "object" ? JSON.stringify(value) : String(value);
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
    for (const [name, value] of Object.entries(feature.properties ?? {})) {
      registerValue(name, value);
    }
  }

  const columns: ColumnStat[] = Array.from(aggregates.entries()).map(
    ([name, aggregate]) => {
      const filled = aggregate.filled;
      // A property omitted from a DBF row is empty just like an explicit null.
      const empty = Math.max(0, features.length - filled);
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

  const geometryTypes = Array.from(
    new Set(features.map((feature) => feature.geometry?.type ?? "NULL")),
  ).sort();

  return {
    fileName,
    featureCount: features.length,
    geometryTypes,
    columns,
  };
};
