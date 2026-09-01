import { describe, expect, it } from "vitest";
import { iter } from "but-unzip";
import iconv from "iconv-lite";
import JSZip from "jszip";
import shpwrite from "@mapbox/shp-write";
import type { Geometry } from "geojson";
import type { FeatureCollectionGeometry } from "./types";
import { exploreAttributeRows } from "./attribute-rows";
import { createCsv, prepareExportCollection, selectExportCollection } from "./export-data";
import { fileNameFromPath, isZipDownloadCandidate } from "./download-detection";
import { exploreColumns } from "./column-explorer";
import { getColumnQualityIssues } from "./column-quality";
import { computeBounds, ensureFeatureIds } from "./feature-collection";
import { formatFileSize } from "./format";
import { inspectZipEntries, parseEncodingLabel } from "./inspect-zip";
import { parseShapefileGeometries } from "./parse-shapefile";
import { parseDbfProperties } from "./parse-dbf";
import {
  countCollectionCoordinates,
  prepareParsedDataset,
  shouldUseQuickMode,
} from "./prepare-dataset";
import { createQuickPreview } from "./quick-preview";
import { inspectShapefileScale, sampleShapefileLayer } from "./quick-shapefile";
import { detectSridFromPrj, getSridOption } from "./srid";
import { summarizeCollection } from "./summarize-collection";
import { buildCategoryStops, buildNumericStops } from "./visualization";

const collection = (count: number): FeatureCollectionGeometry => ({
  type: "FeatureCollection",
  features: Array.from({ length: count }, (_, index) => ({
    type: "Feature",
    id: index,
    geometry: { type: "Point", coordinates: [index, index * 2] },
    properties: { value: index, group: index % 2 ? "odd" : "even" },
  })),
});

const createShpBuffer = async (geometry: Geometry): Promise<ArrayBuffer> => {
  const source: FeatureCollectionGeometry = {
    type: "FeatureCollection",
    features: [{ type: "Feature", geometry, properties: { id: 1 } }],
  };
  const zip = await shpwrite.zip(source, { outputType: "uint8array" });
  for (const entry of iter(zip)) {
    if (!entry.filename.toLowerCase().endsWith(".shp")) continue;
    const data = entry.read();
    const bytes = data instanceof Promise ? await data : data;
    return Uint8Array.from(bytes).buffer;
  }
  throw new Error("Generated ZIP did not contain an SHP file");
};

const createShapefileLayer = async (source: FeatureCollectionGeometry): Promise<{
  shp: ArrayBuffer;
  shx: ArrayBuffer;
  dbf: ArrayBuffer;
}> => {
  const zip = await shpwrite.zip(source, { outputType: "uint8array" });
  const buffers: Partial<Record<"shp" | "shx" | "dbf", ArrayBuffer>> = {};
  for (const entry of iter(zip)) {
    const extension = entry.filename.toLowerCase().match(/\.(shp|shx|dbf)$/)?.[1] as
      | "shp"
      | "shx"
      | "dbf"
      | undefined;
    if (!extension) continue;
    const data = entry.read();
    const bytes = data instanceof Promise ? await data : data;
    buffers[extension] = Uint8Array.from(bytes).buffer;
  }
  if (!buffers.shp || !buffers.shx || !buffers.dbf) {
    throw new Error("Generated ZIP did not contain a complete layer");
  }
  return { shp: buffers.shp, shx: buffers.shx, dbf: buffers.dbf };
};

