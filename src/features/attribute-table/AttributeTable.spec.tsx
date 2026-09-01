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
  it("renders the data grid column controls and keeps detailed filters collapsed", async () => {
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
          onExport={() => {}}
        />
      </I18nextProvider>,
    );

    expect(html).toContain("Detailed filters");
    expect(html).toContain("Columns 2/2");
    expect(html).toContain('aria-label="Export"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="export-dialog"');
    expect(html).toContain("<svg");
    expect(html).toContain("Column visibility");
    expect(html).toContain("Show all");
    expect(html).toContain('type="checkbox" checked=""');
    expect(html).not.toContain("<details open");
    expect(html).toContain("rdg-resize-handle");
    expect(html).toContain("rdg-cell-draggable");
    expect(html).toContain("Pin name column left");
    expect(html).toContain("Pin score column right");
    expect(html).toContain("Move name column");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("Sort column");
    expect(html).toContain('disabled=""');
    expect(html).toContain("grid-template-columns:54px 108px 108px");
    expect(html).not.toContain("react-table__resizer");
  });

  it("exposes every row to the virtualized data grid without pagination", async () => {
    const i18n = createInstance();
    await i18n.init({
      lng: "en",
      fallbackLng: "en",
      interpolation: { escapeValue: false },
      showSupportNotice: false,
      resources: { en: { translation: messages.en } },
    });
    const largeCollection: FeatureCollectionGeometry = {
      type: "FeatureCollection",
      features: Array.from({ length: 101 }, (_, index) => ({
        type: "Feature",
        id: `feature-${index + 1}`,
        geometry: { type: "Point", coordinates: [127, 38] },
        properties: { name: `Feature ${index + 1}`, score: index + 1 },
      })),
    };

    const html = renderToStaticMarkup(
      <I18nextProvider i18n={i18n}>
        <AttributeTable
          collection={largeCollection}
          columns={columns}
          selectedId={null}
          onSelect={() => {}}
        />
      </I18nextProvider>,
    );

    expect(html).toContain('aria-rowcount="102"');
    expect(html).toContain("repeat(101, 34px)");
    expect(html).toContain("Feature 1");
    expect(html).not.toContain("react-table__pagination");
  });
});
