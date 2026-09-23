import { ArrowDown, ArrowRight, ArrowUp } from 'lucide-react';

import { cn } from '../../lib/cn';

export interface MetricProps {
  label: string;
  /**
   * The formatted value. `null` renders an explicit "not available" rather
   * than a zero or a placeholder that reads as real (docs/FRONTEND_AUDIT.md §3.2).
   */
  value: string | null;
  unit?: string | undefined;
  /** Percentage change against the previous period, if one was computed. */
  delta?: number | null;
  /** Whether a rising value is good, bad, or neither. */
  deltaIntent?: 'up-is-good' | 'up-is-bad' | 'neutral';
  asOf?: Date | string | null | undefined;
  className?: string;
}

const NOT_AVAILABLE = 'Not available';

export function Metric({
  label,
  value,
  unit,
  delta = null,
  deltaIntent = 'neutral',
  asOf,
  className,
}: MetricProps) {
  const asOfDate = typeof asOf === 'string' ? new Date(asOf) : asOf;
  const asOfValid = asOfDate instanceof Date && !Number.isNaN(asOfDate.getTime());

  const DeltaIcon = delta === null || delta === 0 ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
  const deltaTone =
    delta === null || delta === 0 || deltaIntent === 'neutral'
      ? 'text-text-subtle'
      : delta > 0 === (deltaIntent === 'up-is-good')
        ? 'text-ok'
        : 'text-critical';

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <span className="text-2xs font-medium uppercase tracking-wide text-text-muted">{label}</span>

      <span className="flex items-baseline gap-1">
        {value === null ? (
          <span className="text-lg text-text-subtle">{NOT_AVAILABLE}</span>
        ) : (
          <>
            <span data-numeric className="text-metric font-semibold leading-none text-text">
              {value}
            </span>
            {unit !== undefined && <span className="text-sm text-text-muted">{unit}</span>}
          </>
        )}
      </span>

      <span className="flex items-center gap-2 text-2xs text-text-subtle">
        {delta !== null && (
          <span className={cn('inline-flex items-center gap-0.5', deltaTone)}>
            <DeltaIcon aria-hidden className="size-3" />
            <span data-numeric>{Math.abs(delta).toFixed(1)}%</span>
          </span>
        )}
        {asOfValid && (
          <time dateTime={asOfDate.toISOString()}>
            as of {asOfDate.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
          </time>
        )}
      </span>
    </div>
  );
}
