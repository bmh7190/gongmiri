import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DataGrid,
  type Column as GridColumn,
  type ColumnWidths,
  type DataGridHandle,
  type SortColumn as GridSortColumn,
} from "react-data-grid";
import "react-data-grid/lib/styles.css";
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

const WIDTH_SAMPLE_LIMIT = 400;

type GridAttributeRow = AttributeRow & { __rowNumber: number };
type GridColumnConfig = { id: string; pinned: false | "start" | "end" };
type ManagedColumnState = {
  datasetKey: string;
  order: string[];
  hidden: string[];
  pinnedStart: string[];
  pinnedEnd: string[];
};

const GRID_DEFAULT_COLUMN_OPTIONS = {
  minWidth: 80,
  resizable: true,
  sortable: true,
  draggable: true,
} as const;
const getGridRowKey = (row: GridAttributeRow) => row.id;
const createManagedColumnState = (
  datasetKey: string,
  order: string[],
): ManagedColumnState => ({
  datasetKey,
  order,
  hidden: [],
  pinnedStart: [],
  pinnedEnd: [],
});

const getWheelPixels = (event: WheelEvent, grid: HTMLDivElement) => {
  const unit = event.deltaMode === WheelEvent.DOM_DELTA_LINE
    ? 34
    : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
      ? grid.clientHeight
      : 1;
  let left = event.deltaX * unit;
  let top = event.deltaY * unit;
  if (event.shiftKey && left === 0) {
    left = top;
    top = 0;
  }
  return { left, top };
};

const useIsolatedGridScroll = () => {
  const gridRef = useRef<DataGridHandle>(null);

  useLayoutEffect(() => {
    const grid = gridRef.current?.element;
    const outer = grid?.closest<HTMLElement>(".react-app");
    if (!grid || !outer) return;

    let pointerInside = false;
    let interactionLocked = false;
    let restoring = false;
    let releaseToken = 0;
    let lockedPosition = {
      outerTop: outer.scrollTop,
      outerLeft: outer.scrollLeft,
      gridTop: grid.scrollTop,
      gridLeft: grid.scrollLeft,
    };

    const rememberPosition = () => {
      lockedPosition = {
        outerTop: outer.scrollTop,
        outerLeft: outer.scrollLeft,
        gridTop: grid.scrollTop,
        gridLeft: grid.scrollLeft,
      };
    };
    const restoreOuter = () => {
      if (restoring) return;
      restoring = true;
      outer.scrollTop = lockedPosition.outerTop;
      outer.scrollLeft = lockedPosition.outerLeft;
      restoring = false;
    };
    const restoreInteraction = () => {
      if (restoring) return;
      restoring = true;
      outer.scrollTop = lockedPosition.outerTop;
      outer.scrollLeft = lockedPosition.outerLeft;
      grid.scrollTop = lockedPosition.gridTop;
      grid.scrollLeft = lockedPosition.gridLeft;
      restoring = false;
    };
    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      // Trackpad momentum can escape a nested scroller at either boundary even
      // with overscroll-behavior. Consume it here and move only the grid.
      event.preventDefault();
      event.stopImmediatePropagation();
      const { left, top } = getWheelPixels(event, grid);
      const outerTop = outer.scrollTop;
      const outerLeft = outer.scrollLeft;
      grid.scrollTop += top;
      grid.scrollLeft += left;
      outer.scrollTop = outerTop;
      outer.scrollLeft = outerLeft;
      lockedPosition.outerTop = outerTop;
      lockedPosition.outerLeft = outerLeft;
      lockedPosition.gridTop = grid.scrollTop;
      lockedPosition.gridLeft = grid.scrollLeft;
    };
    const handlePointerEnter = () => {
      pointerInside = true;
      rememberPosition();
    };
    const handlePointerLeave = () => {
      pointerInside = false;
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[role='columnheader'], [role='gridcell'], .rdg-resize-handle")) {
        return;
      }
      releaseToken += 1;
      interactionLocked = true;
      // React Data Grid focuses/scrolls active cells while resizing or sorting.
      // Keep both nested scroll containers at their pre-interaction positions.
      rememberPosition();
    };
    const releaseInteraction = () => {
      if (!interactionLocked) return;
      const token = ++releaseToken;
      restoreInteraction();
      window.requestAnimationFrame(() => {
        if (token !== releaseToken) return;
        restoreInteraction();
        window.requestAnimationFrame(() => {
          if (token !== releaseToken) return;
          restoreInteraction();
          interactionLocked = false;
        });
      });
    };
    const handleGridScroll = () => {
      if (interactionLocked) restoreInteraction();
    };
    const handleOuterScroll = () => {
      if (pointerInside || interactionLocked) restoreOuter();
    };

    grid.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    grid.addEventListener("pointerenter", handlePointerEnter);
    grid.addEventListener("pointerleave", handlePointerLeave);
    grid.addEventListener("pointerdown", handlePointerDown, true);
    grid.addEventListener("scroll", handleGridScroll);
    outer.addEventListener("scroll", handleOuterScroll);
    window.addEventListener("pointerup", releaseInteraction, true);
    window.addEventListener("pointercancel", releaseInteraction, true);
    return () => {
      releaseToken += 1;
      grid.removeEventListener("wheel", handleWheel, true);
      grid.removeEventListener("pointerenter", handlePointerEnter);
      grid.removeEventListener("pointerleave", handlePointerLeave);
      grid.removeEventListener("pointerdown", handlePointerDown, true);
      grid.removeEventListener("scroll", handleGridScroll);
      outer.removeEventListener("scroll", handleOuterScroll);
      window.removeEventListener("pointerup", releaseInteraction, true);
      window.removeEventListener("pointercancel", releaseInteraction, true);
    };
  }, []);

  return gridRef;
};

