import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Play, RotateCcw } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { KeyValue } from '../../components/ui/KeyValue';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { Select } from '../../components/ui/Select';
import { EmptyState } from '../../components/ui/States';
import { StatusPill, type Status } from '../../components/ui/Status';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { jobs, type AnalyticsJob, type JobType } from '../../lib/api/endpoints';
import { formatDatasetTime, formatDuration, formatValue } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';
import { PanelState } from '../shared/PanelState';

const JOB_TYPES: { value: JobType; label: string }[] = [
  { value: 'DAILY', label: 'Daily aggregates' },
  { value: 'HOURLY', label: 'Hourly distribution' },
  { value: 'MONTHLY', label: 'Monthly trends' },
  { value: 'PEAK', label: 'Peak power events' },
];

const STATUS_TONE: Record<string, Status> = {
  QUEUED: 'neutral',
  RUNNING: 'info',
  RETRYING: 'warning',
  SUCCEEDED: 'ok',
  FAILED: 'critical',
  CANCELLED: 'warning',
};

/** A job that is still moving is worth re-reading; a finished one is not. */
const IN_FLIGHT = new Set(['QUEUED', 'RUNNING', 'RETRYING']);

export function JobsPage() {
  const selection = useDatasetSelection();
  const { selectedId } = selection;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [jobType, setJobType] = useState<JobType>('DAILY');

  const jobList = useQuery({
    queryKey: ['jobs', selectedId] as const,
    queryFn: () => jobs.list(selectedId),
    enabled: selectedId !== undefined,
    // Poll only while something is actually running. React Query pauses this
    // when the tab is hidden, which the old 3-second setInterval did not.
    refetchInterval: (query) =>
      (query.state.data ?? []).some((job) => IN_FLIGHT.has(job.status)) ? 3000 : false,
  });

  const submit = useMutation({
    mutationFn: () => {
      if (selectedId === undefined) throw new Error('Select a dataset first');
      return jobs.create(selectedId, jobType);
    },
    onSuccess: (job) => {
      toast({ title: 'Job submitted', description: `${job.job_type} · ${job.id}`, status: 'ok' });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Could not submit job', description: error.message, status: 'critical' });
    },
  });

  const retry = useMutation({
    mutationFn: (jobId: string) => jobs.retry(jobId),
    onSuccess: () => {
      toast({ title: 'Job resubmitted', status: 'ok' });
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Retry failed', description: error.message, status: 'critical' });
    },
  });

  const columns: Column<AnalyticsJob>[] = [
    { id: 'type', header: 'Type', cell: (row) => row.job_type, sortValue: (row) => row.job_type },
    {
      id: 'status',
      header: 'Status',
      cell: (row) => (
        <StatusPill status={STATUS_TONE[row.status] ?? 'neutral'}>{row.status}</StatusPill>
      ),
      sortValue: (row) => row.status,
    },
    {
      id: 'duration',
      header: 'Duration',
      cell: (row) =>
        row.duration_seconds == null ? 'Not available' : formatDuration(row.duration_seconds),
      sortValue: (row) => row.duration_seconds ?? null,
      align: 'right',
      numeric: true,
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: (row) => formatValue(row.progress_percent, '%'),
      sortValue: (row) => row.progress_percent,
      align: 'right',
      numeric: true,
    },
    {
      id: 'retries',
      header: 'Retries',
      cell: (row) => String(row.retry_count),
      sortValue: (row) => row.retry_count,
      align: 'right',
      numeric: true,
    },
    {
      id: 'submitted',
      header: 'Submitted',
      cell: (row) => formatDatasetTime(row.created_at, { withSeconds: true }),
      sortValue: (row) => row.created_at ?? null,
      align: 'right',
    },
    {
      id: 'actions',
      header: '',
      cell: (row) =>
        row.status === 'FAILED' ? (
          <Button
            size="sm"
            loading={retry.isPending && retry.variables === row.id}
            icon={<RotateCcw aria-hidden className="size-3" />}
            onClick={() => {
              retry.mutate(row.id);
            }}
          >
            Retry
          </Button>
        ) : null,
      align: 'right',
    },
  ];

  const rows = jobList.data ?? [];
  const fetchedAt = jobList.dataUpdatedAt === 0 ? null : new Date(jobList.dataUpdatedAt);
  const failed = rows.find((job) => job.status === 'FAILED');

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">MapReduce jobs</h1>
        <DatasetPicker selection={selection} />
      </div>

      <Panel>
        <PanelHeader
          title="Submit a job"
          source="Job orchestrator"
          actions={
            <div className="flex items-center gap-2">
              <Select
                aria-label="Job type"
                className="w-56"
                value={jobType}
                onValueChange={(value) => {
                  setJobType(value as JobType);
                }}
                options={JOB_TYPES}
              />
              <Button
                variant="primary"
                size="sm"
                loading={submit.isPending}
                disabled={selectedId === undefined}
                icon={<Play aria-hidden className="size-3.5" />}
                onClick={() => {
                  submit.mutate();
                }}
              >
                Run job
              </Button>
            </div>
          }
        />
        <PanelBody>
          <p className="text-xs text-text-muted">
            Each job runs the Hadoop streaming pipeline over the selected dataset&apos;s cleaned
            output and writes its aggregates back to the analytical store.
          </p>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Job history"
          source="Job orchestrator"
          asOf={fetchedAt}
          stale={jobList.isStale && !jobList.isFetching}
        />
        <PanelBody className="p-0">
          <PanelState
            isLoading={jobList.isLoading || selection.isLoading}
            error={jobList.error ?? selection.error}
            isEmpty={rows.length === 0}
            empty={
              <EmptyState
                title="No jobs for this dataset"
                description="Submit one above to produce aggregates."
              />
            }
            onRetry={() => void jobList.refetch()}
          >
            <Table
              caption="Analytics job history"
              columns={columns}
              rows={rows}
              rowKey={(row) => row.id}
              maxHeight="28rem"
            />
          </PanelState>
        </PanelBody>
      </Panel>

      {failed !== undefined && (
        <Panel>
          <PanelHeader title="Most recent failure" source={`Job ${failed.id}`} />
          <PanelBody>
            <KeyValue
              items={[
                { label: 'Job', value: failed.id, mono: true },
                { label: 'Type', value: failed.job_type },
                { label: 'Run', value: failed.run_id, mono: true },
                { label: 'Error', value: failed.error_message ?? 'No message recorded' },
                { label: 'Input path', value: failed.input_path, mono: true },
                { label: 'Output path', value: failed.output_path, mono: true },
                { label: 'Retries', value: String(failed.retry_count) },
              ]}
            />
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
