import { useId, useMemo } from 'react';

import { formatValue } from '../../lib/format';

export interface HourPoint {
  hour: number;
  averagePowerKw: number | null;
}

interface Phase {
  label: string;
  from: number;
  to: number;
  above: boolean;
}

/** Where a value sits in the plot, as a percentage, for an HTML overlay. */
const pct = (value: number) => `${String(value)}%`;

/**
 * The shape of a day in this house.
 *
 * Every mark here is computed from the hourly aggregate — the peak hour, the
 * quietest hour, the mean the house sits around, and where the phases begin and
 * end. Nothing is authored. If the household's routine were different, or the
 * dataset changed, the curve and its annotations would move together. That is
 * the point: this is a reading, not an illustration.
 *
 * The trace is drawn in a non-uniform viewBox so it always fills the width, so
 * every label lives in an HTML layer on top rather than in the SVG, where the
 * same scaling would stretch the type.
 */
/**
 * Read the day out of the hourly aggregate.
 *
 * Exported because the overview writes a sentence about the same shape, and two
 * readings of one dataset must not be allowed to disagree.
 */
export function buildDayShape(hours: readonly HourPoint[]) {
  const known = hours
    .filter((h): h is { hour: number; averagePowerKw: number } => h.averagePowerKw !== null)
    .sort((a, b) => a.hour - b.hour);

  if (known.length < 4) return null;

  const values = known.map((h) => h.averagePowerKw);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

  const peak = known.reduce((a, b) => (b.averagePowerKw > a.averagePowerKw ? b : a));
  const trough = known.reduce((a, b) => (b.averagePowerKw < a.averagePowerKw ? b : a));

  /**
   * Split the day where the load crosses its own mean. A run above the mean is
   * the house being used; a run below it is the house at rest. The names are
   * chosen from when in the day each run falls, so they describe this
   * household rather than a generic schedule.
   */
  const runs: Phase[] = [];
  let runStart = known[0]?.hour ?? 0;
  let runAbove = (known[0]?.averagePowerKw ?? 0) >= mean;

  const nameRun = (from: number, to: number, above: boolean): string => {
    if (!above) return from >= 22 || from <= 4 ? 'asleep' : 'quiet';
    if (to <= 11) return 'morning';
    if (from >= 17) return 'evening';
    return 'daytime';
  };

  for (const point of known.slice(1)) {
    const above = point.averagePowerKw >= mean;
    if (above !== runAbove) {
      runs.push({
        label: nameRun(runStart, point.hour - 1, runAbove),
        from: runStart,
        to: point.hour - 1,
        above: runAbove,
      });
      runStart = point.hour;
      runAbove = above;
    }
  }
  const lastHour = known[known.length - 1]?.hour ?? 23;
  runs.push({
    label: nameRun(runStart, lastHour, runAbove),
    from: runStart,
    to: lastHour,
    above: runAbove,
  });

  /**
   * A day that dips in and out of its own mean several times would otherwise
   * label two separate stretches "quiet". Only the longest run keeps each
   * name; the shorter ones stay drawn but go unlabelled, because repeating a
   * word does not tell the reader anything new.
   */
  const longestByName = new Map<string, Phase>();
  for (const run of runs) {
    const held = longestByName.get(run.label);
    if (held === undefined || run.to - run.from > held.to - held.from)
      longestByName.set(run.label, run);
  }
  const labelled = new Set(longestByName.values());

  // Catmull-Rom through the points, so the trace reads as a continuous
  // measurement rather than a connect-the-dots chart.
  const W = 1000;
  const H = 300;
  const padY = 26;
  const x = (hour: number) => (hour / 23) * W;
  const y = (value: number) => H - padY - ((value - min) / (max - min || 1)) * (H - padY * 2);

  const pts = known.map((h) => ({ x: x(h.hour), y: y(h.averagePowerKw) }));
  let path = `M ${String(pts[0]?.x ?? 0)} ${String(pts[0]?.y ?? 0)}`;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    if (!p0 || !p1 || !p2 || !p3) continue;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    path += ` C ${String(c1x)} ${String(c1y)}, ${String(c2x)} ${String(c2y)}, ${String(p2.x)} ${String(p2.y)}`;
  }

  /** The share of the day's average draw that falls in each named stretch. */
  const total = values.reduce((sum, v) => sum + v, 0);
  const shareOf = (run: Phase) =>
    known
      .filter((h) => h.hour >= run.from && h.hour <= run.to)
      .reduce((sum, h) => sum + h.averagePowerKw, 0) / (total || 1);
  const busiest = runs
    .filter((run) => run.above)
    .reduce<Phase | null>((a, b) => (a === null || shareOf(b) > shareOf(a) ? b : a), null);

  return {
    known,
    max,
    min,
    mean,
    peak,
    trough,
    runs,
    labelled,
    busiest,
    shareOf,
    path,
    x,
    y,
    W,
    H,
  };
}