type SortableColumnOptionProps = {
  columnId: string;
  visible: boolean;
  pinned: false | "start" | "end";
  moveLabel: string;
  pinStartLabel: string;
  pinEndLabel: string;
  onToggleVisibility: () => void;
  onTogglePin: (side: "start" | "end") => void;
};

function SortableColumnOption({
  columnId,
  visible,
  pinned,
  moveLabel,
  pinStartLabel,
  pinEndLabel,
  onToggleVisibility,
  onTogglePin,
}: SortableColumnOptionProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: columnId });

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
          checked={visible}
          onChange={onToggleVisibility}
        />
        <span title={columnId}>{columnId}</span>
      </label>
      <div className="react-table__pin-actions">
        <button
          type="button"
          className={pinned === "start" ? "is-active" : ""}
          aria-label={pinStartLabel}
          aria-pressed={pinned === "start"}
          onClick={() => onTogglePin("start")}
        >
          ←
        </button>
        <button
          type="button"
          className={pinned === "end" ? "is-active" : ""}
          aria-label={pinEndLabel}
          aria-pressed={pinned === "end"}
          onClick={() => onTogglePin("end")}
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
  const gridRef = useIsolatedGridScroll();
  const [query, setQuery] = useState("");
  const [searchColumn, setSearchColumn] = useState("");
  const [filterColumn, setFilterColumn] = useState("");
  const [emptyFilter, setEmptyFilter] = useState<EmptyValueFilter>("all");
  const [minimum, setMinimum] = useState("");
  const [maximum, setMaximum] = useState("");
  const [gridColumnWidths, setGridColumnWidths] = useState<ColumnWidths>(() => new Map());

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
  const datasetColumnKey = columnOrder.join("\u0000");
  const [managedColumns, setManagedColumns] = useState<ManagedColumnState>(() => (
    createManagedColumnState(datasetColumnKey, columnOrder)
  ));
  const [gridSortColumns, setGridSortColumns] = useState<readonly GridSortColumn[]>([]);
  const resolvedManagedColumns = managedColumns.datasetKey === datasetColumnKey
    ? managedColumns
    : createManagedColumnState(datasetColumnKey, columnOrder);
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
  const estimatedColumnWidths = useMemo(() => {
    const stride = Math.max(1, Math.floor(sourceRows.length / WIDTH_SAMPLE_LIMIT));
    const sample = sourceRows
      .filter((_, index) => index % stride === 0)
      .slice(0, WIDTH_SAMPLE_LIMIT);
    return new Map(columnOrder.map((column) => [
      column,
      estimateWidth([column, ...sample.map((row) => row.properties[column])]),
    ]));
  }, [columnOrder, sourceRows]);
  const sortedRows = useMemo(() => {
    const sorting = gridSortColumns.at(-1);
    if (!sorting) return filteredRows;
    const direction = sorting.direction === "DESC" ? -1 : 1;
    return [...filteredRows].sort((left, right) => direction * compareAttributeValues(
      left.properties[sorting.columnKey],
      right.properties[sorting.columnKey],
    ));
  }, [filteredRows, gridSortColumns]);
  const hiddenColumnSet = useMemo(
    () => new Set(resolvedManagedColumns.hidden),
    [resolvedManagedColumns.hidden],
  );
  const pinnedStartSet = useMemo(
    () => new Set(resolvedManagedColumns.pinnedStart),
    [resolvedManagedColumns.pinnedStart],
  );
  const pinnedEndSet = useMemo(
    () => new Set(resolvedManagedColumns.pinnedEnd),
    [resolvedManagedColumns.pinnedEnd],
  );
  const visibleDataColumnIds = useMemo(() => [
    ...resolvedManagedColumns.pinnedStart.filter((id) => !hiddenColumnSet.has(id)),
    ...resolvedManagedColumns.order.filter((id) => (
      !hiddenColumnSet.has(id) && !pinnedStartSet.has(id) && !pinnedEndSet.has(id)
    )),
    ...resolvedManagedColumns.pinnedEnd.filter((id) => !hiddenColumnSet.has(id)),
  ], [hiddenColumnSet, pinnedEndSet, pinnedStartSet, resolvedManagedColumns]);
  const visibleDataColumnCount = visibleDataColumnIds.length;
  const visibleDataColumnOrderKey = visibleDataColumnIds.join("\u0000");
  const stableGridColumnConfigs = useMemo<GridColumnConfig[]>(() => [
    { id: "__rowNumber", pinned: "start" },
    ...visibleDataColumnIds.map((id) => ({
      id,
      pinned: pinnedStartSet.has(id) ? "start" as const
        : pinnedEndSet.has(id) ? "end" as const
          : false as const,
    })),
  ], [pinnedEndSet, pinnedStartSet, visibleDataColumnIds]);
  const dragSensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const handleColumnDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    handleGridColumnReorder(String(active.id), String(over.id));
  };
  const gridRows = useMemo<GridAttributeRow[]>(
    () => sortedRows.map((row, index) => ({ ...row, __rowNumber: index + 1 })),
    [sortedRows],
  );
  const gridColumns = useMemo<readonly GridColumn<GridAttributeRow>[]>(
    () => stableGridColumnConfigs.map(({ id, pinned }) => {
      if (id === "__rowNumber") {
        return {
          key: id,
          name: "",
          width: 54,
          minWidth: 54,
          maxWidth: 54,
          frozen: "start",
          resizable: false,
          sortable: false,
          draggable: false,
          renderCell: ({ row }) => row.__rowNumber,
        };
      }
      return {
        key: id,
        name: id || t("table.unnamed"),
        width: estimatedColumnWidths.get(id) ?? 150,
        minWidth: 80,
        frozen: pinned === "start" ? "start" : pinned === "end" ? "end" : false,
        resizable: true,
        sortable: true,
        draggable: true,
        renderCell: ({ row }) => formatCell(row.properties[id]),
      };
    }),
    [estimatedColumnWidths, stableGridColumnConfigs, t],
  );
  useEffect(() => {
    setManagedColumns((current) => current.datasetKey === datasetColumnKey
      ? current
      : createManagedColumnState(datasetColumnKey, columnOrder));
    setGridColumnWidths(new Map());
    setGridSortColumns([]);
  }, [collection, columnOrder, datasetColumnKey]);

  useEffect(() => {
    onFilteredIdsChange?.(filteredFeatureIds);
  }, [filteredFeatureIds, onFilteredIdsChange]);

  useEffect(() => {
    onVisibleColumnOrderChange?.(visibleDataColumnIds);
  }, [onVisibleColumnOrderChange, visibleDataColumnOrderKey]);

  const handleGridSortChange = useCallback((next: GridSortColumn[]) => {
    setGridSortColumns(next.slice(-1));
  }, []);
  const handleGridColumnReorder = useCallback((sourceId: string, targetId: string) => {
    setManagedColumns((current) => {
      const state = current.datasetKey === datasetColumnKey
        ? current
        : createManagedColumnState(datasetColumnKey, columnOrder);
      const previousIndex = state.order.indexOf(sourceId);
      const nextIndex = state.order.indexOf(targetId);
      if (previousIndex < 0 || nextIndex < 0) return state;
      return { ...state, order: arrayMove(state.order, previousIndex, nextIndex) };
    });
  }, [columnOrder, datasetColumnKey]);
  const handleToggleColumnVisibility = useCallback((columnId: string) => {
    setManagedColumns((current) => {
      const state = current.datasetKey === datasetColumnKey
        ? current
        : createManagedColumnState(datasetColumnKey, columnOrder);
      const hidden = new Set(state.hidden);
      if (hidden.has(columnId)) hidden.delete(columnId);
      else hidden.add(columnId);
      return { ...state, hidden: [...hidden] };
    });
  }, [columnOrder, datasetColumnKey]);
  const handleToggleColumnPin = useCallback((columnId: string, side: "start" | "end") => {
    setManagedColumns((current) => {
      const state = current.datasetKey === datasetColumnKey
        ? current
        : createManagedColumnState(datasetColumnKey, columnOrder);
      const pinnedStart = state.pinnedStart.filter((id) => id !== columnId);
      const pinnedEnd = state.pinnedEnd.filter((id) => id !== columnId);
      const alreadyPinned = side === "start"
        ? state.pinnedStart.includes(columnId)
        : state.pinnedEnd.includes(columnId);
      if (!alreadyPinned) {
        (side === "start" ? pinnedStart : pinnedEnd).push(columnId);
      }
      return { ...state, pinnedStart, pinnedEnd };
    });
  }, [columnOrder, datasetColumnKey]);
  const handleShowAllColumns = useCallback(() => {
    setManagedColumns((current) => ({ ...current, hidden: [] }));
  }, []);
  const handleGridCellClick = useCallback(
    ({ row }: { row: GridAttributeRow }) => onSelect(row.id),
    [onSelect],
  );
  const getGridRowClass = useCallback(
    (row: GridAttributeRow) => row.id === selectedId ? "is-selected" : undefined,
    [selectedId],
  );

  return (
    <section className="react-table" aria-labelledby="attribute-table-title">
      <div className="react-table__title">
        <div>
          <h2 id="attribute-table-title">{t("table.title")}</h2>
          <p>
            {t("table.filteredRowCount", {
              count: sortedRows.length,
              filtered: sortedRows.length.toLocaleString(i18n.language),
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
              {t("table.columns")} {visibleDataColumnCount}/{resolvedManagedColumns.order.length}
            </summary>
            <div className="react-table__column-menu">
              <div>
                <strong>{t("table.columnVisibility")}</strong>
                <button
                  type="button"
                  onClick={handleShowAllColumns}
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
                    items={resolvedManagedColumns.order}
                    strategy={verticalListSortingStrategy}
                  >
                    {resolvedManagedColumns.order.map((columnId) => (
                      <SortableColumnOption
                        key={columnId}
                        columnId={columnId}
                        visible={!hiddenColumnSet.has(columnId)}
                        pinned={pinnedStartSet.has(columnId) ? "start"
                          : pinnedEndSet.has(columnId) ? "end" : false}
                        moveLabel={t("table.moveColumn", { column: columnId })}
                        pinStartLabel={t("table.pinColumnStart", { column: columnId })}
                        pinEndLabel={t("table.pinColumnEnd", { column: columnId })}
                        onToggleVisibility={() => handleToggleColumnVisibility(columnId)}
                        onTogglePin={(side) => handleToggleColumnPin(columnId, side)}
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

      <DataGrid
        ref={gridRef}
        className="react-table__grid"
        aria-label={t("table.title")}
        columns={gridColumns}
        rows={gridRows}
        rowKeyGetter={getGridRowKey}
        columnWidths={gridColumnWidths}
        onColumnWidthsChange={setGridColumnWidths}
        sortColumns={gridSortColumns}
        onSortColumnsChange={handleGridSortChange}
        onColumnsReorder={handleGridColumnReorder}
        onCellClick={handleGridCellClick}
        rowClass={getGridRowClass}
        rowHeight={34}
        headerRowHeight={36}
        defaultColumnOptions={GRID_DEFAULT_COLUMN_OPTIONS}
      />
    </section>
  );
}
