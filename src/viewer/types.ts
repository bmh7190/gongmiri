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

export type ZipInspection = {
  layers: ZipLayerStatus[];
  hasValidLayer: boolean;
};

export type FeatureCollectionGeometry = FeatureCollection<Geometry>;
export type FeatureGeometry = Feature<Geometry>;