export function DayCurve({
  hours,
  height = 300,
  className,
}: {
  hours: readonly HourPoint[];
  /** Plot height in pixels; the hour axis and peak label sit outside it. */
  height?: number;
  className?: string;
}) {
  const gradientId = useId();
  const clipId = useId();

  const model = useMemo(() => buildDayShape(hours), [hours]);

  if (model === null) {
    return (
      <p className={className}>
        <span className="text-sm text-text-muted">
          The shape of a day appears once the hourly aggregate has been computed. Run the hourly
          MapReduce job for this dataset.
        </span>
      </p>
    );
  }

  const { max, mean, min, peak, trough, runs, labelled, path, x, y, W, H } = model;

  /** A y in the viewBox, as a percentage of the plot, for the HTML layer. */
  const top = (value: number) => (y(value) / H) * 100;
  const left = (hour: number) => (hour / 23) * 100;

  return (
    <figure className={className}>
      <figcaption className="sr-only">
        Average household power by hour of day, averaged over every recorded day. Highest at{' '}
        {String(peak.hour)}:00 at {formatValue(peak.averagePowerKw, 'kW')}, lowest at{' '}
        {String(trough.hour)}:00 at {formatValue(trough.averagePowerKw, 'kW')}, averaging{' '}
        {formatValue(mean, 'kW')}.
      </figcaption>

      {/* The scale sits in its own column so the trace itself starts at the
          left edge of the page and runs the full width. */}
      <div className="flex gap-3">
        <div
          className="relative w-16 shrink-0 self-start text-right text-2xs text-text-subtle"
          style={{ height }}
        >
          {[max, mean, min].map((value, index) => (
            <span
              key={value}
              data-numeric
              className="absolute right-0 -translate-y-1/2 whitespace-nowrap tabular-nums"
              style={{ top: pct(top(value)) }}
            >
              {/* The same formatter the peak label and the figures use, so one
                  reading is not set to two decimals and another to three. */}
              {formatValue(value, 'kW', { withUnit: index === 0 })}
            </span>
          ))}
        </div>

        <div className="relative min-w-0 flex-1">
          <svg
            viewBox={`0 0 ${String(W)} ${String(H)}`}
            preserveAspectRatio="none"
            className="w-full"
            style={{ height }}
            role="img"
            aria-label={`Average power by hour. Peak ${formatValue(peak.averagePowerKw, 'kW')} at ${String(peak.hour)}:00, average ${formatValue(mean, 'kW')}.`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="rgb(var(--color-accent))" stopOpacity="0" />
                <stop offset="100%" stopColor="rgb(var(--color-accent))" stopOpacity="0.18" />
              </linearGradient>
              <clipPath id={clipId}>
                <rect x="0" y="0" width={W} height={H} />
              </clipPath>
            </defs>

            {/* The mean is the line the phases are defined against, so it is the
                one reference the plot draws. */}
            <line
              x1="0"
              x2={W}
              y1={y(mean)}
              y2={y(mean)}
              stroke="rgb(var(--color-border-strong))"
              strokeWidth="1"
              strokeDasharray="2 6"
              vectorEffect="non-scaling-stroke"
            />

            {/* A lit rule along the floor for each stretch the house spends above
                its own average draw. Tinted blocks behind the trace went muddy and
                said less: this marks the extent precisely and stays out of the way. */}
            {runs.map((run) => (
              <line
                key={`${run.label}-${String(run.from)}`}
                x1={x(run.from)}
                x2={x(run.to)}
                y1={H - 5}
                y2={H - 5}
                stroke={run.above ? 'rgb(var(--color-accent))' : 'rgb(var(--color-border-strong))'}
                strokeWidth="2"
                strokeLinecap="round"
                opacity={run.above ? 0.55 : 0.6}
              />
            ))}

            <g clipPath={`url(#${clipId})`}>
              <path
                d={`${path} L ${String(W)} ${String(H)} L 0 ${String(H)} Z`}
                fill={`url(#${gradientId})`}
              />
              <path
                d={path}
                fill="none"
                stroke="rgb(var(--color-accent))"
                strokeWidth="2.5"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                className="day-curve-trace"
              />
            </g>

            {/* The peak is the one moment worth marking on the trace itself. */}
            <circle
              cx={x(peak.hour)}
              cy={y(peak.averagePowerKw)}
              r="4.5"
              fill="rgb(var(--color-canvas))"
              stroke="rgb(var(--color-peak))"
              strokeWidth="2.5"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          {/* The peak reading is set against the trace, where the eye already is. */}
          <span
            className="pointer-events-none absolute whitespace-nowrap pb-3 text-2xs"
            style={{
              top: pct(top(peak.averagePowerKw)),
              left: pct(left(peak.hour)),
              transform: `translate(${peak.hour > 17 ? '-100%' : peak.hour < 4 ? '0' : '-50%'}, -100%)`,
            }}
          >
            <span className="text-peak">peak {String(peak.hour).padStart(2, '0')}:00</span>{' '}
            <span data-numeric className="tabular-nums text-text-muted">
              {formatValue(peak.averagePowerKw, 'kW')}
            </span>
          </span>

          {/* Hour axis, labelled where the day actually changes rather than every
              three hours. Labels at either end sit inside the plot instead of
              hanging off it. */}
          <div className="relative mt-2 h-4 select-none">
            {runs
              .filter((run) => labelled.has(run))
              .map((run) => {
                const centre = (run.from + run.to) / 2;
                const edge = centre < 3 ? 'left-0' : centre > 20 ? 'right-0' : '';
                return (
                  <span
                    key={`label-${run.label}-${String(run.from)}`}
                    className={`absolute top-0 whitespace-nowrap text-2xs text-text-subtle ${
                      edge === '' ? '-translate-x-1/2' : edge
                    }`}
                    style={edge === '' ? { left: pct(left(centre)) } : {}}
                  >
                    {run.label}
                  </span>
                );
              })}
          </div>
        </div>
      </div>
    </figure>
  );
}
