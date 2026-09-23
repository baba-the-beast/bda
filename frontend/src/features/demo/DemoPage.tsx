import { CheckCircle2, Circle, Play } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../../components/ui/Button';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { StatusPill, type Status } from '../../components/ui/Status';
import { analytics, datasets, hive, jobs, stream } from '../../lib/api/endpoints';
import { ApiError } from '../../lib/api/errors';
import { formatDuration, humanizeEnum } from '../../lib/format';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';

interface StepResult {
  state: 'idle' | 'running' | 'passed' | 'failed';
  summary?: string;
  detail?: string;
  correlationId?: string | null;
  durationMs?: number;
}

interface DemoStep {
  id: string;
  title: string;
  /** What this step proves about the platform, for the person watching. */
  demonstrates: string;
  run: (datasetId: string) => Promise<{ summary: string; detail?: string | undefined }>;
}

/**
 * The walkthrough steps.
 *
 * Every one calls the real API and reports what actually came back. Nothing is
 * scripted: a step that fails says so, with the correlation id, rather than
 * printing a rehearsed success.
 */
const STEPS: DemoStep[] = [
  {
    id: 'ingest',
    title: 'Dataset ingest',
    demonstrates: 'HDFS storage abstraction and SHA-256 integrity',
    run: async (datasetId) => {
      const dataset = await datasets.get(datasetId);
      return {
        summary: `${dataset.filename}, ${dataset.status.toLowerCase()}`,
        detail: `Checksum ${dataset.checksum_sha256.slice(0, 16)}…, raw path ${
          dataset.raw_hdfs_path ?? 'not recorded'
        }`,
      };
    },
  },
  {
    id: 'quality',
    title: 'Data quality',
    demonstrates: 'Cleaning pipeline and rejection accounting',
    run: async (datasetId) => {
      const report = await datasets.quality(datasetId);
      const share =
        report.total_input_rows === 0
          ? 'n/a'
          : `${((report.valid_rows / report.total_input_rows) * 100).toFixed(1)}%`;
      return {
        summary: `${report.valid_rows.toLocaleString()} of ${report.total_input_rows.toLocaleString()} rows valid (${share})`,
        detail: `${report.rejected_rows.toLocaleString()} rejected, schema ${report.schema_version}`,
      };
    },
  },
  {
    id: 'batch',
    title: 'MapReduce aggregates',
    demonstrates: 'Hadoop streaming batch layer',
    run: async (datasetId) => {
      const history = await jobs.list(datasetId);
      const succeeded = history.filter((job) => job.status === 'SUCCEEDED');
      if (succeeded.length === 0) {
        throw new Error('No successful MapReduce job for this dataset yet — run one first.');
      }
      const latest = succeeded[0];
      return {
        summary: `${String(succeeded.length)} successful job(s)`,
        detail:
          latest === undefined
            ? undefined
            : `Latest ${latest.job_type} in ${formatDuration(latest.duration_seconds ?? null)}`,
      };
    },
  },
  {
    id: 'aggregates',
    title: 'Analytical store',
    demonstrates: 'Aggregates persisted and queryable',
    run: async (datasetId) => {
      const daily = await analytics.daily(datasetId);
      if (daily.length === 0) throw new Error('No daily aggregates stored for this dataset.');
      const total = daily.reduce((sum, row) => sum + row.total_consumption_kwh, 0);
      return {
        summary: `${String(daily.length)} day(s) aggregated`,
        detail: `${total.toFixed(2)} kWh total across the stored range`,
      };
    },
  },
  {
    id: 'hive',
    title: 'Hive query',
    demonstrates: 'Whitelisted SQL templates over the cleaned dataset',
    run: async (datasetId) => {
      const result = await hive.execute(datasetId, 'daily_aggregates', { limit: 5 });
      return {
        summary: `${String(result.row_count)} row(s) in ${formatDuration(result.execution_duration_sec)}`,
        detail: `Columns: ${result.columns.slice(0, 5).join(', ')}`,
      };
    },
  },
  {
    id: 'stream',
    title: 'Streaming credential',
    demonstrates: 'Short-lived ticket auth for Server-Sent Events',
    run: async () => {
      const ticket = await stream.ticket();
      return {
        summary: `Ticket issued, valid ${String(ticket.expires_in)}s`,
        detail: 'The access token never enters the stream URL.',
      };
    },
  },
];

