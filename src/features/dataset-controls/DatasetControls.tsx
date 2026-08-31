import { useTranslation } from "react-i18next";
import type {
  EncodingOption,
  ParseMode,
  SridCode,
  ZipInspection,
} from "../../domain/types";
import { SRID_OPTIONS } from "../../domain/srid";
import "./dataset-controls.css";

type DatasetControlsProps = {
  inspection: ZipInspection;
  encoding: EncodingOption;
  sridOverride: SridCode | null;
  requiresSrid: boolean;
  disabled: boolean;
  parseMode: ParseMode;
  totalFeatures: number;
  displayedFeatures: number;
  onEncodingChange: (encoding: EncodingOption) => void;
  onSridChange: (srid: SridCode | null) => void;
  onParseModeChange: (mode: ParseMode) => void;
};

export default function DatasetControls({
  inspection,
  encoding,
  sridOverride,
  requiresSrid,
  disabled,
  parseMode,
  totalFeatures,
  displayedFeatures,
  onEncodingChange,
  onSridChange,
  onParseModeChange,
}: DatasetControlsProps) {
  const { t, i18n } = useTranslation();

  return (
    <div
      className={`dataset-controls${requiresSrid ? " requires-srid" : ""}`}
      aria-label={t("dataset.settings")}
    >
      <fieldset className="dataset-controls__mode">
          <legend>{t("dataset.analysisMode")}</legend>
          <button
            type="button"
            className={parseMode === "quick" ? "is-active" : ""}
            aria-pressed={parseMode === "quick"}
            disabled={disabled}
            onClick={() => onParseModeChange("quick")}
          >
            Quick
          </button>
          <button
            type="button"
            className={parseMode === "full" ? "is-active" : ""}
            aria-pressed={parseMode === "full"}
            disabled={disabled}
            onClick={() => onParseModeChange("full")}
          >
            Full
          </button>
          {totalFeatures > 0 && (
            <small>
              {t("dataset.featureDisplay", {
                displayed: displayedFeatures.toLocaleString(i18n.language),
                total: totalFeatures.toLocaleString(i18n.language),
              })}
            </small>
          )}
      </fieldset>
      <label>
          <span>{t("dataset.encoding")}</span>
          <select
            value={encoding}
            disabled={disabled}
            onChange={(event) =>
              onEncodingChange(event.target.value as EncodingOption)
            }
          >
            <option value="utf-8">UTF-8</option>
            <option value="cp949">CP949</option>
            <option value="euc-kr">EUC-KR</option>
          </select>
      </label>
      <label>
          <span>{t("dataset.coordinateSystem")}</span>
          <select
            value={sridOverride ?? "file"}
            disabled={disabled}
            aria-invalid={requiresSrid}
            onChange={(event) => {
              const value = event.target.value;
              onSridChange(value === "file" ? null : Number(value) as SridCode);
            }}
          >
            {inspection.hasPrj && (
              <option value="file">
                {inspection.detectedSridCode
                  ? `PRJ · EPSG:${inspection.detectedSridCode}`
                  : t("dataset.fileProjection")}
              </option>
            )}
            {!inspection.hasPrj && (
              <option value="file" disabled>
                {t("dataset.chooseSrid")}
              </option>
            )}
            {SRID_OPTIONS.map((option) => (
              <option key={option.code} value={option.code}>
                EPSG:{option.code} · {option.name}
              </option>
            ))}
          </select>
      </label>
    </div>
  );
}
