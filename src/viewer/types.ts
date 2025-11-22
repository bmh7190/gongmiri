import type { Feature, FeatureCollection, Geometry } from "geojson";

export type FeatureId = string;

export type ColumnDataType =
  | "string"
  | "number"
  | "boolean"
  | "mixed"
  | "null"
  | "other";

export type NumericSummary = {
  min: number;
  max: number;
  mean: number;
};

export type ColumnStat = {
  name: string;
  filled: number;
  empty: number;
  fillRate: number;
  samples: string[];
  dataType: ColumnDataType;
  uniqueCount: number | null;
  uniqueRatio: number | null;
  numericSummary: NumericSummary | null;
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
  hasQix: boolean;
  hasSbn: boolean;
  hasSbx: boolean;
  missingEssential: string[];
};

export type SridCode =
  | 4326
  | 3857
  | 2098
  | 5174
  | 5175
  | 5176
  | 5179
  | 5181
  | 5183
  | 5186;

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

export type EncodingOption = "utf-8" | "cp949" | "euc-kr";

export type ParseMode = "full" | "quick";

export type VisualizationColorMode = "default" | "category" | "continuous";
export type VisualizationNumericScale = "quantile" | "equal";

export type CategoryStop = {
  value: string;
  color: string;
  count: number;
  ratio: number;
  isOther?: boolean;
};

export type NumericStop = {
  value: number;
  color: string;
};

export type SizeStop = {
  value: number;
  radius: number;
};

export type VisualizationSettings = {
  colorMode: VisualizationColorMode;
  categoryField: string | null;
  numericField: string | null;
  numericScale: VisualizationNumericScale;
  pointSizeField: string | null;
  pointSizeRange: [number, number];
  cluster: boolean;
};

export type VisualizationConfig = VisualizationSettings & {
  categoryStops: CategoryStop[];
  numericStops: NumericStop[];
  numericDomain: [number, number] | null;
  pointSizeStops: SizeStop[] | null;
};

export type NumericLegendEntry = {
  color: string;
  label: string;
};

export type SizeLegend = {
  field: string;
  min: SizeStop;
  max: SizeStop;
} | null;

export type ParseProgress = {
  label: string;
  percent: number;
};

export type LargeDatasetState = {
  fileBytes: number;
  featureCount: number;
  isLargeFile: boolean;
  isLargeFeature: boolean;
};