const createCharacterDbf = (
  value: string,
  encoding: "utf-8" | "cp949" | "euc-kr",
): ArrayBuffer => {
  const encoded = iconv.encode(value, encoding);
  const fieldLength = Math.max(32, encoded.length);
  const headerLength = 65;
  const recordLength = fieldLength + 1;
  const bytes = new Uint8Array(headerLength + recordLength + 1);
  const view = new DataView(bytes.buffer);

  bytes[0] = 0x03;
  bytes[1] = 126;
  bytes[2] = 8;
  bytes[3] = 31;
  view.setUint32(4, 1, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  bytes.set(new TextEncoder().encode("NAME"), 32);
  bytes[43] = "C".charCodeAt(0);
  bytes[48] = fieldLength;
  bytes[64] = 0x0d;
  bytes[65] = 0x20;
  bytes.fill(0x20, 66, 66 + fieldLength);
  bytes.set(encoded, 66);
  bytes[bytes.length - 1] = 0x1a;
  return bytes.buffer;
};

const createMultiPolygonShpBuffer = (): ArrayBuffer => {
  const rings = [
    [[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]],
    [[3, 3], [3, 4], [4, 4], [4, 3], [3, 3]],
  ];
  const points = rings.flat();
  const contentBytes = 4 + 32 + 4 + 4 + rings.length * 4 + points.length * 16;
  const bytes = new ArrayBuffer(100 + 8 + contentBytes);
  const view = new DataView(bytes);

  view.setInt32(0, 9994, false);
  view.setInt32(24, bytes.byteLength / 2, false);
  view.setInt32(28, 1000, true);
  view.setInt32(32, 5, true);
  view.setFloat64(36, 0, true);
  view.setFloat64(44, 0, true);
  view.setFloat64(52, 4, true);
  view.setFloat64(60, 4, true);

  view.setInt32(100, 1, false);
  view.setInt32(104, contentBytes / 2, false);
  view.setInt32(108, 5, true);
  view.setFloat64(112, 0, true);
  view.setFloat64(120, 0, true);
  view.setFloat64(128, 4, true);
  view.setFloat64(136, 4, true);
  view.setInt32(144, rings.length, true);
  view.setInt32(148, points.length, true);

  let partOffset = 152;
  let pointStart = 0;
  for (const ring of rings) {
    view.setInt32(partOffset, pointStart, true);
    partOffset += 4;
    pointStart += ring.length;
  }

  let pointOffset = 152 + rings.length * 4;
  for (const [x, y] of points) {
    view.setFloat64(pointOffset, x, true);
    view.setFloat64(pointOffset + 8, y, true);
    pointOffset += 16;
  }
  return bytes;
};

describe("feature collections", () => {
  it("normalizes stable string ids", () => {
    const input: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [127, 37] },
          properties: { OBJECTID: 42 },
        },
      ],
    };
    ensureFeatureIds(input);
    expect(input.features[0]?.id).toBe("42");
    expect(input.features[0]?.properties?.id).toBe("42");
  });

  it("computes bounds across nested geometries", () => {
    const input: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: [[[1, 2], [5, 2], [5, 8], [1, 2]]],
          },
          properties: {},
        },
      ],
    };
    expect(computeBounds(input)).toEqual([[1, 2], [5, 8]]);
  });
});

describe("attribute row exploration", () => {
  const rows = [
    { id: "1", properties: { name: "Seoul", score: 100 } },
    { id: "2", properties: { name: "Busan", score: null } },
    { id: "3", properties: { name: "Incheon", score: 80 } },
  ];

  it("searches all values or a selected column and sorts numeric values", () => {
    expect(exploreAttributeRows(rows, "seo", null, null, "asc").map((row) => row.id))
      .toEqual(["1"]);
    expect(exploreAttributeRows(rows, "80", "score", "name", "desc").map((row) => row.id))
      .toEqual(["3"]);
    expect(exploreAttributeRows(rows, "", null, "score", "asc").map((row) => row.id))
      .toEqual(["3", "1", "2"]);
  });

  it("filters empty values and inclusive numeric ranges", () => {
    expect(exploreAttributeRows(rows, "", null, null, "asc", {
      column: "score",
      empty: "empty",
      min: null,
      max: null,
    }).map((row) => row.id)).toEqual(["2"]);
    expect(exploreAttributeRows(rows, "", null, null, "asc", {
      column: "score",
      empty: "filled",
      min: 90,
      max: 100,
    }).map((row) => row.id)).toEqual(["1"]);
  });
});

describe("data exports", () => {
  it("exports a selected subset as Excel-friendly CSV", () => {
    const source = collection(3);
    const selected = selectExportCollection(source, ["1"]);
    const csv = createCsv(selected);
    expect(selected.features).toHaveLength(1);
    expect(csv.startsWith("\uFEFFfeature_id,value,group")).toBe(true);
    expect(csv).toContain("1,1,odd");
  });

  it("keeps selected fields and restores source coordinates", () => {
    const source: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: { type: "Point", coordinates: [127, 38] },
        properties: { name: "origin", hidden: "remove" },
      }],
    };
    const projection = getSridOption(5179)?.proj4;
    if (!projection) throw new Error("Missing EPSG:5179 definition");

    const exported = prepareExportCollection(source, ["name"], projection);
    const feature = exported.features[0];
    expect(feature?.properties).toEqual({ name: "origin" });
    expect(feature?.geometry.type).toBe("Point");
    if (feature?.geometry.type !== "Point") throw new Error("Expected Point");
    expect(feature.geometry.coordinates[0]).toBeCloseTo(200_000, 1);
    expect(feature.geometry.coordinates[1]).toBeCloseTo(600_000, 1);
  });

  it("exports properties in the current table column order", () => {
    const source: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        id: "feature-1",
        geometry: { type: "Point", coordinates: [127, 38] },
        properties: { name: "Seoul", category: "capital", score: 100 },
      }],
    };

    const prepared = prepareExportCollection(source, ["score", "name"], null);
    expect(Object.keys(prepared.features[0]?.properties ?? {})).toEqual(["score", "name"]);
    expect(createCsv(prepared)).toContain("feature_id,score,name");
  });
});

