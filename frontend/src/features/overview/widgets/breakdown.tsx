import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { BarChart } from '../../../components/charts/BarChart';
import { EmptyState } from '../../../components/ui/States';
import { analytics } from '../../../lib/api/endpoints';
import { formatDatasetDate, formatDatasetTime, formatValue } from '../../../lib/format';
import { PanelState } from '../../shared/PanelState';
import { useVoltageBands } from '../../voltage/voltageBands';

import { useDailyAggregates } from './energy';
import type { WidgetProps } from './types';
import { WidgetCard } from './WidgetCard';

const fetchedAt = (updatedAt: number) => (updatedAt === 0 ? null : new Date(updatedAt));

/** What each sub-meter circuit serves in this household (docs/DATA_DICTIONARY.md). */
const SUBMETERS = [
  { key: 'sub_metering_1_total', name: 'Kitchen', detail: 'dishwasher, oven, microwave' },
  { key: 'sub_metering_2_total', name: 'Laundry', detail: 'washer, dryer, fridge, a light' },
  { key: 'sub_metering_3_total', name: 'Water heater & AC', detail: 'climate systems' },
] as const;

/**
 * Energy through each sub-metered circuit, summed over every recorded day.
 *
 * Shares are of the three sub-meters together, not of the house: much of the
 * household's draw is on no sub-meter at all, and the card says so rather than
 * letting three bars that sum to 100% imply otherwise.
 */
export function SubmeterWidget({ datasetId, context }: WidgetProps) {
  const daily = useDailyAggregates(datasetId);

  const totals = useMemo(() => {
    const rows = daily.data ?? [];
    // The daily totals are in watt-hours; the card reads in kWh.
    return SUBMETERS.map((meter) => ({
      ...meter,
      kwh: rows.reduce((sum, row) => sum + row[meter.key], 0) / 1000,
    }));
  }, [daily.data]);
  const metered = totals.reduce((sum, meter) => sum + meter.kwh, 0);
  const roomy = context.span.h >= 2 || context.size !== 'sm';

  return (
    <WidgetCard
      title="Sub-meter breakdown"
      source="the daily aggregate"
      asOf={fetchedAt(daily.dataUpdatedAt)}
      context={context}
    >
      <PanelState
        compact
        isLoading={daily.isLoading}
        error={daily.error}
        isEmpty={(daily.data ?? []).length === 0 || metered === 0}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No sub-meter totals yet"
            description="They come from the daily MapReduce job."
          />
        }
        onRetry={() => void daily.refetch()}
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
                  {ranked.length.toLocaleString()}
                </span>
                <span className="text-sm text-text-muted">
                  {ranked.length === 1 ? 'event' : 'events'}
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
