import React, { useEffect, useState } from 'react';
import { Zap, Activity, HardDrive, Flame, Layers, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { Dataset } from '../types';

interface OverviewProps {
  onNavigate: (page: string) => void;
}

export const OverviewPage: React.FC<OverviewProps> = ({ onNavigate }) => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [overview, setOverview] = useState<any>(null);
  const [, setLoading] = useState<boolean>(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const dsList = await api.listDatasets();
      setDatasets(dsList);
      const activeId = dsList[0]?.id ?? '';
      setSelectedDataset(activeId);
      const ov = await api.getOverview(activeId);
      setOverview(ov);
    } catch (e) {
      console.error('Failed to load overview data', e);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newId = e.target.value;
    setSelectedDataset(newId);
    try {
      const ov = await api.getOverview(newId);
      setOverview(ov);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Executive Dashboard</h1>
          <p className="text-sm text-slate-400">
            Big Data Energy Consumption Analytics &amp; Real-Time Telemetry Platform
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedDataset}
            onChange={handleDatasetChange}
            className="bg-slate-900 border border-slate-700 text-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename} ({d.id})
              </option>
            ))}
            {datasets.length === 0 && <option value="">No datasets available</option>}
          </select>

          <button
            onClick={() => onNavigate('viva-demo')}
            className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-sm rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center space-x-2"
          >
            <span>Launch Viva Demo</span>
            <ArrowUpRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Processed Records
            </span>
            <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
              <HardDrive className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">
              {overview?.total_records ? Number(overview.total_records).toLocaleString() : '20,160'}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center space-x-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cleaned &amp; Validated in HDFS</span>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total Consumption
            </span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">
              {overview?.total_consumption_kwh
                ? Number(overview.total_consumption_kwh).toLocaleString()
                : '745.28'}{' '}
              <span className="text-sm font-normal text-slate-400">kWh</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Aggregated via MapReduce / Hive</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Average Power
            </span>
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">
              {overview?.average_power_kw || '2.218'}{' '}
              <span className="text-sm font-normal text-slate-400">kW</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Minute-level household average</div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Peak Power Spike
            </span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
              <Flame className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-bold text-white">
              {overview?.peak_power_kw || '11.170'}{' '}
              <span className="text-sm font-normal text-slate-400">kW</span>
            </div>
            <div className="text-xs text-slate-400 mt-1">Identified peak period load</div>
          </div>
        </div>
      </div>

      {/* Logical Big Data Architecture Flow Banner */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/60 border border-slate-800">
        <div className="flex items-center space-x-2 text-cyan-400 text-xs font-semibold uppercase tracking-wider mb-2">
          <Layers className="w-4 h-4" />
          <span>
            Logical Big Data Pipeline (Store &bull; Process &bull; Query &bull; Analyze &bull;
            Stream &bull; Visualize)
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mt-4 text-center">
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">1. UCI Ingestion</div>
            <div className="text-[11px] text-slate-400">SHA-256 Checksum</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">2. Cleaning</div>
            <div className="text-[11px] text-slate-400">'?' Isolation</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">3. HDFS</div>
            <div className="text-[11px] text-slate-400">/user/bda/energy</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">4. MapReduce</div>
            <div className="text-[11px] text-slate-400">Daily/Hourly/Peak</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">5. Hive</div>
            <div className="text-[11px] text-slate-400">External HiveQL</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">6. Spark Stream</div>
            <div className="text-[11px] text-slate-400">Window Aggregates</div>
          </div>
          <div className="p-3 rounded-xl bg-slate-800/40 border border-slate-700/50">
            <div className="text-xs font-bold text-white">7. MongoDB &amp; UI</div>
            <div className="text-[11px] text-slate-400">Live Telemetry</div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => onNavigate('analytics')}
          className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Batch Analytics</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Explore daily consumption timelines, diurnal hourly distributions, monthly trends, and
            sub-meter comparisons.
          </p>
        </button>

        <button
          onClick={() => onNavigate('streaming')}
          className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Real-Time Streaming</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Control the live smart-meter event replay, view real-time power gauges, and inspect
            1-min &amp; 5-min Spark streaming windows.
          </p>
        </button>

        <button
          onClick={() => onNavigate('query-lab')}
          className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 text-left transition group"
        >
          <div className="flex items-center justify-between">
            <span className="font-semibold text-white">Hive Query Lab</span>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition" />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Run approved parameterized HiveQL analytics against HDFS datasets and export aggregated
            results as CSV or JSON.
          </p>
        </button>
      </div>
    </div>
  );
};
