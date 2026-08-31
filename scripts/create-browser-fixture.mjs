import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import shpwrite from "@mapbox/shp-write";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, "../sample-data");
const outputPath = path.join(outputDir, "browser-fixture.zip");
const collection = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Point", coordinates: [126.98, 37.57] }, properties: { name: "Seoul", category: "capital", score: 100 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [129.08, 35.18] }, properties: { name: "Busan", category: "metro", score: 80 } },
    { type: "Feature", geometry: { type: "Point", coordinates: [126.71, 37.46] }, properties: { name: "Incheon", category: "metro", score: null } },
  ],
};

await mkdir(outputDir, { recursive: true });
const zip = await shpwrite.zip(collection, { outputType: "uint8array" });
await writeFile(outputPath, Buffer.from(zip));
console.log(outputPath);
