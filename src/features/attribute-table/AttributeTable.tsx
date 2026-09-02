import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DataGrid,
  type Column as GridColumn,
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
  type AttributeRow,
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
  resizable: false,
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

const useContainedGridInteraction = () => {
  const gridRef = useRef<DataGridHandle>(null);
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const grid = gridRef.current?.element;
    const outer = grid?.closest<HTMLElement>(".react-app");
    if (!grid || !outer) return;

    let wheelRestoreFrame = 0;
    const restoreOuterAfterWheel = (top: number, left: number) => {
      const restore = () => {
        outer.scrollTop = top;
        outer.scrollLeft = left;
      };
      window.cancelAnimationFrame(wheelRestoreFrame);
      restore();
      wheelRestoreFrame = window.requestAnimationFrame(() => {
        restore();
        wheelRestoreFrame = window.requestAnimationFrame(restore);
      });
    };

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const outerTop = outer.scrollTop;
      const outerLeft = outer.scrollLeft;
      const { left, top } = getWheelPixels(event, grid);
      grid.scrollLeft += left;
      grid.scrollTop += top;
      restoreOuterAfterWheel(outerTop, outerLeft);
    };

    grid.addEventListener("wheel", handleWheel, { capture: true, passive: false });
    return () => {
      window.cancelAnimationFrame(wheelRestoreFrame);
      grid.removeEventListener("wheel", handleWheel, true);
    };
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const outer = section?.closest<HTMLElement>(".react-app");
    if (!section || !outer) return;

    let restoreFrame = 0;
    const preserveOuterScroll = () => {
      const top = outer.scrollTop;
      const left = outer.scrollLeft;
      const restore = () => {
        outer.scrollTop = top;
        outer.scrollLeft = left;
      };
      window.cancelAnimationFrame(restoreFrame);
      queueMicrotask(restore);
      restoreFrame = window.requestAnimationFrame(() => {
        restore();
        restoreFrame = window.requestAnimationFrame(restore);
      });
    };

    section.addEventListener("pointerdown", preserveOuterScroll, true);
    section.addEventListener("mousedown", preserveOuterScroll, true);
    section.addEventListener("click", preserveOuterScroll, true);
    section.addEventListener("change", preserveOuterScroll, true);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      section.removeEventListener("pointerdown", preserveOuterScroll, true);
      section.removeEventListener("mousedown", preserveOuterScroll, true);
      section.removeEventListener("click", preserveOuterScroll, true);
      section.removeEventListener("change", preserveOuterScroll, true);
    };
  }, []);

  return { gridRef, sectionRef };
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
  onVisibleColumnOrderChange,
  onExport,
  exportOpen = false,
}: AttributeTableProps) {
  const { t } = useTranslation();
  const { gridRef, sectionRef } = useContainedGridInteraction();

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
    if (!sorting) return sourceRows;
    const direction = sorting.direction === "DESC" ? -1 : 1;
    return [...sourceRows].sort((left, right) => direction * compareAttributeValues(
      left.properties[sorting.columnKey],
      right.properties[sorting.columnKey],
    ));
  }, [gridSortColumns, sourceRows]);
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
        resizable: false,
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
    setGridSortColumns([]);
  }, [collection, columnOrder, datasetColumnKey]);

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
    <section ref={sectionRef} className="react-table" aria-labelledby="attribute-table-title">
      <div className="react-table__title">
        <div>
          <h2 id="attribute-table-title">{t("table.title")}</h2>
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

      <DataGrid
        ref={gridRef}
        className="react-table__grid"
        aria-label={t("table.title")}
        columns={gridColumns}
        rows={gridRows}
        rowKeyGetter={getGridRowKey}
        sortColumns={gridSortColumns}
        onSortColumnsChange={handleGridSortChange}
        onColumnsReorder={handleGridColumnReorder}
        onCellMouseDown={(_args, event) => event.preventGridDefault()}
        onCellClick={handleGridCellClick}
        rowClass={getGridRowClass}
        rowHeight={34}
        headerRowHeight={36}
        defaultColumnOptions={GRID_DEFAULT_COLUMN_OPTIONS}
      />
    </section>
  );
}
