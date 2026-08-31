import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { ZipInspection } from "../../domain/types";
import "./dataset-summary.css";

type DatasetSummaryProps = {
  inspection: ZipInspection;
  featureCount: number;
  geometryTypes: string[];
};

type ComponentStatus = {
  label: string;
  descriptionKey: string;
  present: boolean;
  required: boolean;
};

export default function DatasetSummary({
  inspection,
  featureCount,
  geometryTypes,
}: DatasetSummaryProps) {
  const { t, i18n } = useTranslation();
  const components = useMemo<ComponentStatus[]>(() => {
    const layers = inspection.layers;
    const everyLayerHas = (key: keyof (typeof layers)[number]) =>
      layers.length > 0 && layers.every((layer) => Boolean(layer[key]));
    const everyLayerHasSpatialIndex = layers.length > 0 && layers.every(
      (layer) => layer.hasQix || (layer.hasSbn && layer.hasSbx),
    );

    return [
      { label: ".shp", descriptionKey: "geometryFile", present: everyLayerHas("hasShp"), required: true },
      { label: ".dbf", descriptionKey: "attributeFile", present: everyLayerHas("hasDbf"), required: true },
      { label: ".shx", descriptionKey: "recordIndex", present: everyLayerHas("hasShx"), required: true },
      { label: ".prj", descriptionKey: "projectionFile", present: everyLayerHas("hasPrj"), required: false },
      { label: ".cpg", descriptionKey: "encodingFile", present: everyLayerHas("hasCpg"), required: false },
      { label: ".qix/.sbn", descriptionKey: "spatialIndex", present: everyLayerHasSpatialIndex, required: false },
    ];
  }, [inspection.layers]);
  const detectedTypes = geometryTypes.length
    ? geometryTypes
    : [t("summary.noGeometry")];

  return (
    <section className="dataset-summary" aria-labelledby="dataset-summary-title">
      <h2 id="dataset-summary-title">{t("summary.compositionTitle")}</h2>
      <div className="dataset-summary__overview">
        <article>
          <span>{t("summary.features")}</span>
          <strong>{featureCount.toLocaleString(i18n.language)}</strong>
        </article>
        <article>
          <span>{t("summary.detectedTypes")}</span>
          <div className="dataset-summary__types">
            {detectedTypes.map((type) => <strong key={type}>{type}</strong>)}
          </div>
        </article>
      </div>
      <div className="dataset-summary__components">
        {components.map((component) => (
          <div
            key={component.label}
            className={component.present ? "is-present" : "is-missing"}
            aria-label={`${component.label} · ${t(component.present ? "summary.present" : "summary.missing")}`}
          >
            <strong>
              <span aria-hidden="true" />
              {component.label}
            </strong>
            <small>{t(`summary.components.${component.descriptionKey}`)}</small>
            {!component.present && component.required && (
              <em>{t("summary.required")}</em>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
