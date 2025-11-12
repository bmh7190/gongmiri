import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import shpwrite from "shp-write";
import { iter } from "but-unzip";
import { parseDbf, parseShp, combine } from "shpjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../sample-data");
const OUTPUT_NAME = "benchmark-zip.zip";
const FEATURE_COUNT = 50_000;
const STRING_VALUE = "gongmiri-benchmark-".padEnd(220, "x");

const perf = {
  mark(name) {
    return performance.mark(name);
  },
  measure(name, start, end) {
    return performance.measure(name, start, end);
  },
};

const createFeature = (index) => {
  const lon = -180 + ((index * 0.01) % 360);
  const lat = -85 + ((index * 0.005) % 170);
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: [lon, lat],
    },
    properties: {
      id: index,
      name: `feature-${index}`,
      attr_a: `${STRING_VALUE}${index}`,
      attr_b: `${STRING_VALUE.split("").reverse().join("")}${index}`,
      attr_c: `${STRING_VALUE.replace(/x/g, "y")}${index}`,
      attr_d: `${STRING_VALUE.replace(/g/g, "G")}${index}`,
      attr_e: `${STRING_VALUE.replace(/i/g, "I")}${index}`,
    },
  };
};

const buildGeoJSON = () => ({
  type: "FeatureCollection",
  features: Array.from({ length: FEATURE_COUNT }, (_, idx) => createFeature(idx)),
});

const exportZip = async (geojson) => {
  const arrayBuffer = shpwrite.zip(geojson);
  const buffer = Buffer.from(arrayBuffer);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const targetPath = path.join(OUTPUT_DIR, OUTPUT_NAME);
  await writeFile(targetPath, buffer);
  return { buffer, targetPath };
};

const cloneBuffer = (bytes) => bytes.slice().buffer;

const collectEntries = async (arrayBuffer) => {
  const files = {};

  for (const entry of iter(new Uint8Array(arrayBuffer))) {
    const normalized = entry.filename.replace(/\\/g, "/");
    const name = normalized.split("/").pop();
    if (!name) continue;
    const match = name.match(/^(.+)\.(shp|dbf|shx|prj|cpg)$/i);
    if (!match) continue;
    const baseName = match[1];
    const extension = match[2].toLowerCase();
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
        layer.prj = new TextDecoder().decode(bytes).trim();
        break;
      case "cpg":
        layer.cpg = new TextDecoder().decode(bytes).trim();
        break;
      default:
        break;
    }
  }

  return files;
};

const parseArchive = async (arrayBuffer) => {
  const entries = await collectEntries(arrayBuffer);
  const layers = Object.values(entries).filter((layer) => layer.shp);
  if (!layers.length) throw new Error("SHP 레이어가 생성되지 않았습니다.");

  const collections = [];
  for (const layer of layers) {
    if (!layer.shp) continue;
    const geometries = parseShp(layer.shp);
    const properties = layer.dbf
      ? parseDbf(layer.dbf, new TextEncoder().encode("utf-8"))
      : [];
    const collection = combine([geometries, properties]);
    collections.push(collection);
  }

  return collections;
};

const runBenchmark = async () => {
  console.log(`[gongmiri] ${FEATURE_COUNT.toLocaleString()}개 피처 GeoJSON 생성 중...`);
  perf.mark("geojson:start");
  const geojson = buildGeoJSON();
  perf.mark("geojson:end");
  const geojsonTime = perf.measure("geojson:duration", "geojson:start", "geojson:end");

  console.log(`[gongmiri] Shapefile ZIP 내보내는 중...`);
  perf.mark("zip:start");
  const { buffer, targetPath } = await exportZip(geojson);
  perf.mark("zip:end");
  const zipTime = perf.measure("zip:duration", "zip:start", "zip:end");

  console.log(`[gongmiri] ZIP 용량 ${(buffer.length / (1024 * 1024)).toFixed(1)} MB (${targetPath})`);

  perf.mark("parse:start");
  const collections = await parseArchive(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  perf.mark("parse:end");
  const parseTime = perf.measure("parse:duration", "parse:start", "parse:end");
  const merged = collections[0];
  const featureCount = merged?.features?.length ?? 0;

  console.log("------ 결과 ------");
  console.log(`GeoJSON 생성 시간: ${geojsonTime.duration.toFixed(2)} ms`);
  console.log(`ZIP 생성 시간: ${zipTime.duration.toFixed(2)} ms`);
  console.log(`워커 파서 등가 로직 시간: ${parseTime.duration.toFixed(2)} ms`);
  console.log(`파싱된 피처 개수: ${featureCount.toLocaleString()}`);
};

runBenchmark().catch((error) => {
  console.error("[gongmiri] 벤치마크 실패", error);
  process.exitCode = 1;
});
