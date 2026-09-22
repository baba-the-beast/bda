import { BarChart, LineChart } from 'echarts/charts';
import {
  DataZoomComponent,
  GridComponent,
  MarkLineComponent,
  TooltipComponent,
} from 'echarts/components';
import * as echarts from 'echarts/core';
import { CanvasRenderer } from 'echarts/renderers';
import { useEffect, useRef, type MutableRefObject } from 'react';

// Tree-shaken registration: only the pieces these charts use are bundled, which
// keeps ECharts a fraction of the full distribution.
echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  DataZoomComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export type EChartsOption = echarts.EChartsCoreOption;

/**
 * Mounts an ECharts instance into a div and keeps it in step with `option`.
 *
 * The instance is created once and updated in place; a ResizeObserver handles
 * layout changes, which a window listener alone would miss when a panel resizes
 * without the window doing so.
 */
export function useECharts(option: EChartsOption): MutableRefObject<HTMLDivElement | null> {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) return;

    const chart = echarts.init(container, undefined, { renderer: 'canvas' });
    chartRef.current = chart;

    const observer = new ResizeObserver(() => {
      chart.resize();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    // `notMerge: false` lets ECharts diff rather than rebuild, so a streaming
    // update does not discard the user's zoom selection.
    chartRef.current?.setOption(option, { notMerge: false, lazyUpdate: true });
  }, [option]);

  return containerRef;
}
