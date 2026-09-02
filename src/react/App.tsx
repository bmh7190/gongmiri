import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { inspectZipEntries } from "../domain/inspect-zip";
import type {
  EncodingOption,
  FeatureCollectionGeometry,
  ViewerResult,
  ZipInspection,
  FeatureId,
  SridCode,
  ParseMode,
  VisualizationConfig,
  VisualizationSettings,
} from "../domain/types";
import AttributeTable from "../features/attribute-table/AttributeTable";
import DatasetControls from "../features/dataset-controls/DatasetControls";
import DatasetSummary from "../features/dataset-summary/DatasetSummary";
import VisualizationControls from "../features/visualization/VisualizationControls";
import ExportDialog from "../features/export/ExportDialog";
import {
  DownloadDetectionPrompt,
  DownloadDetectionToggle,
  useDownloadDetection,
} from "../features/download-detection/DownloadDetection";
import {
  buildCategoryStops,
  buildNumericStops,
  buildPointSizeStops,
  DEFAULT_POINT_SIZE_RANGE,
} from "../domain/visualization";
import { getSridOption } from "../domain/srid";
import { changeLocale, localeOptions, type AppLocale } from "./i18n";
import { useParserWorker } from "./hooks/use-parser-worker";
import "./styles.css";

const MapViewer = lazy(() => import("../features/map-viewer/MapViewer"));
type ResultPanel = "map" | "quality" | "table";
type AppTheme = "light" | "dark";

const THEME_STORAGE_KEY = "gongmiri.theme";
const COLUMN_QUALITY_PAGE_SIZE = 9;

const getInitialTheme = (): AppTheme => {
  if (typeof window === "undefined") return "light";
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") return savedTheme;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const createDefaultVisualization = (): VisualizationSettings => ({
  colorMode: "default",
  categoryField: null,
  numericField: null,
  numericScale: "quantile",
  pointSizeField: null,
  pointSizeRange: DEFAULT_POINT_SIZE_RANGE,
  cluster: false,
});

