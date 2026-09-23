import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { Sparkline } from '../../../components/charts/Sparkline';
import { Metric } from '../../../components/ui/Metric';
import { EmptyState } from '../../../components/ui/States';
import { analytics } from '../../../lib/api/endpoints';
import { formatValue } from '../../../lib/format';
import { PanelState } from '../../shared/PanelState';
import { buildDayShape, DayCurve } from '../DayCurve';
import { useOverview } from '../overview';

import type { WidgetProps } from './types';
import { WidgetCard } from './WidgetCard';

const fetchedAt = (updatedAt: number) => (updatedAt === 0 ? null : new Date(updatedAt));

export function useDailyAggregates(datasetId: string | undefined) {
  return useQuery({
    queryKey: ['analytics', 'daily', datasetId] as const,
    queryFn: () => analytics.daily(datasetId ?? ''),
    enabled: datasetId !== undefined,
  });
}

const mean = (values: readonly number[]) =>
  values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);

/**
 * Change in mean daily consumption, last seven recorded days against the seven
 * before. Null unless both windows have at least three days: a percentage off
 * one day against one other is noise dressed as a trend.
 */
export function weeklyTrend(dailyKwh: readonly number[]): number | null {
  if (dailyKwh.length < 6) return null;
  const recent = dailyKwh.slice(-7);
  const before = dailyKwh.slice(-14, -recent.length);
  if (recent.length < 3 || before.length < 3) return null;
  const base = mean(before);
  if (base === 0) return null;
  return ((mean(recent) - base) / base) * 100;
}

/** Total consumption with its supporting figures and the daily trend. */
export function ConsumptionWidget({ datasetId, context }: WidgetProps) {
  const overview = useOverview(datasetId);
  const daily = useDailyAggregates(datasetId);
  const summary = overview.data;

  const series = useMemo(
    () =>
      [...(daily.data ?? [])]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((row) => row.total_consumption_kwh),
    [daily.data],
  );
  const trend = weeklyTrend(series);
  // Width decisions follow the chosen size: in one column every card is
  // full-width, and a wide card should keep its detail there.
  const small = context.size === 'sm';
  const kwh = (value: number | null | undefined, unit: 'kWh' | 'kW') =>
    value == null ? null : formatValue(value, unit, { withUnit: false });

  return (
    <WidgetCard
      title="Total consumption"
      source="the analytics service"
      asOf={fetchedAt(overview.dataUpdatedAt)}
      context={context}
    >
      <PanelState
        compact
        isLoading={overview.isLoading}
        error={overview.error}
        onRetry={() => void overview.refetch()}
      >
        <div className="flex h-full flex-col justify-between gap-2">
          {/* Wraps on the card's own width, which is what varies: the same
              card is 2 columns wide on a desktop and the whole phone on a phone. */}
          <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
            <Metric
              size="figure"
              label="recorded in total"
              value={kwh(summary?.totalConsumptionKwh, 'kWh')}
              unit="kWh"
              delta={trend}
            />
            {!small && (
              // The minimum width is what makes this wrap under the figure on a
              // phone instead of squeezing three columns beside it.
              <dl className="grid min-w-[15rem] flex-1 grid-cols-3 gap-3 text-2xs text-text-muted">
                <Figure label="average draw" value={kwh(summary?.averagePowerKw, 'kW')} unit="kW" />
                <Figure label="highest minute" value={kwh(summary?.peakPowerKw, 'kW')} unit="kW" />
                <Figure
                  label={summary?.daysAggregated === 1 ? 'day recorded' : 'days recorded'}
                  value={summary?.daysAggregated?.toLocaleString() ?? null}
                />
              </dl>
            )}
          </div>

          {series.length >= 2 ? (
            <div>
              <Sparkline
                className="h-[2rem]"
                values={series}
                label={`Daily consumption over ${String(series.length)} recorded days, most recent ${formatValue(series.at(-1), 'kWh')}.`}
              />
              <p className="mt-1 text-2xs text-text-subtle">
                {trend === null
                  ? `${String(series.length)} days, one point each`
                  : 'change: last 7 days against the 7 before'}
              </p>
            </div>
          ) : (
            !small && (
              <p className="text-2xs text-text-subtle">
                The daily trend appears once the daily MapReduce job has run for two or more days.
              </p>
            )
          )}
        </div>
      </PanelState>
    </WidgetCard>
  );
}

function Figure({ label, value, unit }: { label: string; value: string | null; unit?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="order-2">{label}</dt>
      <dd className="order-1 m-0 text-sm text-text">
        {value === null ? (
          <span className="text-text-subtle">not recorded</span>
        ) : (
          <>
            <span data-numeric>{value}</span>
            {unit !== undefined && <span className="text-text-muted"> {unit}</span>}
          </>
        )}
      </dd>
    </div>
  );
}

/** The shape of an average day, from the hourly aggregate. */
export function LoadCurveWidget({ datasetId, context }: WidgetProps) {
  const hourly = useQuery({
    queryKey: ['analytics', 'hourly', datasetId] as const,
    queryFn: () => analytics.hourly(datasetId ?? ''),
    enabled: datasetId !== undefined,
  });

  const hours = useMemo(
    () => (hourly.data ?? []).map((row) => ({ hour: row.hour, averagePowerKw: row.average_power })),
    [hourly.data],
  );
  const shape = useMemo(() => buildDayShape(hours), [hours]);
  const tall = context.span.h >= 2;
  const hhmm = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  return (
    <WidgetCard
      title="Daily load curve"
      source="the hourly aggregate"
      asOf={fetchedAt(hourly.dataUpdatedAt)}
      context={context}
    >
      <PanelState
        compact
        isLoading={hourly.isLoading}
        error={hourly.error}
        isEmpty={shape === null}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No hourly aggregate yet"
            description="Run the hourly MapReduce job for this dataset and the shape of a day appears here."
          />
        }
        onRetry={() => void hourly.refetch()}
      >
        <div className="flex h-full flex-col justify-between gap-3 pt-3">
          <DayCurve hours={hours} height={tall ? 250 : 92} />
          {tall && shape !== null && (
            <p className="text-xs leading-relaxed text-text-muted">
              Quietest at{' '}
              <span data-numeric className="text-text">
                {hhmm(shape.trough.hour)}
              </span>
              , highest at{' '}
              <span data-numeric className="text-text">
                {hhmm(shape.peak.hour)}
              </span>
              {shape.busiest !== null && (
                <>
                  ; the {shape.busiest.label} run carries{' '}
                  <span data-numeric className="text-text">
                    {Math.round(shape.shareOf(shape.busiest) * 100)}%
                  </span>{' '}
                  of an average day&rsquo;s draw
                </>
              )}
              .
            </p>
          )}
        </div>
      </PanelState>
    </WidgetCard>
  );
}
