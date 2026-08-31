import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "../../locales/messages";
import type { FeatureCollectionGeometry } from "../../domain/types";
import ExportControls from "./ExportControls";

const source: FeatureCollectionGeometry = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "feature-1",
    geometry: { type: "Point", coordinates: [127, 38] },
    properties: { name: "Seoul", score: 100 },
  }],
};

describe("ExportControls", () => {
  it("renders localized scope, coordinate, field, and save controls", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      showSupportNotice: false,
      resources: { en: { translation: messages.en } },
    });

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <ExportControls
          collection={source}
          selectedId="feature-1"
          filteredIds={["feature-1"]}
          fileName="sample.zip"
          parseMode="full"
          sourceProjection="+proj=tmerc +lat_0=38 +lon_0=127"
          sourceProjectionLabel="EPSG:5179"
        />
      </I18nextProvider>,
    );

    expect(html).toContain("Save results");
    expect(html).toContain("GeoJSON coordinates");
    expect(html).toContain("Included fields 2/2");
    expect(html).toContain("Save GeoJSON");
    expect(html).toContain("Save CSV");
  });
});
