import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "../../locales/messages";
import type { ColumnStat, FeatureCollectionGeometry } from "../../domain/types";
import AttributeTable from "./AttributeTable";

const collection: FeatureCollectionGeometry = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "feature-1",
      geometry: { type: "Point", coordinates: [127, 38] },
      properties: { name: "Seoul", score: 100 },
    },
  ],
};

const columns: ColumnStat[] = ["name", "score"].map((name) => ({
  name,
  filled: 1,
  empty: 0,
  fillRate: 1,
  samples: [],
  dataType: name === "score" ? "number" : "string",
  uniqueCount: 1,
  uniqueRatio: 1,
  numericSummary: null,
}));

describe("AttributeTable", () => {
  it("renders sortable column headers and keeps detailed filters collapsed", async () => {
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
        <AttributeTable
          collection={collection}
          columns={columns}
          selectedId={null}
          onSelect={() => {}}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("Detailed filters");
    expect(html).toContain("Columns 2/2");
    expect(html).toContain("Column visibility");
    expect(html).toContain("Show all");
    expect(html).toContain('type="checkbox" checked=""');
    expect(html).not.toContain("<details open");
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('title="name"');
    expect(html).toContain('title="score"');
    expect(html).toContain("Resize name column");
    expect(html).toContain("Double-click to reset width");
    expect(html).not.toContain("Sort column");
  });
});
