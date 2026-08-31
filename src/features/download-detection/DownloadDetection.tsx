import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  DOWNLOAD_DETECTION_ENABLED_KEY,
  RECENT_ZIP_DOWNLOAD_KEY,
  type RecentZipDownload,
} from "../../domain/download-detection";
import "./download-detection.css";

const isExtensionRuntime = () =>
  typeof chrome !== "undefined" && Boolean(chrome.runtime?.id) && Boolean(chrome.permissions);

export type DownloadDetectionController = {
  enabled: boolean;
  isChanging: boolean;
  isReady: boolean;
  permissionDenied: boolean;
  recent: RecentZipDownload | null;
  supported: boolean;
  toggle: () => Promise<void>;
};

export const useDownloadDetection = (): DownloadDetectionController => {
  const [enabled, setEnabled] = useState(false);
  const [recent, setRecent] = useState<RecentZipDownload | null>(null);
  const [isChanging, setIsChanging] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const supported = isExtensionRuntime();

  useEffect(() => {
    if (!supported) {
      setIsReady(true);
      return;
    }
    void Promise.all([
      chrome.permissions.contains({ permissions: ["downloads"] }),
      chrome.storage.local.get([
        DOWNLOAD_DETECTION_ENABLED_KEY,
        RECENT_ZIP_DOWNLOAD_KEY,
      ]),
    ]).then(([hasPermission, stored]) => {
      setEnabled(hasPermission && stored[DOWNLOAD_DETECTION_ENABLED_KEY] === true);
      setRecent((stored[RECENT_ZIP_DOWNLOAD_KEY] as RecentZipDownload | undefined) ?? null);
    }).catch(() => setEnabled(false)).finally(() => setIsReady(true));
  }, [supported]);

  const toggle = async () => {
    setIsChanging(true);
    setPermissionDenied(false);
    try {
      if (enabled) {
        await chrome.storage.local.set({ [DOWNLOAD_DETECTION_ENABLED_KEY]: false });
        await chrome.permissions.remove({ permissions: ["downloads"] });
        await chrome.action.setBadgeText({ text: "" });
        setEnabled(false);
        return;
      }
      const granted = await chrome.permissions.request({ permissions: ["downloads"] });
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
      await chrome.storage.local.set({ [DOWNLOAD_DETECTION_ENABLED_KEY]: true });
      setEnabled(true);
    } finally {
      setIsChanging(false);
    }
  };

  return {
    enabled,
    isChanging,
    isReady,
    permissionDenied,
    recent,
    supported,
    toggle,
  };
};

type DownloadDetectionProps = {
  detection: DownloadDetectionController;
};

export function DownloadDetectionPrompt({ detection }: DownloadDetectionProps) {
  const { t } = useTranslation();
  if (!detection.supported || !detection.isReady || detection.enabled) return null;

  return (
    <section className="react-download-detection" aria-labelledby="download-detection-title">
      <div>
        <h2 id="download-detection-title">{t("downloadDetection.title")}</h2>
        <p>{t("downloadDetection.description")}</p>
        <small>{t("downloadDetection.privacy")}</small>
      </div>
      <button
        type="button"
        disabled={detection.isChanging}
        onClick={() => void detection.toggle()}
      >
        {t("downloadDetection.enable")}
      </button>
      {detection.permissionDenied && (
        <p role="alert">{t("downloadDetection.denied")}</p>
      )}
      {detection.recent && (
        <p className="react-download-detection__recent" role="status">
          {t("downloadDetection.recent", { fileName: detection.recent.fileName })}
        </p>
      )}
    </section>
  );
}

export function DownloadDetectionToggle({ detection }: DownloadDetectionProps) {
  const { t } = useTranslation();
  if (!detection.supported || !detection.isReady || !detection.enabled) return null;

  const label = t("downloadDetection.disableLabel");
  return (
    <button
      type="button"
      className="react-icon-button react-download-detection-toggle"
      aria-label={label}
      aria-pressed="true"
      title={label}
      disabled={detection.isChanging}
      onClick={() => void detection.toggle()}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11" />
        <path d="m8 10 4 4 4-4" />
        <path d="M5 18h14" />
      </svg>
    </button>
  );
}