export default function App() {
  const { t, i18n } = useTranslation();
  const [theme, setTheme] = useState<AppTheme>(getInitialTheme);
  const downloadDetection = useDownloadDetection();
  const { parse, progress, cancel } = useParserWorker();
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [inspection, setInspection] = useState<ZipInspection | null>(null);
  const [result, setResult] = useState<ViewerResult | null>(null);
  const [collection, setCollection] = useState<FeatureCollectionGeometry | null>(null);
  const [selectedId, setSelectedId] = useState<FeatureId | null>(null);
  const [encoding, setEncoding] = useState<EncodingOption>("utf-8");
  const [sridOverride, setSridOverride] = useState<SridCode | null>(null);
  const [requiresSrid, setRequiresSrid] = useState(false);
  const [parseMode, setParseMode] = useState<ParseMode>("full");
  const [featureStats, setFeatureStats] = useState({ total: 0 });
  const [columnQualityPage, setColumnQualityPage] = useState(1);
  const [activeResultPanel, setActiveResultPanel] = useState<ResultPanel>("map");
  const [visibleTableFields, setVisibleTableFields] = useState<string[]>([]);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const exportTriggerRef = useRef<HTMLButtonElement | null>(null);
  const mapCollection = collection;
  const [visualizationSettings, setVisualizationSettings] =
    useState<VisualizationSettings>(createDefaultVisualization);
  const sourceRef = useRef<{ buffer: ArrayBuffer; fileName: string; fileBytes: number } | null>(null);
  const visualization = useMemo<VisualizationConfig>(() => {
    const categoryStops =
      mapCollection && visualizationSettings.categoryField
        ? buildCategoryStops(mapCollection, visualizationSettings.categoryField)
        : [];
    const numeric =
      mapCollection && visualizationSettings.numericField
        ? buildNumericStops(
            mapCollection,
            visualizationSettings.numericField,
            visualizationSettings.numericScale,
          )
        : { stops: [], domain: null };
    const pointSizeStops =
      mapCollection && visualizationSettings.pointSizeField
        ? buildPointSizeStops(
            mapCollection,
            visualizationSettings.pointSizeField,
            visualizationSettings.pointSizeRange,
          )
        : null;
    return {
      ...visualizationSettings,
      categoryStops,
      numericStops: numeric.stops,
      numericDomain: numeric.domain,
      pointSizeStops,
    };
  }, [mapCollection, visualizationSettings]);
  const hasPoints = useMemo(
    () =>
      mapCollection?.features.some((feature) =>
        feature.geometry?.type === "Point" || feature.geometry?.type === "MultiPoint"
      ) ?? false,
    [mapCollection],
  );
  const columnQualityPageCount = Math.max(
    1,
    Math.ceil((result?.columns.length ?? 0) / COLUMN_QUALITY_PAGE_SIZE),
  );
  const visibleQualityColumns = useMemo(() => {
    const start = (columnQualityPage - 1) * COLUMN_QUALITY_PAGE_SIZE;
    return result?.columns.slice(start, start + COLUMN_QUALITY_PAGE_SIZE) ?? [];
  }, [columnQualityPage, result]);
  const sourceSrid = sridOverride ?? inspection?.detectedSridCode ?? null;
  const sourceProjection = useMemo(() => {
    if (sourceSrid === 4326) return null;
    if (sourceSrid) {
      return getSridOption(sourceSrid)?.proj4 ?? inspection?.prjText ?? null;
    }
    return inspection?.prjText ?? null;
  }, [inspection?.prjText, sourceSrid]);
  const sourceProjectionLabel = sourceProjection
    ? sourceSrid
      ? `EPSG:${sourceSrid}`
      : t("dataset.fileProjection")
    : sourceSrid === 4326
      ? t("export.sourceSameAsWgs84")
      : t("export.sourceUnavailable");
  const hasActivity = Boolean(
    inspection || result || progress || error || requiresSrid || isLoading,
  );
  const showDropZone = !hasActivity || Boolean(error);

  const handleVisibleTableFields = useCallback((nextFields: string[]) => {
    setVisibleTableFields((current) => (
      current.length === nextFields.length
      && current.every((field, index) => field === nextFields[index])
        ? current
        : nextFields
    ));
  }, []);

  const handleOpenExport = useCallback((trigger: HTMLButtonElement) => {
    exportTriggerRef.current = trigger;
    setIsExportOpen(true);
  }, []);

  const handleCloseExport = useCallback(() => {
    setIsExportOpen(false);
    window.requestAnimationFrame(() => exportTriggerRef.current?.focus());
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      window.dispatchEvent(new Event("resize"));
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeResultPanel]);

  useEffect(() => {
    if (!mapCollection) return;
    const selectedIsVisible = mapCollection.features.some(
      (feature) => String(feature.id) === selectedId,
    );
    if (!selectedIsVisible) {
      setSelectedId(mapCollection.features[0]?.id?.toString() ?? null);
    }
  }, [mapCollection, selectedId]);

  const runParse = useCallback(
    async (
      buffer: ArrayBuffer,
      fileName: string,
      nextEncoding: EncodingOption,
      nextSrid: SridCode | null,
      nextMode: ParseMode,
      nextFileBytes: number,
      allowAutoQuick = false,
    ) => {
      setIsLoading(true);
      setError("");
      setCollection(null);
      setResult(null);
      setSelectedId(null);
      setColumnQualityPage(1);
      try {
        const parsed = await parse(
          buffer,
          nextEncoding,
          nextSrid,
          nextMode,
          fileName,
          nextFileBytes,
          allowAutoQuick,
        );
        setFeatureStats({ total: parsed.totalFeatures });
        setParseMode(parsed.mode);
        setCollection(parsed.collection);
        setSelectedId(parsed.collection.features[0]?.id?.toString() ?? null);
        setResult(parsed.result);
      } catch (parseError) {
        if (parseError instanceof Error && parseError.name === "AbortError") return;
        setError(
          parseError instanceof Error && parseError.message === "noShpLayer"
            ? t("error.noShpLayer")
            : t("error.workerFailed"),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [parse, t],
  );

  const processFile = useCallback(
    async (file: File) => {
      if (!/\.zip$/i.test(file.name)) {
        setError(t("error.zipOnly"));
        return;
      }

      setIsLoading(true);
      setError("");
      setInspection(null);
      setResult(null);
      setCollection(null);
      setSelectedId(null);
      setSridOverride(null);
      setRequiresSrid(false);
      setFeatureStats({ total: 0 });
      setColumnQualityPage(1);
      setActiveResultPanel("map");
      setVisibleTableFields([]);
      setIsExportOpen(false);
      setVisualizationSettings(createDefaultVisualization());
      sourceRef.current = null;

      try {
        const buffer = await file.arrayBuffer();
        const nextInspection = await inspectZipEntries(buffer);
        setInspection(nextInspection);
        if (!nextInspection.hasValidLayer) {
          const details = nextInspection.layers.length
            ? nextInspection.layers
                .map((layer) => `${layer.name}: ${layer.missingEssential.join(", ")}`)
                .join("; ")
            : t("error.noShapefileEntries");
          setError(t("error.essentialFilesMissing", { details }));
          return;
        }

        const encoding: EncodingOption =
          nextInspection.detectedEncoding ?? "utf-8";
        const nextMode: ParseMode = "full";
        setEncoding(encoding);
        setParseMode(nextMode);
        sourceRef.current = { buffer, fileName: file.name, fileBytes: file.size };
        if (!nextInspection.hasPrj) {
          setRequiresSrid(true);
          return;
        }
        await runParse(buffer, file.name, encoding, null, nextMode, file.size, true);
      } catch {
        setError(t("error.zipReadFailed"));
      } finally {
        setIsLoading(false);
      }
    },
    [runParse, t],
  );

  const handleEncodingChange = (nextEncoding: EncodingOption) => {
    setEncoding(nextEncoding);
    const source = sourceRef.current;
    if (source && !requiresSrid) {
      void runParse(source.buffer, source.fileName, nextEncoding, sridOverride, parseMode, source.fileBytes);
    }
  };

  const handleSridChange = (nextSrid: SridCode | null) => {
    if (nextSrid === null && !inspection?.hasPrj) return;
    setSridOverride(nextSrid);
    setRequiresSrid(false);
    const source = sourceRef.current;
    if (source) {
      void runParse(
        source.buffer,
        source.fileName,
        encoding,
        nextSrid,
        parseMode,
        source.fileBytes,
        !result,
      );
    }
  };

  const handleParseModeChange = (nextMode: ParseMode) => {
    if (nextMode === parseMode) return;
    setParseMode(nextMode);
    const source = sourceRef.current;
    if (source && !requiresSrid) {
      void runParse(source.buffer, source.fileName, encoding, sridOverride, nextMode, source.fileBytes);
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void processFile(file);
    event.target.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    if (isLoading) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  };

  const handleCancel = () => {
    cancel();
    setIsLoading(false);
    setError(t("error.cancelled"));
  };

  const handleRetry = () => {
    const source = sourceRef.current;
    if (!source || requiresSrid) return;
    void runParse(
      source.buffer,
      source.fileName,
      encoding,
      sridOverride,
      parseMode,
      source.fileBytes,
    );
  };

  const handleResultTabKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    panel: ResultPanel,
  ) => {
    const panels: ResultPanel[] = ["map", "quality", "table"];
    const currentIndex = panels.indexOf(panel);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % panels.length;
    if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + panels.length) % panels.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = panels.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const nextPanel = panels[nextIndex]!;
    setActiveResultPanel(nextPanel);
    document.getElementById(`result-tab-${nextPanel}`)?.focus();
  };

  return (
    <main className="react-app">
      <a className="react-skip-link" href="#viewer-content">
        {t("common.skipToContent")}
      </a>
      <header
        className={`react-header${inspection?.hasValidLayer ? " has-dataset-controls" : ""}`}
      >
        <div>
          <p className="react-eyebrow">
            {t("app.name")} · {t("app.tagline")}
          </p>
          <h1>{t("app.title")}</h1>
        </div>
        <div className="react-header__actions">
          {inspection?.hasValidLayer && (
            <DatasetControls
              inspection={inspection}
              encoding={encoding}
              sridOverride={sridOverride}
              requiresSrid={requiresSrid}
              disabled={isLoading}
              parseMode={parseMode}
              onEncodingChange={handleEncodingChange}
              onSridChange={handleSridChange}
              onParseModeChange={handleParseModeChange}
            />
          )}
          <div className="react-header__preferences">
            <DownloadDetectionToggle detection={downloadDetection} />
            <button
              type="button"
              className="react-icon-button react-theme-toggle"
              aria-label={t(theme === "light" ? "app.switchToDark" : "app.switchToLight")}
              title={t(theme === "light" ? "app.switchToDark" : "app.switchToLight")}
              onClick={() => setTheme((current) => current === "light" ? "dark" : "light")}
            >
              {theme === "light" ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M20.4 15.3A8.5 8.5 0 0 1 8.7 3.6 8.5 8.5 0 1 0 20.4 15.3Z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
                </svg>
              )}
            </button>
            <label className="react-language">
              <span>{t("app.language")}</span>
              <select
                value={i18n.language}
                onChange={(event) =>
                  void changeLocale(event.target.value as AppLocale)
                }
              >
                {localeOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </header>

      <DownloadDetectionPrompt detection={downloadDetection} />

      {result && inspection && (
        <DatasetSummary
          inspection={inspection}
          featureCount={featureStats.total || result.featureCount}
          geometryTypes={result.geometryTypes}
        />
      )}

      <section
        id="viewer-content"
        tabIndex={-1}
        className={`react-grid${hasActivity ? "" : " is-empty"}${showDropZone ? "" : " is-viewer"}`}
      >
        {showDropZone && (
          <label
            className={`react-drop-zone${isDragging ? " is-dragging" : ""}${isLoading ? " is-loading" : ""}`}
            aria-disabled={isLoading}
            onDragEnter={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept=".zip,application/zip"
              disabled={isLoading}
              onChange={handleInput}
            />
            <strong>{t("upload.dropZip")}</strong>
            <span>{t("upload.chooseFile")}</span>
            {!hasActivity && <small>{t("upload.localOnly")}</small>}
          </label>
        )}

        <div
          className={`react-status${result ? " has-result" : ""}`}
          aria-busy={isLoading}
        >
          {progress && (
            <div className="react-progress" role="status" aria-live="polite" aria-atomic="true">
              <div>
                <strong>
                  {t(`progress.${progress.code}`, {
                    current: progress.currentLayer,
                    total: progress.totalLayers,
                  })}
                </strong>
                <span>{progress.percent}%</span>
              </div>
              <progress max="100" value={progress.percent} />
              <div className="react-progress__actions">
                <button type="button" onClick={handleCancel}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          )}
          {error && (
            <div className="react-error" role="alert">
              <p>{error}</p>
              {sourceRef.current && !requiresSrid && (
                <button type="button" disabled={isLoading} onClick={handleRetry}>
                  {t("common.retry")}
                </button>
              )}
            </div>
          )}
          {!error && !result && !progress && !requiresSrid && inspection && (
            <div>
              <h2>{t("empty.title")}</h2>
              <p>{t("empty.description")}</p>
            </div>
          )}
          {result && (
            <div className="react-summary">
              <div className="react-result-tabs" role="tablist" aria-label={t("tabs.label")}>
                {(["map", "quality", "table"] as const).map((panel) => (
                  <button
                    key={panel}
                    id={`result-tab-${panel}`}
                    type="button"
                    role="tab"
                    aria-selected={activeResultPanel === panel}
                    aria-controls={`result-panel-${panel}`}
                    tabIndex={activeResultPanel === panel ? 0 : -1}
                    onClick={() => setActiveResultPanel(panel)}
                    onKeyDown={(event) => handleResultTabKeyDown(event, panel)}
                  >
                    {t(`tabs.${panel}`)}
                  </button>
                ))}
              </div>
              <section
                id="result-panel-map"
                className={`react-result-panel${activeResultPanel === "map" ? " is-mobile-active" : ""}`}
                role="tabpanel"
                aria-labelledby="result-tab-map"
              >
                <Suspense fallback={<div className="react-map-loading">{t("map.loading")}</div>}>
                  <MapViewer
                    collection={mapCollection}
                    selectedId={selectedId}
                    onSelect={setSelectedId}
                    visualization={visualization}
                    toolbar={(
                      <VisualizationControls
                        columns={result.columns}
                        settings={visualizationSettings}
                        hasPoints={hasPoints}
                        onChange={(change) =>
                          setVisualizationSettings((current) => ({ ...current, ...change }))
                        }
                      />
                    )}
                  />
                </Suspense>
              </section>
              <section
                id="result-panel-quality"
                className={`react-result-panel${activeResultPanel === "quality" ? " is-mobile-active" : ""}`}
                role="tabpanel"
                aria-labelledby="result-tab-quality"
              >
                <h2>{t("summary.columnQuality")}</h2>
                <div className="react-columns">
                  {visibleQualityColumns.map((column) => (
                  <article key={column.name}>
                    <div>
                      <strong>{column.name || t("summary.unnamed")}</strong>
                      <span>{column.dataType}</span>
                    </div>
                    <progress max="100" value={column.fillRate} />
                    <small>
                      {column.fillRate.toLocaleString(i18n.language, {
                        minimumFractionDigits: 1,
                        maximumFractionDigits: 1,
                      })}% {t("summary.filled")}
                    </small>
                    <div className="react-column-meta">
                      <span>
                        {t("summary.emptyCount", {
                          count: column.empty.toLocaleString(i18n.language),
                        })}
                      </span>
                      <span>
                        {column.uniqueCount === null
                          ? t("summary.uniqueOverflow")
                          : t("summary.uniqueCount", {
                              count: column.uniqueCount.toLocaleString(i18n.language),
                            })}
                      </span>
                    </div>
                  </article>
                  ))}
                </div>
                {visibleQualityColumns.length === 0 && (
                  <p className="react-columns-empty">{t("summary.noColumns")}</p>
                )}
                {columnQualityPageCount > 1 && (
                  <nav className="react-columns-pagination" aria-label={t("summary.pagination")}>
                    <button
                      type="button"
                      disabled={columnQualityPage === 1}
                      onClick={() => setColumnQualityPage((current) => Math.max(1, current - 1))}
                    >
                      {t("summary.previousPage")}
                    </button>
                    <span aria-live="polite">
                      {t("summary.pageStatus", {
                        current: columnQualityPage,
                        total: columnQualityPageCount,
                      })}
                    </span>
                    <button
                      type="button"
                      disabled={columnQualityPage === columnQualityPageCount}
                      onClick={() => setColumnQualityPage((current) => (
                        Math.min(columnQualityPageCount, current + 1)
                      ))}
                    >
                      {t("summary.nextPage")}
                    </button>
                  </nav>
                )}
              </section>
              <section
                id="result-panel-table"
                className={`react-result-panel${activeResultPanel === "table" ? " is-mobile-active" : ""}`}
                role="tabpanel"
                aria-labelledby="result-tab-table"
              >
                {collection && (
                  <>
                    <AttributeTable
                      collection={collection}
                      columns={result.columns}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onVisibleColumnOrderChange={handleVisibleTableFields}
                      onExport={handleOpenExport}
                      exportOpen={isExportOpen}
                    />
                  </>
                )}
              </section>
            </div>
          )}
          {inspection && !inspection.hasValidLayer && (
            <ul>
              {inspection.layers.map((layer) => (
                <li key={layer.name}>
                  {layer.name}: {layer.missingEssential.join(", ")}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
      {isExportOpen && collection && result && (
        <ExportDialog
          collection={collection}
          fileName={result.fileName}
          parseMode={parseMode}
          sourceProjection={sourceProjection}
          sourceProjectionLabel={sourceProjectionLabel}
          defaultFields={visibleTableFields}
          onClose={handleCloseExport}
        />
      )}
    </main>
  );
}
