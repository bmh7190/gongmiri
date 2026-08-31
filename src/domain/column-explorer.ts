import { getColumnQualityIssues, type ColumnQualityIssue } from "./column-quality";
import type { ColumnStat } from "./types";

export type ColumnQualityFilter = "all" | "issues" | ColumnQualityIssue;
export type ColumnSort = "name" | "fillRate" | "empty" | "unique" | "type";

export const exploreColumns = (
  columns: ColumnStat[],
  query: string,
  quality: ColumnQualityFilter,
  sort: ColumnSort,
): ColumnStat[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = columns.filter((column) => {
    if (
      normalizedQuery &&
      !column.name.toLocaleLowerCase().includes(normalizedQuery)
    ) {
      return false;
    }
    const issues = getColumnQualityIssues(column);
    if (quality === "issues") return issues.length > 0;
    if (quality !== "all") return issues.includes(quality);
    return true;
  });

  return filtered.sort((left, right) => {
    switch (sort) {
      case "fillRate":
        return left.fillRate - right.fillRate || left.name.localeCompare(right.name);
      case "empty":
        return right.empty - left.empty || left.name.localeCompare(right.name);
      case "unique":
        return (
          (right.uniqueCount ?? Number.MAX_SAFE_INTEGER) -
            (left.uniqueCount ?? Number.MAX_SAFE_INTEGER) ||
          left.name.localeCompare(right.name)
        );
      case "type":
        return left.dataType.localeCompare(right.dataType) ||
          left.name.localeCompare(right.name);
      default:
        return left.name.localeCompare(right.name);
    }
  });
};
