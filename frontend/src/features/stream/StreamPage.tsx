import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, Square } from 'lucide-react';
import { useMemo, useState } from 'react';

import { TimeSeriesChart } from '../../components/charts/TimeSeriesChart';
import { Button } from '../../components/ui/Button';
import { Metric } from '../../components/ui/Metric';
import { Panel, PanelBody, PanelHeader } from '../../components/ui/Panel';
import { EmptyState } from '../../components/ui/States';
import { StatusPill, type Status } from '../../components/ui/Status';
import { Table, type Column } from '../../components/ui/Table';
import { useToast } from '../../components/ui/Toast';
import { stream } from '../../lib/api/endpoints';
import { formatDatasetTime, formatValue } from '../../lib/format';
import {
  useTelemetryStream,
  type StreamStatus,
  type TelemetryReading,
} from '../../lib/stream/useTelemetryStream';
import { useDatasetSelection } from '../datasets/useDatasetSelection';
import { DatasetPicker } from '../shared/DatasetPicker';

const CONNECTION: Record<StreamStatus, { status: Status; label: string }> = {
  idle: { status: 'neutral', label: 'Not connected' },
  connecting: { status: 'info', label: 'Connecting' },
  open: { status: 'ok', label: 'Live' },
  reconnecting: { status: 'warning', label: 'Reconnecting' },
  closed: { status: 'neutral', label: 'Closed' },
  error: { status: 'critical', label: 'Error' },
};

const READING_COLUMNS: Column<TelemetryReading>[] = [
  {
    id: 'time',
    header: 'Time',
    cell: (r) => formatDatasetTime(r.timestamp, { withSeconds: true }),
  },
  {
    id: 'active',
    header: 'Active power',
    cell: (r) => formatValue(r.global_active_power, 'kW'),
    align: 'right',
    numeric: true,
  },
  {
    id: 'reactive',
    header: 'Reactive power',
    cell: (r) => formatValue(r.global_reactive_power, 'kvar'),
    align: 'right',
    numeric: true,
  },
  {
    id: 'voltage',
    header: 'Voltage',
    cell: (r) => formatValue(r.voltage, 'V'),
    align: 'right',
    numeric: true,
  },
  {
    id: 'current',
    header: 'Current',
    cell: (r) => formatValue(r.global_intensity, 'A'),
    align: 'right',
    numeric: true,
  },
];

/**
 * Live telemetry.
 *
 * The screen this replaces opened with invented readings (4.218 kW, 238.6 V),
 * generated its Spark latency with Math.random, presented client-side EMAs as
 * tumbling and sliding window averages, and substituted plausible constants for
 * missing fields. Every figure here comes from the stream or says it is
 * unavailable (docs/FRONTEND_AUDIT.md F3, F4, F5).
 */
