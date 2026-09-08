import { createInstance } from "i18next";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import { describe, expect, it } from "vitest";
import { messages } from "../../locales/messages";
import InvalidZipDialog, { type InvalidZipIssue } from "./InvalidZipDialog";

const renderDialog = async (issue: InvalidZipIssue) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    showSupportNotice: false,
    resources: { en: { translation: messages.en } },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>
      <InvalidZipDialog issue={issue} onClose={() => {}} onChooseAnother={() => {}} />
    </I18nextProvider>,
  );
};

describe("InvalidZipDialog", () => {
  it("explains matching required files without rendering a result section", async () => {
    const html = await renderDialog({ fileName: "broken.zip", layers: [] });

    expect(html).toContain("No spatial data found");
    expect(html).toContain("broken.zip");
    expect(html).toContain(".shp");
    expect(html).toContain(".dbf");
    expect(html).toContain(".shx");
    expect(html).toContain("No recognizable Shapefile components were found");
  });

  it("lists missing files for each detected layer", async () => {
    const html = await renderDialog({
      fileName: "partial.zip",
      layers: [{
        name: "roads",
        hasShp: true,
        hasDbf: false,
        hasShx: false,
        hasPrj: false,
        hasCpg: false,
        hasQix: false,
        hasSbn: false,
        hasSbx: false,
        missingEssential: [".dbf", ".shx"],
      }],
    });

    expect(html).toContain("roads");
    expect(html).toContain("Missing: .dbf, .shx");
  });
});
