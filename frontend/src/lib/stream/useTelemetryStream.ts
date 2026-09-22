import { useCallback, useEffect, useRef, useState } from 'react';

import { API_BASE } from '../api/client';
import { stream, type StreamWindow } from '../api/endpoints';

export type StreamStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed' | 'error';

export interface TelemetryReading {
  timestamp: string;
  global_active_power: number;
  global_reactive_power: number | null;
  voltage: number | null;
  global_intensity: number | null;
  anomaly?: boolean;
}

interface TelemetryPayload {
  reading?: TelemetryReading;
  window?: StreamWindow;
}

export interface TelemetryState {
  status: StreamStatus;
  /** Bounded history, oldest first. */
  readings: readonly TelemetryReading[];
  /** Server-computed aggregates. Null until the server sends a window. */
  window: StreamWindow | null;
  /** When the last event arrived, for staleness display. */
  lastEventAt: Date | null;
  error: string | null;
  reconnect: () => void;
}

const MAX_READINGS = 600;
const BASE_RETRY_MS = 1000;
const MAX_RETRY_MS = 30_000;

function isTelemetryPayload(value: unknown): value is TelemetryPayload {
  return typeof value === 'object' && value !== null;
}

function toReading(payload: TelemetryPayload): TelemetryReading | null {
  const reading = payload.reading;
  if (reading === undefined || typeof reading.global_active_power !== 'number') {
    return null;
  }
  // Absent fields stay null. The previous implementation substituted plausible
  // constants (238.0 V, 0.45 kvar), rendering invented measurements as real
  // (docs/FRONTEND_AUDIT.md F5).
  return {
    timestamp: reading.timestamp,
    global_active_power: reading.global_active_power,
    global_reactive_power: reading.global_reactive_power ?? null,
    voltage: reading.voltage ?? null,
    global_intensity: reading.global_intensity ?? null,
    ...(reading.anomaly === undefined ? {} : { anomaly: reading.anomaly }),
  };
}

/**
 * Owns the EventSource for the live telemetry feed.
 *
 * - Authenticates with a short-lived ticket, never the access token (BR-1).
 * - Reports connection state so the UI can say whether it is live.
 * - Reconnects with capped exponential backoff.
 * - Keeps a bounded ring buffer and flushes to React on an animation frame, so
 *   a high event rate costs one render per frame rather than one per message.
 * - Surfaces the server's window aggregates and never computes a substitute.
 */
export function useTelemetryStream(enabled = true): TelemetryState {
  const [status, setStatus] = useState<StreamStatus>('idle');
  const [readings, setReadings] = useState<readonly TelemetryReading[]>([]);
  const [windowAggregate, setWindowAggregate] = useState<StreamWindow | null>(null);
  const [lastEventAt, setLastEventAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  const sourceRef = useRef<EventSource | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const frameRef = useRef<number | null>(null);
  const pendingRef = useRef<TelemetryReading[]>([]);
  const latestWindowRef = useRef<StreamWindow | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const pending = pendingRef.current;
    if (pending.length === 0) return;
    pendingRef.current = [];

    setReadings((current) => {
      const next = [...current, ...pending];
      return next.length > MAX_READINGS ? next.slice(next.length - MAX_READINGS) : next;
    });
    if (latestWindowRef.current !== null) {
      setWindowAggregate(latestWindowRef.current);
    }
    setLastEventAt(new Date());
  }, []);

  const scheduleFlush = useCallback(() => {
    frameRef.current ??= requestAnimationFrame(flush);
  }, [flush]);

  const reconnect = useCallback(() => {
    setAttempt((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }

    let disposed = false;

    const connect = async (): Promise<void> => {
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      setError(null);

      let ticket: string;
      try {
        ({ ticket } = await stream.ticket());
      } catch {
        if (disposed) return;
        setStatus('error');
        setError('Could not obtain a stream ticket. Your session may have ended.');
        return;
      }
      if (disposed) return;

      const source = new EventSource(
        `${API_BASE}/stream/live?ticket=${encodeURIComponent(ticket)}`,
      );
      sourceRef.current = source;

      source.onopen = () => {
        if (!disposed) setStatus('open');
      };

      const handleTelemetry = (event: MessageEvent<string>) => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        if (!isTelemetryPayload(parsed)) return;

        if (parsed.window !== undefined) {
          latestWindowRef.current = parsed.window;
        }
        const reading = toReading(parsed);
        if (reading !== null) {
          pendingRef.current.push(reading);
        }
        scheduleFlush();
      };

      source.addEventListener('telemetry', handleTelemetry);

      source.onerror = () => {
        source.close();
        if (disposed) return;
        setStatus('reconnecting');
        // The browser retries EventSource itself, but a dead ticket has to be
        // re-issued, so the connection is rebuilt from scratch with backoff.
        const delay = Math.min(BASE_RETRY_MS * 2 ** attempt, MAX_RETRY_MS);
        retryRef.current = setTimeout(() => {
          setAttempt((n) => n + 1);
        }, delay);
      };
    };

    void connect();

    return () => {
      disposed = true;
      sourceRef.current?.close();
      sourceRef.current = null;
      if (retryRef.current !== null) clearTimeout(retryRef.current);
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [enabled, attempt, scheduleFlush]);

  useEffect(() => {
    if (!enabled) {
      setStatus('closed');
    }
  }, [enabled]);

  return {
    status,
    readings,
    window: windowAggregate,
    lastEventAt,
    error,
    reconnect,
  };
}
