import {
  DOWNLOAD_DETECTION_ENABLED_KEY,
  RECENT_ZIP_DOWNLOAD_KEY,
  fileNameFromPath,
  isZipDownloadCandidate,
  type RecentZipDownload,
} from "./domain/download-detection";

chrome.runtime.onInstalled.addListener(() => {
  console.log("[gongmiri] installed");
});

const handleDownloadChanged = async (delta: chrome.downloads.DownloadDelta) => {
  if (delta.state?.current !== "complete") return;
  try {
    const stored = await chrome.storage.local.get(DOWNLOAD_DETECTION_ENABLED_KEY);
    if (stored[DOWNLOAD_DETECTION_ENABLED_KEY] !== true) return;

    const [download] = await chrome.downloads.search({ id: delta.id });
    if (!download || !isZipDownloadCandidate(download.filename, download.finalUrl || download.url)) {
      return;
    }
    const recent: RecentZipDownload = {
      id: download.id,
      fileName: fileNameFromPath(download.filename),
      detectedAt: new Date().toISOString(),
    };
    await chrome.storage.local.set({ [RECENT_ZIP_DOWNLOAD_KEY]: recent });
    await chrome.action.setBadgeBackgroundColor({ color: "#2563eb" });
    await chrome.action.setBadgeText({ text: "ZIP" });
  } catch (error) {
    console.warn("[gongmiri] download detection failed", error);
  }
};

chrome.downloads?.onChanged.addListener((delta) => {
  void handleDownloadChanged(delta);
});
