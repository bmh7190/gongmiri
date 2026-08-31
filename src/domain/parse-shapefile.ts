import type { Geometry } from "geojson";
import { parseShp } from "shpjs";

export const parseShapefileGeometries = (
  buffer: ArrayBuffer,
  sourceProjection?: string,
): Geometry[] => parseShp(buffer, sourceProjection) as Geometry[];
