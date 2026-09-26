import { Radio } from 'lucide-react';
import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Sparkline } from '../../../components/charts/Sparkline';
import { Button } from '../../../components/ui/Button';
import { EmptyState } from '../../../components/ui/States';
import { StatusPill, type Status } from '../../../components/ui/Status';
import { formatValue } from '../../../lib/format';
import { useTelemetryStream, type StreamStatus } from '../../../lib/stream/useTelemetryStream';
import { PanelState } from '../../shared/PanelState';
import { useReplayStatus } from '../../stream/replayStatus';

import type { WidgetProps } from './types';
import { WidgetCard } from './WidgetCard';

const CONNECTION: Record<StreamStatus, { status: Status; label: string }> = {
  idle: { status: 'neutral', label: 'Not connected' },
  connecting: { status: 'info', label: 'Connecting' },
  open: { status: 'ok', label: 'Live' },
  reconnecting: { status: 'warning', label: 'Reconnecting' },
  closed: { status: 'neutral', label: 'Closed' },
  error: { status: 'critical', label: 'Error' },
};

/** How many recent readings the trend line covers. */
const TRAIL = 120;

/**
 * Live voltage and power from the stream service.
 *
 * It connects only while the replay is actually running, so an idle dashboard
 * holds no open connection, and it shows nothing it has not received: before the
 * first event it says it is waiting rather than showing a placeholder reading.
 */
export function LiveWidget({ context }: WidgetProps) {
  const status = useReplayStatus();
  const replay = status.data;
  const live = replay?.running === true && !replay.paused;
  const telemetry = useTelemetryStream(live);

  const latest = telemetry.readings.at(-1);
  const trail = useMemo(
    () => telemetry.readings.slice(-TRAIL).map((reading) => reading.global_active_power),
    [telemetry.readings],
  );
  const connection = CONNECTION[telemetry.status];
  // Width decisions follow the chosen size: in one column every card is
  // full-width, and a wide card should keep its detail there.
  const small = context.size === 'sm';

  return (
    <WidgetCard
      title="Live voltage & power"
      source="the stream service"
      asOf={telemetry.lastEventAt}
      context={context}
      actions={
        live ? <StatusPill status={connection.status}>{connection.label}</StatusPill> : undefined
      }
    >
      <PanelState
        compact
        isLoading={status.isLoading}
        error={status.error}
        isEmpty={!live}
        empty={
          <EmptyState
            className="h-full justify-center gap-1.5 py-0"
            icon={<Radio aria-hidden className="size-5 text-text-subtle" />}
            title={replay?.paused === true ? 'The replay is paused' : 'The replay is not running'}
            description="Start it from the live stream page; readings appear here as they arrive."
            action={
              <Button asChild size="sm">
                <Link to="/stream">Open live stream</Link>
              </Button>
            }
          />
        }
        onRetry={() => void status.refetch()}
      >
        {telemetry.error !== null ? (
          <p role="alert" className="text-xs text-critical">
            {telemetry.error}{' '}
            <button type="button" className="underline" onClick={telemetry.reconnect}>
              Try again
            </button>
          </p>
        ) : latest === undefined ? (
          <p className="text-sm text-text-muted">Connected. Waiting for the first reading…</p>
        ) : (
          <div className="flex h-full flex-col justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-8 gap-y-2">
              <Reading
                label="active power"
                value={formatValue(latest.global_active_power, 'kW', { withUnit: false })}
                unit="kW"
                large
              />
              <Reading
                label="voltage"
                value={
                  latest.voltage === null
                    ? null
                    : formatValue(latest.voltage, 'V', { withUnit: false })
                }
                unit="V"
              />
              {!small && (
                <Reading
                  label="current"
                  value={
                    latest.global_intensity === null
                      ? null
                      : formatValue(latest.global_intensity, 'A', { withUnit: false })
                  }
                  unit="A"
                />
              )}
            </div>
            {!small && (
              <Sparkline
                values={trail}
                label={`Active power over the last ${String(trail.length)} readings, now ${formatValue(latest.global_active_power, 'kW')}.`}
              />
            )}
          </div>
        )}
      </PanelState>
    </WidgetCard>
  );
}

function Reading({
  label,
  value,
  unit,
  large = false,
}: {
  label: string;
  value: string | null;
  unit: string;
  large?: boolean;
}) {
  return (
    <p className="flex flex-col gap-0.5">
      <span className="flex items-baseline gap-1">
        {value === null ? (
          <span className="text-sm text-text-subtle">not recorded</span>
        ) : (
          <>
            <span
              data-numeric
              className={
                large ? 'text-figure font-medium leading-none text-text' : 'text-xl text-text'
              }
            >
              {value}
            </span>
            <span className="text-sm text-text-muted">{unit}</span>
          </>
        )}
      </span>
      <span className="text-xs text-text-muted">{label}</span>
    </p>
  );
}
