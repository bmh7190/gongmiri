import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  FeatureCollectionGeometry,
  FeatureId,
  ParseMode,
} from "../../domain/types";
import { selectExportCollection } from "../../domain/export-data";
import type { ExportFormat } from "../../domain/export-protocol";
import { useExportWorker } from "./use-export-worker";
import "./export-dialog.css";

type ExportScope = "all" | "selected" | "filtered";

type ExportDialogProps = {
  collection: FeatureCollectionGeometry;
  selectedId: FeatureId | null;
  filteredIds: FeatureId[];
  fileName: string;
  parseMode: ParseMode;
  sourceProjection: string | null;
  sourceProjectionLabel: string;
  defaultFields: string[];
  onClose: () => void;
  initialFormat?: ExportFormat;
};

const downloadBytes = (content: ArrayBuffer, fileName: string, mime: string) => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
};

export default function ExportDialog({
  collection,
  selectedId,
  filteredIds,
  fileName,
  parseMode,
  sourceProjection,
  sourceProjectionLabel,
  defaultFields,
  onClose,
  initialFormat = "csv",
}: ExportDialogProps) {
  const { t, i18n } = useTranslation();
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const { exportData, isExporting, cancelExport } = useExportWorker();
  const [format, setFormat] = useState<ExportFormat>(initialFormat);
  const [scope, setScope] = useState<ExportScope>("all");
  const [coordinateTarget, setCoordinateTarget] = useState<"wgs84" | "source">("wgs84");
  const [fieldQuery, setFieldQuery] = useState("");
  const [exportError, setExportError] = useState(false);
  const allFields = useMemo(() => Array.from(new Set(
    collection.features.flatMap((feature) => Object.keys(feature.properties ?? {})),
  )), [collection]);
  const orderedFields = useMemo(() => {
    const available = new Set(allFields);
    const preferred = defaultFields.filter((field) => available.has(field));
    const preferredSet = new Set(preferred);
    return [
      ...preferred,
      ...allFields.filter((field) => !preferredSet.has(field)).sort(),
    ];
  }, [allFields, defaultFields]);
  const [selectedFields, setSelectedFields] = useState<string[]>(() => {
    const visible = defaultFields.filter((field) => allFields.includes(field));
    return visible.length ? visible : allFields;
  });
  const visibleFieldOptions = useMemo(() => {
    const normalized = fieldQuery.trim().toLocaleLowerCase(i18n.language);
    if (!normalized) return orderedFields;
    return orderedFields.filter((field) =>
      field.toLocaleLowerCase(i18n.language).includes(normalized)
    );
  }, [fieldQuery, i18n.language, orderedFields]);
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
  const outputFileName = `${baseName}-${scope}.${format}`;
  const disabled = scoped.features.length === 0 || selectedFields.length === 0;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  const requestClose = () => {
    if (isExporting) cancelExport();
    onClose();
  };

  const handleBackdropMouseDown = (event: MouseEvent<HTMLDialogElement>) => {
    if (event.target === event.currentTarget) requestClose();
  };

  const saveExport = async () => {
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
        outputFileName,
        format === "geojson"
          ? "application/geo+json;charset=utf-8"
          : "text/csv;charset=utf-8",
      );
      onClose();
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setExportError(true);
    }
  };

  const toggleField = (field: string, checked: boolean) => {
    setSelectedFields((current) => checked
      ? orderedFields.filter((item) => item === field || current.includes(item))
      : current.filter((item) => item !== field));
  };

  return (
    <dialog
      ref={dialogRef}
      className="react-export-dialog"
      aria-labelledby="export-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onMouseDown={handleBackdropMouseDown}
    >
      <div className="react-export-dialog__shell">
        <header className="react-export-dialog__header">
          <div>
            <h2 id="export-dialog-title">{t("export.title")}</h2>
            <p>{t("export.count", { count: scoped.features.length.toLocaleString(i18n.language) })}</p>
          </div>
          <button
            type="button"
            className="react-export-dialog__close"
            aria-label={t("export.close")}
            onClick={requestClose}
          >
            ×
          </button>
        </header>

        <div className="react-export-dialog__body">
          <div className="react-export-dialog__format" role="group" aria-label={t("export.format") }>
            {(["csv", "geojson"] as const).map((nextFormat) => (
              <button
                key={nextFormat}
                type="button"
                aria-pressed={format === nextFormat}
                onClick={() => {
                  setFormat(nextFormat);
                  setExportError(false);
                }}
              >
                {nextFormat === "csv" ? "CSV" : "GeoJSON"}
              </button>
            ))}
          </div>

          <p className="react-export-dialog__description">
            {t(format === "csv" ? "export.csvDescription" : "export.geojsonDescription")}
          </p>

          <label className="react-export-dialog__setting">
            <span>{t("export.scope")}</span>
            <select value={scope} onChange={(event) => setScope(event.target.value as ExportScope)}>
              <option value="all">{t("export.all")}</option>
              <option value="selected" disabled={!selectedId}>{t("export.selected")}</option>
              <option value="filtered">{t("export.filtered")}</option>
            </select>
          </label>

          {format === "geojson" ? (
            <label className="react-export-dialog__setting">
              <span>{t("export.coordinates")}</span>
              <select
                value={coordinateTarget}
                onChange={(event) => setCoordinateTarget(event.target.value as "wgs84" | "source")}
              >
                <option value="wgs84">WGS84 · EPSG:4326</option>
                <option value="source" disabled={!sourceProjection}>{sourceProjectionLabel}</option>
              </select>
            </label>
          ) : (
            <div className="react-export-dialog__format-note">
              <strong>{t("export.csvSettings")}</strong>
              <span>{t("export.csvSettingsDescription")}</span>
            </div>
          )}

          <section className="react-export-dialog__fields" aria-labelledby="export-fields-title">
            <div className="react-export-dialog__fields-header">
              <div>
                <strong id="export-fields-title">{t("export.fieldsTitle")}</strong>
                <span>{t("export.fields", { selected: selectedFields.length, total: allFields.length })}</span>
              </div>
              <div>
                <button type="button" onClick={() => setSelectedFields(orderedFields)}>
                  {t("export.selectAllFields")}
                </button>
                <button type="button" onClick={() => setSelectedFields([])}>
                  {t("export.clearFields")}
                </button>
              </div>
            </div>
            <input
              type="search"
              value={fieldQuery}
              aria-label={t("export.searchFields")}
              placeholder={t("export.searchFieldsPlaceholder")}
              onChange={(event) => setFieldQuery(event.target.value)}
            />
            <div className="react-export-dialog__field-list">
              {visibleFieldOptions.map((field) => (
                <label key={field}>
                  <input
                    type="checkbox"
                    checked={selectedFields.includes(field)}
                    onChange={(event) => toggleField(field, event.target.checked)}
                  />
                  <span title={field}>{field}</span>
                </label>
              ))}
              {visibleFieldOptions.length === 0 && <p>{t("export.noMatchingFields")}</p>}
            </div>
          </section>

          {parseMode === "quick" && (
            <p className="react-export-dialog__warning">{t("export.quickWarning")}</p>
          )}
          {selectedFields.length === 0 && (
            <p className="react-export-dialog__warning">{t("export.chooseFields")}</p>
          )}
          {exportError && (
            <p className="react-export-dialog__error" role="alert">{t("export.failed")}</p>
          )}
        </div>

        <footer className="react-export-dialog__footer">
          <div>
            <span>{t("export.fileName")}</span>
            <strong title={outputFileName}>{outputFileName}</strong>
          </div>
          <div>
            <button type="button" onClick={requestClose}>{t("common.cancel")}</button>
            <button
              type="button"
              className="is-primary"
              disabled={disabled || isExporting}
              onClick={() => void saveExport()}
            >
              {isExporting
                ? t("export.preparing")
                : t(format === "csv" ? "export.csv" : "export.geojson")}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}
