import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  FeatureCollectionGeometry,
  FeatureId,
  ParseMode,
} from "../../domain/types";
import { selectExportCollection } from "../../domain/export-data";
import type { ExportFormat } from "../../domain/export-protocol";
import { useExportWorker } from "./use-export-worker";
import "./export-controls.css";

type ExportScope = "all" | "selected" | "filtered";

type ExportControlsProps = {
  collection: FeatureCollectionGeometry;
  selectedId: FeatureId | null;
  filteredIds: FeatureId[];
  fileName: string;
  parseMode: ParseMode;
  sourceProjection: string | null;
  sourceProjectionLabel: string;
};

const downloadBytes = (content: ArrayBuffer, fileName: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default function ExportControls({
  collection,
  selectedId,
  filteredIds,
  fileName,
  parseMode,
  sourceProjection,
  sourceProjectionLabel,
}: ExportControlsProps) {
  const { t, i18n } = useTranslation();
  const { exportData, isExporting, cancelExport } = useExportWorker();
  const [scope, setScope] = useState<ExportScope>("all");
  const [coordinateTarget, setCoordinateTarget] = useState<"wgs84" | "source">("wgs84");
  const [exportError, setExportError] = useState(false);
  const allFields = useMemo(() => Array.from(new Set(
    collection.features.flatMap((feature) => Object.keys(feature.properties ?? {})),
  )).sort(), [collection]);
  const [selectedFields, setSelectedFields] = useState<string[]>(allFields);

  useEffect(() => {
    setSelectedFields(allFields);
    setCoordinateTarget("wgs84");
    setExportError(false);
  }, [allFields, fileName]);

  const scoped = useMemo(() => {
    if (scope === "selected") {
      return selectExportCollection(collection, selectedId ? [selectedId] : []);
    }
    if (scope === "filtered") {
      return selectExportCollection(collection, filteredIds);
    }
    return collection;
  }, [collection, filteredIds, scope, selectedId]);
  const baseName = fileName.replace(/\.zip$/i, "") || "gongmiri";
  const disabled = scoped.features.length === 0;

  const saveExport = async (format: ExportFormat) => {
    setExportError(false);
    try {
      const buffer = await exportData({
        collection: scoped,
        fields: selectedFields,
        targetProjection: format === "geojson" && coordinateTarget === "source"
          ? sourceProjection
          : null,
        format,
      });
      downloadBytes(
        buffer,
        `${baseName}-${scope}.${format}`,
        format === "geojson"
          ? "application/geo+json;charset=utf-8"
          : "text/csv;charset=utf-8",
      );
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setExportError(true);
    }
  };

  return (
    <section className="react-export" aria-labelledby="export-title">
      <div>
        <h2 id="export-title">{t("export.title")}</h2>
        <p>
          {t("export.count", {
            count: scoped.features.length.toLocaleString(i18n.language),
          })}
        </p>
      </div>
      <label>
        <span>{t("export.scope")}</span>
        <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
          <option value="all">{t("export.all")}</option>
          <option value="selected" disabled={!selectedId}>{t("export.selected")}</option>
          <option value="filtered">{t("export.filtered")}</option>
        </select>
      </label>
      <label>
        <span>{t("export.coordinates")}</span>
        <select
          value={coordinateTarget}
          onChange={(event) => setCoordinateTarget(event.target.value as "wgs84" | "source")}
        >
          <option value="wgs84">WGS84 · EPSG:4326</option>
          <option value="source" disabled={!sourceProjection}>{sourceProjectionLabel}</option>
        </select>
      </label>
      <div className="react-export__actions">
        <button
          type="button"
          disabled={disabled || isExporting}
          onClick={() => void saveExport("geojson")}
        >
          {t("export.geojson")}
        </button>
        <button
          type="button"
          disabled={disabled || isExporting}
          onClick={() => void saveExport("csv")}
        >
          {t("export.csv")}
        </button>
      </div>
      <details className="react-export__fields">
        <summary>{t("export.fields", { selected: selectedFields.length, total: allFields.length })}</summary>
        <div>
          {allFields.map((field) => (
            <label key={field}>
              <input
                type="checkbox"
                checked={selectedFields.includes(field)}
                onChange={(event) => setSelectedFields((current) =>
                  event.target.checked
                    ? [...current, field]
                    : current.filter((item) => item !== field),
                )}
              />
              <span>{field}</span>
            </label>
          ))}
        </div>
      </details>
      {isExporting && (
        <div className="react-export__progress" role="status" aria-live="polite">
          <span>{t("export.preparing")}</span>
          <button type="button" onClick={cancelExport}>{t("common.cancel")}</button>
        </div>
      )}
      {parseMode === "quick" && (
        <p className="react-export__warning">{t("export.quickWarning")}</p>
      )}
      {exportError && (
        <p className="react-export__error" role="alert">{t("export.failed")}</p>
      )}
    </section>
  );
}
