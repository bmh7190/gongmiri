import type { FeatureCollectionGeometry } from "./types";

export type ExportFormat = "geojson" | "csv";

export type ExportRequest = {
  id: number;
  collection: FeatureCollectionGeometry;
  fields: string[];
  targetProjection: string | null;
  format: ExportFormat;
};

export type ExportSuccess = {
  id: number;
  status: "success";
  buffer: ArrayBuffer;
};

export type ExportFailure = {
  id: number;
  status: "error";
};

export type ExportWorkerMessage = ExportSuccess | ExportFailure;
