import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { StatusPill, type Status } from '../../components/ui/Status';
import { jobs } from '../../lib/api/endpoints';
import { formatValue } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

import { useOverview } from './overview';

/** The pipeline this platform implements, in the order data moves through it. */
const PIPELINE_STAGES = [
  { id: 'ingest', label: 'Ingest', detail: 'Upload to HDFS', route: '/datasets' },
  { id: 'clean', label: 'Clean', detail: 'Quality report', route: '/datasets' },
  { id: 'batch', label: 'Batch', detail: 'MapReduce jobs', route: '/jobs' },
  { id: 'query', label: 'Query', detail: 'Hive templates', route: '/query' },
  { id: 'stream', label: 'Stream', detail: 'Live telemetry', route: '/stream' },
] as const;

/**
 * Landing route.
 *
 * Every figure here is either from the API or explicitly "Not available". The
 * previous shell surrounded this page with five invented readouts — grid
 * frequency, ingest p99, trips, cluster node, sync state — which are gone
 * (docs/FRONTEND_AUDIT.md F2).
 */
export function OverviewPage() {
  const selection = useDatasetSelection();
  const { selected, selectedId } = selection;

  const overview = useOverview(selectedId);
  const jobList = useQuery({
    queryKey: ['jobs', selectedId] as const,
    queryFn: () => jobs.list(selectedId),
    enabled: selectedId !== undefined,
  });

  const summary = overview.data;
  const fetchedAt = overview.dataUpdatedAt === 0 ? null : new Date(overview.dataUpdatedAt);

  /** A stage is only "done" if the dataset's own status says so. */
  const stageStatus = (stageId: string): { status: Status; label: string } => {
    if (selected === undefined) return { status: 'neutral', label: 'No dataset' };

    switch (stageId) {
      case 'ingest':
        return { status: 'ok', label: 'Uploaded' };
      case 'clean':
        return selected.status === 'PROCESSED' || selected.quality_report != null
          ? { status: 'ok', label: 'Cleaned' }
          : { status: 'warning', label: 'Not run' };
      case 'batch': {
        const succeeded = (jobList.data ?? []).filter((j) => j.status === 'SUCCEEDED').length;
        if (jobList.data === undefined) return { status: 'neutral', label: 'Unknown' };
        return succeeded > 0
          ? { status: 'ok', label: `${String(succeeded)} succeeded` }
          : { status: 'warning', label: 'None run' };
      }
      case 'query':
        return { status: 'info', label: 'On demand' };
      case 'stream':
        return { status: 'info', label: 'On demand' };
      default:
        return { status: 'neutral', label: 'Unknown' };
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Overview</h1>
        <DatasetPicker selection={selection} />
      </div>

      <Panel>
        <PanelHeader
          title="Consumption summary"
          source={selected === undefined ? undefined : `Analytics · ${selected.filename}`}
          asOf={fetchedAt}
          stale={overview.isStale && !overview.isFetching}
        />
        <PanelBody>
          <PanelState
            isLoading={overview.isLoading || selection.isLoading}
            error={overview.error ?? selection.error}
            isEmpty={selection.datasets.length === 0}
            empty={
              <EmptyState
                title="No datasets yet"
                description="Upload a meter reading file to begin."
                action={
                  <Button asChild size="sm" variant="primary">
                    <Link to="/datasets">Go to datasets</Link>
                  </Button>
                }
              />
            }
            onRetry={() => void overview.refetch()}
          >
            <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
              <Metric
                label="Total consumption"
                value={
                  summary?.totalConsumptionKwh == null
                    ? null
                    : formatValue(summary.totalConsumptionKwh, 'kWh', { withUnit: false })
                }
                unit="kWh"
                asOf={fetchedAt}
              />
              <Metric
                label="Average power"
                value={
                  summary?.averagePowerKw == null
                    ? null
                    : formatValue(summary.averagePowerKw, 'kW', { withUnit: false })
                }
                unit="kW"
                asOf={fetchedAt}
              />
              <Metric
                label="Peak power"
                value={
                  summary?.peakPowerKw == null
                    ? null
                    : formatValue(summary.peakPowerKw, 'kW', { withUnit: false })
                }
                unit="kW"
                asOf={fetchedAt}
              />
              <Metric
                label="Days aggregated"
                value={
                  summary?.daysAggregated == null ? null : summary.daysAggregated.toLocaleString()
                }
                asOf={fetchedAt}
              />
            </div>
          </PanelState>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Pipeline status"
          source="Dataset status and job history"
          asOf={fetchedAt}
        />
        <PanelBody>
          <ol className="flex flex-col gap-2 md:flex-row md:items-stretch">
            {PIPELINE_STAGES.map((stage, index) => {
              const { status, label } = stageStatus(stage.id);
              return (
                <li key={stage.id} className="flex flex-1 items-center gap-2">
                  <Link
                    to={stage.route}
                    className="flex flex-1 flex-col gap-1.5 rounded border border-border bg-surface-sunken p-3 transition-colors duration-base hover:border-border-strong"
                  >
                    <span className="text-2xs uppercase tracking-wide text-text-subtle">
                      Stage {index + 1}
                    </span>
                    <span className="text-sm font-medium text-text">{stage.label}</span>
                    <span className="text-2xs text-text-muted">{stage.detail}</span>
                    <StatusPill status={status} className="mt-1 self-start">
                      {label}
                    </StatusPill>
                  </Link>
                  {index < PIPELINE_STAGES.length - 1 && (
                    <ArrowRight
                      aria-hidden
                      className="hidden size-4 shrink-0 text-text-subtle md:block"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </PanelBody>
      </Panel>
    </div>
  );
}