describe("download detection", () => {
  it("accepts ZIP filenames and strips local paths without exposing them", () => {
    expect(isZipDownloadCandidate("C:\\Downloads\\sample.ZIP")).toBe(true);
    expect(isZipDownloadCandidate("report.pdf", "https://example.test/data.zip?token=hidden"))
      .toBe(true);
    expect(isZipDownloadCandidate("report.pdf")).toBe(false);
    expect(fileNameFromPath("C:\\Downloads\\sample.zip")).toBe("sample.zip");
  });
});

describe("column summaries", () => {
  it("counts omitted properties as empty", () => {
    const input: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [0, 0] },
          properties: { name: "present" },
        },
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [1, 1] },
          properties: {},
        },
      ],
    };
    const name = summarizeCollection(input, "sample.zip").columns[0];
    expect(name).toMatchObject({ filled: 1, empty: 1, fillRate: 50 });
  });

  it("flags mostly empty and single-value columns", () => {
    const input: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { constant: "same" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: { constant: "same" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [2, 2] }, properties: { sparse: "one" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [3, 3] }, properties: {} },
      ],
    };
    const columns = summarizeCollection(input, "quality.zip").columns;
    const constant = columns.find((column) => column.name === "constant")!;
    const sparse = columns.find((column) => column.name === "sparse")!;
    expect(getColumnQualityIssues(constant)).toContain("singleValue");
    expect(getColumnQualityIssues(sparse)).toContain("mostlyEmpty");
  });

  it("searches, filters, and sorts column quality summaries", () => {
    const input: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        { type: "Feature", geometry: { type: "Point", coordinates: [0, 0] }, properties: { name: "A", score: 10 } },
        { type: "Feature", geometry: { type: "Point", coordinates: [1, 1] }, properties: { name: "A", score: "bad" } },
        { type: "Feature", geometry: { type: "Point", coordinates: [2, 2] }, properties: { name: "A" } },
      ],
    };
    const columns = summarizeCollection(input, "columns.zip").columns;

    expect(exploreColumns(columns, "score", "mixedType", "empty"))
      .toMatchObject([{ name: "score", empty: 1, dataType: "mixed" }]);
    expect(exploreColumns(columns, "", "all", "fillRate").map((column) => column.name))
      .toEqual(["score", "name"]);
  });
});

describe("quick previews", () => {
  it("samples the requested number across the full collection", () => {
    const preview = createQuickPreview(collection(30), 10);
    expect(preview.features).toHaveLength(10);
    expect(preview.features[0]?.id).toBe(0);
    expect(preview.features[preview.features.length - 1]?.id).toBe(27);
  });

  it("prepares Quick samples and summaries before crossing the Worker boundary", () => {
    const prepared = prepareParsedDataset(collection(30_000), "worker.zip", "quick");
    expect(prepared.totalFeatures).toBe(30_000);
    expect(prepared.displayedFeatures).toBe(25_000);
    expect(prepared.result.featureCount).toBe(25_000);
  });

  it("counts nested coordinates and automatically selects Quick by every size signal", () => {
    const polygon: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [{
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]],
        },
        properties: {},
      }],
    };
    expect(countCollectionCoordinates(polygon)).toBe(4);
    expect(shouldUseQuickMode({ fileBytes: 100 * 1024 * 1024, features: 1, coordinates: 1 })).toBe(true);
    expect(shouldUseQuickMode({ fileBytes: 1, features: 100_000, coordinates: 1 })).toBe(true);
    expect(shouldUseQuickMode({ fileBytes: 1, features: 1, coordinates: 500_000 })).toBe(true);
    expect(shouldUseQuickMode({ fileBytes: 1, features: 1, coordinates: 4 })).toBe(false);
  });

  it("applies automatic Quick only when initial auto selection is allowed", () => {
    const source = collection(3);
    const auto = prepareParsedDataset(source, "large.zip", "full", {
      fileBytes: 100 * 1024 * 1024,
      allowAutoQuick: true,
    });
    const manual = prepareParsedDataset(source, "large.zip", "full", {
      fileBytes: 100 * 1024 * 1024,
      allowAutoQuick: false,
    });
    expect(auto.mode).toBe("quick");
    expect(manual.mode).toBe("full");
  });

  it("samples SHP and matching DBF records before geometry parsing", async () => {
    const layer = await createShapefileLayer(collection(100));
    expect(inspectShapefileScale(layer.shp, layer.shx)).toEqual({
      records: 100,
      coordinates: 100,
    });

    const sampled = sampleShapefileLayer(layer.shp, layer.shx, layer.dbf, 10);
    const geometries = parseShapefileGeometries(sampled.shp);
    const properties = parseDbfProperties(sampled.dbf!, "UTF-8", "utf-8");
    expect(sampled.selectedIndices).toEqual([0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
    expect(geometries).toHaveLength(10);
    expect(properties).toHaveLength(10);
    expect(properties[0]?.value).toBe(0);
    expect(properties[9]?.value).toBe(90);
  });
});

