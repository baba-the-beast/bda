import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { BarChart } from '../../../components/charts/BarChart';
import { EmptyState } from '../../../components/ui/States';
import { analytics } from '../../../lib/api/endpoints';
import { formatDatasetDate, formatDatasetTime, formatValue } from '../../../lib/format';
import { PanelState } from '../../shared/PanelState';
import { useVoltageBands } from '../../voltage/voltageBands';
import { useOverview } from '../overview';

import type { WidgetProps } from './types';
import { WidgetCard } from './WidgetCard';

const fetchedAt = (updatedAt: number) => (updatedAt === 0 ? null : new Date(updatedAt));

/** What each sub-meter circuit serves in this household (docs/DATA_DICTIONARY.md). */
const SUBMETERS = [
  { key: 'kitchen_kwh', name: 'Kitchen', detail: 'dishwasher, oven, microwave' },
  { key: 'laundry_kwh', name: 'Laundry', detail: 'washer, dryer, fridge, a light' },
  { key: 'climate_kwh', name: 'Water heater & AC', detail: 'climate systems' },
] as const;

type SubmeterKey = (typeof SUBMETERS)[number]['key'];

export interface SubmeterTotals {
  kwh: Record<SubmeterKey, number>;
  daysAggregated: number;
}

/**
 * Narrows /analytics/submeters, which sums every recorded day on the server.
 * It replaces summing the daily aggregate here, which the service caps to the
 * most recent days. A missing or malformed figure reads as zero days, so the
 * card shows its empty state instead of a partial total.
 */
export function parseSubmeters(payload: unknown): SubmeterTotals {
  const raw = (
    typeof payload === 'object' && payload !== null && !Array.isArray(payload) ? payload : {}
  ) as Record<string, unknown>;
  const num = (value: unknown) =>
    typeof value === 'number' && Number.isFinite(value) ? value : null;
  const kwh = { kitchen_kwh: 0, laundry_kwh: 0, climate_kwh: 0 };
  for (const { key } of SUBMETERS) {
    const value = num(raw[key]);
    if (value === null) return { kwh, daysAggregated: 0 };
    kwh[key] = value;
  }
  return { kwh, daysAggregated: num(raw.days_aggregated) ?? 0 };
}

/**
 * Energy through each sub-metered circuit, summed over every recorded day.
 *
 * Shares are of the three sub-meters together, not of the house: much of the
 * household's draw is on no sub-meter at all, and the card says so rather than
 * letting three bars that sum to 100% imply otherwise.
 */
export function SubmeterWidget({ datasetId, context }: WidgetProps) {
  const submeters = useQuery({
    queryKey: ['analytics', 'submeters', datasetId] as const,
    queryFn: async () => parseSubmeters(await analytics.submeters(datasetId ?? '')),
    enabled: datasetId !== undefined,
  });

  const totals = useMemo(
    () => SUBMETERS.map((meter) => ({ ...meter, kwh: submeters.data?.kwh[meter.key] ?? 0 })),
    [submeters.data],
  );
  const metered = totals.reduce((sum, meter) => sum + meter.kwh, 0);
  const roomy = context.span.h >= 2 || context.size !== 'sm';

  return (
    <WidgetCard
      title="Sub-meter breakdown"
      source="the daily aggregate"
      asOf={fetchedAt(submeters.dataUpdatedAt)}
      context={context}
    >
      <PanelState
        compact
        isLoading={submeters.isLoading}
        error={submeters.error}
        isEmpty={(submeters.data?.daysAggregated ?? 0) === 0 || metered === 0}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No sub-meter totals yet"
            description="They come from the daily MapReduce job."
          />
        }
        onRetry={() => void submeters.refetch()}
      >
        <div className="flex h-full flex-col justify-between gap-3">
          <ul className="flex flex-col gap-3">
            {totals.map((meter) => {
              const share = metered === 0 ? 0 : meter.kwh / metered;
              return (
                <li key={meter.key} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <span className="truncate text-text">{meter.name}</span>
                    <span data-numeric className="shrink-0 text-text-muted">
                      {formatValue(meter.kwh, 'kWh')}
                      <span className="ml-1.5 text-text-subtle">{Math.round(share * 100)}%</span>
                    </span>
                  </div>
                  <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-surface-raised">
                    <div
                      className="h-full rounded-full bg-accent"
                      style={{ width: `${String(share * 100)}%` }}
                    />
                  </div>
                  {roomy && <span className="text-2xs text-text-subtle">{meter.detail}</span>}
                </li>
              );
            })}
          </ul>
          {roomy && (
            <p className="text-2xs text-text-subtle">
              Shares of the {formatValue(metered, 'kWh')} the three sub-meters recorded, not of the
              whole house. Most circuits have no sub-meter.
            </p>
          )}
        </div>
      </PanelState>
    </WidgetCard>
  );
}

