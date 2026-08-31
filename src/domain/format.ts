const FILE_SIZE_UNITS = ["B", "KB", "MB", "GB"] as const;

export const formatFileSize = (bytes: number, locale: string): string => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    FILE_SIZE_UNITS.length - 1,
  );
  const value = bytes / 1024 ** unitIndex;
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: unitIndex === 0 ? 0 : 1,
  }).format(value);
  return `${formatted} ${FILE_SIZE_UNITS[unitIndex]}`;
};
