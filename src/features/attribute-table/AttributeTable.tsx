import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
  type Column,
} from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import type {
  ColumnStat,
  FeatureCollectionGeometry,
  FeatureId,
} from "../../domain/types";
import {
  compareAttributeValues,
  exploreAttributeRows,
  type AttributeRow,
  type EmptyValueFilter,
} from "../../domain/attribute-rows";
import "./attribute-table.css";

const ROW_HEIGHT = 34;
const HEADER_HEIGHT = 36;
const BUFFER_ROWS = 8;
const WIDTH_SAMPLE_LIMIT = 400;

const TABLE_FEATURES = tableFeatures({
  columnOrderingFeature,
  columnPinningFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper<typeof TABLE_FEATURES, AttributeRow>();

type AttributeColumn = Column<typeof TABLE_FEATURES, AttributeRow, unknown>;

type SortableColumnOptionProps = {
  column: AttributeColumn;
  moveLabel: string;
  pinStartLabel: string;
  pinEndLabel: string;
};

function SortableColumnOption({
  column,
  moveLabel,
  pinStartLabel,
  pinEndLabel,
}: SortableColumnOptionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: column.id });

  return (
    <div
      ref={setNodeRef}
      className={`react-table__column-option${isDragging ? " is-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        type="button"
        className="react-table__drag-handle"
        aria-label={moveLabel}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>
      <label>
        <input
          type="checkbox"
          checked={column.getIsVisible()}
          onChange={column.getToggleVisibilityHandler()}
        />
        <span title={column.id}>{column.id}</span>
      </label>
      <div className="react-table__pin-actions">
        <button
          type="button"
          className={column.getIsPinned() === "start" ? "is-active" : ""}
          aria-label={pinStartLabel}
          aria-pressed={column.getIsPinned() === "start"}
          onClick={() => column.pin(column.getIsPinned() === "start" ? false : "start")}
        >
          ←
        </button>
        <button
          type="button"
          className={column.getIsPinned() === "end" ? "is-active" : ""}
          aria-label={pinEndLabel}
          aria-pressed={column.getIsPinned() === "end"}
          onClick={() => column.pin(column.getIsPinned() === "end" ? false : "end")}
        >
          →
        </button>
      </div>
    </div>
  );
}

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
  const [query, setQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState("");
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
  const filteredRows = useMemo(
    () => exploreAttributeRows(
      sourceRows,
      query,
      searchColumn || null,
      null,
      "asc",
      {
        column: filterColumn || null,
        empty: emptyFilter,
        min: minimum === "" ? null : Number(minimum),
        max: maximum === "" ? null : Number(maximum),
      },
    ),
    [emptyFilter, filterColumn, maximum, minimum, query, searchColumn, sourceRows],
  );
  const tableColumns = useMemo(() => {
    const stride = Math.max(1, Math.floor(filteredRows.length / WIDTH_SAMPLE_LIMIT));
    const sample = filteredRows
      .filter((_, index) => index % stride === 0)
      .slice(0, WIDTH_SAMPLE_LIMIT);
    return columnHelper.columns([
      columnHelper.display({
        id: "__rowNumber",
        header: "",
        size: 54,
        enableSorting: false,
      }),
      ...columnOrder.map((column) => columnHelper.accessor(
        (row) => row.properties[column],
        {
          id: column,
          header: column || t("table.unnamed"),
          cell: (cell) => formatCell(cell.getValue()),
          size: estimateWidth([
            column,
            ...sample.map((row) => row.properties[column]),
          ]),
          sortFn: (left, right) => compareAttributeValues(
            left.original.properties[column],
            right.original.properties[column],
          ),
          sortUndefined: "last",
        },
      )),
    ]);
  }, [columnOrder, filteredRows, t]);
  const table = useTable({
    features: TABLE_FEATURES,
    columns: tableColumns,
    data: filteredRows,
    getRowId: (row) => row.id,
    enableMultiSort: false,
    enableSortingRemoval: true,
    sortDescFirst: false,
    columnResizeMode: "onChange",
    initialState: {
      columnPinning: { start: ["__rowNumber"], end: [] },
    },
  });
  const rows = table.getRowModel().rows;
  const visibleColumns = table.getVisibleLeafColumns();
  const dataColumns = table
    .getAllLeafColumns()
    .filter((column) => column.id !== "__rowNumber");
  const visibleDataColumnCount = dataColumns.filter((column) => column.getIsVisible()).length;
  const dragSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleColumnDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const order = dataColumns.map((column) => column.id);
    const previousIndex = order.indexOf(String(active.id));
    const nextIndex = order.indexOf(String(over.id));
    if (previousIndex < 0 || nextIndex < 0) return;
    table.setColumnOrder(["__rowNumber", ...arrayMove(order, previousIndex, nextIndex)]);
  };
  const rowTemplate = visibleColumns
    .map((column) => `${column.getSize()}px`)
    .join(" ");
  const idIndex = useMemo(
    () => new Map(rows.map((row, index) => [row.original.id, index])),
    [rows],
  );
  const getRowKey = useCallback(
    (index: number) => rows[index]?.original.id ?? index,
    [rows],
  );
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => ROW_HEIGHT,
    getItemKey: getRowKey,
    overscan: BUFFER_ROWS,
    scrollMargin: HEADER_HEIGHT,
    useFlushSync: false,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) viewport.scrollTop = 0;
  }, [emptyFilter, filterColumn, maximum, minimum, query, searchColumn, table.state.sorting]);

  useEffect(() => {
    onFilteredIdsChange?.(rows.map((row) => row.original.id));
  }, [onFilteredIdsChange, rows]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const index = selectedId ? idIndex.get(selectedId) : undefined;
    if (!viewport || index === undefined) return;
    rowVirtualizer.scrollToIndex(index, { align: "auto" });
  }, [idIndex, rowVirtualizer, selectedId]);

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
    if (next) onSelect(next.original.id);
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
        <div className="react-table__title-actions">
          <details className="react-table__column-manager">
            <summary>
              {t("table.columns")} {visibleDataColumnCount}/{dataColumns.length}
            </summary>
            <div className="react-table__column-menu">
              <div>
                <strong>{t("table.columnVisibility")}</strong>
                <button
                  type="button"
                  onClick={() => dataColumns.forEach((column) => column.toggleVisibility(true))}
                >
                  {t("table.showAllColumns")}
                </button>
              </div>
              <div className="react-table__column-list">
                <DndContext
                  sensors={dragSensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleColumnDragEnd}
                >
                  <SortableContext
                    items={dataColumns.map((column) => column.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    {dataColumns.map((column) => (
                      <SortableColumnOption
                        key={column.id}
                        column={column}
                        moveLabel={t("table.moveColumn", { column: column.id })}
                        pinStartLabel={t("table.pinColumnStart", { column: column.id })}
                        pinEndLabel={t("table.pinColumnEnd", { column: column.id })}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </div>
            </div>
          </details>
          <span className="react-table__virtual-badge">{t("table.virtualized")}</span>
        </div>
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
        </div>
        <details className={`react-table__filters${filterColumn ? " is-active" : ""}`}>
          <summary>{t("table.filters")}</summary>
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
        </details>
      </div>

      <div
        ref={viewportRef}
        className="react-table__viewport"
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={visibleColumns.length}
      >
        {table.getHeaderGroups().map((headerGroup) => (
          <div
            key={headerGroup.id}
            className="react-table__header"
            role="row"
            style={{ gridTemplateColumns: rowTemplate }}
          >
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              const pinned = header.column.getIsPinned();
              const pinnedStyle = pinned === "start"
                ? { left: `${header.column.getStart("start")}px` }
                : pinned === "end"
                  ? { right: `${header.column.getAfter("end")}px` }
                  : undefined;
              if (header.column.id === "__rowNumber") {
                return (
                  <span
                    key={header.id}
                    role="columnheader"
                    aria-label={t("table.rowNumber")}
                    className="is-pinned"
                    style={pinnedStyle}
                  />
                );
              }
              return (
                <span
                  key={header.id}
                  role="columnheader"
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                  className={pinned ? "is-pinned" : undefined}
                  style={pinnedStyle}
                >
                  <button
                    type="button"
                    className="react-table__sort-button"
                    title={header.column.id}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span>{header.column.id}</span>
                    {sorted && <i aria-hidden="true">{sorted === "asc" ? "↑" : "↓"}</i>}
                  </button>
                  <button
                    type="button"
                    className={`react-table__resizer${header.column.getIsResizing() ? " is-resizing" : ""}`}
                    aria-label={t("table.resizeColumn", { column: header.column.id })}
                    title={t("table.resetColumnWidth")}
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onDoubleClick={() => header.column.resetSize()}
                  />
                </span>
              );
            })}
          </div>
        ))}
        <div
          className="react-table__spacer"
          style={{ height: rowVirtualizer.getTotalSize() }}
        >
          {virtualRows.map((virtualRow) => {
              const row = rows[virtualRow.index];
              if (!row) return null;
              const absoluteIndex = virtualRow.index;
              const selected = row.original.id === selectedId;
              return (
                <button
                  key={row.id}
                  type="button"
                  role="row"
                  aria-rowindex={absoluteIndex + 1}
                  aria-selected={selected}
                  className={`react-table__row${selected ? " is-selected" : ""}`}
                  style={{
                    gridTemplateColumns: rowTemplate,
                    transform: `translateY(${virtualRow.start - HEADER_HEIGHT}px)`,
                  }}
                  onClick={() => onSelect(row.original.id)}
                  onKeyDown={(event) => handleRowKeyDown(event, absoluteIndex)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const pinned = cell.column.getIsPinned();
                    const pinnedStyle = pinned === "start"
                      ? { left: `${cell.column.getStart("start")}px` }
                      : pinned === "end"
                        ? { right: `${cell.column.getAfter("end")}px` }
                        : undefined;
                    if (cell.column.id === "__rowNumber") {
                      return (
                        <span
                          key={cell.id}
                          role="gridcell"
                          className="is-pinned"
                          style={pinnedStyle}
                        >
                          {absoluteIndex + 1}
                        </span>
                      );
                    }
                    const value = formatCell(cell.getValue());
                    return (
                      <span
                        key={cell.id}
                        role="gridcell"
                        title={value}
                        className={pinned ? "is-pinned" : undefined}
                        style={pinnedStyle}
                      >
                        <table.FlexRender cell={cell} />
                      </span>
                    );
                  })}
                </button>
              );
            })}
        </div>
      </div>
    </section>
  );
}