const STATE_TONE: Record<StepResult['state'], Status> = {
  idle: 'neutral',
  running: 'info',
  passed: 'ok',
  failed: 'critical',
};

/**
 * Guided walkthrough.
 *
 * Runs the pipeline end to end against the live platform so a reviewer can
 * follow raw file to live stream, and see real responses at each stage.
 */
export function DemoPage() {
  const selection = useDatasetSelection();
  const { selectedId } = selection;
  const [results, setResults] = useState<Record<string, StepResult>>({});
  const [running, setRunning] = useState(false);

  const runStep = async (step: DemoStep, datasetId: string): Promise<boolean> => {
    setResults((current) => ({ ...current, [step.id]: { state: 'running' } }));
    const startedAt = performance.now();

    try {
      const outcome = await step.run(datasetId);
      setResults((current) => ({
        ...current,
        [step.id]: {
          state: 'passed',
          summary: outcome.summary,
          ...(outcome.detail === undefined ? {} : { detail: outcome.detail }),
          durationMs: performance.now() - startedAt,
        },
      }));
      return true;
    } catch (error) {
      setResults((current) => ({
        ...current,
        [step.id]: {
          state: 'failed',
          summary: error instanceof Error ? error.message : 'Step failed',
          correlationId: error instanceof ApiError ? error.correlationId : null,
          durationMs: performance.now() - startedAt,
        },
      }));
      return false;
    }
  };

  const runAll = async () => {
    if (selectedId === undefined) return;
    setRunning(true);
    setResults({});
    for (const step of STEPS) {
      // Sequential on purpose: each stage depends on the one before it, and a
      // reviewer should see them complete in pipeline order.
      const ok = await runStep(step, selectedId);
      if (!ok) break;
    }
    setRunning(false);
  };

  const passed = Object.values(results).filter((r) => r.state === 'passed').length;

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Guided demo"
        lede="Walks one dataset through the whole pipeline, calling the live services as it goes."
        actions={<DatasetPicker selection={selection} />}
      />

      <Panel>
        <PanelHeader
          title="Pipeline walkthrough"
          source="the live platform, with no scripted output"
          actions={
            <div className="flex items-center gap-2">
              {passed > 0 && (
                <span className="text-2xs text-text-muted">
                  {passed} of {STEPS.length} passed
                </span>
              )}
              <Button
                variant="primary"
                size="sm"
                loading={running}
                disabled={selectedId === undefined}
                icon={<Play aria-hidden className="size-3.5" />}
                onClick={() => {
                  void runAll();
                }}
              >
                Run walkthrough
              </Button>
            </div>
          }
        />
        <PanelBody>
          <ol className="flex flex-col gap-2">
            {STEPS.map((step, index) => {
              const result = results[step.id] ?? { state: 'idle' as const };
              const Icon = result.state === 'passed' ? CheckCircle2 : Circle;

              return (
                <li
                  key={step.id}
                  className="flex gap-3 rounded border border-border bg-surface-sunken p-3"
                >
                  <Icon
                    aria-hidden
                    className={
                      result.state === 'passed'
                        ? 'mt-0.5 size-4 shrink-0 text-ok'
                        : 'mt-0.5 size-4 shrink-0 text-text-subtle'
                    }
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-text">
                        {index + 1}. {step.title}
                      </span>
                      <StatusPill status={STATE_TONE[result.state]}>
                        {humanizeEnum(result.state)}
                      </StatusPill>
                      {result.durationMs !== undefined && (
                        <span data-numeric className="text-2xs text-text-subtle">
                          {Math.round(result.durationMs)} ms
                        </span>
                      )}
                    </div>
                    <p className="text-2xs text-text-subtle">Demonstrates: {step.demonstrates}</p>
                    {result.summary !== undefined && (
                      <p
                        className={
                          result.state === 'failed'
                            ? 'text-xs text-critical'
                            : 'text-xs text-text-muted'
                        }
                      >
                        {result.summary}
                      </p>
                    )}
                    {result.detail !== undefined && (
                      <p className="break-words text-2xs text-text-subtle">{result.detail}</p>
                    )}
                    {result.correlationId != null && (
                      <p className="font-mono text-2xs text-text-subtle">
                        Reference: {result.correlationId}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </PanelBody>
      </Panel>
    </div>
  );
}
