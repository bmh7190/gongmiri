import { useTranslation } from "react-i18next";
import type {
  ColumnStat,
  VisualizationSettings,
} from "../../domain/types";
import "./visualization-controls.css";

type VisualizationControlsProps = {
  columns: ColumnStat[];
  settings: VisualizationSettings;
  hasPoints: boolean;
  onChange: (change: Partial<VisualizationSettings>) => void;
};

export default function VisualizationControls({
  columns,
  settings,
  hasPoints,
  onChange,
}: VisualizationControlsProps) {
  const { t } = useTranslation();
  const numericColumns = columns.filter((column) => column.dataType === "number");
  const hasNumericColumns = numericColumns.length > 0;
  const viewModes = ["default", "category", "continuous"] as const;

  return (
    <section className="visualization-controls" aria-label={t("visualization.mode")}>
      <div className="visualization-controls__body">
        <fieldset
          className="visualization-controls__group visualization-controls__mode-group"
          aria-label={t("visualization.mode")}
        >
          <div className="visualization-controls__modes">
            {viewModes.map((mode) => (
              <button
                key={mode}
                type="button"
                className={settings.colorMode === mode ? "is-active" : ""}
                aria-pressed={settings.colorMode === mode}
                disabled={mode === "continuous" && !hasNumericColumns}
                title={mode === "continuous" && !hasNumericColumns
                  ? t("visualization.requiresNumeric")
                  : undefined}
                onClick={() => onChange({ colorMode: mode })}
              >
                <span className={`visualization-controls__swatch is-${mode}`} aria-hidden="true">
                  {mode === "category" && <><i /><i /><i /></>}
                </span>
                {t(`visualization.${mode}`)}
              </button>
            ))}
          </div>
        </fieldset>

        {settings.colorMode === "category" && (
          <div className="visualization-controls__field">
            <select
              aria-label={t("visualization.field")}
              value={settings.categoryField ?? ""}
              onChange={(event) => onChange({ categoryField: event.target.value || null })}
            >
              <option value="">{t("visualization.chooseField")}</option>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>{column.name}</option>
              ))}
            </select>
          </div>
        )}
        {settings.colorMode === "continuous" && (
          <div className="visualization-controls__conditional">
            <label className="visualization-controls__field">
              <select
                aria-label={t("visualization.numericField")}
                value={settings.numericField ?? ""}
                onChange={(event) => onChange({ numericField: event.target.value || null })}
              >
                <option value="">{t("visualization.chooseField")}</option>
                {numericColumns.map((column) => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
              </select>
            </label>
            <label className="visualization-controls__field">
              <select
                aria-label={t("visualization.scale")}
                value={settings.numericScale}
                onChange={(event) =>
                  onChange({
                    numericScale: event.target.value as VisualizationSettings["numericScale"],
                  })
                }
              >
                <option value="quantile">{t("visualization.quantile")}</option>
                <option value="equal">{t("visualization.equal")}</option>
              </select>
            </label>
          </div>
        )}

        {hasPoints && (
          <fieldset className="visualization-controls__group visualization-controls__point-group">
            <legend>{t("visualization.pointOptions")}</legend>
            <div className="visualization-controls__point-fields">
              {hasNumericColumns && (
                <label className="visualization-controls__field">
                  <span>{t("visualization.pointSize")}</span>
                  <select
                    value={settings.pointSizeField ?? ""}
                    onChange={(event) => onChange({ pointSizeField: event.target.value || null })}
                  >
                    <option value="">{t("visualization.defaultSize")}</option>
                    {numericColumns.map((column) => (
                      <option key={column.name} value={column.name}>{column.name}</option>
                    ))}
                  </select>
                </label>
              )}
              <label className="visualization-controls__switch">
                <input
                  type="checkbox"
                  checked={settings.cluster}
                  onChange={(event) => onChange({ cluster: event.target.checked })}
                />
                <span className="visualization-controls__switch-track" aria-hidden="true">
                  <span />
                </span>
                <span>{t("visualization.cluster")}</span>
              </label>
            </div>
          </fieldset>
        )}
      </div>
    </section>
  );
}
