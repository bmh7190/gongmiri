import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { messages } from "../../locales/messages";
import type { ColumnStat, FeatureCollectionGeometry } from "../../domain/types";
import AttributeTable, {
  restoreTableScrollPosition,
  shouldContainTableWheel,
} from "./AttributeTable";

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
  it("contains only wheel input that would leave a vertical table boundary", () => {
    const viewport = { clientHeight: 440, scrollHeight: 3_400 };

    expect(shouldContainTableWheel({ ...viewport, scrollTop: 0, deltaY: -120 })).toBe(true);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 0, deltaY: 120 })).toBe(false);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 800, deltaY: -120 })).toBe(false);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 800, deltaY: 120 })).toBe(false);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 2_960, deltaY: 120 })).toBe(true);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 2_960, deltaY: -120 })).toBe(false);
    expect(shouldContainTableWheel({ ...viewport, scrollTop: 0, deltaY: 0 })).toBe(false);
  });

  it("restores both table and outer scroll positions after a column resize render", () => {
    const viewport = { scrollTop: 0, scrollLeft: 0 };
    const appScroller = { scrollTop: 0, scrollLeft: 0 };

    restoreTableScrollPosition(
      {
        viewportTop: 1_200,
        viewportLeft: 340,
        appTop: 1_940,
        appLeft: 0,
      },
      viewport,
      appScroller,
    );

    expect(viewport).toEqual({ scrollTop: 1_200, scrollLeft: 340 });
    expect(appScroller).toEqual({ scrollTop: 1_940, scrollLeft: 0 });
  });

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
    expect(html).toContain('aria-sort="none"');
    expect(html).toContain('title="name"');
    expect(html).toContain('title="score"');
    expect(html).toContain("Resize name column");
    expect(html).toContain('aria-orientation="vertical"');
    expect(html).toContain("Double-click to reset width");
    expect(html).toContain("Pin name column left");
    expect(html).toContain("Pin score column right");
    expect(html).toContain("Move name column");
    expect(html).toContain('aria-pressed="false"');
    expect(html).not.toContain("Sort column");
    expect(html).toContain("Page 1 of 1");
    expect(html).toContain('disabled=""');
    expect(html).toContain('--react-table-columns:54px 108px 108px');
    expect(html.match(/data-column-id="name"/g)).toHaveLength(3);
    expect(html).toContain('data-min-size="80"');
  });

  it("renders a bounded native row page instead of a virtualized body", async () => {
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

    expect(html).toContain("Page 1 of 2");
    expect(html).toContain("Previous");
    expect(html).toContain("Next");
    expect(html).toContain("Feature 100");
    expect(html).not.toContain("Feature 101");
    expect(html).not.toContain("Virtual scrolling");
  });
});
