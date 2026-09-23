import { useMemo } from 'react';

import { formatCompact, formatValue, type Unit } from '../../lib/format';

import { ChartFrame } from './ChartFrame';
import { axisCommon, gridCommon, tooltipCommon, useChartChrome, valueAxisCommon } from './theme';
import { useECharts, type EChartsOption } from './useECharts';

export interface CategoryDatum {
  category: string;
  value: number | null;
}

export interface BarChartProps {
  title: string;
  description: string;
  unit: Unit;
  categoryLabel: string;
  data: readonly CategoryDatum[];
  /** Pixels, or 'fill' to take the height of a compact frame's container. */
  height?: number | 'fill';
  /** See ChartFrame `compact`. */
  compact?: boolean;
  refreshing?: boolean;
}

/**
 * Bars over a categorical axis.
 *
 * All bars take slot 1: the categories are nominal, and bar length already
 * encodes the value, so colouring each bar differently would spend the identity
 * channel re-encoding what length shows. One series, so no legend — the title
 * names it.
 */
export function BarChart({
  title,
  description,
  unit,
  categoryLabel,
  data,
  height = 240,
  compact = false,
  refreshing = false,
}: BarChartProps) {
  const chrome = useChartChrome();

  const option = useMemo<EChartsOption>(
    () => ({
      animation: false,
      grid: gridCommon,
      tooltip: {
        trigger: 'item',
        ...tooltipCommon(chrome),
        formatter: (params: unknown) => {
          const typed = params as { name?: string; value?: number | null };
          return `<div style="color:${chrome.textMuted};margin-bottom:2px">${typed.name ?? ''}</div>
            <div style="font-variant-numeric:tabular-nums">${formatValue(typed.value ?? null, unit)}</div>`;
        },
      },
      xAxis: {
        type: 'category',
        data: data.map((d) => d.category),
        ...axisCommon(chrome),
      },
      yAxis: {
        type: 'value',
        name: unit,
        nameTextStyle: { color: chrome.textSubtle, fontSize: 11, align: 'left' },
        ...valueAxisCommon(chrome),
        axisLabel: { ...valueAxisCommon(chrome).axisLabel, formatter: formatCompact },
      },
      series: [
        {
          type: 'bar' as const,
          name: title,
          data: data.map((d) => d.value),
          // Thin marks, and a 4px rounded end anchored to the baseline.
          barMaxWidth: 18,
          itemStyle: { color: chrome.palette[0], borderRadius: [4, 4, 0, 0] },
          // A 2px surface gap keeps neighbouring bars apart without a border.
          barCategoryGap: '30%',
          emphasis: { itemStyle: { color: chrome.palette[0], opacity: 0.85 } },
        },
      ],
    }),
    [data, unit, title, chrome],
  );

  const containerRef = useECharts(option);

  return (
    <ChartFrame
      title={title}
      description={description}
      series={[{ name: title, colorIndex: 0 }]}
      tableColumns={[categoryLabel, `${title} (${unit})`]}
      tableRows={data.map((d) => [d.category, formatValue(d.value, unit)])}
      refreshing={refreshing}
      compact={compact}
    >
      <div
        ref={containerRef}
        style={{ height: height === 'fill' ? '100%' : height }}
        role="img"
        aria-label={description}
      />
    </ChartFrame>
  );
}
