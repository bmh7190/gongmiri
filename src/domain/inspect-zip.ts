import { iter } from "but-unzip";
import { detectSridFromPrj } from "./srid";
import type {
  EncodingOption,
  SridCode,
  ZipInspection,
  ZipLayerStatus,
} from "./types";

const readEntryAsText = async (entry: {
  read: () => Promise<Uint8Array> | Uint8Array;
}): Promise<string> => {
  const data = entry.read();
  const bytes = data instanceof Promise ? await data : data;
  return new TextDecoder().decode(bytes).trim();
};

export const parseEncodingLabel = (
  label: string,
): EncodingOption | undefined => {
  const normalized = label.trim().toLowerCase();
  if (normalized.includes("utf-8") || normalized.includes("utf8")) {
    return "utf-8";
  }
  if (
    normalized.includes("euc-kr") ||
    normalized.includes("euckr") ||
    normalized.includes("ksc") ||
    normalized.includes("5601")
  ) {
    return "euc-kr";
  }
  if (
    normalized.includes("949") ||
    normalized.includes("ms949") ||
    normalized.includes("uhc")
  ) {
    return "cp949";
  }
  return undefined;
};

export const inspectZipEntries = async (
  buffer: ArrayBuffer,
): Promise<ZipInspection> => {
  const layers = new Map<string, ZipLayerStatus>();
  let hasCpg = false;
  let hasPrj = false;
  let detectedEncoding: EncodingOption | undefined;
  let detectedSridCode: SridCode | undefined;
  let prjText: string | undefined;

  const mark = (layerName: string, extension: string) => {
    const layer = layers.get(layerName) ?? {
      name: layerName,
      hasShp: false,
      hasDbf: false,
      hasShx: false,
      hasPrj: false,
      hasCpg: false,
      hasQix: false,
      hasSbn: false,
      hasSbx: false,
      missingEssential: [],
    };

    const property = `has${extension[0]?.toUpperCase()}${extension.slice(1)}` as
      | "hasShp"
      | "hasDbf"
      | "hasShx"
      | "hasPrj"
      | "hasCpg"
      | "hasQix"
      | "hasSbn"
      | "hasSbx";
    layer[property] = true;
    layers.set(layerName, layer);
  };

  for (const entry of iter(new Uint8Array(buffer))) {
    const leaf = entry.filename.replace(/\\/g, "/").split("/").pop();
    if (!leaf) continue;
    const match = leaf.match(/^(.+)\.(shp|dbf|shx|prj|cpg|qix|sbn|sbx)$/i);
    if (!match?.[1] || !match[2]) continue;
    const extension = match[2].toLowerCase();
    mark(match[1], extension);

    if (extension === "cpg") {
      hasCpg = true;
      detectedEncoding ??= parseEncodingLabel(await readEntryAsText(entry));
    }
    if (extension === "prj") {
      hasPrj = true;
      if (!prjText) {
        prjText = await readEntryAsText(entry);
        detectedSridCode = detectSridFromPrj(prjText);
      }
    }
  }

  const finalized = Array.from(layers.values()).map((layer) => {
    const missingEssential: string[] = [];
    if (!layer.hasShp) missingEssential.push(".shp");
    if (!layer.hasDbf) missingEssential.push(".dbf");
    if (!layer.hasShx) missingEssential.push(".shx");
    return { ...layer, missingEssential };
  });

  return {
    layers: finalized,
    hasValidLayer: finalized.some(
      (layer) => layer.hasShp && layer.hasDbf && layer.hasShx,
    ),
    hasCpg,
    hasPrj,
    detectedEncoding,
    detectedSridCode,
    prjText,
  };
};
