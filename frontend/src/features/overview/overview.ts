import { useQuery } from '@tanstack/react-query';

import { analytics } from '../../lib/api/endpoints';

/**
 * The overview endpoint returns an untyped dict, so it has no generated schema
 * (see BR-5 in docs/FRONTEND_BACKEND_REQUESTS.md). Its payload is narrowed here
 * at the boundary instead of being assumed, and any field the service omits
 * stays null so the UI says "Not available" rather than showing a zero.
 */
export interface OverviewSummary {
  datasetId: string | null;
  totalRecords: number | null;
  totalConsumptionKwh: number | null;
  averagePowerKw: number | null;
  peakPowerKw: number | null;
  activeJobs: number | null;
  totalDatasets: number | null;
  daysAggregated: number | null;
}

const numberOrNull = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const stringOrNull = (value: unknown): string | null =>
  typeof value === 'string' && value !== '' ? value : null;

export function parseOverview(payload: unknown): OverviewSummary {
  const raw = (typeof payload === 'object' && payload !== null ? payload : {}) as Record<
    string,
    unknown
  >;

  return {
    datasetId: stringOrNull(raw.dataset_id),
    totalRecords: numberOrNull(raw.total_records),
    totalConsumptionKwh: numberOrNull(raw.total_consumption_kwh ?? raw.total_energy_kwh),
    averagePowerKw: numberOrNull(raw.average_power_kw),
    peakPowerKw: numberOrNull(raw.peak_power_kw),
    activeJobs: numberOrNull(raw.active_jobs_count),
    totalDatasets: numberOrNull(raw.total_datasets),
    daysAggregated: numberOrNull(raw.days_aggregated),
  };
}

export function useOverview(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['overview', datasetId] as const,
    queryFn: async () => parseOverview(await analytics.overview(datasetId)),
    enabled: datasetId !== undefined,
  });
}
