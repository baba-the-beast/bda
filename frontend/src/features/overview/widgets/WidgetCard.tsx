import { GripVertical, Maximize2, Minimize2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '../../../components/ui/Button';
import type { WidgetRenderContext } from '../../../components/ui/draggable-widget-grid';
import { SIZE_LABEL, SIZE_SPAN } from '../../../components/ui/widget-grid-layout';
import { cn } from '../../../lib/cn';
import { formatClockTime } from '../../../lib/format';

export interface WidgetCardProps {
  title: string;
  /** Where the numbers came from, completing "from …". */
  source?: string | undefined;
  asOf?: Date | null | undefined;
  context: WidgetRenderContext;
  /** Controls beside the size toggle, e.g. a link to the full route. */
  actions?: ReactNode;
  children: ReactNode;
  bodyClassName?: string;
}

/**
 * The frame every overview card sits in.
 *
 * Its header carries the same provenance a Panel does — source and read time —
 * because a dashboard is where figures get quoted out of context. The grip is
 * a visual cue only: the whole card is the drag surface.
 */
export function WidgetCard({
  title,
  source,
  asOf,
  context,
  actions,
  children,
  bodyClassName,
}: WidgetCardProps) {
  const { nextSize, cycleSize, dragging, size } = context;
  const grows =
    nextSize !== undefined &&
    SIZE_SPAN[nextSize].w * SIZE_SPAN[nextSize].h > SIZE_SPAN[size].w * SIZE_SPAN[size].h;

  return (
    <article
      className={cn(
        'flex h-full flex-col overflow-hidden rounded border bg-surface transition-colors duration-base',
        dragging ? 'border-accent/60' : 'border-border hover:border-border-strong',
      )}
    >
      <header className="flex items-start gap-2 border-b border-border px-3 py-2.5">
        <GripVertical aria-hidden className="mt-0.5 size-3.5 shrink-0 text-text-subtle" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-text">{title}</h2>
          {(source !== undefined || asOf != null) && (
            <p className="truncate text-2xs text-text-subtle">
              {source !== undefined && <>from {source}</>}
              {source !== undefined && asOf != null && ' · '}
              {asOf != null && (
                <>
                  read at <time dateTime={asOf.toISOString()}>{formatClockTime(asOf)}</time>
                </>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {actions}
          {cycleSize !== undefined && nextSize !== undefined && (
            <Button
              size="sm"
              variant="ghost"
              className="size-[1.75rem] px-0"
              aria-label={`Make ${title} ${SIZE_LABEL[nextSize]}`}
              title={`Make ${SIZE_LABEL[nextSize]}`}
              onClick={cycleSize}
              icon={
                grows ? (
                  <Maximize2 aria-hidden className="size-3.5" />
                ) : (
                  <Minimize2 aria-hidden className="size-3.5" />
                )
              }
            />
          )}
        </div>
      </header>
      <div className={cn('relative min-h-0 flex-1 overflow-hidden p-3', bodyClassName)}>
        {children}
      </div>
    </article>
  );
}
