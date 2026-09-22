import React, { useEffect, useState } from 'react';
import { Cpu, Play, RotateCcw, XCircle, CheckCircle2, Clock, AlertTriangle } from 'lucide-react';
import { api } from '../api';
import { AnalyticsJob, Dataset } from '../types';

export const JobsPage: React.FC = () => {
  const [jobs, setJobs] = useState<AnalyticsJob[]>([]);
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  useEffect(() => {
    loadData();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const dsList = await api.listDatasets();
      setDatasets(dsList);
      if (dsList.length > 0) {
        setSelectedDataset(dsList[0].id);
      }
      fetchJobs();
    } catch (e) {
      console.error(e);
    }
  };

  const fetchJobs = async () => {
    try {
      const list = await api.listJobs();
      setJobs(list);
    } catch (e) {
      console.error(e);
    }
  };

  const handleLaunchJob = async (type: string) => {
    if (!selectedDataset) {
      alert('Please select a dataset first.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createJob(selectedDataset, type);
      await fetchJobs();
    } catch (e: any) {
      alert(e.message || 'Job submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetry = async (jobId: string) => {
    try {
      await api.retryJob(jobId);
      await fetchJobs();
    } catch (e: any) {
      alert(e.message || 'Retry failed');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">MapReduce Job Orchestration</h1>
          <p className="text-sm text-slate-400">
            Asynchronous Hadoop Streaming Jobs &bull; Idempotent Run Tracking &bull; Automated MongoDB Aggregation Sinks
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="text-xs text-slate-400">Target Dataset:</label>
          <select
            value={selectedDataset}
            onChange={(e) => setSelectedDataset(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Action Launch Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Job 1</span>
            <div className="text-base font-bold text-white mt-1">Daily Consumption</div>
            <p className="text-xs text-slate-400 mt-1">
              Date key &bull; Accumulates total kWh, average power, bounds, and submeter breakdown.
            </p>
          </div>
          <button
            onClick={() => handleLaunchJob('DAILY')}
            disabled={submitting}
            className="w-full py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Launch Daily MR</span>
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-semibold text-blue-400 uppercase tracking-wider">Job 2</span>
            <div className="text-base font-bold text-white mt-1">Hourly Profile</div>
            <p className="text-xs text-slate-400 mt-1">
              Hour-of-day key (0-23) &bull; Computes diurnal average, minimum, maximum, and total energy.
            </p>
          </div>
          <button
            onClick={() => handleLaunchJob('HOURLY')}
            disabled={submitting}
            className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Launch Hourly MR</span>
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Job 3</span>
            <div className="text-base font-bold text-white mt-1">Monthly Trends</div>
            <p className="text-xs text-slate-400 mt-1">
              Year-Month key &bull; Evaluates seasonal consumption trends across multi-year data.
            </p>
          </div>
          <button
            onClick={() => handleLaunchJob('MONTHLY')}
            disabled={submitting}
            className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Launch Monthly MR</span>
          </button>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-4">
          <div>
            <span className="text-xs font-semibold text-amber-400 uppercase tracking-wider">Job 4</span>
            <div className="text-base font-bold text-white mt-1">Peak Events</div>
            <p className="text-xs text-slate-400 mt-1">
              Threshold window key &bull; Isolates peak active power spikes with appliance loads.
            </p>
          </div>
          <button
            onClick={() => handleLaunchJob('PEAK')}
            disabled={submitting}
            className="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow transition flex items-center justify-center space-x-1.5"
          >
            <Play className="w-3.5 h-3.5 fill-white" />
            <span>Launch Peak MR</span>
          </button>
        </div>
      </div>

      {/* Jobs History Table */}
      <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
        <div className="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white">Execution Ledger &amp; Job Status</h3>
          <span className="text-xs text-slate-400">{jobs.length} jobs executed</span>
        </div>

        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
            <tr>
              <th className="p-3">Job ID / Run ID</th>
              <th className="p-3">Type</th>
              <th className="p-3">Status</th>
              <th className="p-3">Duration</th>
              <th className="p-3">HDFS Output</th>
              <th className="p-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {jobs.map((j) => (
              <tr key={j.id} className="hover:bg-slate-800/30">
                <td className="p-3 font-mono text-xs">
                  <div className="font-semibold text-white">{j.id}</div>
                  <div className="text-slate-500">{j.run_id}</div>
                </td>
                <td className="p-3">
                  <span className="font-semibold text-cyan-400 text-xs">{j.job_type}</span>
                </td>
                <td className="p-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                    j.status === 'SUCCEEDED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : j.status === 'RUNNING' || j.status === 'QUEUED'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                      : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                  }`}>
                    {j.status}
                  </span>
                </td>
                <td className="p-3 text-xs text-slate-400">
                  {j.duration_seconds ? `${j.duration_seconds}s` : '--'}
                </td>
                <td className="p-3 font-mono text-xs text-slate-400 truncate max-w-xs">
                  {j.output_path}
                </td>
                <td className="p-3">
                  {j.status === 'FAILED' && (
                    <button
                      onClick={() => handleRetry(j.id)}
                      className="px-2.5 py-1 bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border border-amber-500/30 rounded-lg text-xs font-semibold transition flex items-center space-x-1"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Retry</span>
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {jobs.length === 0 && (
              <tr>
                <td colSpan={6} className="p-8 text-center text-xs text-slate-500">
                  No MapReduce jobs executed yet. Launch a job above.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
