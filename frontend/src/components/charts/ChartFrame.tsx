import { BarChart3, Table2 } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/States';

import { useChartChrome } from './theme';

export interface ChartSeriesMeta {
  name: string;
  /** Slot index into the fixed categorical order. */
  colorIndex: number;
}

export interface ChartFrameProps {
  /** Names the figure for assistive technology and the table view. */
  title: string;
  /** One sentence stating what the chart shows, read instead of the canvas. */
  description: string;
  series: readonly ChartSeriesMeta[];
  /** Header row for the table twin. */
  tableColumns: readonly string[];
  /** Already-formatted cells. Formatting belongs to the caller, not the table. */
  tableRows: readonly (readonly string[])[];
  /** True while a refetch is in flight: the old render is held, dimmed. */
  refreshing?: boolean;
  /**
   * For a chart inside a fixed-size card whose header already names it: the
   * title and description move to assistive technology only, the table toggle
   * shrinks to an icon, and the plot fills whatever height is left.
   */
  compact?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * The shell every chart sits in.
 *
 * It supplies the three things a canvas cannot: a legend (identity without
 * relying on colour alone), a text description, and a table twin holding the
 * same numbers. A tooltip is an enhancement; the table is the guarantee.
 */
export function ChartFrame({
  title,
  description,
  series,
  tableColumns,
  tableRows,
  refreshing = false,
  compact = false,
  children,
  className,
}: ChartFrameProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart');
  const descriptionId = useId();
  const { palette } = useChartChrome();

  const isEmpty = tableRows.length === 0;

  return (
    <figure
      className={cn('m-0 flex flex-col gap-2', compact && 'relative h-full min-h-0', className)}
    >
      <figcaption
        className={cn(
          'flex flex-wrap items-center justify-between gap-2',
          compact && 'absolute right-2 top-2 z-base',
        )}
      >
        <div className={cn('flex flex-col gap-1', compact && 'sr-only')}>
          <p className="text-xs font-medium text-text">{title}</p>
          <p id={descriptionId} className="text-2xs text-text-muted">
            {description}
          </p>
        </div>

        <Button
          size="sm"
          variant="ghost"
          aria-pressed={view === 'table'}
          aria-label={compact ? (view === 'chart' ? 'View as table' : 'View as chart') : undefined}
          title={compact ? (view === 'chart' ? 'View as table' : 'View as chart') : undefined}
          onClick={() => {
            setView((current) => (current === 'chart' ? 'table' : 'chart'));
          }}
          icon={
            view === 'chart' ? (
              <Table2 aria-hidden className="size-3.5" />
            ) : (
              <BarChart3 aria-hidden className="size-3.5" />
            )
          }
        >
          {compact ? null : view === 'chart' ? 'View as table' : 'View as chart'}
        </Button>
      </figcaption>

      {/* A legend is always present for two or more series, so identity never
          depends on colour alone. One series needs none: the title names it. */}
      {series.length > 1 && (
        <ul className="flex flex-wrap items-center gap-3">
          {series.map((item) => (
            <li key={item.name} className="flex items-center gap-1.5 text-2xs text-text-muted">
              <span
                aria-hidden
                className="size-2 shrink-0 rounded-sm"
                style={{ backgroundColor: palette[item.colorIndex % palette.length] }}
              />
              {item.name}
            </li>
          ))}
        </ul>
      )}

      {isEmpty ? (
        <EmptyState
          title="No data for this selection"
          description="Pick a different dataset or date range."
        />
      ) : view === 'chart' ? (
        <div
          // Held at reduced opacity during a refetch rather than collapsing to a
          // skeleton, which would jump the layout on every poll.
          className={cn(
            'transition-opacity duration-base',
            refreshing && 'opacity-60',
            compact && 'min-h-0 flex-1',
          )}
          aria-describedby={descriptionId}
        >
          {children}
        </div>
      ) : (
        <div
          className={cn(
            'overflow-auto rounded border border-border',
            compact ? 'min-h-0 flex-1' : 'max-h-80',
          )}
        >
          <table className="w-full border-collapse text-xs">
            <caption className="sr-only">{title}</caption>
            <thead className="sticky top-0 bg-surface-raised">
              <tr>
                {tableColumns.map((column, index) => (
                  <th
                    key={column}
                    scope="col"
                    className={cn(
                      'border-b border-border px-3 py-2 font-medium text-text-muted',
                      index === 0 ? 'text-left' : 'text-right',
                    )}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) => (
                    <td
                      key={`${row[0] ?? ''}-${String(index)}`}
                      data-numeric={index > 0 ? true : undefined}
                      className={cn(
                        'border-b border-border/50 px-3 py-1.5 text-text',
                        index === 0 ? 'text-left' : 'text-right',
                      )}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </figure>
  );
}
