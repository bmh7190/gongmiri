/// <reference lib="webworker" />

import { iter } from "but-unzip";
import { combine } from "shpjs";
import type { FeatureCollection } from "geojson";
import type {
  EncodingOption,
  FeatureCollectionGeometry,
  ParseMode,
  SridCode,
} from "../domain/types";
import { SRID_OPTIONS } from "../domain/srid";
import { parseShapefileGeometries } from "../domain/parse-shapefile";
import { parseDbfProperties } from "../domain/parse-dbf";
import { prepareParsedDataset, shouldUseQuickMode } from "../domain/prepare-dataset";
import { QUICK_PREVIEW_LIMIT } from "../domain/quick-preview";
import {
  inspectShapefileScale,
  sampleShapefileLayer,
  type ShapefileScale,
} from "../domain/quick-shapefile";
import { logDebug, logWarn } from "../shared/logger";
import type {
  ParseError,
  ParseErrorCode,
  ParseProgressCode,
  ParseProgressMessage,
  ParseRequest,
  ParseSuccess,
} from "../domain/parser-protocol";

class ParserFailure extends Error {
  readonly code: ParseErrorCode;

  constructor(code: ParseErrorCode) {
    super(code);
    this.code = code;
  }
}

type LayerEntry = {
  shp?: ArrayBuffer;
  shx?: ArrayBuffer;
  dbf?: ArrayBuffer;
  prj?: string;
  cpg?: string;
  fileName: string;
};

type ParseArchiveResult = {
  collection: FeatureCollection | FeatureCollection[];
  totalFeatures: number;
  coordinateCount: number;
  mode: ParseMode;
  preSampled: boolean;
  hasScaleMetadata: boolean;
};

const textDecoder = new TextDecoder();
const cloneBuffer = (bytes: Uint8Array): ArrayBuffer =>
  Uint8Array.from(bytes).buffer;

const sridToProj4 = (srid: SridCode | null): string | undefined => {
  if (!srid) return undefined;
  const option = SRID_OPTIONS.find((item) => item.code === srid);
  return option?.proj4;
};

const normalizeCollection = (
  result: FeatureCollection | FeatureCollection[],
): FeatureCollection => {
  if (Array.isArray(result)) {
    return {
      type: "FeatureCollection",
      features: result.flatMap((collection) => collection.features),
    } as FeatureCollection;
  }
  return result;
};

self.addEventListener("message", async (event: MessageEvent<ParseRequest>) => {
  const {
    id,
    buffer,
    encoding,
    srid,
    mode,
    fileName,
    fileBytes,
    allowAutoQuick,
  } = event.data;
  logDebug("[worker] parse request", {
    id,
    encoding,
    srid,
    bufferBytes: buffer.byteLength,
  });
  const reportProgress = (
    code: ParseProgressCode,
    percent: number,
    currentLayer?: number,
    totalLayers?: number,
  ) => {
    const response: ParseProgressMessage = {
      id,
      status: "progress",
      code,
      percent: clampPercent(percent),
      currentLayer,
      totalLayers,
    };
    postMessage(response);
  };
  try {
    reportProgress("unzipping", 5);
    const archive = await parseArchive(
      buffer,
      encoding,
      srid,
      mode,
      fileBytes,
      allowAutoQuick,
      reportProgress,
    );
    const collection = normalizeCollection(archive.collection) as FeatureCollectionGeometry;
    reportProgress("summarizing", 93);
    const dataset = prepareParsedDataset(collection, fileName, mode, {
      fileBytes,
      allowAutoQuick,
      totalFeatures: archive.hasScaleMetadata ? archive.totalFeatures : undefined,
      coordinateCount: archive.hasScaleMetadata ? archive.coordinateCount : undefined,
      preSampled: archive.preSampled,
      effectiveMode: archive.mode,
    });
    reportProgress("rendering", 98);
    logDebug("[worker] parse success", {
      id,
      featureCount: dataset.collection.features.length,
      totalFeatures: dataset.totalFeatures,
      geometrySample: dataset.collection.features[0]?.geometry?.type ?? "n/a",
    });
    const response: ParseSuccess = {
      id,
      status: "success",
      dataset,
    };
    postMessage(response);
  } catch (error) {
    const code = error instanceof ParserFailure ? error.code : "parseFailed";
    logWarn("[worker] parse failure", { id, code, error });
    const response: ParseError = { id, status: "error", code };
    postMessage(response);
  }
});

