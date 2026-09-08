import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
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

    let active = true;
    const syncState = async () => {
      try {
        const [hasPermission, stored] = await Promise.all([
          chrome.permissions.contains({ permissions: ["downloads"] }),
          chrome.storage.local.get(RECENT_ZIP_DOWNLOAD_KEY),
        ]);
        if (!active) return;
        setEnabled(hasPermission);
        setRecent(
          hasPermission
            ? (stored[RECENT_ZIP_DOWNLOAD_KEY] as RecentZipDownload | undefined) ?? null
            : null,
        );
      } catch {
        if (active) setEnabled(false);
      } finally {
        if (active) setIsReady(true);
      }
    };
    const handlePermissionChange = (permissions: chrome.permissions.Permissions) => {
      if (permissions.permissions?.includes("downloads")) void syncState();
    };

    void chrome.action.setBadgeText({ text: "" }).catch(() => {});
    void syncState();
    chrome.permissions.onAdded.addListener(handlePermissionChange);
    chrome.permissions.onRemoved.addListener(handlePermissionChange);
    return () => {
      active = false;
      chrome.permissions.onAdded.removeListener(handlePermissionChange);
      chrome.permissions.onRemoved.removeListener(handlePermissionChange);
    };
  }, [supported]);

  const toggle = async () => {
    setIsChanging(true);
    setPermissionDenied(false);
    try {
      if (enabled) {
        const removed = await chrome.permissions.remove({ permissions: ["downloads"] });
        if (removed) {
          await Promise.all([
            chrome.action.setBadgeText({ text: "" }),
            chrome.storage.local.remove(RECENT_ZIP_DOWNLOAD_KEY),
          ]);
          setRecent(null);
          setEnabled(false);
        }
        return;
      }
      const granted = await chrome.permissions.request({ permissions: ["downloads"] });
      if (!granted) {
        setPermissionDenied(true);
        return;
      }
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
