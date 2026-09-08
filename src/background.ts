import {
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

const handleDownloadsChanged = (delta: chrome.downloads.DownloadDelta) => {
  void handleDownloadChanged(delta);
};

let downloadListenerAttached = false;

const syncDownloadListener = async () => {
  const hasPermission = await chrome.permissions.contains({ permissions: ["downloads"] });
  if (hasPermission && !downloadListenerAttached) {
    chrome.downloads.onChanged.addListener(handleDownloadsChanged);
    downloadListenerAttached = true;
    return;
  }
  if (!hasPermission && downloadListenerAttached) {
    chrome.downloads.onChanged.removeListener(handleDownloadsChanged);
    downloadListenerAttached = false;
    await chrome.action.setBadgeText({ text: "" });
  }
};

const handlePermissionChange = (permissions: chrome.permissions.Permissions) => {
  if (permissions.permissions?.includes("downloads")) void syncDownloadListener();
};

chrome.permissions.onAdded.addListener(handlePermissionChange);
chrome.permissions.onRemoved.addListener(handlePermissionChange);
void syncDownloadListener();
