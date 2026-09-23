import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { PageHeader } from '../../components/ui/PageHeader';
import { EmptyState } from '../../components/ui/States';
import { analytics, jobs } from '../../lib/api/endpoints';
import { formatValue } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

import { buildDayShape, DayCurve } from './DayCurve';
import { useOverview } from './overview';

/** The route each pipeline stage leads to, in the order data moves through it. */
const STAGES = [
  { id: 'ingest', name: 'Ingest', route: '/datasets' },
  { id: 'clean', name: 'Clean', route: '/datasets' },
  { id: 'batch', name: 'Batch', route: '/jobs' },
  { id: 'query', name: 'Query', route: '/query' },
  { id: 'stream', name: 'Stream', route: '/stream' },
] as const;

/**
 * Landing route.
 *
 * Opens on the shape of a day in this household, because that is the most
 * characteristic thing in this dataset's world — when the family wakes, leaves,
 * returns and sleeps, read straight off the hourly aggregate. The figures sit
 * beneath it as a reading of that curve rather than as four identical tiles.
 */
export function OverviewPage() {
  const selection = useDatasetSelection();
  const { selected, selectedId } = selection;

  const overview = useOverview(selectedId);
  const hourly = useQuery({
    queryKey: ['analytics', 'hourly', selectedId] as const,
    queryFn: () => analytics.hourly(selectedId ?? ''),
    enabled: selectedId !== undefined,
  });
  const jobList = useQuery({
    queryKey: ['jobs', selectedId] as const,
    queryFn: () => jobs.list(selectedId),
    enabled: selectedId !== undefined,
  });

  const summary = overview.data;
  const fetchedAt = overview.dataUpdatedAt === 0 ? null : new Date(overview.dataUpdatedAt);

  const hours = useMemo(
    () => (hourly.data ?? []).map((row) => ({ hour: row.hour, averagePowerKw: row.average_power })),
    [hourly.data],
  );

  /** The same reading the curve is drawn from, set as a sentence. */
  const shape = useMemo(() => buildDayShape(hours), [hours]);
  const hhmm = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

  /** Each stage reports what the data says about it, never an assumed state. */
  const stageState = (id: string): { done: boolean; note: string } => {
    if (selected === undefined) return { done: false, note: 'no dataset' };
    switch (id) {
      case 'ingest':
        return { done: true, note: 'uploaded' };
      case 'clean': {
        const cleaned = selected.status === 'PROCESSED' || selected.quality_report != null;
        return { done: cleaned, note: cleaned ? 'cleaned' : 'not run' };
      }
      case 'batch': {
        if (jobList.data === undefined) return { done: false, note: 'unknown' };
        const ok = jobList.data.filter((j) => j.status === 'SUCCEEDED').length;
        return { done: ok > 0, note: ok > 0 ? `${String(ok)} jobs` : 'none run' };
      }
      default:
        return { done: false, note: 'on demand' };
    }
  };

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <PageHeader
        title="A day in this house"
        lede={
          selected === undefined
            ? 'One household near Paris, metered every minute.'
            : `Averaged across every day recorded in ${selected.filename}.`
        }
        actions={<DatasetPicker selection={selection} />}
      />

      <PanelState
        isLoading={selection.isLoading || overview.isLoading}
        error={selection.error ?? overview.error}
        isEmpty={selection.datasets.length === 0}
        empty={
          <EmptyState
            title="Nothing recorded yet"
            description="Upload a meter reading file and the house starts telling you about itself."
            action={
              <Button asChild variant="primary" size="sm">
                <Link to="/datasets">Upload a dataset</Link>
              </Button>
            }
          />
        }
        onRetry={() => void overview.refetch()}
      >
        <section aria-labelledby="day-shape">
          <h2 id="day-shape" className="sr-only">
            Average power by hour
          </h2>
          <DayCurve hours={hours} />

          {shape !== null && (
            <p className="mt-6 max-w-[62ch] text-base leading-relaxed text-text-muted">
              Quietest at{' '}
              <span data-numeric className="text-text">
                {hhmm(shape.trough.hour)}
              </span>
              , highest at{' '}
              <span data-numeric className="text-text">
                {hhmm(shape.peak.hour)}
              </span>
              .{' '}
              {shape.busiest !== null && (
                <>
                  Its heaviest stretch is the {shape.busiest.label} run,{' '}
                  <span data-numeric className="text-text">
                    {hhmm(shape.busiest.from)}
                  </span>{' '}
                  to{' '}
                  <span data-numeric className="text-text">
                    {hhmm(shape.busiest.to)}
                  </span>
                  , which alone carries{' '}
                  <span data-numeric className="text-text">
                    {Math.round(shape.shareOf(shape.busiest) * 100)}%
                  </span>{' '}
                  of an average day&rsquo;s draw.
                </>
              )}
            </p>
          )}
        </section>

        {/* The reading of that curve. The total is the figure the page is about;
            the rest support it, so they are set smaller rather than in matching
            tiles. */}
        <section className="grid items-baseline gap-x-8 gap-y-6 border-t border-border pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            size="figure"
            label="recorded in total"
            value={
              summary?.totalConsumptionKwh == null
                ? null
                : formatValue(summary.totalConsumptionKwh, 'kWh', { withUnit: false })
            }
            unit="kWh"
            asOf={fetchedAt}
          />
          <Metric
            label="average draw"
            value={
              summary?.averagePowerKw == null
                ? null
                : formatValue(summary.averagePowerKw, 'kW', { withUnit: false })
            }
            unit="kW"
          />
          <Metric
            label="highest minute"
            value={
              summary?.peakPowerKw == null
                ? null
                : formatValue(summary.peakPowerKw, 'kW', { withUnit: false })
            }
            unit="kW"
          />
          <Metric
            label={summary?.daysAggregated === 1 ? 'day of readings' : 'days of readings'}
            value={summary?.daysAggregated == null ? null : summary.daysAggregated.toLocaleString()}
          />
        </section>

        {/* The pipeline as a line, because that is what it is: one thing after
            another. Not five boxes. */}
        <section aria-labelledby="pipeline" className="border-t border-border pt-6">
          <h2 id="pipeline" className="text-sm text-text-muted">
            How this dataset got here
          </h2>

          <ol className="mt-4 flex flex-col gap-0 sm:flex-row">
            {STAGES.map((stage, index) => {
              const { done, note } = stageState(stage.id);
              return (
                <li key={stage.id} className="flex flex-1 items-center gap-3">
                  <Link
                    to={stage.route}
                    className="group flex flex-1 items-baseline gap-2 py-2 sm:flex-col sm:items-start sm:gap-1"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className={
                          done
                            ? 'size-1.5 rounded-full bg-accent'
                            : 'size-1.5 rounded-full border border-border-strong'
                        }
                      />
                      <span className="text-sm text-text group-hover:text-accent">
                        {stage.name}
                      </span>
                    </span>
                    <span className="text-2xs text-text-subtle">{note}</span>
                  </Link>
                  {index < STAGES.length - 1 && (
                    <span aria-hidden className="hidden h-px flex-1 bg-border sm:block" />
                  )}
                </li>
              );
            })}
          </ol>
        </section>
      </PanelState>
    </div>
  );
}
