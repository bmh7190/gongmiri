import { mkdir, rm, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import path from "node:path";
import { fileURLToPath } from "node:url";
import shpwrite from "@mapbox/shp-write";
import { iter } from "but-unzip";
import { parseDbf, parseShp, combine } from "shpjs";
import {
  inspectShapefileScale,
  sampleShapefileLayer,
} from "../src/domain/quick-shapefile.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUTPUT_DIR = path.resolve(__dirname, "../sample-data");
const SCENARIOS = {
  "points-50k": { featureCount: 50_000, geometry: "point" },
  "points-100k": { featureCount: 100_000, geometry: "point" },
  "polygons-500k-coords": { featureCount: 10_000, geometry: "polygon" },
};
const scenarioName = process.argv
  .find((argument) => argument.startsWith("--scenario="))
  ?.slice("--scenario=".length) ?? "points-50k";
const scenario = SCENARIOS[scenarioName];
if (!scenario) {
  throw new Error(`알 수 없는 시나리오: ${scenarioName}. 지원: ${Object.keys(SCENARIOS).join(", ")}`);
}
const KEEP_OUTPUT = process.argv.includes("--keep");
const QUICK = process.argv.includes("--quick");
const OUTPUT_NAME = `benchmark-${scenarioName}.zip`;
const FEATURE_COUNT = scenario.featureCount;
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
  if (scenario.geometry === "polygon") {
    const radius = 0.003;
    const segments = 50;
    const ring = Array.from({ length: segments + 1 }, (_, vertex) => {
      const angle = (Math.PI * 2 * (vertex % segments)) / segments;
      return [lon + Math.cos(angle) * radius, lat + Math.sin(angle) * radius];
    });
    return {
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [ring] },
      properties: { id: index, name: `polygon-${index}` },
    };
  }
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
  const bytes = await shpwrite.zip(geojson, { outputType: "uint8array" });
  const buffer = Buffer.from(bytes);
  await mkdir(OUTPUT_DIR, { recursive: true });
  const targetPath = path.join(OUTPUT_DIR, OUTPUT_NAME);
  await writeFile(targetPath, buffer);
  return { buffer, targetPath };
};

const cloneBuffer = (bytes) => Uint8Array.from(bytes).buffer;

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
      case "shx":
        layer.shx = cloneBuffer(bytes);
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

  const scales = new Map();
  for (const layer of layers) {
    if (layer.shp && layer.shx) {
      scales.set(layer, inspectShapefileScale(layer.shp, layer.shx));
    }
  }
  const totalFeatures = Array.from(scales.values()).reduce(
    (total, scale) => total + scale.records,
    0,
  );
  const coordinateCount = Array.from(scales.values()).reduce(
    (total, scale) => total + scale.coordinates,
    0,
  );

  const collections = [];
  for (const layer of layers) {
    if (!layer.shp) continue;
    let shp = layer.shp;
    let dbf = layer.dbf;
    if (QUICK && totalFeatures > 25_000 && layer.shx) {
      const scale = scales.get(layer);
      const target = scale
        ? Math.max(1, Math.floor(25_000 * scale.records / totalFeatures))
        : 25_000;
      const sampled = sampleShapefileLayer(shp, layer.shx, dbf, target);
      shp = sampled.shp;
      dbf = sampled.dbf;
    }
    const geometries = parseShp(shp);
    const properties = dbf
      ? parseDbf(dbf, new TextEncoder().encode("utf-8"))
      : [];
    const collection = combine([geometries, properties]);
    collections.push(collection);
  }

  return { collections, totalFeatures, coordinateCount };
};

const countCoordinates = (coordinates) => {
  if (!Array.isArray(coordinates)) return 0;
  if (coordinates.length >= 2 && typeof coordinates[0] === "number") return 1;
  return coordinates.reduce((total, child) => total + countCoordinates(child), 0);
};

const runBenchmark = async () => {
  console.log(`[gongmiri] ${scenarioName}: ${FEATURE_COUNT.toLocaleString()}개 피처 GeoJSON 생성 중...`);
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
  const parsed = await parseArchive(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  perf.mark("parse:end");
  const parseTime = perf.measure("parse:duration", "parse:start", "parse:end");
  const merged = parsed.collections[0];
  const featureCount = merged?.features?.length ?? 0;
  const coordinateCount = merged?.features?.reduce(
    (total, feature) => total + countCoordinates(feature.geometry?.coordinates),
    0,
  ) ?? 0;

  console.log("------ 결과 ------");
  console.log(`GeoJSON 생성 시간: ${geojsonTime.duration.toFixed(2)} ms`);
  console.log(`ZIP 생성 시간: ${zipTime.duration.toFixed(2)} ms`);
  console.log(`워커 파서 등가 로직 시간: ${parseTime.duration.toFixed(2)} ms`);
  console.log(`파싱된 피처 개수: ${featureCount.toLocaleString()}`);
  console.log(`파싱된 좌표 개수: ${coordinateCount.toLocaleString()}`);
  console.log(`원본 피처/좌표: ${parsed.totalFeatures.toLocaleString()} / ${parsed.coordinateCount.toLocaleString()}`);
  console.log(`처리 모드: ${QUICK ? "Quick 선행 샘플" : "Full"}`);
  if (!KEEP_OUTPUT) {
    await rm(targetPath, { force: true });
    console.log("벤치마크 ZIP 삭제 완료 (--keep으로 보존 가능)");
  }
};

runBenchmark().catch((error) => {
  console.error("[gongmiri] 벤치마크 실패", error);
  process.exitCode = 1;
});
