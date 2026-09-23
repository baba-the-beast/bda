import { useMemo } from 'react';

import {
  DATASET_TIME_ZONE_LABEL,
  formatCompact,
  formatDatasetDate,
  formatDatasetTime,
  formatValue,
  type Unit,
} from '../../lib/format';

import { ChartFrame } from './ChartFrame';
import {
  axisCommon,
  gridCommon,
  readChrome,
  SERIES_PALETTE,
  tooltipCommon,
  valueAxisCommon,
} from './theme';
import { useECharts, type EChartsOption } from './useECharts';

export interface TimeSeriesPoint {
  /** Epoch milliseconds, or an ISO instant. */
  t: number | string;
  v: number | null;
}

export interface TimeSeries {
  name: string;
  points: readonly TimeSeriesPoint[];
}

export interface TimeSeriesChartProps {
  title: string;
  description: string;
  unit: Unit;
  series: readonly TimeSeries[];
  height?: number;
  /** Adds a brush for long ranges. Off for short, glanceable series. */
  zoomable?: boolean;
  refreshing?: boolean;
  /** Draws a labelled horizontal rule, e.g. an anomaly threshold. */
  threshold?: { value: number; label: string } | undefined;
}

/**
 * Line chart over time.
 *
 * Handles long series without thinning them by hand: ECharts samples with LTTB
 * once a series exceeds the pixel budget, which preserves peaks — the whole
 * point of a load profile — where naive decimation would drop them.
 */
