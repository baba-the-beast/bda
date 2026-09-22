import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface Column<Row> {
  /** Stable key, also used as the sort key. */
  id: string;
  header: string;
  /** Cell contents. Keep formatting here, not in the row data. */
  cell: (row: Row) => ReactNode;
  /** Value used for sorting; omit to make the column unsortable. */
  sortValue?: (row: Row) => string | number | null;
  align?: 'left' | 'right';
  /** Marks figures so they render with tabular numerals. */
  numeric?: boolean;
  width?: string;
}

export interface TableProps<Row> {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Constrains height and makes the header stick while the body scrolls. */
  maxHeight?: string;
  empty?: ReactNode;
  className?: string;
}

type SortState = { columnId: string; direction: 'asc' | 'desc' } | null;

/**
 * Sortable table with a sticky header.
 *
 * Sorting is driven from the header cell's `aria-sort` and a real button, so
 * it is operable and announced by keyboard alone. The caption is visually
 * hidden but present, giving screen-reader users the table's purpose.
 *
 * Row virtualisation is deliberately not here yet: it lands in Phase 5, with
 * the routes whose row counts actually justify it.
 */
export function Table<Row>({
  caption,
  columns,
  rows,
  rowKey,
  maxHeight,
  empty,
  className,
}: TableProps<Row>) {
  const [sort, setSort] = useState<SortState>(null);

  const sorted = useMemo(() => {
    if (sort === null) return rows;
    const column = columns.find((c) => c.id === sort.columnId);
    const sortValue = column?.sortValue;
    if (sortValue === undefined) return rows;

    return [...rows].sort((a, b) => {
      const av = sortValue(a);
      const bv = sortValue(b);
      if (av === null && bv === null) return 0;
      if (av === null) return 1; // nulls always sort last
      if (bv === null) return -1;
      const result =
        typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av).localeCompare(String(bv));
      return sort.direction === 'asc' ? result : -result;
    });
  }, [rows, columns, sort]);

  const toggleSort = (columnId: string) => {
    setSort((current) =>
      current?.columnId === columnId
        ? current.direction === 'asc'
          ? { columnId, direction: 'desc' }
          : null
        : { columnId, direction: 'asc' },
    );
  };

  if (rows.length === 0 && empty !== undefined) {
    return <>{empty}</>;
  }

  return (
    <div
      className={cn('overflow-auto', className)}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
    >
      <table className="w-full border-collapse text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 z-sticky bg-surface-raised">
          <tr>
            {columns.map((column) => {
              const sortable = column.sortValue !== undefined;
              const active = sort?.columnId === column.id;
              const SortIcon = !active
                ? ChevronsUpDown
                : sort.direction === 'asc'
                  ? ArrowUp
                  : ArrowDown;

              return (
                <th
                  key={column.id}
                  scope="col"
                  style={column.width !== undefined ? { width: column.width } : undefined}
                  aria-sort={
                    active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined
                  }
                  className={cn(
                    'border-b border-border px-3 py-2 font-medium text-text-muted',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {sortable ? (
                    <button
                      type="button"
                      onClick={() => {
                        toggleSort(column.id);
                      }}
                      className={cn(
                        'inline-flex items-center gap-1 rounded-sm transition-colors duration-base hover:text-text',
                        column.align === 'right' && 'flex-row-reverse',
                      )}
                    >
                      {column.header}
                      <SortIcon
                        aria-hidden
                        className={cn('size-3', active ? 'text-accent' : 'text-text-subtle')}
                      />
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr
              key={rowKey(row)}
              className="transition-colors duration-fast hover:bg-surface-raised/60"
            >
              {columns.map((column) => (
                <td
                  key={column.id}
                  {...(column.numeric === true ? { 'data-numeric': true } : {})}
                  className={cn(
                    'border-b border-border/50 px-3 py-1.5 text-text',
                    column.align === 'right' ? 'text-right' : 'text-left',
                  )}
                >
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
