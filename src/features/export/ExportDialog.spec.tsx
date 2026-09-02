import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "../../locales/messages";
import type { FeatureCollectionGeometry } from "../../domain/types";
import ExportDialog from "./ExportDialog";

const source: FeatureCollectionGeometry = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    id: "feature-1",
    geometry: { type: "Point", coordinates: [127, 38] },
    properties: { name: "Seoul", score: 100 },
  }],
};

const createI18n = async () => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    showSupportNotice: false,
    resources: { en: { translation: messages.en } },
  });
  return i18n;
};

const renderDialog = async (initialFormat: "csv" | "geojson") => {
  const i18n = await createI18n();
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <ExportDialog
        collection={source}
        fileName="sample.zip"
        parseMode="full"
        sourceProjection="+proj=tmerc +lat_0=38 +lon_0=127"
        sourceProjectionLabel="EPSG:5179"
        defaultFields={["score", "name"]}
        initialFormat={initialFormat}
        onClose={() => {}}
      />
    </I18nextProvider>,
  );
};

describe("ExportDialog", () => {
  it("shows CSV-specific settings without coordinate controls", async () => {
    const html = await renderDialog("csv");

    expect(html).toContain("Export data");
    expect(html).toContain("UTF-8 with BOM");
    expect(html).toContain("Save CSV");
    expect(html).toContain("Included fields 2/2");
    expect(html).not.toContain("Export scope");
    expect(html).not.toContain("Selected features");
    expect(html).not.toContain("GeoJSON coordinates");
  });

  it("shows coordinate controls only for GeoJSON", async () => {
    const html = await renderDialog("geojson");

    expect(html).toContain("GeoJSON coordinates");
    expect(html).toContain("Save GeoJSON");
    expect(html).not.toContain("UTF-8 with BOM");
  });
});
