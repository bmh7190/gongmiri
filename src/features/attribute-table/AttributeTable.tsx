import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import {
  DataGrid,
  type Column as GridColumn,
  type ColumnWidths,
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
import {
  columnOrderingFeature,
  columnPinningFeature,
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

const WIDTH_SAMPLE_LIMIT = 400;

const TABLE_FEATURES = tableFeatures({
  columnOrderingFeature,
  columnPinningFeature,
  columnVisibilityFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
});
const columnHelper = createColumnHelper<typeof TABLE_FEATURES, AttributeRow>();

type AttributeColumn = Column<typeof TABLE_FEATURES, AttributeRow, unknown>;
type GridAttributeRow = AttributeRow & { __rowNumber: number };

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
  const tableColumns = useMemo(() => {
    return columnHelper.columns([
      columnHelper.display({
        id: "__rowNumber",
        header: "",
        enableSorting: false,
      }),
      ...columnOrder.map((column) => columnHelper.accessor(
        (row) => row.properties[column],
        {
          id: column,
          header: column || t("table.unnamed"),
          cell: (cell) => formatCell(cell.getValue()),
          sortFn: (left, right) => compareAttributeValues(
            left.original.properties[column],
            right.original.properties[column],
          ),
          sortUndefined: "last",
        },
      )),
    ]);
  }, [columnOrder, t]);
  const table = useTable(
    {
      features: TABLE_FEATURES,
      columns: tableColumns,
      data: filteredRows,
      getRowId: (row) => row.id,
      enableMultiSort: false,
      enableSortingRemoval: true,
      sortDescFirst: false,
      initialState: {
        columnPinning: { start: ["__rowNumber"], end: [] },
      },
    },
    (state) => ({
      columnOrder: state.columnOrder,
      columnPinning: state.columnPinning,
      columnVisibility: state.columnVisibility,
      sorting: state.sorting,
    }),
  );
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
  const gridRows = useMemo<GridAttributeRow[]>(
    () => rows.map((row, index) => ({ ...row.original, __rowNumber: index + 1 })),
    [rows],
  );
  const gridColumns = useMemo<readonly GridColumn<GridAttributeRow>[]>(
    () => visibleColumns.map((column) => {
      const pinned = column.getIsPinned();
      if (column.id === "__rowNumber") {
        return {
          key: column.id,
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
        key: column.id,
        name: column.id || t("table.unnamed"),
        width: estimatedColumnWidths.get(column.id) ?? 150,
        minWidth: 80,
        frozen: pinned === "start" ? "start" : pinned === "end" ? "end" : false,
        resizable: true,
        sortable: true,
        draggable: true,
        renderCell: ({ row }) => formatCell(row.properties[column.id]),
      };
    }),
    [estimatedColumnWidths, t, visibleDataColumnOrderKey, visibleColumns],
  );
  const gridSortColumns = useMemo<readonly GridSortColumn[]>(
    () => table.state.sorting.map((sorting) => ({
      columnKey: sorting.id,
      direction: sorting.desc ? "DESC" : "ASC",
    })),
    [table.state.sorting],
  );

  useEffect(() => {
    setGridColumnWidths(new Map());
  }, [collection]);

  useEffect(() => {
    onFilteredIdsChange?.(filteredFeatureIds);
  }, [filteredFeatureIds, onFilteredIdsChange]);

  useEffect(() => {
    onVisibleColumnOrderChange?.(visibleDataColumnIds);
  }, [onVisibleColumnOrderChange, visibleDataColumnOrderKey]);

  const handleGridSortChange = useCallback((next: GridSortColumn[]) => {
    const sorting = next.at(-1);
    table.setSorting(sorting ? [{
      id: sorting.columnKey,
      desc: sorting.direction === "DESC",
    }] : []);
  }, [table]);
  const handleGridColumnReorder = useCallback((sourceId: string, targetId: string) => {
    const order = dataColumns.map((column) => column.id);
    const previousIndex = order.indexOf(sourceId);
    const nextIndex = order.indexOf(targetId);
    if (previousIndex < 0 || nextIndex < 0) return;
    table.setColumnOrder(["__rowNumber", ...arrayMove(order, previousIndex, nextIndex)]);
  }, [dataColumns, table]);

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

      <DataGrid
        className="react-table__grid"
        aria-label={t("table.title")}
        columns={gridColumns}
        rows={gridRows}
        rowKeyGetter={(row) => row.id}
        columnWidths={gridColumnWidths}
        onColumnWidthsChange={setGridColumnWidths}
        sortColumns={gridSortColumns}
        onSortColumnsChange={handleGridSortChange}
        onColumnsReorder={handleGridColumnReorder}
        onCellClick={({ row }) => onSelect(row.id)}
        rowClass={(row) => row.id === selectedId ? "is-selected" : undefined}
        rowHeight={34}
        headerRowHeight={36}
        defaultColumnOptions={{
          minWidth: 80,
          resizable: true,
          sortable: true,
          draggable: true,
        }}
      />
    </section>
  );
}
