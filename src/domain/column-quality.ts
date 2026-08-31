import type { ColumnStat } from "./types";

export type ColumnQualityIssue = "mostlyEmpty" | "singleValue" | "mixedType";

export const getColumnQualityIssues = (
  column: ColumnStat,
): ColumnQualityIssue[] => {
  const issues: ColumnQualityIssue[] = [];
  if (column.fillRate < 50) issues.push("mostlyEmpty");
  if (column.filled > 1 && column.uniqueCount === 1) issues.push("singleValue");
  if (column.dataType === "mixed") issues.push("mixedType");
  return issues;
};
