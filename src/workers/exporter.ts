/// <reference lib="webworker" />

import { createCsv, createGeoJson, prepareExportCollection } from "../domain/export-data";
import type {
  ExportFailure,
  ExportRequest,
  ExportSuccess,
} from "../domain/export-protocol";

const encoder = new TextEncoder();

self.addEventListener("message", (event: MessageEvent<ExportRequest>) => {
  const { id, collection, fields, targetProjection, format } = event.data;
  try {
    const prepared = prepareExportCollection(collection, fields, targetProjection);
    const content = format === "geojson" ? createGeoJson(prepared) : createCsv(prepared);
    const buffer = encoder.encode(content).buffer;
    const response: ExportSuccess = { id, status: "success", buffer };
    postMessage(response, { transfer: [buffer] });
  } catch {
    const response: ExportFailure = { id, status: "error" };
    postMessage(response);
  }
});
