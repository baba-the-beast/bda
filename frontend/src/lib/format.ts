/**
 * One place that decides how a number, a unit or an instant is written.
 *
 * Precision is fixed per unit rather than per call site, so the same quantity
 * never appears as 2.2 kW on one panel and 2.204 kW on the next.
 */

/** The UCI dataset is a household outside Paris; its clock is the one that matters. */
export const DATASET_TIME_ZONE = 'Europe/Paris';
export const DATASET_TIME_ZONE_LABEL = 'CET/CEST';

export type Unit = 'kW' | 'kWh' | 'kvar' | 'V' | 'A' | 'Wh' | 'Hz' | '%' | 'count' | 'ms' | 's';

/** Decimal places that reflect what each instrument actually resolves. */
const PRECISION: Record<Unit, number> = {
  kW: 3,
  kWh: 2,
  kvar: 3,
  V: 1,
  A: 1,
  Wh: 0,
  Hz: 2,
  '%': 1,
  count: 0,
  ms: 0,
  s: 2,
};

const NOT_RECORDED = 'not recorded';

/**
 * Format a measurement.
 *
 * `null` and `undefined` become an explicit "not recorded" rather than 0 or a
 * dash that reads as a real reading (docs/FRONTEND_AUDIT.md §3.2).
 */
export function formatValue(
  value: number | null | undefined,
  unit: Unit,
  options: { withUnit?: boolean } = {},
): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return NOT_RECORDED;
  }

  const digits = PRECISION[unit];
  const formatted = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);

  if (options.withUnit === false || unit === 'count') return formatted;
  return unit === '%' ? `${formatted}%` : `${formatted} ${unit}`;
}

/** Compact form for axis ticks, where space is short and precision is noise. */
export function formatCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '';
  return new Intl.NumberFormat(undefined, {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

function toDate(value: Date | string | number | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** A dataset instant, in the dataset's own timezone and labelled as such. */
export function formatDatasetTime(
  value: Date | string | number | null | undefined,
  options: { withZone?: boolean; withSeconds?: boolean } = {},
): string {
  const date = toDate(value);
  if (date === null) return NOT_RECORDED;

  const formatted = new Intl.DateTimeFormat(undefined, {
    timeZone: DATASET_TIME_ZONE,
    hour: '2-digit',
    minute: '2-digit',
    ...(options.withSeconds === true ? { second: '2-digit' } : {}),
    hour12: false,
  }).format(date);

  return options.withZone === false ? formatted : `${formatted} ${DATASET_TIME_ZONE_LABEL}`;
}

export function formatDatasetDate(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (date === null) return NOT_RECORDED;
  return new Intl.DateTimeFormat(undefined, {
    timeZone: DATASET_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  }).format(date);
}

/** Wall-clock time of the viewer, for "as of" stamps rather than dataset instants. */
export function formatClockTime(value: Date | string | number | null | undefined): string {
  const date = toDate(value);
  if (date === null) return NOT_RECORDED;
  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

/** Elapsed time, chosen so a job duration reads naturally at any scale. */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return NOT_RECORDED;
  }
  if (seconds < 1) return `${String(Math.round(seconds * 1000))} ms`;
  if (seconds < 60) return `${seconds.toFixed(2)} s`;

  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  if (minutes < 60) return `${String(minutes)}m ${String(remainder)}s`;

  const hours = Math.floor(minutes / 60);
  return `${String(hours)}h ${String(minutes % 60)}m`;
}

/** Byte size for dataset listings. */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes)) return NOT_RECORDED;
  if (bytes < 1024) return `${String(bytes)} B`;

  const units = ['kB', 'MB', 'GB', 'TB'];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(size < 100 ? 1 : 0)} ${units[unitIndex] ?? 'TB'}`;
}

/** "3 minutes ago", for staleness without making the reader do arithmetic. */
export function formatRelative(
  value: Date | string | number | null | undefined,
  now: Date = new Date(),
): string {
  const date = toDate(value);
  if (date === null) return NOT_RECORDED;

  const seconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const relative = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
  const absolute = Math.abs(seconds);

  if (absolute < 60) return relative.format(seconds, 'second');
  if (absolute < 3600) return relative.format(Math.round(seconds / 60), 'minute');
  if (absolute < 86400) return relative.format(Math.round(seconds / 3600), 'hour');
  return relative.format(Math.round(seconds / 86400), 'day');
}

/**
 * Render an API enum as prose: `PARTIALLY_PROCESSED` becomes "Partially
 * processed".
 *
 * The wire value is what the services speak and is never rewritten; this is
 * only how it is set on screen. Tracked-out capitals are how a screen announces
 * that a machine wrote it, and nothing here needs announcing that way.
 */
export function humanizeEnum(value: string): string {
  const words = value.trim().toLowerCase().replace(/[_-]+/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
