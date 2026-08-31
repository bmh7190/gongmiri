export type ShapefileScale = {
  records: number;
  coordinates: number;
};

export type SampledShapefileLayer = {
  shp: ArrayBuffer;
  dbf?: ArrayBuffer;
  selectedIndices: number[];
};

const SHAPE_TYPE_POINT = new Set([1, 11, 21]);
const SHAPE_TYPE_LINE_OR_POLYGON = new Set([3, 5, 13, 15, 23, 25]);
const SHAPE_TYPE_MULTIPOINT = new Set([8, 18, 28]);

const recordCount = (shx: ArrayBuffer): number =>
  Math.max(0, Math.floor((shx.byteLength - 100) / 8));

const recordLocation = (
  shxView: DataView,
  index: number,
): { offset: number; contentBytes: number } => ({
  offset: shxView.getInt32(100 + index * 8, false) * 2,
  contentBytes: shxView.getInt32(104 + index * 8, false) * 2,
});

const recordCoordinateCount = (
  shpView: DataView,
  offset: number,
  contentBytes: number,
): number => {
  const contentStart = offset + 8;
  if (contentBytes < 4 || contentStart + contentBytes > shpView.byteLength) return 0;
  const shapeType = shpView.getInt32(contentStart, true);
  if (SHAPE_TYPE_POINT.has(shapeType)) return 1;
  if (SHAPE_TYPE_LINE_OR_POLYGON.has(shapeType) && contentBytes >= 44) {
    return Math.max(0, shpView.getInt32(contentStart + 40, true));
  }
  if (SHAPE_TYPE_MULTIPOINT.has(shapeType) && contentBytes >= 40) {
    return Math.max(0, shpView.getInt32(contentStart + 36, true));
  }
  return 0;
};

export const inspectShapefileScale = (
  shp: ArrayBuffer,
  shx: ArrayBuffer,
): ShapefileScale => {
  const shpView = new DataView(shp);
  const shxView = new DataView(shx);
  const records = recordCount(shx);
  let coordinates = 0;
  for (let index = 0; index < records; index += 1) {
    const location = recordLocation(shxView, index);
    coordinates += recordCoordinateCount(
      shpView,
      location.offset,
      location.contentBytes,
    );
  }
  return { records, coordinates };
};

export const createSampleIndices = (
  total: number,
  target: number,
): number[] => {
  if (total <= 0 || target <= 0) return [];
  if (total <= target) return Array.from({ length: total }, (_, index) => index);
  const stride = total / target;
  return Array.from(
    { length: target },
    (_, sampleIndex) => Math.floor(sampleIndex * stride),
  );
};

const sampleShp = (
  shp: ArrayBuffer,
  shx: ArrayBuffer,
  selectedIndices: number[],
): ArrayBuffer => {
  const source = new Uint8Array(shp);
  const shxView = new DataView(shx);
  const records = selectedIndices.map((index) => recordLocation(shxView, index));
  const totalBytes = 100 + records.reduce(
    (total, record) => total + 8 + record.contentBytes,
    0,
  );
  const output = new Uint8Array(totalBytes);
  output.set(source.subarray(0, Math.min(100, source.length)));
  const outputView = new DataView(output.buffer);
  outputView.setInt32(24, totalBytes / 2, false);
  let targetOffset = 100;
  records.forEach((record, recordIndex) => {
    const contentStart = record.offset + 8;
    const contentEnd = contentStart + record.contentBytes;
    if (record.offset < 100 || contentEnd > source.length) {
      throw new Error("invalidShapefileIndex");
    }
    outputView.setInt32(targetOffset, recordIndex + 1, false);
    outputView.setInt32(targetOffset + 4, record.contentBytes / 2, false);
    output.set(source.subarray(contentStart, contentEnd), targetOffset + 8);
    targetOffset += 8 + record.contentBytes;
  });
  return output.buffer;
};

const sampleDbf = (
  dbf: ArrayBuffer,
  selectedIndices: number[],
): ArrayBuffer => {
  const source = new Uint8Array(dbf);
  const sourceView = new DataView(dbf);
  if (source.length < 32) throw new Error("invalidDbfHeader");
  const sourceRecords = sourceView.getUint32(4, true);
  const headerBytes = sourceView.getUint16(8, true);
  const recordBytes = sourceView.getUint16(10, true);
  if (headerBytes < 32 || recordBytes < 1 || headerBytes > source.length) {
    throw new Error("invalidDbfHeader");
  }
  const validIndices = selectedIndices.filter((index) => index < sourceRecords);
  const output = new Uint8Array(headerBytes + validIndices.length * recordBytes + 1);
  output.set(source.subarray(0, headerBytes));
  const outputView = new DataView(output.buffer);
  outputView.setUint32(4, validIndices.length, true);
  validIndices.forEach((sourceIndex, outputIndex) => {
    const sourceStart = headerBytes + sourceIndex * recordBytes;
    const sourceEnd = sourceStart + recordBytes;
    if (sourceEnd > source.length) throw new Error("invalidDbfRecord");
    output.set(source.subarray(sourceStart, sourceEnd), headerBytes + outputIndex * recordBytes);
  });
  output[output.length - 1] = 0x1a;
  return output.buffer;
};

export const sampleShapefileLayer = (
  shp: ArrayBuffer,
  shx: ArrayBuffer,
  dbf: ArrayBuffer | undefined,
  target: number,
): SampledShapefileLayer => {
  const selectedIndices = createSampleIndices(recordCount(shx), target);
  return {
    shp: sampleShp(shp, shx, selectedIndices),
    dbf: dbf ? sampleDbf(dbf, selectedIndices) : undefined,
    selectedIndices,
  };
};
