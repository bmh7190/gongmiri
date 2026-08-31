import { parseDbf } from "shpjs";
import { parseEncodingLabel } from "./inspect-zip";
import type { EncodingOption } from "./types";

const textEncoder = new TextEncoder();

export const resolveDbfEncoding = (
  cpg: string | undefined,
  fallback: EncodingOption,
): EncodingOption => (cpg ? parseEncodingLabel(cpg) : undefined) ?? fallback;

export const getDbfDecoderLabel = (
  encoding: EncodingOption,
): "utf-8" | "euc-kr" => encoding === "utf-8" ? "utf-8" : "euc-kr";

export const parseDbfProperties = (
  buffer: ArrayBuffer,
  cpg: string | undefined,
  fallback: EncodingOption,
): GeoJSON.GeoJsonProperties[] => {
  const encoding = resolveDbfEncoding(cpg, fallback);
  const decoderLabel = getDbfDecoderLabel(encoding);
  return parseDbf(buffer, textEncoder.encode(decoderLabel));
};
