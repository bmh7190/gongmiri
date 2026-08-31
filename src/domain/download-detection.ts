export const DOWNLOAD_DETECTION_ENABLED_KEY = "gongmiri.downloadDetectionEnabled";
export const RECENT_ZIP_DOWNLOAD_KEY = "gongmiri.recentZipDownload";

export type RecentZipDownload = {
  id: number;
  fileName: string;
  detectedAt: string;
};

export const fileNameFromPath = (value: string): string =>
  value.replace(/\\/g, "/").split("/").pop() || value;

export const isZipDownloadCandidate = (
  fileName: string,
  url = "",
): boolean => /\.zip$/i.test(fileNameFromPath(fileName)) || /\.zip(?:$|[?#])/i.test(url);
