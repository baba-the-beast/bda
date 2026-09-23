import { ArrowDown, ArrowUp } from 'lucide-react';

import { cn } from '../../lib/cn';

export interface MetricProps {
  label: string;
  /**
   * The formatted value. `null` renders an explicit "not recorded" rather than
   * a zero or a dash that reads as a real measurement
   * (docs/FRONTEND_AUDIT.md §3.2).
   */
  value: string | null;
  unit?: string | undefined;
  /** Percentage change against the previous period, if one was computed. */
  delta?: number | null;
  deltaIntent?: 'up-is-good' | 'up-is-bad' | 'neutral';
  asOf?: Date | string | null | undefined;
  /** `figure` is for the one value a panel is actually about. */
  size?: 'default' | 'figure';
  className?: string;
}

const NOT_RECORDED = 'not recorded';

/**
 * A measured value.
 *
 * The label sits under the number in sentence case, not above it in tracked-out
 * capitals: the figure is what the eye should land on, and the label explains it
 * afterwards.
 */
export function Metric({
  label,
  value,
  unit,
  delta = null,
  deltaIntent = 'neutral',
  asOf,
  size = 'default',
  className,
}: MetricProps) {
  const asOfDate = typeof asOf === 'string' ? new Date(asOf) : asOf;
  const asOfValid = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime());

  const DeltaIcon = delta !== null && delta < 0 ? ArrowDown : ArrowUp;
  const deltaTone =
    delta === null || delta === 0 || deltaIntent === 'neutral'
      ? 'text-text-subtle'
      : delta > 0 === (deltaIntent === 'up-is-good')
        ? 'text-ok'
        : 'text-critical';

  return (
    <div className={cn('flex flex-col gap-0.5', className)}>
      <span className="flex items-baseline gap-1.5">
        {value === null ? (
          <span className={cn('text-text-subtle', size === 'figure' ? 'text-xl' : 'text-lg')}>
            {NOT_RECORDED}
          </span>
        ) : (
          <>
            <span
              data-numeric
              className={cn(
                'font-medium leading-none tracking-tight text-text',
                size === 'figure' ? 'text-figure' : 'text-2xl',
              )}
            >
              {value}
            </span>
            {unit !== undefined && (
              <span className={cn('text-text-muted', size === 'figure' ? 'text-base' : 'text-sm')}>
                {unit}
              </span>
            )}
          </>
        )}

        {delta !== null && delta !== 0 && (
          <span className={cn('ml-1 inline-flex items-center gap-0.5 text-2xs', deltaTone)}>
            <DeltaIcon aria-hidden className="size-3" />
            <span data-numeric>{Math.abs(delta).toFixed(1)}%</span>
          </span>
        )}
      </span>

      <span className="text-sm text-text-muted">{label}</span>

      {asOfValid && (
        <time dateTime={asOfDate.toISOString()} className="text-2xs text-text-subtle">
          read at {asOfDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
        </time>
      )}
    </div>
  );
}
