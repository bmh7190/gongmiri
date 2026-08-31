import { describe, expect, it } from "vitest";
import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { messages } from "../../locales/messages";
import {
  DownloadDetectionPrompt,
  DownloadDetectionToggle,
  type DownloadDetectionController,
} from "./DownloadDetection";

const createController = (
  change: Partial<DownloadDetectionController> = {},
): DownloadDetectionController => ({
  enabled: false,
  isChanging: false,
  isReady: true,
  permissionDenied: false,
  recent: null,
  supported: true,
  toggle: async () => {},
  ...change,
});

const renderLocalized = async (element: ReactNode) => {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    showSupportNotice: false,
    resources: { en: { translation: messages.en } },
  });
  return renderToStaticMarkup(
    <I18nextProvider i18n={i18n}>{element}</I18nextProvider>,
  );
};

describe("DownloadDetection", () => {
  it("shows the onboarding prompt only while detection is disabled", async () => {
    const html = await renderLocalized(
      <DownloadDetectionPrompt detection={createController()} />,
    );

    expect(html).toContain("Downloaded ZIP detection");
    expect(html).toContain("Enable");
    expect(html).not.toContain("react-download-detection-toggle");
  });

  it("shows only the compact header toggle while detection is enabled", async () => {
    const detection = createController({ enabled: true });
    const prompt = await renderLocalized(
      <DownloadDetectionPrompt detection={detection} />,
    );
    const toggle = await renderLocalized(
      <DownloadDetectionToggle detection={detection} />,
    );

    expect(prompt).toBe("");
    expect(toggle).toContain("react-download-detection-toggle");
    expect(toggle).toContain("Turn off downloaded ZIP detection");
    expect(toggle).not.toContain("Downloaded ZIP detection</h2>");
  });
});
