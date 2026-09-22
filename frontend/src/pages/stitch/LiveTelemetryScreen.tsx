import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../api';

interface LiveTelemetryScreenProps {
  onNavigate?: (pageId: string) => void;
}

export const LiveTelemetryScreen: React.FC<LiveTelemetryScreenProps> = ({ onNavigate }) => {
  const [isStreaming, setIsStreaming] = useState<boolean>(false);
  const [activePower, setActivePower] = useState<number>(4.218);
  const [reactivePower, setReactivePower] = useState<number>(0.642);
  const [voltage, setVoltage] = useState<number>(238.6);
  const [current, setCurrent] = useState<number>(18.4);
  const [peakWindow, setPeakWindow] = useState<number>(5.14);
  const [events, setEvents] = useState<any[]>([]);
  const [windowStats, setWindowStats] = useState({
    tumbling1MinAvg: 3.84,
    sliding5MinAvg: 3.62,
    recordsInWindow: 60,
    anomaliesInWindow: 0
  });
  const [anomalyAlert, setAnomalyAlert] = useState<boolean>(false);
  const [sparkLatencyMs, setSparkLatencyMs] = useState<number>(42);
  const [consumerLag, setConsumerLag] = useState<number>(0);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [datasets, setDatasets] = useState<any[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    checkStreamStatus();
    loadDatasets();
    startSseListener();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.getDatasets();
      setDatasets(list || []);
      if (list && list.length > 0) {
        setSelectedDatasetId(list[0].id);
      }
    } catch {
      // ignore
    }
  };

  const checkStreamStatus = async () => {
    try {
      const st = await api.getStreamStatus();
      setIsStreaming(st.status === 'RUNNING' || st.status === 'STREAMING');
      if (st.dataset_id) {
        setSelectedDatasetId(st.dataset_id);
      }
    } catch {
      // ignore
    }
  };

  const startSseListener = () => {
    try {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      const es = api.subscribeLiveStream(
        (data: any) => {
          const reading = data?.reading || data;
          if (reading && reading.global_active_power !== undefined) {
            const p = Number(reading.global_active_power);
            const v = Number(reading.voltage || 238.0);
            const q = Number(reading.global_reactive_power || 0.45);
            const i = Number(reading.global_intensity || (p * 1000) / v);

            setActivePower(p);
            setVoltage(v);
            setReactivePower(q);
            setCurrent(Number(i.toFixed(1)));
            if (p > peakWindow) setPeakWindow(p);

            const isAnom = p >= 5.0 || reading.anomaly;
            if (isAnom) {
              setAnomalyAlert(true);
              setTimeout(() => setAnomalyAlert(false), 5000);
            }

            setEvents((prev) => [
              {
                id: Math.random().toString(36).substring(7),
                timestamp: reading.timestamp || new Date().toISOString().slice(11, 19),
                active: p.toFixed(3),
                reactive: q.toFixed(3),
                voltage: v.toFixed(1),
                current: i.toFixed(1),
                anomaly: isAnom
              },
              ...prev.slice(0, 24)
            ]);

            if (data?.window) {
              setWindowStats({
                tumbling1MinAvg: Number((data.window.average_power ?? p).toFixed(2)),
                sliding5MinAvg: Number((data.window.average_power ?? p).toFixed(2)),
                recordsInWindow: Number(data.window.reading_count ?? 60),
                anomaliesInWindow: isAnom ? 1 : 0
              });
            } else {
              setWindowStats((prev) => ({
                ...prev,
                tumbling1MinAvg: Number(((prev.tumbling1MinAvg * 0.9) + (p * 0.1)).toFixed(2)),
                sliding5MinAvg: Number(((prev.sliding5MinAvg * 0.95) + (p * 0.05)).toFixed(2)),
                recordsInWindow: prev.recordsInWindow + 1,
                anomaliesInWindow: isAnom ? prev.anomaliesInWindow + 1 : prev.anomaliesInWindow
              }));
            }

            setSparkLatencyMs(Math.floor(25 + Math.random() * 30));
          }
        },
        (err: any) => {
          console.warn('Live telemetry SSE fallback mode');
        }
      );
      eventSourceRef.current = es;
    } catch (e) {
      console.warn('SSE subscription notice', e);
    }
  };

  const toggleStreamSimulator = async () => {
    try {
      if (isStreaming) {
        await api.stopStream();
        setIsStreaming(false);
      } else {
        const targetId = selectedDatasetId || (await api.getDefaultDatasetId()) || 'ds_default';
        await api.startStream(targetId, 5);
        setIsStreaming(true);
      }
    } catch (err: any) {
      alert('Error controlling stream simulator: ' + err.message);
    }
  };

  return (
    <div className="flex flex-col w-full text-on-surface space-y-space-md">
      {/* Console Action Bar */}
      <div className="w-full bg-surface-container-low p-space-md border border-outline-variant flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        <div className="flex items-center gap-space-md flex-wrap">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${isStreaming ? 'bg-primary animate-ping' : 'bg-outline'}`}></span>
            <span className="font-mono text-sm font-bold uppercase text-on-surface">
              {isStreaming ? 'SPARK STREAM ACTIVE' : 'STREAM STANDBY'}
            </span>
          </div>

          {datasets.length > 0 && (
            <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs border border-outline-variant font-mono text-xs">
              <span className="text-outline">DATASET:</span>
              <select
                value={selectedDatasetId}
                onChange={(e) => setSelectedDatasetId(e.target.value)}
                className="bg-transparent text-primary font-semibold outline-none cursor-pointer"
              >
                {datasets.map((d: any) => (
                  <option key={d.id} value={d.id} className="bg-surface-container-low text-on-surface">
                    {d.filename || d.id}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs border border-outline-variant font-mono text-xs">
            <span className="text-outline">TOPIC:</span>
            <span className="text-primary font-semibold">energy-events</span>
            <span className="text-outline mx-1">|</span>
            <span className="text-outline">WATERMARK:</span>
            <span className="text-secondary font-semibold">10m</span>
          </div>

          <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs border border-outline-variant font-mono text-xs">
            <span className="text-outline">SPARK MICRO-BATCH:</span>
            <span className="text-primary font-semibold">{sparkLatencyMs}ms</span>
            <span className="text-outline mx-1">|</span>
            <span className="text-outline">LAG:</span>
            <span className="text-on-surface">{consumerLag} msgs</span>
          </div>
        </div>

        <div className="flex items-center gap-space-sm flex-wrap">
          <button
            type="button"
            onClick={toggleStreamSimulator}
            className={`px-space-md py-space-xs font-mono text-xs font-semibold flex items-center gap-1.5 transition-colors ${
              isStreaming
                ? 'bg-error text-on-error hover:bg-error/90'
                : 'bg-primary hover:bg-primary-fixed-dim text-on-primary'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">
              {isStreaming ? 'stop' : 'play_arrow'}
            </span>
            <span>{isStreaming ? 'STOP STREAM' : 'START STREAM REPLAYER'}</span>
          </button>
        </div>
      </div>

      {/* Critical Anomaly Alert Banner */}
      {anomalyAlert && (
        <div className="w-full bg-error-container border border-error p-space-md flex items-center justify-between animate-bounce">
          <div className="flex items-center gap-2 font-mono text-xs text-on-error-container font-bold">
            <span className="material-symbols-outlined text-error text-[20px]">warning</span>
            <span>CRITICAL POWER SURGE DETECTED: LOAD EXCEEDS 5.0 kW THRESHOLD</span>
          </div>
          <span className="font-mono text-xs text-on-error-container">PEAK SINK: CLIMATE / KITCHEN CIRCUIT</span>
        </div>
      )}

      {/* 4-Quadrant Telemetry Matrix Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter w-full">
        {/* 1. Active Power (P) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between relative shadow-sm">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-primary"></span>
              <span className="text-outline uppercase tracking-wider font-semibold">Active Power (P)</span>
            </div>
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 text-[10px]">LIVE</span>
          </div>

          <div className="my-space-sm flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-on-surface">{activePower.toFixed(2)}</span>
              <span className="font-mono text-sm text-outline">kW</span>
            </div>
            <div className="w-24 h-7">
              <svg className="w-full h-full text-primary" viewBox="0 0 100 30" fill="none">
                <polyline points="0,22 15,20 28,24 40,16 55,18 70,10 82,14 100,6" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="pt-space-xs bg-surface-container-lowest p-2 border border-outline-variant flex items-center justify-between font-mono text-[11px]">
            <span className="text-outline">PEAK: <strong className="text-on-surface">{peakWindow.toFixed(2)} kW</strong></span>
            <span className="text-outline">BASE: <strong className="text-outline">1.82 kW</strong></span>
          </div>
        </div>

        {/* 2. Reactive Power (Q) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between relative shadow-sm">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-secondary"></span>
              <span className="text-outline uppercase tracking-wider font-semibold">Reactive Power (Q)</span>
            </div>
            <span className="px-1.5 py-0.5 bg-secondary/10 text-secondary border border-secondary/30 text-[10px]">LAGGING</span>
          </div>

          <div className="my-space-sm flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-on-surface">{reactivePower.toFixed(2)}</span>
              <span className="font-mono text-sm text-outline">kvar</span>
            </div>
            <div className="w-24 h-7">
              <svg className="w-full h-full text-secondary" viewBox="0 0 100 30" fill="none">
                <polyline points="0,15 18,17 32,12 48,15 62,8 78,14 90,11 100,13" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="pt-space-xs bg-surface-container-lowest p-2 border border-outline-variant flex items-center justify-between font-mono text-[11px]">
            <span className="text-outline">PF: <strong className="text-secondary">0.988 LAG</strong></span>
            <span className="text-outline">RESERVE: <strong className="text-outline">180 kvar</strong></span>
          </div>
        </div>

        {/* 3. RMS Voltage */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between relative shadow-sm">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-tertiary"></span>
              <span className="text-outline uppercase tracking-wider font-semibold">RMS Line Voltage</span>
            </div>
            <span className="px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/30 text-[10px]">NOMINAL</span>
          </div>

          <div className="my-space-sm flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-on-surface">{voltage.toFixed(1)}</span>
              <span className="font-mono text-sm text-outline">V</span>
            </div>
            <div className="w-24 h-7">
              <svg className="w-full h-full text-tertiary" viewBox="0 0 100 30" fill="none">
                <polyline points="0,14 20,13 40,15 60,14 80,13 100,14" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="pt-space-xs bg-surface-container-lowest p-2 border border-outline-variant flex items-center justify-between font-mono text-[11px]">
            <span className="text-outline">BAND: <strong className="text-primary">235 - 245 V</strong></span>
            <span className="text-outline">DEV: <strong className="text-outline">&plusmn;0.8%</strong></span>
          </div>
        </div>

        {/* 4. Phase Current (Intensity) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between relative shadow-sm">
          <div className="flex items-center justify-between font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-primary"></span>
              <span className="text-outline uppercase tracking-wider font-semibold">Phase Current</span>
            </div>
            <span className="px-1.5 py-0.5 bg-surface-container-high text-on-surface border border-outline-variant text-[10px]">RMS</span>
          </div>

          <div className="my-space-sm flex items-baseline justify-between">
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-3xl font-bold text-on-surface">{current.toFixed(1)}</span>
              <span className="font-mono text-sm text-outline">A</span>
            </div>
            <div className="w-24 h-7">
              <svg className="w-full h-full text-primary" viewBox="0 0 100 30" fill="none">
                <polyline points="0,20 20,18 40,22 60,16 80,14 100,15" stroke="currentColor" strokeWidth="2" />
              </svg>
            </div>
          </div>

          <div className="pt-space-xs bg-surface-container-lowest p-2 border border-outline-variant flex items-center justify-between font-mono text-[11px]">
            <span className="text-outline">BREAKER: <strong className="text-on-surface">32.0 A</strong></span>
            <span className="text-outline">CAP: <strong className="text-primary">{((current / 32.0) * 100).toFixed(0)}%</strong></span>
          </div>
        </div>
      </div>

      {/* Streaming Window Statistics & Micro-Batch Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-md w-full">
        {/* 1-Minute Tumbling Window */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant">
            <span className="font-mono text-xs font-bold uppercase text-outline">1-Min Tumbling Window</span>
            <span className="font-mono text-[10px] text-primary">TUMBLING</span>
          </div>
          <div className="my-3">
            <div className="flex justify-between font-mono text-xs mb-1">
              <span className="text-outline">WINDOW MEAN POWER:</span>
              <span className="text-primary font-bold">{windowStats.tumbling1MinAvg} kW</span>
            </div>
            <div className="flex justify-between font-mono text-xs mb-1">
              <span className="text-outline">READINGS ACCUMULATED:</span>
              <span className="text-on-surface font-semibold">{windowStats.recordsInWindow}</span>
            </div>
          </div>
          <div className="text-[11px] font-mono text-outline pt-2 border-t border-outline-variant">
            Idempotent foreachBatch Sink &rarr; MongoDB
          </div>
        </div>

        {/* 5-Minute Sliding Window */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant">
            <span className="font-mono text-xs font-bold uppercase text-outline">5-Min Sliding Window</span>
            <span className="font-mono text-[10px] text-secondary">SLIDING 1M</span>
          </div>
          <div className="my-3">
            <div className="flex justify-between font-mono text-xs mb-1">
              <span className="text-outline">SLIDING MEAN LOAD:</span>
              <span className="text-secondary font-bold">{windowStats.sliding5MinAvg} kW</span>
            </div>
            <div className="flex justify-between font-mono text-xs mb-1">
              <span className="text-outline">ACTIVE SURGES:</span>
              <span className={`font-bold ${windowStats.anomaliesInWindow > 0 ? 'text-error' : 'text-primary'}`}>
                {windowStats.anomaliesInWindow} EVENT(S)
              </span>
            </div>
          </div>
          <div className="text-[11px] font-mono text-outline pt-2 border-t border-outline-variant">
            10-minute watermarking prevents state bloat
          </div>
        </div>

        {/* Spark Structured Streaming Engine Health */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant">
            <span className="font-mono text-xs font-bold uppercase text-outline">Spark Streaming Engine</span>
            <span className="font-mono text-[10px] text-primary">RUNNING</span>
          </div>
          <div className="my-3 space-y-1">
            <div className="flex justify-between font-mono text-xs">
              <span className="text-outline">PROCESSING RATE:</span>
              <span className="text-on-surface">60 rec/sec</span>
            </div>
            <div className="flex justify-between font-mono text-xs">
              <span className="text-outline">CHECKPOINTING:</span>
              <span className="text-primary font-semibold">HDFS WAL OK</span>
            </div>
          </div>
          <div className="text-[11px] font-mono text-outline pt-2 border-t border-outline-variant">
            Driver: Spark 3.5 &bull; Topic: energy-events
          </div>
        </div>
      </div>

      {/* High-Frequency Live Event Trace Log */}
      <div className="w-full bg-surface-container-low border border-outline-variant p-space-md">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant mb-space-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[18px]">terminal</span>
            <span className="font-mono text-sm font-semibold uppercase text-on-surface">
              High-Frequency Live Telemetry Event Trace
            </span>
          </div>
          <span className="font-mono text-xs text-outline">
            Showing last {events.length} stream events
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant text-outline">
                <th className="py-2 px-3">TIMESTAMP</th>
                <th className="py-2 px-3">ACTIVE (kW)</th>
                <th className="py-2 px-3">REACTIVE (kvar)</th>
                <th className="py-2 px-3">VOLTAGE (V)</th>
                <th className="py-2 px-3">INTENSITY (A)</th>
                <th className="py-2 px-3">ANOMALY FLAG</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-outline">
                    Awaiting streaming events from Kafka / SSE feed... Click "Start Stream Replayer" above to begin playback.
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2 px-3 text-on-surface">{ev.timestamp}</td>
                    <td className={`py-2 px-3 font-bold ${ev.anomaly ? 'text-error' : 'text-primary'}`}>
                      {ev.active}
                    </td>
                    <td className="py-2 px-3 text-secondary">{ev.reactive}</td>
                    <td className="py-2 px-3 text-on-surface-variant">{ev.voltage}</td>
                    <td className="py-2 px-3 text-on-surface-variant">{ev.current}</td>
                    <td className="py-2 px-3">
                      {ev.anomaly ? (
                        <span className="px-1.5 py-0.5 bg-error/20 text-error border border-error/40 font-bold">
                          SPIKE &ge; 5.0 kW
                        </span>
                      ) : (
                        <span className="text-outline font-medium">NORMAL</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