export function StreamPage() {
  const selection = useDatasetSelection();
  const { selectedId } = selection;
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [subscribed, setSubscribed] = useState(false);
  const telemetry = useTelemetryStream(subscribed);

  const control = useMutation({
    mutationFn: async (action: 'start' | 'pause' | 'resume' | 'stop') => {
      if (action === 'start') {
        if (selectedId === undefined) throw new Error('Select a dataset first');
        return stream.start(selectedId);
      }
      return action === 'pause'
        ? stream.pause()
        : action === 'resume'
          ? stream.resume()
          : stream.stop();
    },
    onSuccess: (_data, action) => {
      setSubscribed(action !== 'stop');
      toast({ title: `Stream ${action === 'stop' ? 'stopped' : action + 'ed'}`, status: 'ok' });
      void queryClient.invalidateQueries({ queryKey: ['stream'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Stream command failed', description: error.message, status: 'critical' });
    },
  });

  const connection = CONNECTION[telemetry.status];
  const latest = telemetry.readings.at(-1);
  const windowAggregate = telemetry.window;

  const chartSeries = useMemo(
    () => [
      {
        name: 'Active power',
        points: telemetry.readings.map((r) => ({ t: r.timestamp, v: r.global_active_power })),
      },
    ],
    [telemetry.readings],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-text">Live stream</h1>
        <DatasetPicker selection={selection} />
      </div>

      <Panel>
        <PanelHeader
          title="Replay control"
          source="Stream service"
          actions={
            <div className="flex items-center gap-2">
              <StatusPill status={connection.status}>{connection.label}</StatusPill>
              <Button
                size="sm"
                variant="primary"
                loading={control.isPending && control.variables === 'start'}
                disabled={selectedId === undefined}
                icon={<Play aria-hidden className="size-3.5" />}
                onClick={() => {
                  control.mutate('start');
                }}
              >
                Start
              </Button>
              <Button
                size="sm"
                icon={<Pause aria-hidden className="size-3.5" />}
                onClick={() => {
                  control.mutate('pause');
                }}
              >
                Pause
              </Button>
              <Button
                size="sm"
                variant="danger"
                icon={<Square aria-hidden className="size-3.5" />}
                onClick={() => {
                  control.mutate('stop');
                }}
              >
                Stop
              </Button>
            </div>
          }
        />
        <PanelBody>
          {telemetry.error !== null && (
            <p role="alert" className="mb-3 text-xs text-critical">
              {telemetry.error}{' '}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  telemetry.reconnect();
                }}
              >
                Try again
              </button>
            </p>
          )}

          <div className="grid grid-cols-2 gap-5 md:grid-cols-4">
            <Metric
              label="Active power"
              value={
                latest === undefined
                  ? null
                  : formatValue(latest.global_active_power, 'kW', { withUnit: false })
              }
              unit="kW"
              asOf={telemetry.lastEventAt}
            />
            <Metric
              label="Voltage"
              value={
                latest?.voltage == null
                  ? null
                  : formatValue(latest.voltage, 'V', { withUnit: false })
              }
              unit="V"
              asOf={telemetry.lastEventAt}
            />
            <Metric
              label="1-min tumbling mean"
              value={
                windowAggregate?.tumbling_average_power == null
                  ? null
                  : formatValue(windowAggregate.tumbling_average_power, 'kW', { withUnit: false })
              }
              unit="kW"
              asOf={telemetry.lastEventAt}
            />
            <Metric
              label="5-min sliding mean"
              value={
                windowAggregate?.average_power == null
                  ? null
                  : formatValue(windowAggregate.average_power, 'kW', { withUnit: false })
              }
              unit="kW"
              asOf={telemetry.lastEventAt}
            />
          </div>
          <p className="mt-3 text-2xs text-text-subtle">
            Window means are computed by the stream service and read from its window payload. The
            client does not derive them.
          </p>
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader
          title="Active power"
          source="Live telemetry"
          asOf={telemetry.lastEventAt}
          stale={telemetry.status === 'reconnecting'}
        />
        <PanelBody>
          {telemetry.readings.length === 0 ? (
            <EmptyState
              title={subscribed ? 'Waiting for the first reading' : 'Stream not running'}
              description={
                subscribed
                  ? 'The replay is connected; readings will appear as they arrive.'
                  : 'Start the replay to see live readings.'
              }
            />
          ) : (
            <TimeSeriesChart
              title="Active power"
              description={`Live household active power, ${String(telemetry.readings.length)} readings buffered.`}
              unit="kW"
              series={chartSeries}
              height={260}
            />
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Recent readings" source="Live telemetry" asOf={telemetry.lastEventAt} />
        <PanelBody className="p-0">
          <Table
            caption="Recent telemetry readings"
            columns={READING_COLUMNS}
            rows={[...telemetry.readings].reverse().slice(0, 25)}
            rowKey={(row) => row.timestamp}
            maxHeight="20rem"
            empty={<EmptyState title="No readings yet" />}
          />
        </PanelBody>
      </Panel>
    </div>
  );
}
