import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';

import type { GridWidget, LayoutItem } from '../../components/ui/draggable-widget-grid';
import { WIDGET_SIZES, type WidgetSize } from '../../components/ui/widget-grid-layout';

import { SubmeterWidget, PeakWidget, VoltageBandWidget } from './widgets/breakdown';
import { ConsumptionWidget, LoadCurveWidget } from './widgets/energy';
import { LiveWidget } from './widgets/live';
import { DatasetHealthWidget, JobsWidget } from './widgets/pipeline';
import type { WidgetProps } from './widgets/types';

export interface WidgetDefinition {
  label: string;
  /** Allowed sizes, in toggle order. The first is not necessarily the default. */
  sizes: readonly WidgetSize[];
  Component: ComponentType<WidgetProps>;
}

export const WIDGETS = {
  consumption: {
    label: 'Total consumption',
    sizes: ['wide', 'lg', 'sm'],
    Component: ConsumptionWidget,
  },
  'load-curve': { label: 'Daily load curve', sizes: ['lg', 'wide'], Component: LoadCurveWidget },
  live: { label: 'Live voltage & power', sizes: ['wide', 'lg', 'sm'], Component: LiveWidget },
  submeters: {
    label: 'Sub-meter breakdown',
    sizes: ['tall', 'wide', 'sm'],
    Component: SubmeterWidget,
  },
  peaks: { label: 'Peak events', sizes: ['tall', 'sm'], Component: PeakWidget },
  jobs: { label: 'MapReduce jobs', sizes: ['sm', 'tall'], Component: JobsWidget },
  health: { label: 'Dataset health', sizes: ['sm', 'wide'], Component: DatasetHealthWidget },
  'voltage-bands': {
    label: 'Voltage band distribution',
    sizes: ['wide', 'lg'],
    Component: VoltageBandWidget,
  },
} satisfies Record<string, WidgetDefinition>;

export type WidgetId = keyof typeof WIDGETS;

const isWidgetId = (id: string): id is WidgetId => Object.hasOwn(WIDGETS, id);

/**
 * The starting board. It tiles exactly at four columns (16 cells, four rows)
 * and at two: the figure people come for first, the day's shape beside it, the
 * live feed under the figure, then the breakdowns and the pipeline.
 */
export const DEFAULT_LAYOUT: readonly LayoutItem[] = [
  { id: 'consumption', size: 'wide' },
  { id: 'load-curve', size: 'lg' },
  { id: 'live', size: 'wide' },
  { id: 'submeters', size: 'tall' },
  { id: 'peaks', size: 'tall' },
  { id: 'jobs', size: 'sm' },
  { id: 'health', size: 'sm' },
  { id: 'voltage-bands', size: 'wide' },
];

const STORAGE_VERSION = 1;
export const layoutStorageKey = (userId: string | undefined) =>
  `gridpulse.overview.layout.v${String(STORAGE_VERSION)}:${userId ?? 'anonymous'}`;

/**
 * Reconcile a stored layout with the widgets that exist now: unknown ids and
 * disallowed sizes are dropped, and widgets added since are appended in their
 * default size, so a release never strands a saved board.
 */
export function reconcileLayout(stored: unknown): LayoutItem[] {
  const result: LayoutItem[] = [];
  const seen = new Set<string>();

  if (Array.isArray(stored)) {
    for (const entry of stored) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { id, size } = entry as { id?: unknown; size?: unknown };
      if (typeof id !== 'string' || !isWidgetId(id) || seen.has(id)) continue;
      const allowed: readonly WidgetSize[] = WIDGETS[id].sizes;
      const fallback = DEFAULT_LAYOUT.find((item) => item.id === id)?.size ?? allowed[0] ?? 'sm';
      const valid =
        typeof size === 'string' &&
        (WIDGET_SIZES as readonly string[]).includes(size) &&
        allowed.includes(size as WidgetSize);
      result.push({ id, size: valid ? (size as WidgetSize) : fallback });
      seen.add(id);
    }
  }

  for (const item of DEFAULT_LAYOUT) {
    if (!seen.has(item.id)) result.push({ ...item });
  }
  return result;
}

function load(key: string): LayoutItem[] {
  try {
    const raw = window.localStorage.getItem(key);
    return reconcileLayout(raw === null ? null : (JSON.parse(raw) as unknown));
  } catch {
    // Blocked or corrupt storage: start from the default board.
    return reconcileLayout(null);
  }
}

const sameLayout = (a: readonly LayoutItem[], b: readonly LayoutItem[]) =>
  a.length === b.length &&
  a.every((item, i) => {
    const other = b[i];
    return item.id === other?.id && item.size === other.size;
  });

/**
 * The reader's board, kept per user in this browser.
 *
 * There is no backend field for dashboard preferences, so this is local by
 * design: a layout is a convenience of one person on one device, and losing it
 * costs a reset, not data.
 */
export function useDashboardLayout(userId: string | undefined) {
  const key = layoutStorageKey(userId);
  const [layout, setLayoutState] = useState<LayoutItem[]>(() => load(key));

  // A different user signing in on the same browser gets their own board.
  useEffect(() => {
    setLayoutState(load(key));
  }, [key]);

  const setLayout = useCallback(
    (next: LayoutItem[]) => {
      const reconciled = reconcileLayout(next);
      setLayoutState(reconciled);
      try {
        window.localStorage.setItem(key, JSON.stringify(reconciled));
      } catch {
        // Applies for this visit even if it cannot be kept.
      }
    },
    [key],
  );

  const reset = useCallback(() => {
    setLayoutState(reconcileLayout(null));
    try {
      window.localStorage.removeItem(key);
    } catch {
      // Nothing stored to clear.
    }
  }, [key]);

  const widgets = useMemo<GridWidget[]>(
    () =>
      layout.map((item) => {
        const definition = WIDGETS[item.id as WidgetId];
        return { ...item, label: definition.label, sizes: definition.sizes };
      }),
    [layout],
  );

  return {
    widgets,
    setLayout,
    reset,
    isDefault: sameLayout(layout, DEFAULT_LAYOUT),
  };
}