describe("encoding labels", () => {
  it.each([
    ["UTF-8", "utf-8"],
    ["MS949", "cp949"],
    ["EUC-KR", "euc-kr"],
  ])("maps %s to %s", (label, expected) => {
    expect(parseEncodingLabel(label)).toBe(expected);
  });

  it.each([
    ["UTF-8", "utf-8", "서울 데이터"],
    ["MS949", "cp949", "서울 데이터"],
    ["EUC-KR", "euc-kr", "서울 지도"],
  ] as const)("decodes an actual %s DBF record", (cpg, encoding, expected) => {
    const dbf = createCharacterDbf(expected, encoding);
    expect(parseDbfProperties(dbf, cpg, "utf-8"))
      .toEqual([{ NAME: expected }]);
  });

  it("uses the selected CP949 fallback when a CPG file is absent", () => {
    const expected = "한글 속성";
    const dbf = createCharacterDbf(expected, "cp949");
    expect(parseDbfProperties(dbf, undefined, "cp949"))
      .toEqual([{ NAME: expected }]);
  });
});

describe("ZIP inspection", () => {
  it("finds multiple layers with Korean names inside nested folders", async () => {
    const source: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [127, 37] },
          properties: { name: "기준점" },
        },
        {
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [[127, 37], [128, 38]],
          },
          properties: { name: "도로" },
        },
      ],
    };
    const zip = await shpwrite.zip(source, {
      folder: "중첩/공간자료",
      outputType: "uint8array",
      types: { point: "한글_점", polyline: "도로" },
    });
    const inspection = await inspectZipEntries(zip.slice().buffer);

    expect(inspection.hasValidLayer).toBe(true);
    expect(inspection.hasPrj).toBe(true);
    expect(inspection.detectedSridCode).toBe(4326);
    expect(inspection.layers.map((layer) => layer.name).sort())
      .toEqual(["도로", "한글_점"]);
    expect(inspection.layers.every((layer) => layer.missingEssential.length === 0))
      .toBe(true);
  });

  it("reports the exact essential files missing from a layer", async () => {
    const zip = new JSZip();
    zip.file("중첩/불완전.shp", Uint8Array.of(1, 2, 3), { binary: true });
    zip.file("중첩/불완전.cpg", "MS949");
    const bytes = await zip.generateAsync({ type: "uint8array", compression: "STORE" });
    const inspection = await inspectZipEntries(new Uint8Array(bytes).buffer);

    expect(inspection.hasValidLayer).toBe(false);
    expect(inspection.detectedEncoding).toBe("cp949");
    expect(inspection.layers).toHaveLength(1);
    expect(inspection.layers[0]).toMatchObject({
      name: "불완전",
      missingEssential: [".dbf", ".shx"],
    });
  });

  it("rejects a damaged ZIP instead of treating it as an empty archive", async () => {
    const damaged = Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 0xff, 0xff);
    await expect(inspectZipEntries(damaged.buffer)).rejects.toThrow();
  });
});

