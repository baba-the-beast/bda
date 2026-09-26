import { describe, expect, it } from 'vitest';

import { computeLayout } from '../../components/ui/widget-grid-layout';
import { parseReplayStatus } from '../stream/replayStatus';

import { DEFAULT_LAYOUT, layoutStorageKey, reconcileLayout } from './dashboardLayout';
import { parseOverview } from './overview';
import { parseSubmeters } from './widgets/breakdown';
import { weeklyTrend } from './widgets/energy';

describe('reconcileLayout', () => {
  it('returns the default board when nothing is stored', () => {
    expect(reconcileLayout(null)).toEqual(DEFAULT_LAYOUT);
    expect(reconcileLayout('not json at all')).toEqual(DEFAULT_LAYOUT);
  });

  it('keeps a saved order and size', () => {
    const saved = [
      { id: 'jobs', size: 'tall' },
      { id: 'consumption', size: 'sm' },
    ];
    const result = reconcileLayout(saved);
    expect(result.slice(0, 2)).toEqual(saved);
    // Everything else follows, so nothing goes missing.
    expect(result).toHaveLength(DEFAULT_LAYOUT.length);
  });

  it('drops unknown widgets, duplicates and sizes a widget does not allow', () => {
    const result = reconcileLayout([
      { id: 'retired-widget', size: 'sm' },
      { id: 'peaks', size: 'lg' }, // peaks allows tall and sm only
      { id: 'peaks', size: 'sm' },
      { id: 'jobs', size: 'gigantic' },
      'garbage',
    ]);
    expect(result.find((item) => item.id === 'retired-widget')).toBeUndefined();
    expect(result.filter((item) => item.id === 'peaks')).toEqual([{ id: 'peaks', size: 'tall' }]);
    expect(result.find((item) => item.id === 'jobs')).toEqual({ id: 'jobs', size: 'sm' });
  });

  it('keys storage per user', () => {
    expect(layoutStorageKey('u1')).not.toBe(layoutStorageKey('u2'));
    expect(layoutStorageKey(undefined)).toContain('anonymous');
  });

  it('ships a default that tiles without gaps at every column count', () => {
    for (const columns of [1, 2, 4]) {
      expect(computeLayout(DEFAULT_LAYOUT, columns).exact).toBe(true);
    }
  });
});

describe('weeklyTrend', () => {
  it('needs two windows of at least three days', () => {
    expect(weeklyTrend([10, 12])).toBeNull();
    expect(weeklyTrend([10, 10, 10, 10, 10])).toBeNull();
  });

  it('compares the last seven days with the seven before', () => {
    const before = [10, 10, 10, 10, 10, 10, 10];
    const recent = [12, 12, 12, 12, 12, 12, 12];
    expect(weeklyTrend([...before, ...recent])).toBeCloseTo(20);
  });

  it('refuses to divide by a zero baseline', () => {
    expect(weeklyTrend([0, 0, 0, 5, 5, 5, 5, 5, 5, 5])).toBeNull();
  });
});

describe('parseReplayStatus', () => {
  it('reads the stream service status', () => {
    expect(
      parseReplayStatus({ is_running: true, is_paused: false, dataset_id: 'ds_1', extra: 1 }),
    ).toEqual({ running: true, paused: false, datasetId: 'ds_1' });
  });

  it('treats anything unexpected as not running, never as live', () => {
    expect(parseReplayStatus([])).toEqual({ running: false, paused: false, datasetId: null });
    expect(parseReplayStatus(null).running).toBe(false);
    expect(parseReplayStatus({ is_running: 'yes' }).running).toBe(false);
  });
});

describe('parseSubmeters', () => {
  it('reads the whole-dataset totals', () => {
    expect(
      parseSubmeters({
        kitchen_kwh: 1.5,
        laundry_kwh: 2,
        climate_kwh: 9.25,
        days_aggregated: 1442,
      }),
    ).toEqual({
      kwh: { kitchen_kwh: 1.5, laundry_kwh: 2, climate_kwh: 9.25 },
      daysAggregated: 1442,
    });
  });

  it('treats a missing or malformed figure as no data, not a partial total', () => {
    expect(
      parseSubmeters({ kitchen_kwh: 1, laundry_kwh: 2, days_aggregated: 3 }).daysAggregated,
    ).toBe(0);
    expect(
      parseSubmeters({ kitchen_kwh: '1', laundry_kwh: 2, climate_kwh: 3 }).daysAggregated,
    ).toBe(0);
    expect(parseSubmeters([]).daysAggregated).toBe(0);
  });
});

describe('parseOverview', () => {
  it('carries the total peak event count, and null when the service omits it', () => {
    expect(parseOverview({ peak_event_count: 137 }).peakEventCount).toBe(137);
    expect(parseOverview({}).peakEventCount).toBeNull();
  });
});
