import type { Feature, FeatureCollection, Geometry } from "geojson";

export type ColumnStat = {
  name: string;
  filled: number;
  empty: number;
  fillRate: number;
  samples: string[];
};

export type ViewerResult = {
  fileName: string;
  featureCount: number;
  geometryTypes: string[];
  columns: ColumnStat[];
};

export type ZipLayerStatus = {
  name: string;
  hasShp: boolean;
  hasDbf: boolean;
  hasShx: boolean;
  hasPrj: boolean;
  hasCpg: boolean;
  missingEssential: string[];
};

export type SridCode = 4326 | 5179 | 5186 | 3857;

export type SridOption = {
  code: SridCode;
  name: string;
  description: string;
  proj4: string;
};

export type ZipInspection = {
  layers: ZipLayerStatus[];
  hasValidLayer: boolean;
  hasCpg: boolean;
  hasPrj: boolean;
  detectedEncoding?: EncodingOption;
  detectedSridCode?: SridCode;
  prjText?: string;
};

export type FeatureCollectionGeometry = FeatureCollection<Geometry>;
export type FeatureGeometry = Feature<Geometry>;

export type EncodingOption = "utf-8" | "cp949";
