import { useQuery } from '@tanstack/react-query';

import { hive } from '../../lib/api/endpoints';

/**
 * A row of the voltage_intensity_correlation template.
 *
 * The field names are the ones the API actually returns. The previous screen
 * read `row.band` and `row.count`, which exist only on its hardcoded fallback
 * objects, so a successful query rendered two empty columns and a failed one
 * rendered invented figures (docs/FRONTEND_AUDIT.md F1).
 */
export interface VoltageBand {
  voltage_band: string;
  avg_voltage: number | null;
  avg_intensity: number | null;
  avg_active_power: number | null;
  avg_reactive_power: number | null;
  reading_count: number | null;
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

export function parseBands(payload: unknown): VoltageBand[] {
  const results = (payload as { results?: unknown }).results;
  if (!Array.isArray(results)) return [];

  return results.map((row) => {
    const record = row as Record<string, unknown>;
    return {
      voltage_band: typeof record.voltage_band === 'string' ? record.voltage_band : 'Unknown band',
      avg_voltage: asNumber(record.avg_voltage),
      avg_intensity: asNumber(record.avg_intensity),
      avg_active_power: asNumber(record.avg_active_power),
      avg_reactive_power: asNumber(record.avg_reactive_power),
      reading_count: asNumber(record.reading_count),
    };
  });
}

/**
 * The band distribution for a dataset. Shared by the voltage route and the
 * overview card under one query key, so the Hive query runs once for both.
 */
export function useVoltageBands(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['voltage-bands', datasetId] as const,
    queryFn: async () =>
      parseBands(await hive.execute(datasetId ?? '', 'voltage_intensity_correlation')),
    enabled: datasetId !== undefined,
  });
}
