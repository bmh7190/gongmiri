import type {
  EncodingOption,
  ParseMode,
  ParsedDataset,
  SridCode,
} from "./types";

export type ParseRequest = {
  id: number;
  buffer: ArrayBuffer;
  encoding: EncodingOption;
  srid: SridCode | null;
  mode: ParseMode;
  fileName: string;
  fileBytes: number;
  allowAutoQuick: boolean;
};

export type ParseSuccess = {
  id: number;
  status: "success";
  dataset: ParsedDataset;
};

export type ParseErrorCode = "noShpLayer" | "parseFailed";

export type ParseProgressCode =
  | "unzipping"
  | "buildingLayers"
  | "parsingGeometry"
  | "reprojecting"
  | "parsingAttributes"
  | "layerComplete"
  | "normalizing"
  | "summarizing"
  | "rendering";

export type ParseError = {
  id: number;
  status: "error";
  code: ParseErrorCode;
};

export type ParseProgressMessage = {
  id: number;
  status: "progress";
  code: ParseProgressCode;
  percent: number;
  currentLayer?: number;
  totalLayers?: number;
};

export type ParserWorkerMessage =
  | ParseSuccess
  | ParseError
  | ParseProgressMessage;