/** The service's default page for /analytics/peak. */
const PEAK_PAGE_SIZE = 50;

/** Minutes where draw crossed the peak threshold, highest first. */
export function PeakWidget({ datasetId, context }: WidgetProps) {
  const peaks = useQuery({
    queryKey: ['analytics', 'peak', datasetId] as const,
    queryFn: () => analytics.peak(datasetId ?? ''),
    enabled: datasetId !== undefined,
  });

  const ranked = useMemo(
    () => [...(peaks.data ?? [])].sort((a, b) => b.power - a.power),
    [peaks.data],
  );
  const top = ranked[0];
  // /analytics/peak returns a page of the highest events, so its length is not
  // the number of events. The count comes from /overview.
  const overview = useOverview(datasetId);
  const counted = overview.data?.peakEventCount ?? null;
  const count = counted ?? ranked.length;
  // Without the count, a full page may be a truncated one.
  const atLeast = counted === null && ranked.length >= PEAK_PAGE_SIZE;
  const listLength = context.span.h >= 2 ? 6 : 0;

  return (
    <WidgetCard
      title="Peak events"
      source="the peak job"
      asOf={fetchedAt(peaks.dataUpdatedAt)}
      context={context}
    >
      <PanelState
        compact
        isLoading={peaks.isLoading}
        error={peaks.error}
        isEmpty={top === undefined}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No peak events"
            description="None recorded, or the peak MapReduce job has not run for this dataset."
          />
        }
        onRetry={() => void peaks.refetch()}
      >
        {top !== undefined && (
          <div className="flex h-full flex-col gap-3">
            <div>
              <p className="flex items-baseline gap-1.5">
                <span data-numeric className="text-2xl font-medium leading-none text-text">
                  {count.toLocaleString()}
                </span>
                <span className="text-sm text-text-muted">
                  {atLeast && 'or more '}
                  {count === 1 ? 'event' : 'events'}
                </span>
              </p>
              <p className="mt-1 text-2xs text-text-subtle">
                above {formatValue(top.threshold_applied, 'kW')}
              </p>
            </div>
            <div className="text-xs">
              <p className="text-text-muted">Highest</p>
              <p className="text-text">
                <span data-numeric className="text-peak">
                  {formatValue(top.power, 'kW')}
                </span>{' '}
                <span className="text-text-muted">
                  {formatDatasetDate(top.timestamp)}, {formatDatasetTime(top.timestamp)}
                </span>
              </p>
            </div>
            {listLength > 0 && ranked.length > 1 && (
              <ol className="flex min-h-0 flex-col gap-1.5 overflow-y-auto border-t border-border pt-2 text-2xs">
                {ranked.slice(1, listLength).map((event) => (
                  <li key={event.timestamp} className="flex justify-between gap-2">
                    <span className="truncate text-text-muted">
                      {formatDatasetDate(event.timestamp)}{' '}
                      {formatDatasetTime(event.timestamp, { withZone: false })}
                    </span>
                    <span data-numeric className="shrink-0 text-text">
                      {formatValue(event.power, 'kW')}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </PanelState>
    </WidgetCard>
  );
}

/** Readings per supply-voltage band, from the Hive correlation query. */
export function VoltageBandWidget({ datasetId, context }: WidgetProps) {
  const bands = useVoltageBands(datasetId);
  const data = useMemo(
    () =>
      (bands.data ?? []).map((band) => ({
        category: band.voltage_band,
        value: band.reading_count,
      })),
    [bands.data],
  );

  return (
    <WidgetCard
      title="Voltage band distribution"
      source="Hive, voltage_intensity_correlation"
      asOf={fetchedAt(bands.dataUpdatedAt)}
      context={context}
      bodyClassName="pt-2"
    >
      <PanelState
        compact
        isLoading={bands.isLoading}
        error={bands.error}
        isEmpty={data.length === 0}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No voltage bands"
            description="Run preprocessing on the dataset before querying voltage bands."
          />
        }
        onRetry={() => void bands.refetch()}
      >
        <BarChart
          compact
          height="fill"
          title="Readings per voltage band"
          description={`Reading count in each of ${String(data.length)} supply-voltage bands.`}
          unit="count"
          categoryLabel="Voltage band"
          data={data}
          refreshing={bands.isFetching && !bands.isLoading}
        />
      </PanelState>
    </WidgetCard>
  );
}
