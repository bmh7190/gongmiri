/// <reference lib="webworker" />

import { iter } from "but-unzip";
import { parseDbf, parseShp, combine } from "shpjs";
import proj4 from "proj4";
import type { FeatureCollection, Geometry, Position } from "geojson";
import type {
  EncodingOption,
  FeatureCollectionGeometry,
  SridCode,
} from "../types";
import { SRID_OPTIONS } from "../utils/srid";
import { logDebug, logWarn } from "../utils/logger";

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

type ParseProgressMessage = {
  id: number;
  status: "progress";
  label: string;
  percent: number;
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
const WGS84 = proj4.WGS84;

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
  logDebug("[worker] parse request", {
    id,
    encoding,
    srid,
    bufferBytes: buffer.byteLength,
  });
  const reportProgress = (label: string, percent: number) => {
    const response: ParseProgressMessage = {
      id,
      status: "progress",
      label,
      percent: clampPercent(percent),
    };
    postMessage(response);
  };
  try {
    reportProgress("ZIP 해제 중", 5);
    const result = await parseArchive(buffer, encoding, srid, reportProgress);
    const collection = normalizeCollection(result);
    logDebug("[worker] parse success", {
      id,
      featureCount: collection.features?.length ?? 0,
      geometrySample: collection.features?.[0]?.geometry?.type ?? "n/a",
    });
    const response: ParseSuccess = {
      id,
      status: "success",
      collection,
    };
    postMessage(response);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "파싱 중 알 수 없는 오류가 발생했습니다.";
    logWarn("[worker] parse failure", { id, message });
    const response: ParseError = { id, status: "error", message };
    postMessage(response);
  }
});

const parseArchive = async (
  buffer: ArrayBuffer,
  encoding: EncodingOption,
  srid: SridCode | null,
  reportProgress: (label: string, percent: number) => void = () => {},
): Promise<FeatureCollection | FeatureCollection[]> => {
  const entries = await collectEntries(buffer);
  reportProgress("레이어 구성 중", 12);
  const layers = Object.values(entries).filter((layer) => layer.shp);
  if (!layers.length) {
    throw new Error("SHP 레이어를 찾지 못했습니다.");
  }

  const projOverride = sridToProj4(srid);
  const transformer = createTransformer(srid);
  logDebug("[worker] layer summary", {
    layerCount: layers.length,
    override: Boolean(projOverride),
    srid,
  });

  const collections: FeatureCollection[] = [];
  const progressBase = 20;
  const progressSpan = 65;
  const perLayer = layers.length ? progressSpan / layers.length : progressSpan;
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]!;
    reportProgress(
      `레이어 ${index + 1}/${layers.length} 파싱 중`,
      progressBase + perLayer * index,
    );
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
    if (transformer) {
      reprojectCollection(collection, transformer);
    }
    logDebug("[worker] layer parsed", {
      name: layer.fileName,
      features: collection.features?.length ?? 0,
      geometry: collection.features?.[0]?.geometry?.type ?? "n/a",
      usedOverride: Boolean(projOverride),
      hasPrj: Boolean(layer.prj),
    });
    collections.push(collection);
    reportProgress(
      `레이어 ${index + 1}/${layers.length} 완료`,
      progressBase + perLayer * (index + 1),
    );
  }

  reportProgress("GeoJSON 정리 중", 90);
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

  logDebug("[worker] collected entries", {
    layerNames: Object.keys(files),
  });
  return files;
};

const mapEncoding = (encoding: EncodingOption): string => {
  switch (encoding) {
    case "euc-kr":
      return "euc-kr";
    case "cp949":
      return "cp949";
    default:
      return "utf-8";
  }
};

const clampPercent = (value: number): number =>
  Math.min(99, Math.max(1, Math.round(value)));

type TransformFn = (position: Position) => Position;

const createTransformer = (srid: SridCode | null): TransformFn | null => {
  const definition = sridToProj4(srid);
  if (!definition) return null;
  const converter = proj4(definition, WGS84);
  return (position: Position): Position => {
    const lon = position[0] ?? 0;
    const lat = position[1] ?? 0;
    const [x, y] = converter.forward([lon, lat]);
    const hasZ = position.length > 2 && typeof position[2] === "number";
    if (hasZ) {
      const z = (position as [number, number, number])[2];
      return [x, y, z];
    }
    return [x, y];
  };
};

const reprojectCollection = (
  collection: FeatureCollectionGeometry,
  transform: TransformFn,
) => {
  for (const feature of collection.features ?? []) {
    if (!feature.geometry) continue;
    feature.geometry = reprojectGeometry(feature.geometry, transform);
  }
};

const reprojectGeometry = (
  geometry: Geometry,
  transform: TransformFn,
): Geometry => {
  switch (geometry.type) {
    case "Point":
      return {
        ...geometry,
        coordinates: transform(geometry.coordinates as Position),
      };
    case "MultiPoint":
    case "LineString":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[]).map((pos) =>
          transform(pos),
        ),
      };
    case "MultiLineString":
    case "Polygon":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[][]).map((ring) =>
          ring.map((pos) => transform(pos)),
        ),
      };
    case "MultiPolygon":
      return {
        ...geometry,
        coordinates: (geometry.coordinates as Position[][][]).map((poly) =>
          poly.map((ring) => ring.map((pos) => transform(pos))),
        ),
      };
    case "GeometryCollection":
      return {
        ...geometry,
        geometries: geometry.geometries?.map((child) =>
          reprojectGeometry(child, transform),
        ),
      };
    default:
      return geometry;
  }
};