const parseArchive = async (
  buffer: ArrayBuffer,
  encoding: EncodingOption,
  srid: SridCode | null,
  requestedMode: ParseMode,
  fileBytes: number,
  allowAutoQuick: boolean,
  reportProgress: (
    code: ParseProgressCode,
    percent: number,
    currentLayer?: number,
    totalLayers?: number,
  ) => void = () => {},
): Promise<ParseArchiveResult> => {
  const entries = await collectEntries(buffer);
  reportProgress("buildingLayers", 12);
  const layers = Object.values(entries).filter((layer) => layer.shp);
  if (!layers.length) {
    throw new ParserFailure("noShpLayer");
  }

  const projOverride = sridToProj4(srid);
  const layerScales = new Map<LayerEntry, ShapefileScale>();
  for (const layer of layers) {
    if (layer.shp && layer.shx) {
      layerScales.set(layer, inspectShapefileScale(layer.shp, layer.shx));
    }
  }
  const hasScaleMetadata = layerScales.size === layers.length;
  const totalFeatures = Array.from(layerScales.values()).reduce(
    (total, scale) => total + scale.records,
    0,
  );
  const coordinateCount = Array.from(layerScales.values()).reduce(
    (total, scale) => total + scale.coordinates,
    0,
  );
  const autoQuick = allowAutoQuick && shouldUseQuickMode({
    fileBytes,
    features: totalFeatures,
    coordinates: coordinateCount,
  });
  const effectiveMode: ParseMode = requestedMode === "quick" || autoQuick
    ? "quick"
    : "full";
  const preSampled = effectiveMode === "quick"
    && hasScaleMetadata
    && totalFeatures > QUICK_PREVIEW_LIMIT;
  logDebug("[worker] layer summary", {
    layerCount: layers.length,
    override: Boolean(projOverride),
    srid,
  });

  const collections: FeatureCollection[] = [];
  const progressBase = 18;
  const progressSpan = 65;
  const perLayer = layers.length ? progressSpan / layers.length : progressSpan;
  for (let index = 0; index < layers.length; index += 1) {
    const layer = layers[index]!;
    const layerStart = progressBase + perLayer * index;
    reportProgress(
      "parsingGeometry",
      layerStart,
      index + 1,
      layers.length,
    );
    const prjText = projOverride ?? layer.prj;
    let shpBuffer = layer.shp;
    let dbfBuffer = layer.dbf;
    if (!shpBuffer) continue;
    if (preSampled && layer.shx) {
      const scale = layerScales.get(layer);
      const target = scale && totalFeatures > 0
        ? Math.max(1, Math.floor(QUICK_PREVIEW_LIMIT * scale.records / totalFeatures))
        : QUICK_PREVIEW_LIMIT;
      const sampled = sampleShapefileLayer(
        shpBuffer,
        layer.shx,
        dbfBuffer,
        target,
      );
      shpBuffer = sampled.shp;
      dbfBuffer = sampled.dbf;
    }
    if (prjText) {
      reportProgress(
        "reprojecting",
        layerStart + perLayer * 0.15,
        index + 1,
        layers.length,
      );
    }
    const geometries = parseShapefileGeometries(shpBuffer, prjText);
    let properties;
    if (dbfBuffer) {
      reportProgress(
        "parsingAttributes",
        layerStart + perLayer * 0.55,
        index + 1,
        layers.length,
      );
      properties = parseDbfProperties(dbfBuffer, layer.cpg, encoding);
    }
    const collection = combine([geometries, properties ?? []]) as FeatureCollectionGeometry;
    (collection as FeatureCollectionGeometry & { fileName?: string }).fileName = layer.fileName;
    logDebug("[worker] layer parsed", {
      name: layer.fileName,
      features: collection.features?.length ?? 0,
      geometry: collection.features?.[0]?.geometry?.type ?? "n/a",
      usedOverride: Boolean(projOverride),
      hasPrj: Boolean(layer.prj),
    });
    collections.push(collection);
    reportProgress(
      "layerComplete",
      progressBase + perLayer * (index + 1),
      index + 1,
      layers.length,
    );
  }

  reportProgress("normalizing", 88);
  return {
    collection: collections.length === 1 ? collections[0]! : collections,
    totalFeatures,
    coordinateCount,
    mode: effectiveMode,
    preSampled,
    hasScaleMetadata,
  };
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
      case "shx":
        layer.shx = cloneBuffer(bytes);
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

const clampPercent = (value: number): number =>
  Math.min(99, Math.max(1, Math.round(value)));

