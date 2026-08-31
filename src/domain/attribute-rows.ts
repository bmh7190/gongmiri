export type AttributeRow = {
  id: string;
  properties: Record<string, unknown>;
};

export type RowSortDirection = "asc" | "desc";
export type EmptyValueFilter = "all" | "empty" | "filled";
export type AttributeValueFilter = {
  column: string | null;
  empty: EmptyValueFilter;
  min: number | null;
  max: number | null;
};

const searchableValue = (value: unknown): string => {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
};

export const compareAttributeValues = (left: unknown, right: unknown): number => {
  const leftEmpty = left === null || left === undefined || left === "";
  const rightEmpty = right === null || right === undefined || right === "";
  if (leftEmpty || rightEmpty) {
    if (leftEmpty && rightEmpty) return 0;
    return leftEmpty ? 1 : -1;
  }
  if (typeof left === "number" && typeof right === "number") {
    return left - right;
  }
  return searchableValue(left).localeCompare(searchableValue(right), undefined, {
    numeric: true,
    sensitivity: "base",
  });
};

export const exploreAttributeRows = (
  rows: AttributeRow[],
  query: string,
  searchColumn: string | null,
  sortColumn: string | null,
  direction: RowSortDirection,
  valueFilter?: AttributeValueFilter,
): AttributeRow[] => {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const filtered = rows.filter((row) => {
    if (normalizedQuery) {
      const values = searchColumn
        ? [row.properties[searchColumn]]
        : Object.values(row.properties);
      if (!values.some((value) =>
        searchableValue(value).toLocaleLowerCase().includes(normalizedQuery),
      )) return false;
    }
    if (!valueFilter?.column) return true;
    const value = row.properties[valueFilter.column];
    const empty = value === null || value === undefined || value === "";
    if (valueFilter.empty === "empty" && !empty) return false;
    if (valueFilter.empty === "filled" && empty) return false;
    if (valueFilter.min !== null || valueFilter.max !== null) {
      if (typeof value !== "number" || !Number.isFinite(value)) return false;
      if (valueFilter.min !== null && value < valueFilter.min) return false;
      if (valueFilter.max !== null && value > valueFilter.max) return false;
    }
    return true;
  });

  if (!sortColumn) return filtered;
  return filtered
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const compared = compareAttributeValues(
        left.row.properties[sortColumn],
        right.row.properties[sortColumn],
      );
      return (direction === "asc" ? compared : -compared) || left.index - right.index;
    })
    .map(({ row }) => row);
};