describe("coordinate systems", () => {
  it("detects an EPSG authority code from PRJ text", () => {
    expect(detectSridFromPrj('PROJCS["Korea 2000",AUTHORITY["EPSG","5179"]]'))
      .toBe(5179);
  });

  it.each([
    ["Korea 2000 / West Belt 2010", 5181],
    ["Korea 2000 / East Belt 2010", 5183],
    ["Korea 2000 / Central Belt 2010", 5186],
  ])("detects the named 2010 belt %s", (name, expected) => {
    expect(detectSridFromPrj(`PROJCS["${name}"]`)).toBe(expected);
  });

  it("converts a manually selected Web Mercator source exactly once", async () => {
    const longitude = 127;
    const latitude = 37;
    const x = longitude * 20037508.34 / 180;
    const yDegrees = Math.log(Math.tan((90 + latitude) * Math.PI / 360))
      / (Math.PI / 180);
    const y = yDegrees * 20037508.34 / 180;
    const shpBuffer = await createShpBuffer({
      type: "Point",
      coordinates: [x, y],
    });
    const geometries = parseShapefileGeometries(
      shpBuffer,
      "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +no_defs +type=crs",
    );
    const point = geometries[0];
    expect(point?.type).toBe("Point");
    if (point?.type !== "Point") throw new Error("Expected Point geometry");
    expect(point.coordinates[0]).toBeCloseTo(longitude, 5);
    expect(point.coordinates[1]).toBeCloseTo(latitude, 5);
  });

  it.each([
    [4326, [127, 38], [127, 38]],
    [5179, [200_000, 600_000], [127, 38]],
    [5186, [200_000, 500_000], [127, 38]],
  ] as const)("converts EPSG:%i coordinates to WGS84", async (code, source, expected) => {
    const option = getSridOption(code);
    if (!option) throw new Error(`Missing EPSG:${code} definition`);
    const shpBuffer = await createShpBuffer({
      type: "Point",
      coordinates: [...source],
    });
    const geometries = parseShapefileGeometries(shpBuffer, option.proj4);
    const point = geometries[0];
    expect(point?.type).toBe("Point");
    if (point?.type !== "Point") throw new Error("Expected Point geometry");
    expect(point.coordinates[0]).toBeCloseTo(expected[0], 5);
    expect(point.coordinates[1]).toBeCloseTo(expected[1], 5);
  });
});

describe("Shapefile geometry parsing", () => {
  const wgs84 = "+proj=longlat +datum=WGS84 +no_defs +type=crs";

  it.each<[string, Geometry]>([
    ["Point", { type: "Point", coordinates: [127, 37] }],
    ["LineString", {
      type: "LineString",
      coordinates: [[127, 37], [128, 38]],
    }],
    ["Polygon", {
      type: "Polygon",
      coordinates: [[[127, 37], [128, 37], [128, 38], [127, 37]]],
    }],
  ])("preserves %s geometry", async (expectedType, geometry) => {
    const shpBuffer = await createShpBuffer(geometry);
    const parsed = parseShapefileGeometries(shpBuffer, wgs84);
    expect(parsed[0]?.type).toBe(expectedType);
  });

  it("parses disjoint polygon parts as a MultiPolygon", () => {
    const parsed = parseShapefileGeometries(
      createMultiPolygonShpBuffer(),
      wgs84,
    );
    const geometry = parsed[0];
    expect(geometry?.type).toBe("MultiPolygon");
    if (geometry?.type !== "MultiPolygon") {
      throw new Error("Expected MultiPolygon geometry");
    }
    expect(geometry.coordinates).toHaveLength(2);
  });

  it("rejects a truncated SHP buffer", () => {
    expect(() => parseShapefileGeometries(new ArrayBuffer(12), wgs84))
      .toThrow();
  });
});

describe("visualization stops", () => {
  it("builds an equal-interval numeric domain", () => {
    const result = buildNumericStops(collection(5), "value", "equal");
    expect(result.domain).toEqual([0, 4]);
    expect(result.stops[0]?.value).toBe(0);
    expect(result.stops[result.stops.length - 1]?.value).toBe(4);
  });

  it("groups category values outside the requested limit", () => {
    const stops = buildCategoryStops(collection(6), "group", 1);
    expect(stops).toHaveLength(2);
    expect(stops[1]).toMatchObject({ count: 3, isOther: true });
  });
});

describe("localized formatting", () => {
  it("formats file sizes with a compact unit", () => {
    expect(formatFileSize(78_951_145, "en")).toBe("75.3 MB");
    expect(formatFileSize(0, "ko")).toBe("0 B");
  });
});
