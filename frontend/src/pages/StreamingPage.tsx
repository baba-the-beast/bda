import React, { useEffect, useState, useRef } from 'react';
import { Play, Pause, Square, Activity, Gauge, Radio, TrendingUp } from 'lucide-react';
import { api } from '../api';
import { Dataset, StreamTelemetryEvent, StreamWindow } from '../types';

export const StreamingPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [eventsPerSec, setEventsPerSec] = useState<number>(5);
  const [streamStatus, setStreamStatus] = useState<any>(null);

  const [currentReading, setCurrentReading] = useState<any>(null);
  const [currentWindow, setCurrentWindow] = useState<StreamWindow | null>(null);
  const [readingHistory, setReadingHistory] = useState<number[]>([]);
  const [totalEmitted, setTotalEmitted] = useState<number>(0);
  const [isConnected, setIsConnected] = useState<boolean>(false);

  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    loadDatasets();
    fetchStatus();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      const first = list[0];
      if (first) {
        setSelectedDataset(first.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchStatus = async () => {
    try {
      const st = await api.getStreamStatus();
      setStreamStatus(st);
      if (st.is_running && !eventSourceRef.current) {
        connectSSE();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const connectSSE = () => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/v1/stream/live');
    eventSourceRef.current = es;

    es.addEventListener('telemetry', (e) => {
      setIsConnected(true);
      try {
        const payload: StreamTelemetryEvent = JSON.parse(e.data);
        if (payload.reading) {
          setCurrentReading(payload.reading);
          setReadingHistory((prev) => [...prev.slice(-30), payload.reading.global_active_power]);
        }
        if (payload.window) {
          setCurrentWindow(payload.window);
        }
        if (payload.total_emitted) {
          setTotalEmitted(payload.total_emitted);
        }
      } catch (err) {
        console.error(err);
      }
    });

    es.onerror = () => {
      setIsConnected(false);
    };
  };

  const handleStart = async () => {
    if (!selectedDataset) return;
    try {
      await api.startStream(selectedDataset, eventsPerSec);
      connectSSE();
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handlePause = async () => {
    try {
      await api.pauseStream();
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeStream();
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  const handleStop = async () => {
    try {
      await api.stopStream();
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setIsConnected(false);
      fetchStatus();
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Real-Time Streaming Telemetry
          </h1>
          <p className="text-sm text-slate-400">
            Simulated Historical Smart Meter Stream &bull; Apache Spark Structured Streaming &bull;
            Sliding Windows
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <div
            className={`flex items-center space-x-2 px-3 py-1.5 rounded-full text-xs font-semibold border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            <span
              className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`}
            />
            <span>{isConnected ? 'SSE Live Stream Active' : 'Disconnected / Standby'}</span>
          </div>
        </div>
      </div>

      {/* Control Panel Card */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Source Dataset
            </label>
            <select
              value={selectedDataset}
              onChange={(e) => setSelectedDataset(e.target.value)}
              className="bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
            >
              {datasets.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.filename}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Events / Sec ({eventsPerSec} Hz)
            </label>
            <input
              type="range"
              min="1"
              max="50"
              value={eventsPerSec}
              onChange={(e) => setEventsPerSec(Number(e.target.value))}
              className="w-32 accent-cyan-500"
            />
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {!streamStatus?.is_running ? (
            <button
              onClick={handleStart}
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-emerald-500/20 transition flex items-center space-x-2"
            >
              <Play className="w-4 h-4 fill-white" />
              <span>Start Stream</span>
            </button>
          ) : (
            <>
              {streamStatus.is_paused ? (
                <button
                  onClick={handleResume}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white font-semibold text-sm rounded-xl transition flex items-center space-x-2"
                >
                  <Play className="w-4 h-4 fill-white" />
                  <span>Resume</span>
                </button>
              ) : (
                <button
                  onClick={handlePause}
                  className="px-4 py-2 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 font-semibold text-sm rounded-xl transition flex items-center space-x-2"
                >
                  <Pause className="w-4 h-4" />
                  <span>Pause</span>
                </button>
              )}

              <button
                onClick={handleStop}
                className="px-4 py-2 bg-rose-500/20 text-rose-300 hover:bg-rose-500/30 border border-rose-500/30 font-semibold text-sm rounded-xl transition flex items-center space-x-2"
              >
                <Square className="w-4 h-4" />
                <span>Stop</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Real-time Telemetry Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Instantaneous Power Gauge Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">
              Live Instantaneous Power
            </span>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>

          <div className="my-6 text-center">
            <div className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500">
              {currentReading ? currentReading.global_active_power.toFixed(3) : '0.000'}
            </div>
            <div className="text-sm font-medium text-slate-400 mt-1">Kilowatts (kW)</div>
          </div>

          <div className="space-y-1 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
            <div className="flex justify-between">
              <span>Grid Voltage:</span>
              <span className="text-slate-200 font-mono">{currentReading?.voltage || 240.0} V</span>
            </div>
            <div className="flex justify-between">
              <span>Current Intensity:</span>
              <span className="text-slate-200 font-mono">
                {currentReading?.global_intensity || 0.0} A
              </span>
            </div>
            <div className="flex justify-between">
              <span>Timestamp:</span>
              <span className="text-cyan-400 font-mono truncate">
                {currentReading?.timestamp || 'Waiting for events...'}
              </span>
            </div>
          </div>
        </div>

        {/* Spark Window Aggregates Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">
              Spark 1-Min Window Aggregate
            </span>
            <Gauge className="w-4 h-4 text-emerald-400" />
          </div>

          <div className="my-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Rolling Average:</span>
              <span className="text-lg font-bold text-white font-mono">
                {currentWindow ? `${currentWindow.average_power.toFixed(3)} kW` : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Window Min / Max:</span>
              <span className="text-sm font-semibold text-slate-300 font-mono">
                {currentWindow
                  ? `${currentWindow.minimum_power.toFixed(2)} / ${currentWindow.maximum_power.toFixed(2)} kW`
                  : '--'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-slate-400">Trend Assessment:</span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  currentWindow?.recent_trend === 'RISING'
                    ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                    : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {currentWindow?.recent_trend || 'STABLE'}
              </span>
            </div>
          </div>

          <div className="text-xs text-slate-400 border-t border-slate-800/80 pt-3 flex justify-between">
            <span>Window Samples:</span>
            <span className="text-slate-200 font-mono">
              {currentWindow?.reading_count || 0} records
            </span>
          </div>
        </div>

        {/* Stream Throughput & Buffer Card */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase">
              Stream Throughput
            </span>
            <Radio className="w-4 h-4 text-purple-400" />
          </div>

          <div className="my-6 text-center">
            <div className="text-4xl font-extrabold text-purple-400">
              {totalEmitted.toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 mt-1">Events Ingested &amp; Dispatched</div>
          </div>

          <div className="space-y-1 text-xs text-slate-400 border-t border-slate-800/80 pt-3">
            <div className="flex justify-between">
              <span>Replay Frequency:</span>
              <span className="text-slate-200 font-mono">{eventsPerSec} events/sec</span>
            </div>
            <div className="flex justify-between">
              <span>Sink Store:</span>
              <span className="text-emerald-400 font-mono">MongoDB stream_windows</span>
            </div>
          </div>
        </div>
      </div>

      {/* Sparkline Visualizer */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center space-x-2">
          <TrendingUp className="w-4 h-4 text-cyan-400" />
          <span>Active Power Telemetry Sparkline (Recent 30 Events)</span>
        </h3>
        <div className="h-32 flex items-end space-x-1.5 pt-4">
          {readingHistory.map((val, idx) => {
            const maxVal = Math.max(...readingHistory, 5.0);
            const heightPct = Math.max(5, Math.round((val / maxVal) * 100));
            return (
              <div
                key={idx}
                style={{ height: `${heightPct}%` }}
                className="flex-1 bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-sm hover:from-cyan-400 hover:to-cyan-300 transition"
                title={`${val.toFixed(3)} kW`}
              />
            );
          })}
          {readingHistory.length === 0 && (
            <div className="w-full text-center text-xs text-slate-500 py-8">
              No live telemetry streaming. Click "Start Stream" above to activate producer.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