export function TimeSeriesChart({
  title,
  description,
  unit,
  series,
  height = 240,
  zoomable = false,
  refreshing = false,
  threshold,
}: TimeSeriesChartProps) {
  const chrome = readChrome();

  const option = useMemo<EChartsOption>(() => {
    const toMs = (t: number | string) => (typeof t === 'number' ? t : new Date(t).getTime());

    // A series spanning days wants dates on the axis; one spanning minutes
    // wants clock times. Labelling daily aggregates "18:00" is meaningless.
    const stamps = series.flatMap((s) => s.points.map((p) => toMs(p.t)));
    const spanMs = stamps.length < 2 ? 0 : Math.max(...stamps) - Math.min(...stamps);
    const spansDays = spanMs > 48 * 60 * 60 * 1000;
    const axisLabel = (value: number) =>
      spansDays ? formatDatasetDate(value) : formatDatasetTime(value, { withZone: false });
    const pointLabel = (value: number) =>
      spansDays ? formatDatasetDate(value) : formatDatasetTime(value, { withSeconds: true });

    return {
      animation: false,
      color: [...SERIES_PALETTE],
      // With a slider, the grid must leave room for it or the axis labels
      // render underneath the brush (dataviz anti-pattern: an axis band the
      // container excludes).
      grid: zoomable ? { ...gridCommon, bottom: 38 } : gridCommon,
      tooltip: {
        trigger: 'axis',
        ...tooltipCommon(chrome),
        // A crosshair reads all series at one instant, which is what a reader
        // of a load profile is actually comparing.
        axisPointer: { type: 'line', lineStyle: { color: chrome.textSubtle, width: 1 } },
        formatter: (params: unknown) => {
          const rows = Array.isArray(params) ? params : [params];
          const first = rows[0] as { value?: [number, number] } | undefined;
          const stamp = first?.value?.[0];
          const head =
            stamp === undefined
              ? ''
              : `<div style="color:${chrome.textMuted};margin-bottom:4px">${pointLabel(stamp)}</div>`;

          const body = rows
            .map((row) => {
              const typed = row as {
                marker?: string;
                seriesName?: string;
                value?: [number, number];
              };
              const value = typed.value?.[1];
              return `<div style="display:flex;gap:8px;justify-content:space-between">
                <span>${typed.marker ?? ''}${typed.seriesName ?? ''}</span>
                <span style="font-variant-numeric:tabular-nums">${formatValue(value ?? null, unit)}</span>
              </div>`;
            })
            .join('');

          return head + body;
        },
      },
      xAxis: {
        type: 'time',
        ...axisCommon(chrome),
        axisLabel: { ...axisCommon(chrome).axisLabel, formatter: axisLabel },
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: chrome.textSubtle, fontSize: 11, align: 'left' },
        ...valueAxisCommon(chrome),
        axisLabel: { ...valueAxisCommon(chrome).axisLabel, formatter: formatCompact },
      },
      ...(zoomable
        ? {
            dataZoom: [
              { type: 'inside', throttle: 50 },
              {
                // A brush, not a scrollbar: the selected span is a faint tint of
                // the series colour on the page's own surface, and the slab of
                // slate the default draws is removed entirely.
                type: 'slider',
                height: 16,
                bottom: 0,
                borderColor: 'transparent',
                backgroundColor: 'transparent',
                fillerColor: 'rgb(232 165 61 / 0.12)',
                dataBackground: {
                  lineStyle: { color: chrome.border, width: 1 },
                  areaStyle: { color: 'transparent' },
                },
                selectedDataBackground: {
                  lineStyle: { color: SERIES_PALETTE[0], width: 1, opacity: 0.7 },
                  areaStyle: { color: 'transparent' },
                },
                handleStyle: { color: chrome.surfaceRaised, borderColor: chrome.borderStrong },
                moveHandleStyle: { color: chrome.border },
                emphasis: { handleStyle: { borderColor: SERIES_PALETTE[0] } },
                textStyle: { color: chrome.textSubtle, fontSize: 10 },
                brushSelect: false,
              },
            ],
          }
        : {}),
      series: series.map((s, index) => ({
        type: 'line' as const,
        name: s.name,
        showSymbol: false,
        // Thin marks: 2px, no fill. A line chart is not a block of colour.
        lineStyle: { width: 2 },
        // Keeps peaks when there are more points than pixels.
        sampling: 'lttb' as const,
        symbolSize: 8,
        emphasis: { focus: 'series' as const },
        data: s.points.map((p) => [toMs(p.t), p.v] as [number, number | null]),
        ...(index === 0 && threshold !== undefined
          ? {
              markLine: {
                silent: true,
                symbol: 'none' as const,
                lineStyle: { color: chrome.textSubtle, width: 1, type: 'solid' as const },
                label: {
                  formatter: threshold.label,
                  color: chrome.textSubtle,
                  fontSize: 10,
                  position: 'insideEndTop' as const,
                },
                data: [{ yAxis: threshold.value }],
              },
            }
          : {}),
      })),
    };
  }, [series, unit, zoomable, threshold, chrome]);

  const containerRef = useECharts(option);

  const tableRows = useMemo(() => {
    const allStamps = series.flatMap((s) =>
      s.points.map((p) => (typeof p.t === 'number' ? p.t : new Date(p.t).getTime())),
    );
    const tableSpansDays =
      allStamps.length >= 2 &&
      Math.max(...allStamps) - Math.min(...allStamps) > 48 * 60 * 60 * 1000;
    const tableStamp = (value: number) =>
      tableSpansDays ? formatDatasetDate(value) : formatDatasetTime(value, { withSeconds: true });

    const stamps = new Map<number, (number | null)[]>();
    series.forEach((s, seriesIndex) => {
      for (const point of s.points) {
        const key = typeof point.t === 'number' ? point.t : new Date(point.t).getTime();
        const row = stamps.get(key) ?? Array.from({ length: series.length }, () => null);
        row[seriesIndex] = point.v;
        stamps.set(key, row);
      }
    });

    return [...stamps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([stamp, values]) => [tableStamp(stamp), ...values.map((v) => formatValue(v, unit))]);
  }, [series, unit]);

  return (
    <ChartFrame
      title={title}
      description={description}
      series={series.map((s, index) => ({ name: s.name, colorIndex: index }))}
      tableColumns={[
        `Time (${DATASET_TIME_ZONE_LABEL})`,
        ...series.map((s) => `${s.name} (${unit})`),
      ]}
      tableRows={tableRows}
      refreshing={refreshing}
    >
      <div ref={containerRef} style={{ height }} role="img" aria-label={description} />
    </ChartFrame>
  );
}
