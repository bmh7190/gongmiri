import { useTranslation } from "react-i18next";
import type {
  FeatureCollectionGeometry,
  FeatureId,
  VisualizationConfig,
} from "../../domain/types";
import { useMapLibre } from "./use-maplibre";
import "maplibre-gl/dist/maplibre-gl.css";
import "./map-viewer.css";

type MapViewerProps = {
  collection: FeatureCollectionGeometry | null;
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
  visualization: VisualizationConfig;
};

export default function MapViewer(props: MapViewerProps) {
  const { t } = useTranslation();
  const { containerRef, ready, error } = useMapLibre({
    ...props,
    popupTitle: t("map.properties"),
  });
  const hasFeatures = Boolean(props.collection?.features.length);

  return (
    <section className="react-map" aria-labelledby="react-map-title">
      <div className="react-map__header">
        <div>
          <h2 id="react-map-title">{t("map.title")}</h2>
          <p>{t(hasFeatures ? "map.help" : "map.empty")}</p>
        </div>
        <span className={`react-map__status${ready ? " is-ready" : ""}`}>
          {t(ready ? "map.ready" : "map.loading")}
        </span>
      </div>
      <div className="react-map__canvas">
        <div ref={containerRef} className="react-map__container" />
        {!hasFeatures && <div className="react-map__empty">{t("map.empty")}</div>}
        {error && <div className="react-map__error">{t("map.basemapError")}</div>}
      </div>
    </section>
  );
}
