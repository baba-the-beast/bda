import { useId, useMemo } from 'react';

import { cn } from '../../lib/cn';

export interface SparklineProps {
  values: readonly (number | null)[];
  /**
   * Read in place of the drawing. A sparkline has no axes, so this sentence is
   * what carries its meaning to anyone not looking at it.
   */
  label: string;
  className?: string;
  /** Marks the last value with a dot: "this is where it is now". */
  markLast?: boolean;
}

const W = 100;
const H = 32;

interface Point {
  x: number;
  y: number;
}

const toPath = (points: readonly Point[]) =>
  points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');

/**
 * A trend line with no chrome, for cards too small for an ECharts frame.
 *
 * Gaps in the data stay gaps: a null breaks the line rather than being joined
 * across or dropped to zero.
 */
export function Sparkline({ values, label, className, markLast = true }: SparklineProps) {
  const gradientId = useId();

  const model = useMemo(() => {
    const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
    if (finite.length < 2) return null;
    const min = Math.min(...finite);
    const max = Math.max(...finite);
    const range = max - min || 1;
    const step = W / Math.max(1, values.length - 1);
    const y = (v: number) => H - 2 - ((v - min) / range) * (H - 4);

    const runs: Point[][] = [];
    let run: Point[] = [];
    values.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        if (run.length > 0) runs.push(run);
        run = [];
      } else {
        run.push({ x: i * step, y: y(v) });
      }
    });
    if (run.length > 0) runs.push(run);

    return { runs, last: runs.at(-1)?.at(-1) ?? null };
  }, [values]);

  if (model === null) {
    return (
      <p className={cn('text-2xs text-text-subtle', className)}>
        Not enough points for a trend yet.
      </p>
    );
  }

  return (
    <div className={cn('relative h-10 w-full', className)}>
      <svg
        viewBox={`0 0 ${String(W)} ${String(H)}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={label}
        className="block size-full overflow-visible"
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
            <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0.16" />
          </linearGradient>
        </defs>
        {model.runs.map((points) => {
          const first = points[0];
          const lastPoint = points.at(-1);
          if (first === undefined || lastPoint === undefined) return null;
          const line = toPath(points);
          return (
            <g key={`${String(first.x)}-${String(points.length)}`}>
              <path
                d={`${line} L ${lastPoint.x.toFixed(2)} ${String(H)} L ${first.x.toFixed(2)} ${String(H)} Z`}
                fill={`url(#${gradientId})`}
              />
              <path
                d={line}
                fill="none"
                stroke="rgb(var(--color-accent))"
                strokeWidth="1.75"
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>
      {/* An HTML dot, so it stays round when the drawing stretches. */}
      {markLast && model.last !== null && (
        <span
          aria-hidden
          className="absolute size-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent"
          style={{
            left: `${String((model.last.x / W) * 100)}%`,
            top: `${String((model.last.y / H) * 100)}%`,
          }}
        />
      )}
    </div>
  );
}
