import { describe, expect, it } from 'vitest';

import {
  formatBytes,
  formatCompact,
  formatDatasetDate,
  formatDatasetTime,
  formatDuration,
  formatRelative,
  formatValue,
} from './format';

describe('formatValue', () => {
  it('uses a fixed precision per unit', () => {
    expect(formatValue(2.20412, 'kW')).toBe('2.204 kW');
    expect(formatValue(2.20412, 'kWh')).toBe('2.20 kWh');
    expect(formatValue(238.64, 'V')).toBe('238.6 V');
    expect(formatValue(18.42, 'A')).toBe('18.4 A');
  });

  it('says "not recorded" rather than inventing a zero', () => {
    expect(formatValue(null, 'kW')).toBe('not recorded');
    expect(formatValue(undefined, 'kW')).toBe('not recorded');
    expect(formatValue(Number.NaN, 'kW')).toBe('not recorded');
    expect(formatValue(Number.POSITIVE_INFINITY, 'kW')).toBe('not recorded');
  });

  it('keeps a real zero, which is a measurement', () => {
    expect(formatValue(0, 'kW')).toBe('0.000 kW');
  });

  it('can omit the unit where a column header already carries it', () => {
    expect(formatValue(2.2, 'kW', { withUnit: false })).toBe('2.200');
  });

  it('puts a percentage sign against the number', () => {
    expect(formatValue(98.74, '%')).toBe('98.7%');
  });
});

describe('formatCompact', () => {
  it('shortens axis ticks', () => {
    expect(formatCompact(1500)).toMatch(/1\.5K/i);
    expect(formatCompact(null)).toBe('');
  });
});

describe('dataset time', () => {
  // 2007-01-15T12:00:00Z is 13:00 in Paris (CET, UTC+1).
  const winter = '2007-01-15T12:00:00Z';
  // 2007-07-15T12:00:00Z is 14:00 in Paris (CEST, UTC+2).
  const summer = '2007-07-15T12:00:00Z';

  it('renders in the dataset timezone, not the viewer’s', () => {
    expect(formatDatasetTime(winter, { withZone: false })).toBe('13:00');
  });

  it('follows the dataset timezone across daylight saving', () => {
    expect(formatDatasetTime(summer, { withZone: false })).toBe('14:00');
  });

  it('labels the zone so the reader knows which clock this is', () => {
    expect(formatDatasetTime(winter)).toBe('13:00 CET/CEST');
  });

  it('can include seconds for telemetry', () => {
    expect(formatDatasetTime(winter, { withZone: false, withSeconds: true })).toBe('13:00:00');
  });

  it('formats dates in the dataset timezone', () => {
    expect(formatDatasetDate('2006-12-16T23:30:00Z')).toContain('17');
  });

  it('reports missing instants explicitly', () => {
    expect(formatDatasetTime(null)).toBe('not recorded');
    expect(formatDatasetTime('not-a-date')).toBe('not recorded');
  });
});

describe('formatDuration', () => {
  it('scales the unit to the magnitude', () => {
    expect(formatDuration(0.075)).toBe('75 ms');
    expect(formatDuration(8.3672)).toBe('8.37 s');
    expect(formatDuration(95)).toBe('1m 35s');
    expect(formatDuration(3725)).toBe('1h 2m');
  });

  it('reports a missing duration explicitly', () => {
    expect(formatDuration(null)).toBe('not recorded');
  });
});

describe('formatBytes', () => {
  it('scales through the binary units', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(28537)).toBe('27.9 kB');
    expect(formatBytes(20640916)).toBe('19.7 MB');
  });

  it('reports a missing size explicitly', () => {
    expect(formatBytes(null)).toBe('not recorded');
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-09-23T12:00:00Z');

  it('describes recent instants in words', () => {
    expect(formatRelative('2026-09-23T11:58:00Z', now)).toMatch(/2 minutes ago/);
    expect(formatRelative('2026-09-23T09:00:00Z', now)).toMatch(/3 hours ago/);
  });

  it('reports a missing instant explicitly', () => {
    expect(formatRelative(null, now)).toBe('not recorded');
  });
});
