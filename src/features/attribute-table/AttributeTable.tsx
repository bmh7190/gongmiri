import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type TouchEvent as ReactTouchEvent,
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

const ROWS_PER_PAGE = 100;
const WIDTH_SAMPLE_LIMIT = 400;

export const shouldContainTableWheel = ({
  scrollTop,
  clientHeight,
  scrollHeight,
  deltaY,
}: {
  scrollTop: number;
  clientHeight: number;
  scrollHeight: number;
  deltaY: number;
}) => {
  if (deltaY === 0) return false;
  const atTop = scrollTop <= 0;
  const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
  return (deltaY < 0 && atTop) || (deltaY > 0 && atBottom);
};

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
  onVisibleColumnOrderChange?: (columnIds: string[]) => void;
  onExport?: (trigger: HTMLButtonElement) => void;
  exportOpen?: boolean;
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
  onVisibleColumnOrderChange,
  onExport,
  exportOpen = false,
}: AttributeTableProps) {
  const { t, i18n } = useTranslation();
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const pendingSortScrollRef = useRef<{
    viewportTop: number;
    viewportLeft: number;
    appTop: number;
    appLeft: number;
    appScroller: HTMLElement | null;
  } | null>(null);
  const [query, setQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [emptyFilter, setEmptyFilter] = useState<EmptyValueFilter>("all");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [pageIndex, setPageIndex] = useState(0);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizingColumnId, setResizingColumnId] = useState<string | false>(false);
  const resizeInteractionRef = useRef<{
    columnId: string;
    startX: number;
    startSize: number;
    nextSize: number;
    minimumSize: number;
    maximumSize: number;
  } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

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
  const filteredFeatureIds = useMemo(
    () => filteredRows.map((row) => row.id),
    [filteredRows],
  );
  const tableColumns = useMemo(() => {
    const stride = Math.max(1, Math.floor(sourceRows.length / WIDTH_SAMPLE_LIMIT));
    const sample = sourceRows
      .filter((_, index) => index % stride === 0)
      .slice(0, WIDTH_SAMPLE_LIMIT);
    return columnHelper.columns([
      columnHelper.display({
        id: "__rowNumber",
        header: "",
        size: 54,
        minSize: 54,
        maxSize: 54,
        enableResizing: false,
        enableSorting: false,
      }),
      ...columnOrder.map((column) => columnHelper.accessor(
        (row) => row.properties[column],
        {
          id: column,
          header: column || t("table.unnamed"),
          cell: (cell) => formatCell(cell.getValue()),
          minSize: 80,
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
  }, [columnOrder, sourceRows, t]);
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
  const headerGroups = table.getHeaderGroups();
  const visibleColumns = headerGroups[headerGroups.length - 1]?.headers.map(
    (header) => header.column,
  ) ?? table.getVisibleLeafColumns();
  const dataColumns = table
    .getAllLeafColumns()
    .filter((column) => column.id !== "__rowNumber");
  const visibleDataColumnCount = dataColumns.filter((column) => column.getIsVisible()).length;
  const visibleDataColumnIds = visibleColumns
    .filter((column) => column.id !== "__rowNumber")
    .map((column) => column.id);
  const visibleDataColumnOrderKey = visibleDataColumnIds.join("\u0000");
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
  const getColumnWidth = useCallback((column: AttributeColumn) => {
    const minimumSize = column.columnDef.minSize ?? 20;
    const maximumSize = column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER;
    return Math.min(
      maximumSize,
      Math.max(
        minimumSize,
        columnWidths[column.id] ?? column.columnDef.size ?? 150,
      ),
    );
  }, [columnWidths]);
  const rowTemplate = visibleColumns
    .map((column) => `${getColumnWidth(column)}px`)
    .join(" ");
  const columnGridStyle = {
    "--react-table-columns": rowTemplate,
  } as CSSProperties;
  const startPinnedColumns = visibleColumns.filter(
    (column) => column.getIsPinned() === "start",
  );
  const endPinnedColumns = visibleColumns.filter(
    (column) => column.getIsPinned() === "end",
  );
  const startPinnedOffsets = new Map<string, number>();
  let startPinnedOffset = 0;
  startPinnedColumns.forEach((column) => {
    startPinnedOffsets.set(column.id, startPinnedOffset);
    startPinnedOffset += getColumnWidth(column);
  });
  const endPinnedOffsets = new Map<string, number>();
  let endPinnedOffset = 0;
  [...endPinnedColumns].reverse().forEach((column) => {
    endPinnedOffsets.set(column.id, endPinnedOffset);
    endPinnedOffset += getColumnWidth(column);
  });
  const startPinnedEdgeId = startPinnedColumns[startPinnedColumns.length - 1]?.id;
  const endPinnedEdgeId = endPinnedColumns[0]?.id;
  const getCellClassName = useCallback((column: AttributeColumn) => {
    const pinned = column.getIsPinned();
    return [
      pinned ? "is-pinned" : "",
      (pinned === "start" && column.id === startPinnedEdgeId)
      || (pinned === "end" && column.id === endPinnedEdgeId)
        ? "is-pinned-edge"
        : "",
      column.id === resizingColumnId ? "is-resizing" : "",
    ].filter(Boolean).join(" ") || undefined;
  }, [endPinnedEdgeId, resizingColumnId, startPinnedEdgeId]);
  const pinnedOffsetsKey = [
    ...startPinnedColumns.map(
      (column) => `${column.id}:${startPinnedOffsets.get(column.id) ?? 0}`,
    ),
    ...endPinnedColumns.map(
      (column) => `${column.id}:${endPinnedOffsets.get(column.id) ?? 0}`,
    ),
  ].join("|");
  const getPinnedStyle = useCallback((column: AttributeColumn) => {
    const pinned = column.getIsPinned();
    if (pinned === "start") {
      return { left: `${startPinnedOffsets.get(column.id) ?? 0}px` };
    }
    if (pinned === "end") {
      return { right: `${endPinnedOffsets.get(column.id) ?? 0}px` };
    }
    return undefined;
  }, [pinnedOffsetsKey]);
  const pageCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
  const pageStart = pageIndex * ROWS_PER_PAGE;
  const pageRows = useMemo(
    () => rows.slice(pageStart, pageStart + ROWS_PER_PAGE),
    [pageStart, rows],
  );

  useEffect(() => {
    if (pageIndex < pageCount) return;
    setPageIndex(pageCount - 1);
    viewportRef.current?.scrollTo({ top: 0 });
  }, [pageCount, pageIndex]);

  useEffect(() => {
    setColumnWidths({});
  }, [collection]);

  useEffect(() => {
    onFilteredIdsChange?.(filteredFeatureIds);
  }, [filteredFeatureIds, onFilteredIdsChange]);

  useEffect(() => {
    onVisibleColumnOrderChange?.(visibleDataColumnIds);
  }, [onVisibleColumnOrderChange, visibleDataColumnOrderKey]);

  useLayoutEffect(() => {
    const pending = pendingSortScrollRef.current;
    if (!pending) return;
    pendingSortScrollRef.current = null;

    const restoreScroll = () => {
      const viewport = viewportRef.current;
      if (viewport) {
        viewport.scrollTop = pending.viewportTop;
        viewport.scrollLeft = pending.viewportLeft;
      }
      if (pending.appScroller) {
        pending.appScroller.scrollTop = pending.appTop;
        pending.appScroller.scrollLeft = pending.appLeft;
      }
    };

    restoreScroll();
    const frame = requestAnimationFrame(restoreScroll);
    return () => cancelAnimationFrame(frame);
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const containBoundaryWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) return;
      if (!shouldContainTableWheel({
        scrollTop: viewport.scrollTop,
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
        deltaY: event.deltaY,
      })) return;
      event.preventDefault();
      event.stopPropagation();
    };

    viewport.addEventListener("wheel", containBoundaryWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", containBoundaryWheel);
  }, []);

  useEffect(() => () => {
    if (resizeFrameRef.current !== null) {
      cancelAnimationFrame(resizeFrameRef.current);
    }
    resizeCleanupRef.current?.();
  }, []);

  const showPage = (nextPage: number) => {
    setPageIndex(nextPage);
    viewportRef.current?.scrollTo({ top: 0 });
  };

  const handleSort = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    const viewport = viewportRef.current;
    const appScroller = viewport?.closest<HTMLElement>(".react-app") ?? null;
    if (viewport) {
      pendingSortScrollRef.current = {
        viewportTop: viewport.scrollTop,
        viewportLeft: viewport.scrollLeft,
        appTop: appScroller?.scrollTop ?? 0,
        appLeft: appScroller?.scrollLeft ?? 0,
        appScroller,
      };
    }
    const columnId = event.currentTarget
      .closest<HTMLElement>("[data-column-id]")
      ?.dataset.columnId;
    if (columnId) {
      table.getColumn(columnId)?.getToggleSortingHandler()?.(event);
    }
  };

  const commitPendingColumnSize = () => {
    resizeFrameRef.current = null;
    const interaction = resizeInteractionRef.current;
    if (!interaction) return;
    setColumnWidths((current) => ({
      ...current,
      [interaction.columnId]: interaction.nextSize,
    }));
  };

  const updateColumnSize = (clientX: number, immediate = false) => {
    const interaction = resizeInteractionRef.current;
    if (!interaction) return;
    interaction.nextSize = Math.min(
      interaction.maximumSize,
      Math.max(
        interaction.minimumSize,
        interaction.startSize + clientX - interaction.startX,
      ),
    );
    if (immediate) {
      if (resizeFrameRef.current !== null) {
        cancelAnimationFrame(resizeFrameRef.current);
      }
      commitPendingColumnSize();
      return;
    }
    if (resizeFrameRef.current === null) {
      resizeFrameRef.current = requestAnimationFrame(commitPendingColumnSize);
    }
  };

  const startColumnResize = (
    clientX: number,
    columnId: string,
    startSize: number,
    minimumSize: number,
    maximumSize: number,
  ) => {
    resizeCleanupRef.current?.();
    resizeInteractionRef.current = {
      columnId,
      startX: clientX,
      startSize,
      nextSize: startSize,
      minimumSize,
      maximumSize,
    };
    setResizingColumnId(columnId);
  };

  const finishColumnResize = (clientX?: number) => {
    if (!resizeInteractionRef.current) return;
    if (typeof clientX === "number") updateColumnSize(clientX, true);
    else commitPendingColumnSize();
    resizeInteractionRef.current = null;
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    setResizingColumnId(false);
  };

  const resetColumnSize = (event: ReactMouseEvent<HTMLButtonElement>) => {
    const columnId = event.currentTarget.dataset.columnId;
    if (!columnId) return;
    setColumnWidths((current) => {
      if (!(columnId in current)) return current;
      const next = { ...current };
      delete next[columnId];
      return next;
    });
  };

  const beginMouseColumnResize = (
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    const columnId = event.currentTarget.dataset.columnId;
    const headerCell = event.currentTarget.closest<HTMLElement>("[role=columnheader]");
    if (!columnId || !headerCell) return;
    event.preventDefault();
    startColumnResize(
      event.clientX,
      columnId,
      headerCell.getBoundingClientRect().width,
      Number(event.currentTarget.dataset.minSize ?? 80),
      Number(event.currentTarget.dataset.maxSize ?? Number.MAX_SAFE_INTEGER),
    );
    const ownerDocument = event.currentTarget.ownerDocument;
    const onMove = (moveEvent: globalThis.MouseEvent) => {
      updateColumnSize(moveEvent.clientX);
    };
    const onEnd = (endEvent: globalThis.MouseEvent) => {
      finishColumnResize(endEvent.clientX);
    };
    const onBlur = () => finishColumnResize();
    const cleanup = () => {
      ownerDocument.removeEventListener("mousemove", onMove);
      ownerDocument.removeEventListener("mouseup", onEnd);
      ownerDocument.defaultView?.removeEventListener("blur", onBlur);
    };
    resizeCleanupRef.current = cleanup;
    ownerDocument.addEventListener("mousemove", onMove);
    ownerDocument.addEventListener("mouseup", onEnd);
    ownerDocument.defaultView?.addEventListener("blur", onBlur);
  };

  const beginTouchColumnResize = (
    event: ReactTouchEvent<HTMLButtonElement>,
  ) => {
    const columnId = event.currentTarget.dataset.columnId;
    const headerCell = event.currentTarget.closest<HTMLElement>("[role=columnheader]");
    if (!columnId || !headerCell || event.touches.length !== 1) return;
    event.preventDefault();
    startColumnResize(
      event.touches[0].clientX,
      columnId,
      headerCell.getBoundingClientRect().width,
      Number(event.currentTarget.dataset.minSize ?? 80),
      Number(event.currentTarget.dataset.maxSize ?? Number.MAX_SAFE_INTEGER),
    );
    const ownerDocument = event.currentTarget.ownerDocument;
    const onMove = (moveEvent: globalThis.TouchEvent) => {
      if (moveEvent.cancelable) moveEvent.preventDefault();
      const touch = moveEvent.touches[0];
      if (touch) updateColumnSize(touch.clientX);
    };
    const onEnd = (endEvent: globalThis.TouchEvent) => {
      finishColumnResize(endEvent.changedTouches[0]?.clientX);
    };
    const onCancel = () => finishColumnResize();
    const cleanup = () => {
      ownerDocument.removeEventListener("touchmove", onMove);
      ownerDocument.removeEventListener("touchend", onEnd);
      ownerDocument.removeEventListener("touchcancel", onCancel);
    };
    resizeCleanupRef.current = cleanup;
    ownerDocument.addEventListener("touchmove", onMove, { passive: false });
    ownerDocument.addEventListener("touchend", onEnd);
    ownerDocument.addEventListener("touchcancel", onCancel);
  };

  const handleRowKeyDown = useCallback((
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
    if (next) {
      showPage(Math.floor(nextIndex / ROWS_PER_PAGE));
      onSelect(next.original.id);
    }
  }, [onSelect, rows]);

  const renderedPageRows = useMemo(() => pageRows.map((row, pageRowIndex) => {
    const absoluteIndex = pageStart + pageRowIndex;
    const selected = row.original.id === selectedId;
    return (
      <button
        key={row.id}
        type="button"
        role="row"
        aria-rowindex={absoluteIndex + 1}
        aria-selected={selected}
        className={`react-table__row${selected ? " is-selected" : ""}`}
        onClick={() => onSelect(row.original.id)}
        onKeyDown={(event) => handleRowKeyDown(event, absoluteIndex)}
      >
        {row.getVisibleCells().map((cell) => {
          const pinnedStyle = getPinnedStyle(cell.column);
          if (cell.column.id === "__rowNumber") {
            return (
              <span
                key={cell.id}
                role="gridcell"
                data-column-id={cell.column.id}
                className={getCellClassName(cell.column)}
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
              data-column-id={cell.column.id}
              className={getCellClassName(cell.column)}
              style={pinnedStyle}
            >
              <table.FlexRender cell={cell} />
            </span>
          );
        })}
      </button>
    );
  }), [
    getCellClassName,
    getPinnedStyle,
    handleRowKeyDown,
    onSelect,
    pageRows,
    pageStart,
    pinnedOffsetsKey,
    selectedId,
    table.FlexRender,
  ]);

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
          {onExport && (
            <button
              type="button"
              className="react-table__export-button"
              aria-label={t("export.open")}
              aria-controls="export-dialog"
              aria-expanded={exportOpen}
              title={t("export.open")}
              onClick={(event) => onExport(event.currentTarget)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 3v10m0 0 4-4m-4 4-4-4M5 15v4h14v-4" />
              </svg>
            </button>
          )}
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
                  autoScroll={false}
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
        className={`react-table__viewport${resizingColumnId ? " is-resizing" : ""}`}
        role="grid"
        aria-rowcount={rows.length}
        aria-colcount={visibleColumns.length}
        style={columnGridStyle}
      >
        {headerGroups.map((headerGroup) => (
          <div
            key={headerGroup.id}
            className="react-table__header"
            role="row"
          >
            {headerGroup.headers.map((header) => {
              const sorted = header.column.getIsSorted();
              const pinnedStyle = getPinnedStyle(header.column);
              if (header.column.id === "__rowNumber") {
                return (
                  <span
                    key={header.column.id}
                    role="columnheader"
                    aria-label={t("table.rowNumber")}
                    data-column-id={header.column.id}
                    className={getCellClassName(header.column)}
                    style={pinnedStyle}
                  />
                );
              }
              return (
                <span
                  key={header.column.id}
                  role="columnheader"
                  aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
                  data-column-id={header.column.id}
                  className={getCellClassName(header.column)}
                  style={pinnedStyle}
                >
                  <button
                    type="button"
                    className="react-table__sort-button"
                    title={header.column.id}
                    onClick={handleSort}
                  >
                    <span>{header.column.id}</span>
                    {sorted && <i aria-hidden="true">{sorted === "asc" ? "↑" : "↓"}</i>}
                  </button>
                  <button
                    type="button"
                    className={`react-table__resizer${header.column.getIsResizing() ? " is-resizing" : ""}`}
                    aria-label={t("table.resizeColumn", { column: header.column.id })}
                    aria-orientation="vertical"
                    title={t("table.resetColumnWidth")}
                    data-column-id={header.column.id}
                    data-min-size={header.column.columnDef.minSize ?? 80}
                    data-max-size={header.column.columnDef.maxSize ?? Number.MAX_SAFE_INTEGER}
                    onMouseDown={beginMouseColumnResize}
                    onTouchStart={beginTouchColumnResize}
                    onDoubleClick={resetColumnSize}
                  />
                </span>
              );
            })}
          </div>
        ))}
        <div className="react-table__body">
          {renderedPageRows}
        </div>
      </div>
      <nav className="react-table__pagination" aria-label={t("table.pagination")}>
        <button
          type="button"
          disabled={pageIndex === 0}
          onClick={() => showPage(Math.max(0, pageIndex - 1))}
        >
          {t("table.previousPage")}
        </button>
        <span>{t("table.pageStatus", { current: pageIndex + 1, total: pageCount })}</span>
        <button
          type="button"
          disabled={pageIndex >= pageCount - 1}
          onClick={() => showPage(Math.min(pageCount - 1, pageIndex + 1))}
        >
          {t("table.nextPage")}
        </button>
      </nav>
    </section>
  );
}
