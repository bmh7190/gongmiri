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

  return (
    <section className="visualization-controls" aria-labelledby="visualization-title">
      <div>
        <h2 id="visualization-title">{t("visualization.title")}</h2>
        <p>{t("visualization.help")}</p>
      </div>
      <div className="visualization-controls__fields">
        <label>
          <span>{t("visualization.color")}</span>
          <select
            value={settings.colorMode}
            onChange={(event) =>
              onChange({
                colorMode: event.target.value as VisualizationSettings["colorMode"],
              })
            }
          >
            <option value="default">{t("visualization.default")}</option>
            <option value="category">{t("visualization.category")}</option>
            <option value="continuous">{t("visualization.continuous")}</option>
          </select>
        </label>
        {settings.colorMode === "category" && (
          <label>
            <span>{t("visualization.field")}</span>
            <select
              value={settings.categoryField ?? ""}
              onChange={(event) => onChange({ categoryField: event.target.value || null })}
            >
              <option value="">{t("visualization.chooseField")}</option>
              {columns.map((column) => (
                <option key={column.name} value={column.name}>{column.name}</option>
              ))}
            </select>
          </label>
        )}
        {settings.colorMode === "continuous" && (
          <>
            <label>
              <span>{t("visualization.numericField")}</span>
              <select
                value={settings.numericField ?? ""}
                onChange={(event) => onChange({ numericField: event.target.value || null })}
              >
                <option value="">{t("visualization.chooseField")}</option>
                {numericColumns.map((column) => (
                  <option key={column.name} value={column.name}>{column.name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{t("visualization.scale")}</span>
              <select
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
          </>
        )}
        {hasPoints && (
          <label>
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
        {hasPoints && (
          <label className="visualization-controls__check">
            <input
              type="checkbox"
              checked={settings.cluster}
              onChange={(event) => onChange({ cluster: event.target.checked })}
            />
            <span>{t("visualization.cluster")}</span>
          </label>
        )}
      </div>
    </section>
  );
}
