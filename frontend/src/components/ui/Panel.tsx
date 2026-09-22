import type { HTMLAttributes, ReactNode } from 'react';

import { cn } from '../../lib/cn';

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
}

/** The standard container. Everything on a page sits in one of these. */
export function Panel({ className, children, ...props }: PanelProps) {
  return (
    <section className={cn('rounded border border-border bg-surface', className)} {...props}>
      {children}
    </section>
  );
}

export interface PanelHeaderProps {
  title: string;
  /** Where the numbers came from, e.g. "Hive · daily_aggregates". */
  source?: string;
  /** When the data was fetched. Rendered as a machine-readable <time>. */
  asOf?: Date | string | null;
  /** Marks the data as known-stale, e.g. while a refetch is failing. */
  stale?: boolean;
  actions?: ReactNode;
  className?: string;
}

/**
 * A panel header carries provenance, not just a title: where the data came
 * from and when it was read. Data honesty is a layout decision as much as a
 * fetching one (docs/FRONTEND_AUDIT.md §3.2).
 */
export function PanelHeader({
  title,
  source,
  asOf,
  stale = false,
  actions,
  className,
}: PanelHeaderProps) {
  const asOfDate = typeof asOf === 'string' ? new Date(asOf) : asOf;
  const asOfValid = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime());

  return (
    <header
      className={cn(
        'flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3',
        className,
      )}
    >
      <div className="flex flex-col gap-0.5">
        <h2 className="text-sm font-semibold text-text">{title}</h2>
        {(source !== undefined || asOfValid) && (
          <p className="flex items-center gap-1.5 text-2xs text-text-subtle">
            {source !== undefined && <span>{source}</span>}
            {source !== undefined && asOfValid && <span aria-hidden>·</span>}
            {asOfValid && (
              <>
                <span>as of</span>
                <time dateTime={asOfDate.toISOString()}>
                  {asOfDate.toLocaleTimeString(undefined, {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                </time>
              </>
            )}
            {stale && <span className="text-warning">· stale</span>}
          </p>
        )}
      </div>
      {actions !== undefined && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  );
}

export function PanelBody({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('p-4', className)} {...props}>
      {children}
    </div>
  );
}
