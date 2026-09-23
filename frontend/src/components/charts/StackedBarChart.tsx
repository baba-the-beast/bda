import { useMemo } from 'react';

import { formatCompact, formatValue, type Unit } from '../../lib/format';

import { ChartFrame } from './ChartFrame';
import {
  axisCommon,
  gridCommon,
  MAX_SERIES,
  readChrome,
  SERIES_PALETTE,
  tooltipCommon,
  valueAxisCommon,
} from './theme';
import { useECharts, type EChartsOption } from './useECharts';

export interface StackedSeries {
  name: string;
  /** One value per category, in the same order as `categories`. */
  values: readonly (number | null)[];
}

export interface StackedBarChartProps {
  title: string;
  description: string;
  unit: Unit;
  categoryLabel: string;
  categories: readonly string[];
  series: readonly StackedSeries[];
  height?: number;
  refreshing?: boolean;
}

/**
 * Stacked bars, for composition within a total — sub-meter disaggregation being
 * the case this exists for.
 *
 * Segments are separated by a 2px surface gap rather than a border, and series
 * take palette slots in fixed order so a filter that removes one does not
 * repaint the others.
 */
export function StackedBarChart({
  title,
  description,
  unit,
  categoryLabel,
  categories,
  series,
  height = 240,
  refreshing = false,
}: StackedBarChartProps) {
  const chrome = readChrome();

  if (series.length > MAX_SERIES) {
    // Slots are never cycled: a ninth series would repeat a hue and break
    // identity. Fold to "Other" upstream instead.
    console.warn(
      `StackedBarChart received ${String(series.length)} series; only ${String(MAX_SERIES)} have distinct colours.`,
    );
  }

  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      color: [...SERIES_PALETTE],
      grid: gridCommon,
      tooltip: {
        trigger: 'axis',
        ...tooltipCommon(chrome),
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgb(255 255 255 / 0.04)' } },
        formatter: (params: unknown) => {
          const rows = Array.isArray(params) ? params : [params];
          const first = rows[0] as { name?: string } | undefined;
          const head = `<div style="color:${chrome.textMuted};margin-bottom:4px">${first?.name ?? ''}</div>`;
          const body = rows
            .map((row) => {
              const typed = row as { marker?: string; seriesName?: string; value?: number | null };
              return `<div style="display:flex;gap:8px;justify-content:space-between">
                <span>${typed.marker ?? ''}${typed.seriesName ?? ''}</span>
                <span style="font-variant-numeric:tabular-nums">${formatValue(typed.value ?? null, unit)}</span>
              </div>`;
            })
            .join('');
          return head + body;
        },
      },
      xAxis: { type: 'category', data: [...categories], ...axisCommon(chrome) },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: chrome.textSubtle, fontSize: 11, align: 'left' },
        ...valueAxisCommon(chrome),
        axisLabel: { ...valueAxisCommon(chrome).axisLabel, formatter: formatCompact },
      },
      series: series.map((s) => ({
        type: 'bar' as const,
        name: s.name,
        stack: 'total',
        barMaxWidth: 24,
        data: [...s.values],
        itemStyle: {
          // The gap is drawn in the surface colour, so segments separate
          // without a border ringing every mark.
          borderColor: chrome.surface,
          borderWidth: 2,
        },
        emphasis: { focus: 'series' as const },
      })),
    }),
    [categories, series, unit, chrome],
  );

  const containerRef = useECharts(option);

  const tableRows = useMemo(
    () =>
      categories.map((category, index) => [
        category,
        ...series.map((s) => formatValue(s.values[index] ?? null, unit)),
      ]),
    [categories, series, unit],
  );

  return (
    <ChartFrame
      title={title}
      description={description}
      series={series.map((s, index) => ({ name: s.name, colorIndex: index }))}
      tableColumns={[categoryLabel, ...series.map((s) => `${s.name} (${unit})`)]}
      tableRows={tableRows}
      refreshing={refreshing}
    >
      <div ref={containerRef} style={{ height }} role="img" aria-label={description} />
    </ChartFrame>
  );
}
