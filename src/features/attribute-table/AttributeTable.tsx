import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type UIEvent,
} from "react";
import { useTranslation } from "react-i18next";
import type {
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureId,
} from "../../domain/types";
import {
  exploreAttributeRows,
  type EmptyValueFilter,
  type RowSortDirection,
} from "../../domain/attribute-rows";
import "./attribute-table.css";

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 36;
const BUFFER_ROWS = 8;
const DEFAULT_HEIGHT = 420;
const WIDTH_SAMPLE_LIMIT = 400;

type AttributeTableProps = {
  collection: FeatureCollectionGeometry;
  columns: ColumnStat[];
  selectedId: FeatureId | null;
  onSelect: (id: FeatureId) => void;
  onFilteredIdsChange?: (ids: FeatureId[]) => void;
};

const formatCell = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") {
    return Number.isInteger(value) ? String(value) : value.toFixed(3);
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "[object]";
    }
  }
  return String(value);
};

const estimateWidth = (values: unknown[]) => {
  const maxCharacters = values.reduce<number>(
    (max, value) => Math.max(max, formatCell(value).length),
    0,
  );
  return Math.min(280, Math.max(108, maxCharacters * 7.2 + 24));
};

export default function AttributeTable({
  collection,
  columns,
  selectedId,
  onSelect,
  onFilteredIdsChange,
}: AttributeTableProps) {
  const { t, i18n } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(DEFAULT_HEIGHT);
  const [query, setQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState("");
  const [sortColumn, setSortColumn] = useState("");
  const [sortDirection, setSortDirection] = useState<RowSortDirection>("asc");
  const [filterColumn, setFilterColumn] = useState("");
  const [emptyFilter, setEmptyFilter] = useState<EmptyValueFilter>("all");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");

  const sourceRows = useMemo(
    () =>
      collection.features.map((feature, index) => ({
        id: String(feature.id ?? `feature-${index}`),
        properties: (feature.properties ?? {}) as Record<string, unknown>,
      })),
    [collection],
  );
  const columnOrder = useMemo(
    () =>
      columns.length
        ? columns.map((column) => column.name).filter(Boolean)
        : Object.keys(sourceRows[0]?.properties ?? {}),
    [columns, sourceRows],
  );
  const rows = useMemo(
    () => exploreAttributeRows(
      sourceRows,
      query,
      searchColumn || null,
      sortColumn || null,
      sortDirection,
      {
        column: filterColumn || null,
        empty: emptyFilter,
        min: minimum === "" ? null : Number(minimum),
        max: maximum === "" ? null : Number(maximum),
      },
    ),
    [emptyFilter, filterColumn, maximum, minimum, query, searchColumn, sortColumn, sortDirection, sourceRows],
  );
  const idIndex = useMemo(
    () => new Map(rows.map((row, index) => [row.id, index])),
    [rows],
  );
  const rowTemplate = useMemo(() => {
    const stride = Math.max(1, Math.floor(rows.length / WIDTH_SAMPLE_LIMIT));
    const sample = rows.filter((_, index) => index % stride === 0).slice(0, WIDTH_SAMPLE_LIMIT);
    const widths = columnOrder.map((column) =>
      estimateWidth([column, ...sample.map((row) => row.properties[column])]),
    );
    return ["54px", ...widths.map((width) => `${width}px`)].join(" ");
  }, [columnOrder, rows]);

  const effectiveScrollTop = Math.max(0, scrollTop - HEADER_HEIGHT);
  const startIndex = Math.max(
    0,
    Math.floor(effectiveScrollTop / ROW_HEIGHT) - BUFFER_ROWS,
  );
  const endIndex = Math.min(
    rows.length,
    startIndex + Math.ceil(viewportHeight / ROW_HEIGHT) + BUFFER_ROWS * 2,
  );
  const visibleRows = rows.slice(startIndex, endIndex);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => {
      setViewportHeight(viewport.clientHeight || DEFAULT_HEIGHT);
    });
    setViewportHeight(viewport.clientHeight || DEFAULT_HEIGHT);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
    setScrollTop(0);
  }, [emptyFilter, filterColumn, maximum, minimum, query, searchColumn, sortColumn, sortDirection]);

  useEffect(() => {
    onFilteredIdsChange?.(rows.map((row) => row.id));
  }, [onFilteredIdsChange, rows]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const index = selectedId ? idIndex.get(selectedId) : undefined;
    if (!viewport || index === undefined) return;
    const top = index * ROW_HEIGHT;
    const bottom = top + ROW_HEIGHT;
    if (top < effectiveScrollTop) {
      viewport.scrollTop = top + HEADER_HEIGHT;
    } else if (bottom > effectiveScrollTop + viewport.clientHeight - HEADER_HEIGHT) {
      viewport.scrollTop = bottom - viewport.clientHeight + HEADER_HEIGHT;
    }
  }, [idIndex, selectedId]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  const handleRowKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const nextIndex = Math.min(
      rows.length - 1,
      Math.max(0, index + (event.key === "ArrowDown" ? 1 : -1)),
    );
    const next = rows[nextIndex];
    if (next) onSelect(next.id);
  };

  return (
    <section className="react-table" aria-labelledby="attribute-table-title">
      <div className="react-table__title">
        <div>
          <h2 id="attribute-table-title">{t("table.title")}</h2>
          <p>
            {t("table.filteredRowCount", {
              count: rows.length,
              filtered: rows.length.toLocaleString(i18n.language),
              total: sourceRows.length.toLocaleString(i18n.language),
            })}
          </p>
        </div>
        <span>{t("table.virtualized")}</span>
      </div>

      <div className="react-table__tools">
        <div className="react-table__tool-row react-table__tool-row--primary">
          <label>
            <span>{t("table.search")}</span>
            <input
              type="search"
              value={query}
              placeholder={t("table.searchPlaceholder")}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>{t("table.searchColumn")}</span>
            <select value={searchColumn} onChange={(event) => setSearchColumn(event.target.value)}>
              <option value="">{t("table.allColumns")}</option>
              {columnOrder.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <label>
            <span>{t("table.sortColumn")}</span>
            <select value={sortColumn} onChange={(event) => setSortColumn(event.target.value)}>
              <option value="">{t("table.originalOrder")}</option>
              {columnOrder.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <button
            type="button"
            className="react-table__sort-direction"
            disabled={!sortColumn}
            aria-label={t("table.sortDirection")}
            title={sortDirection === "asc" ? t("table.ascending") : t("table.descending")}
            onClick={() => setSortDirection((current) => current === "asc" ? "desc" : "asc")}
          >
            <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
          </button>
        </div>
        <div className="react-table__tool-row react-table__tool-row--filters">
          <label>
            <span>{t("table.filterColumn")}</span>
            <select
              value={filterColumn}
              onChange={(event) => {
                setFilterColumn(event.target.value);
                setEmptyFilter("all");
                setMinimum("");
                setMaximum("");
              }}
            >
              <option value="">{t("table.noFilter")}</option>
              {columnOrder.map((column) => <option key={column} value={column}>{column}</option>)}
            </select>
          </label>
          <label>
            <span>{t("table.emptyFilter")}</span>
            <select
              value={emptyFilter}
              disabled={!filterColumn}
              onChange={(event) => setEmptyFilter(event.target.value as EmptyValueFilter)}
            >
              <option value="all">{t("table.emptyAll")}</option>
              <option value="empty">{t("table.emptyOnly")}</option>
              <option value="filled">{t("table.filledOnly")}</option>
            </select>
          </label>
          <label>
            <span>{t("table.minimum")}</span>
            <input type="number" value={minimum} disabled={!filterColumn} onChange={(event) => setMinimum(event.target.value)} />
          </label>
          <label>
            <span>{t("table.maximum")}</span>
            <input type="number" value={maximum} disabled={!filterColumn} onChange={(event) => setMaximum(event.target.value)} />
          </label>
        </div>
      </div>

      <div
        ref={viewportRef}
        className="react-table__viewport"
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={columnOrder.length + 1}
        onScroll={handleScroll}
      >
        <div
          className="react-table__header"
          role="row"
          style={{ gridTemplateColumns: rowTemplate }}
        >
          <span role="columnheader" aria-label={t("table.rowNumber")} />
          {columnOrder.map((column) => (
            <span key={column} role="columnheader" title={column}>
              {column || t("table.unnamed")}
            </span>
          ))}
        </div>
        <div
          className="react-table__spacer"
          style={{ height: rows.length * ROW_HEIGHT }}
        >
          <div
            className="react-table__virtual"
            style={{ transform: `translateY(${startIndex * ROW_HEIGHT}px)` }}
          >
            {visibleRows.map((row, localIndex) => {
              const absoluteIndex = startIndex + localIndex;
              const selected = row.id === selectedId;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="row"
                  aria-rowindex={absoluteIndex + 1}
                  aria-selected={selected}
                  className={`react-table__row${selected ? " is-selected" : ""}`}
                  style={{ gridTemplateColumns: rowTemplate }}
                  onClick={() => onSelect(row.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, absoluteIndex)}
                >
                  <span role="gridcell">{absoluteIndex + 1}</span>
                  {columnOrder.map((column) => {
                    const value = formatCell(row.properties[column]);
                    return (
                      <span key={column} role="gridcell" title={value}>
                        {value}
                      </span>
                    );
                  })}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
