import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { messages } from "../locales/messages";

export type AppLocale = keyof typeof messages;

const STORAGE_KEY = "gongmiri.locale";
const DEFAULT_LOCALE: AppLocale = "ko";

export const localeOptions: ReadonlyArray<{ code: AppLocale; label: string }> = [
  { code: "ko", label: "한국어" },
  { code: "en", label: "English" },
];

const isAppLocale = (value: unknown): value is AppLocale =>
  value === "ko" || value === "en";

const detectBrowserLocale = (): AppLocale => {
  const preferred = navigator.languages?.[0] ?? navigator.language;
  const language = preferred.toLowerCase().split("-")[0];
  return isAppLocale(language) ? language : DEFAULT_LOCALE;
};

const readStoredLocale = async (): Promise<AppLocale | null> => {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await chrome.storage.local.get(STORAGE_KEY);
      const value = stored[STORAGE_KEY];
      return isAppLocale(value) ? value : null;
    }
  } catch {
    // Standalone Vite previews do not expose extension storage.
  }
  const value = window.localStorage.getItem(STORAGE_KEY);
  return isAppLocale(value) ? value : null;
};

const persistLocale = async (locale: AppLocale): Promise<void> => {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({ [STORAGE_KEY]: locale });
      return;
    }
  } catch {
    // Fall through to localStorage in standalone previews.
  }
  window.localStorage.setItem(STORAGE_KEY, locale);
};

const applyDocumentLocale = (locale: AppLocale) => {
  document.documentElement.lang = locale;
  document.title = i18n.t("app.title");
};

export const initializeI18n = async (): Promise<void> => {
  const locale = (await readStoredLocale()) ?? detectBrowserLocale();
  await i18n.use(initReactI18next).init({
    lng: locale,
    fallbackLng: "en",
    interpolation: { escapeValue: false },
    resources: {
      ko: { translation: messages.ko },
      en: { translation: messages.en },
    },
  });
  applyDocumentLocale(locale);
};

export const changeLocale = async (locale: AppLocale): Promise<void> => {
  await i18n.changeLanguage(locale);
  applyDocumentLocale(locale);
  await persistLocale(locale);
};

export default i18n;
