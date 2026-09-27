import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TimeSeriesChart } from './TimeSeriesChart';
import type { EChartsOption } from './useECharts';

// jsdom has no canvas: capture the option the chart hands to ECharts instead.
const captured: { option?: EChartsOption } = {};
vi.mock('./useECharts', () => ({
  useECharts: (option: EChartsOption) => {
    captured.option = option;
    return { current: null };
  },
}));

describe('TimeSeriesChart', () => {
  it('draws points in time order when the rows arrive out of order', () => {
    render(
      <TimeSeriesChart
        title="Peak active power"
        description="Ranked by power, as the peak endpoint returns them."
        unit="kW"
        series={[
          {
            name: 'Peak power',
            points: [
              { t: '2006-12-27T20:57:00Z', v: 11.1 },
              { t: '2006-12-20T20:12:00Z', v: 10.9 },
              { t: '2006-12-28T21:52:00Z', v: 10.4 },
            ],
          },
        ]}
      />,
    );

    const series = captured.option?.series as { data: [number, number][] }[];
    const times = series[0]?.data.map(([t]) => t) ?? [];
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(times).toHaveLength(3);
  });

  it('drops time labels that would overlap on a narrow card', () => {
    render(
      <TimeSeriesChart
        title="Daily energy"
        description="Per day."
        unit="kWh"
        series={[{ name: 'Energy', points: [{ t: '2006-12-16T00:00:00Z', v: 26 }] }]}
      />,
    );

    const xAxis = captured.option?.xAxis as { axisLabel: { hideOverlap?: boolean } };
    expect(xAxis.axisLabel.hideOverlap).toBe(true);
  });
});
