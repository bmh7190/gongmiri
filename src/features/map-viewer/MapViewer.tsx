import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
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
  toolbar?: ReactNode;
};

export default function MapViewer(props: MapViewerProps) {
  const { t } = useTranslation();
  const { containerRef, error } = useMapLibre({
    ...props,
    popupTitle: t("map.properties"),
  });
  const hasFeatures = Boolean(props.collection?.features.length);

  return (
    <section className="react-map" aria-labelledby="react-map-title">
      <div className="react-map__header">
        <div>
          <h2 id="react-map-title">{t("map.title")}</h2>
          {!hasFeatures && <p>{t("map.empty")}</p>}
        </div>
      </div>
      {props.toolbar}
      <div className="react-map__canvas">
        <div ref={containerRef} className="react-map__container" />
        {!hasFeatures && <div className="react-map__empty">{t("map.empty")}</div>}
        {error && <div className="react-map__error">{t("map.basemapError")}</div>}
      </div>
    </section>
  );
}
