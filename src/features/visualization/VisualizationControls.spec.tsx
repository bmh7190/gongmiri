import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import type { ColumnStat, VisualizationSettings } from "../../domain/types";
import { messages } from "../../locales/messages";
import VisualizationControls from "./VisualizationControls";

const columns: ColumnStat[] = [
  {
    name: "category",
    filled: 3,
    empty: 0,
    fillRate: 1,
    samples: [],
    dataType: "string",
    uniqueCount: 2,
    uniqueRatio: 2 / 3,
    numericSummary: null,
  },
  {
    name: "score",
    filled: 3,
    empty: 0,
    fillRate: 1,
    samples: [],
    dataType: "number",
    uniqueCount: 3,
    uniqueRatio: 1,
    numericSummary: { min: 1, max: 3, mean: 2 },
  },
];

const settings: VisualizationSettings = {
  colorMode: "default",
  categoryField: null,
  numericField: null,
  numericScale: "quantile",
  pointSizeField: null,
  pointSizeRange: [4, 18],
  cluster: false,
};

const renderControls = async (
  change: Partial<VisualizationSettings> = {},
  availableColumns: ColumnStat[] = columns,
) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: { en: { translation: messages.en } },
  });

  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <VisualizationControls
        columns={availableColumns}
        settings={{ ...settings, ...change }}
        hasPoints
        onChange={() => {}}
      />
    </I18nextProvider>,
  );
};

describe("VisualizationControls", () => {
  it("presents statistical color choices as explicit view modes", async () => {
    const html = await renderControls();

    expect(html).toContain("View options");
    expect(html).toContain("<details");
    expect(html).not.toContain("<details open");
    expect(html).toContain("View mode");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("By category");
    expect(html).toContain("Continuous");
    expect(html).toContain("Point options");
    expect(html).toContain("Clusters");
  });

  it("shows only the options needed by the selected view mode", async () => {
    const categoryHtml = await renderControls({
      colorMode: "category",
      categoryField: "category",
    });
    const continuousHtml = await renderControls({
      colorMode: "continuous",
      numericField: "score",
    });

    expect(categoryHtml).toContain("Data column");
    expect(categoryHtml).toContain('option value="category" selected=""');
    expect(categoryHtml).not.toContain("Interval method");
    expect(continuousHtml).toContain("Interval method");
    expect(continuousHtml).toContain('option value="score" selected=""');
  });

  it("removes unavailable numeric controls instead of showing empty selectors", async () => {
    const html = await renderControls({}, columns.filter((column) => column.dataType !== "number"));

    expect(html).toContain("Available when the dataset contains a numeric column.");
    expect(html).toContain("disabled");
    expect(html).not.toContain("Size by");
    expect(html).toContain("Clusters");
  });
});
