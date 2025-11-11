/// <reference lib="webworker" />

import { iter } from "but-unzip";
import { parseDbf, parseShp, combine } from "shpjs";
import type { FeatureCollection } from "geojson";
import type {
  EncodingOption,
  FeatureCollectionGeometry,
  SridCode,
} from "../types";
import { SRID_OPTIONS } from "../utils/srid";

type ParseRequest = {
  id: number;
  buffer: ArrayBuffer;
  encoding: EncodingOption;
  srid: SridCode | null;
};

type ParseSuccess = {
  id: number;
  status: "success";
  collection: FeatureCollection;
};

type ParseError = {
  id: number;
  status: "error";
  message: string;
};

type LayerEntry = {
  shp?: ArrayBuffer;
  dbf?: ArrayBuffer;
  prj?: string;
  cpg?: string;
  fileName: string;
};

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

const cloneBuffer = (bytes: Uint8Array): ArrayBuffer =>
  bytes.slice().buffer;

const sridToProj4 = (srid: SridCode | null): string | undefined => {
  if (!srid) return undefined;
  const option = SRID_OPTIONS.find((item) => item.code === srid);
  return option?.proj4;
};

const normalizeCollection = (
  result: FeatureCollection | FeatureCollection[],
): FeatureCollection => {
  if (Array.isArray(result)) {
    return result[0] as FeatureCollection;
  }
  return result;
};

self.addEventListener("message", async (event: MessageEvent<ParseRequest>) => {
  const { id, buffer, encoding, srid } = event.data;
  try {
    const result = await parseArchive(buffer, encoding, srid);
    const collection = normalizeCollection(result);
    const response: ParseSuccess = {
      id,
      status: "success",
      collection,
    };
    postMessage(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "파싱 중 알 수 없는 오류가 발생했습니다.";
    const response: ParseError = { id, status: "error", message };
    postMessage(response);
  }
});

const parseArchive = async (
  buffer: ArrayBuffer,
  encoding: EncodingOption,
  srid: SridCode | null,
): Promise<FeatureCollection | FeatureCollection[]> => {
  const entries = await collectEntries(buffer);
  const layers = Object.values(entries).filter((layer) => layer.shp);
  if (!layers.length) {
    throw new Error("SHP 레이어를 찾지 못했습니다.");
  }

  const projOverride = sridToProj4(srid);

  const collections: FeatureCollection[] = [];
  for (const layer of layers) {
    const prjText = projOverride ?? layer.prj;
    const encodingLabel = layer.cpg?.trim() || mapEncoding(encoding);
    const shpBuffer = layer.shp;
    if (!shpBuffer) continue;
    const geometries = parseShp(shpBuffer, prjText);
    let properties;
    if (layer.dbf) {
      const cpgBuffer = layer.cpg
        ? textEncoder.encode(layer.cpg)
        : textEncoder.encode(encodingLabel);
      properties = parseDbf(layer.dbf, cpgBuffer);
    }
    const collection = combine([geometries, properties ?? []]) as FeatureCollectionGeometry;
    (collection as FeatureCollectionGeometry & { fileName?: string }).fileName = layer.fileName;
    collections.push(collection);
  }

  return collections.length === 1 ? collections[0]! : collections;
};

const collectEntries = async (buffer: ArrayBuffer): Promise<Record<string, LayerEntry>> => {
  const files: Record<string, LayerEntry> = {};

  for (const entry of iter(new Uint8Array(buffer))) {
    const normalized = entry.filename.replace(/\\/g, "/");
    const name = normalized.split("/").pop();
    if (!name) continue;
    const match = name.match(/^(.+)\.(shp|dbf|shx|prj|cpg)$/i);
    if (!match) continue;
    const baseName = match[1]!;
    const extension = match[2]!.toLowerCase();
    const layer =
      files[baseName] ??
      (files[baseName] = {
        fileName: baseName,
      });

    const data = entry.read();
    const bytes = data instanceof Promise ? await data : data;
    switch (extension) {
      case "shp":
        layer.shp = cloneBuffer(bytes);
        break;
      case "dbf":
        layer.dbf = cloneBuffer(bytes);
        break;
      case "prj":
        layer.prj = textDecoder.decode(bytes).trim();
        break;
      case "cpg":
        layer.cpg = textDecoder.decode(bytes).trim();
        break;
      default:
        break;
    }
  }

  return files;
};

const mapEncoding = (encoding: EncodingOption): string => {
  switch (encoding) {
    case "cp949":
      return "cp949";
    default:
      return "utf-8";
  }
};
