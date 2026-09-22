import { useMemo } from 'react';

import {
  DATASET_TIME_ZONE_LABEL,
  formatCompact,
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

    return {
      animation: false,
      color: [...SERIES_PALETTE],
      grid: gridCommon,
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
              : `<div style="color:${chrome.textMuted};margin-bottom:4px">${formatDatasetTime(stamp, { withSeconds: true })}</div>`;

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
        axisLabel: {
          ...axisCommon(chrome).axisLabel,
          formatter: (value: number) => formatDatasetTime(value, { withZone: false }),
        },
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
                type: 'slider',
                height: 18,
                bottom: 0,
                borderColor: chrome.border,
                backgroundColor: chrome.surfaceRaised,
                fillerColor: 'rgb(57 135 229 / 0.15)',
                handleStyle: { color: chrome.textSubtle },
                textStyle: { color: chrome.textSubtle, fontSize: 10 },
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
      .map(([stamp, values]) => [
        formatDatasetTime(stamp, { withSeconds: true }),
        ...values.map((v) => formatValue(v, unit)),
      ]);
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
