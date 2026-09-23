import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/States';
import { StatusPill, type Status } from '../../../components/ui/Status';
import { datasets, jobs, type AnalyticsJob } from '../../../lib/api/endpoints';
import { formatRelative, humanizeEnum } from '../../../lib/format';
import { PanelState } from '../../shared/PanelState';

import type { WidgetProps } from './types';
import { WidgetCard } from './WidgetCard';

const fetchedAt = (updatedAt: number) => (updatedAt === 0 ? null : new Date(updatedAt));

const ACTIVE: ReadonlySet<AnalyticsJob['status']> = new Set(['QUEUED', 'RUNNING', 'RETRYING']);

const JOB_STATUS: Record<AnalyticsJob['status'], Status> = {
  QUEUED: 'info',
  RUNNING: 'info',
  RETRYING: 'warning',
  SUCCEEDED: 'ok',
  FAILED: 'critical',
  CANCELLED: 'neutral',
};

function OpenLink({ to, label }: { to: string; label: string }) {
  return (
    <Button asChild size="sm" variant="ghost" className="size-[1.75rem] px-0">
      <Link to={to} aria-label={label} title={label}>
        <ArrowUpRight aria-hidden className="size-3.5" />
      </Link>
    </Button>
  );
}

/** MapReduce jobs for the dataset: what is running now and how the rest ended. */
export function JobsWidget({ datasetId, context }: WidgetProps) {
  const list = useQuery({
    queryKey: ['jobs', datasetId] as const,
    queryFn: () => jobs.list(datasetId),
    enabled: datasetId !== undefined,
    // Poll only while something is in flight; a settled list does not change.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((job) => ACTIVE.has(job.status)) ? 5000 : false,
  });

  const all = list.data ?? [];
  const active = all.filter((job) => ACTIVE.has(job.status));
  const failed = all.filter((job) => job.status === 'FAILED').length;
  const succeeded = all.filter((job) => job.status === 'SUCCEEDED').length;
  const latest = [...all].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))[0];
  const tall = context.span.h >= 2;

  return (
    <WidgetCard
      title="MapReduce jobs"
      source="the job orchestrator"
      asOf={fetchedAt(list.dataUpdatedAt)}
      context={context}
      actions={<OpenLink to="/jobs" label="Open MapReduce jobs" />}
    >
      <PanelState
        compact
        isLoading={list.isLoading}
        error={list.error}
        isEmpty={all.length === 0}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="No jobs yet"
            description="Submit a daily, hourly, monthly or peak job for this dataset."
          />
        }
        onRetry={() => void list.refetch()}
      >
        <div className="flex h-full flex-col gap-3">
          <p className="flex items-baseline gap-1.5">
            <span data-numeric className="text-2xl font-medium leading-none text-text">
              {active.length.toLocaleString()}
            </span>
            <span className="text-sm text-text-muted">
              {active.length === 1 ? 'job running' : 'jobs running'}
            </span>
          </p>
          <p className="text-2xs text-text-subtle">
            {succeeded.toLocaleString()} succeeded · {failed.toLocaleString()} failed ·{' '}
            {all.length.toLocaleString()} in all
          </p>

          {latest !== undefined && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusPill status={JOB_STATUS[latest.status]}>
                {humanizeEnum(latest.status)}
              </StatusPill>
              <span className="text-text-muted">
                latest: {humanizeEnum(latest.job_type)}
                {latest.created_at !== undefined && <>, {formatRelative(latest.created_at)}</>}
              </span>
            </div>
          )}

          {tall && active.length > 0 && (
            <ul className="flex min-h-0 flex-col gap-2 overflow-y-auto border-t border-border pt-2">
              {active.map((job) => (
                <li key={job.id} className="flex flex-col gap-1 text-2xs">
                  <span className="flex justify-between gap-2 text-text-muted">
                    <span>{humanizeEnum(job.job_type)}</span>
                    <span data-numeric>{Math.round(job.progress_percent)}%</span>
                  </span>
                  <span
                    role="progressbar"
                    aria-label={`${humanizeEnum(job.job_type)} job progress`}
                    aria-valuenow={Math.round(job.progress_percent)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    className="h-1 overflow-hidden rounded-full bg-surface-raised"
                  >
                    <span
                      className="block h-full bg-accent"
                      style={{ width: `${String(job.progress_percent)}%` }}
                    />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PanelState>
    </WidgetCard>
  );
}

/** How the dataset fared in preprocessing: rows kept against rows turned away. */
export function DatasetHealthWidget({ datasetId, dataset, context }: WidgetProps) {
  // The dataset listing usually carries the report already; fetch it only if not.
  const embedded = dataset?.quality_report ?? null;
  const quality = useQuery({
    queryKey: ['datasets', datasetId, 'quality'] as const,
    queryFn: () => datasets.quality(datasetId ?? ''),
    enabled: datasetId !== undefined && embedded === null && dataset?.status === 'PROCESSED',
  });
  const candidate = embedded ?? quality.data ?? null;
  // Trust the shape, not the status code: a report without row counts is no report.
  const report =
    candidate !== null && typeof candidate.total_input_rows === 'number' ? candidate : null;

  const total = report?.total_input_rows ?? 0;
  const validShare = report === null || total === 0 ? null : report.valid_rows / total;

  return (
    <WidgetCard
      title="Dataset health"
      source="preprocessing"
      context={context}
      actions={<OpenLink to="/datasets" label="Open datasets and quality" />}
    >
      <PanelState
        compact
        isLoading={quality.isLoading && quality.fetchStatus !== 'idle'}
        error={quality.error}
        isEmpty={report === null}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            title="Not cleaned yet"
            description="Run preprocessing on this dataset to see how many rows survived validation."
          />
        }
        onRetry={() => void quality.refetch()}
      >
        {report !== null && (
          <div className="flex h-full flex-col gap-3">
            <p className="flex items-baseline gap-1.5">
              <span data-numeric className="text-2xl font-medium leading-none text-text">
                {validShare === null ? '—' : `${(validShare * 100).toFixed(1)}%`}
              </span>
              <span className="text-sm text-text-muted">rows valid</span>
            </p>
            <div aria-hidden className="flex h-1.5 overflow-hidden rounded-full bg-surface-raised">
              <span
                className="h-full bg-ok"
                style={{ width: `${String((validShare ?? 0) * 100)}%` }}
              />
              <span
                className="h-full bg-critical"
                style={{
                  width: `${String(total === 0 ? 0 : (report.rejected_rows / total) * 100)}%`,
                }}
              />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-2xs">
              <dt className="text-text-muted">Valid</dt>
              <dd data-numeric className="m-0 text-right text-text">
                {report.valid_rows.toLocaleString()}
              </dd>
              <dt className="text-text-muted">Rejected</dt>
              <dd data-numeric className="m-0 text-right text-text">
                {report.rejected_rows.toLocaleString()}
              </dd>
              <dt className="text-text-muted">Missing values</dt>
              <dd data-numeric className="m-0 text-right text-text">
                {report.missing_value_rows.toLocaleString()}
              </dd>
            </dl>
          </div>
        )}
      </PanelState>
    </WidgetCard>
  );
}
