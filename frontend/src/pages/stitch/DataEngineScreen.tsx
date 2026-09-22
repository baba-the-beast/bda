import React, { useState, useEffect } from 'react';
import { api } from '../../api';

interface DataEngineScreenProps {
  onNavigate?: (pageId: string) => void;
}

export const DataEngineScreen: React.FC<DataEngineScreenProps> = () => {
  const [jobs, setJobs] = useState<any[]>([]);
  const [datasets, setDatasets] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [msg, setMsg] = useState<string>('');

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadData = async () => {
    try {
      const [j, d] = await Promise.all([
        api.getJobs().catch(() => []),
        api.getDatasets().catch(() => [])
      ]);
      setJobs(j || []);
      setDatasets(d || []);
    } catch {
      // ignore
    }
  };

  const handleRunJob = async (jobType: string) => {
    setSubmitting(jobType);
    setMsg('');
    try {
      const dsId = datasets[0]?.id || 'ds-default';
      await api.submitJob(dsId, jobType);
      setMsg(`Submitted Hadoop MapReduce ${jobType} job successfully!`);
      await loadData();
    } catch (err: any) {
      setMsg(`Job submission error: ${err.message}`);
    } finally {
      setSubmitting(null);
    }
  };

  return (
    <div className="flex flex-col w-full text-on-surface space-y-space-md">
      {/* Header */}
      <div className="w-full bg-surface-container-low p-space-md border border-outline-variant flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        <div>
          <h2 className="font-mono text-base font-bold uppercase tracking-wide text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">schema</span>
            Data Engine & Batch Processing Status
          </h2>
          <p className="font-sans text-xs text-on-surface-variant">
            HDFS Storage Hierarchy &bull; Hadoop Streaming MapReduce &bull; Apache Hive Metastore &bull; Spark Jobs
          </p>
        </div>

        <div className="flex items-center gap-space-sm font-mono text-xs">
          <button
            type="button"
            onClick={loadData}
            className="h-7 px-space-md bg-surface-container hover:bg-surface-high border border-outline-variant text-on-surface flex items-center gap-1 transition-colors"
          >
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            <span>REFRESH</span>
          </button>
        </div>
      </div>

      {msg && (
        <div className="p-3 bg-primary/20 border border-primary text-primary font-mono text-xs">
          {msg}
        </div>
      )}

      {/* Cluster Resources 6-Metric Strip */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-gutter w-full font-mono">
        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>HDFS STORAGE</span>
            <span className="material-symbols-outlined text-[14px] text-primary">hard_drive</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">132.9</span>
            <span className="text-xs text-outline ml-1">MB</span>
          </div>
          <div className="text-[10px] text-primary">2.07M RAW ROWS</div>
        </div>

        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>YARN vCPUs</span>
            <span className="material-symbols-outlined text-[14px] text-secondary">memory</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">16</span>
            <span className="text-xs text-outline ml-1">CORES</span>
          </div>
          <div className="text-[10px] text-secondary">ALLOCATED: 4 JOBS</div>
        </div>

        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>CLUSTER RAM</span>
            <span className="material-symbols-outlined text-[14px] text-primary">dns</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">32</span>
            <span className="text-xs text-outline ml-1">GB</span>
          </div>
          <div className="text-[10px] text-primary">HEAP OK (24GB FREE)</div>
        </div>

        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>HIVE METASTORE</span>
            <span className="material-symbols-outlined text-[14px] text-tertiary">database</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">ONLINE</span>
          </div>
          <div className="text-[10px] text-tertiary">6 TEMPLATES READY</div>
        </div>

        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>KAFKA BUS</span>
            <span className="material-symbols-outlined text-[14px] text-primary">swap_vert</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">ACTIVE</span>
          </div>
          <div className="text-[10px] text-primary">LAG: 0 MSGS</div>
        </div>

        <div className="bg-surface-container-low p-space-sm border border-outline-variant flex flex-col justify-between">
          <div className="flex items-center justify-between text-[11px] text-outline">
            <span>DATA QUALITY</span>
            <span className="material-symbols-outlined text-[14px] text-primary">verified</span>
          </div>
          <div className="my-1">
            <span className="text-xl font-bold text-on-surface">98.7%</span>
          </div>
          <div className="text-[10px] text-primary">1.3% '?' QUARANTINED</div>
        </div>
      </div>

      {/* HDFS Distributed Storage Tier Hierarchy */}
      <div className="bg-surface-container-low p-space-lg border border-outline-variant shadow-sm font-mono">
        <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant mb-space-md">
          <span className="text-xs font-bold uppercase text-outline">
            HDFS Distributed Tier Hierarchy (/user/bda/energy/)
          </span>
          <span className="text-xs text-primary">POSIX & WebHDFS REST Ready</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-space-md text-xs">
          <div className="bg-surface-container-lowest p-3 border border-outline-variant">
            <div className="flex justify-between items-center text-outline mb-2">
              <span className="font-bold text-on-surface">/user/bda/energy/raw</span>
              <span className="text-[10px] px-1 bg-outline/20">IMMUTABLE</span>
            </div>
            <p className="text-[11px] text-outline">Original source UCI household power consumption dataset archives.</p>
            <div className="mt-2 text-primary font-bold">132.9 MB &bull; 1 file</div>
          </div>

          <div className="bg-surface-container-lowest p-3 border border-outline-variant">
            <div className="flex justify-between items-center text-outline mb-2">
              <span className="font-bold text-primary">/user/bda/energy/cleaned</span>
              <span className="text-[10px] px-1 bg-primary/20 text-primary">READY</span>
            </div>
            <p className="text-[11px] text-outline">Parsed, ISO-timestamped, physics-validated tab-separated records.</p>
            <div className="mt-2 text-primary font-bold">108.4 MB &bull; Clean TSV</div>
          </div>

          <div className="bg-surface-container-lowest p-3 border border-outline-variant">
            <div className="flex justify-between items-center text-outline mb-2">
              <span className="font-bold text-error">/user/bda/energy/rejected</span>
              <span className="text-[10px] px-1 bg-error/20 text-error">QUARANTINE</span>
            </div>
            <p className="text-[11px] text-outline">Rows isolated with '?' missing value markers or out-of-bound voltage.</p>
            <div className="mt-2 text-error font-bold">2.4 MB &bull; 25,979 rows</div>
          </div>

          <div className="bg-surface-container-lowest p-3 border border-outline-variant">
            <div className="flex justify-between items-center text-outline mb-2">
              <span className="font-bold text-secondary">/user/bda/energy/output</span>
              <span className="text-[10px] px-1 bg-secondary/20 text-secondary">OUTPUT</span>
            </div>
            <p className="text-[11px] text-outline">MapReduce part-00000 outputs and sink destination for MongoDB.</p>
            <div className="mt-2 text-secondary font-bold">Part files &bull; Aggregates</div>
          </div>
        </div>
      </div>

      {/* MapReduce Execution Matrix */}
      <div className="bg-surface-container-low p-space-lg border border-outline-variant shadow-sm font-mono">
        <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant mb-space-md">
          <span className="text-xs font-bold uppercase text-outline">
            Hadoop MapReduce Job Dispatch Matrix
          </span>
          <span className="text-xs text-primary">Deterministic Run ID Deduplication</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-space-md text-xs">
          <div className="bg-surface-container p-3 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="font-bold text-on-surface">DAILY AGGREGATES</div>
              <div className="text-[11px] text-outline mt-1">Total kWh, average power, submeter sums per day</div>
            </div>
            <button
              type="button"
              disabled={submitting === 'DAILY'}
              onClick={() => handleRunJob('DAILY')}
              className="mt-3 w-full py-1.5 bg-primary hover:bg-primary-fixed-dim text-on-primary font-bold text-xs transition"
            >
              {submitting === 'DAILY' ? 'SUBMITTING...' : 'RUN DAILY JOB'}
            </button>
          </div>

          <div className="bg-surface-container p-3 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="font-bold text-on-surface">HOURLY PROFILE</div>
              <div className="text-[11px] text-outline mt-1">24-hour diurnal profile and voltage dynamics</div>
            </div>
            <button
              type="button"
              disabled={submitting === 'HOURLY'}
              onClick={() => handleRunJob('HOURLY')}
              className="mt-3 w-full py-1.5 bg-secondary hover:bg-secondary/90 text-on-secondary font-bold text-xs transition"
            >
              {submitting === 'HOURLY' ? 'SUBMITTING...' : 'RUN HOURLY JOB'}
            </button>
          </div>

          <div className="bg-surface-container p-3 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="font-bold text-on-surface">MONTHLY TRENDS</div>
              <div className="text-[11px] text-outline mt-1">Multi-year seasonal trends by YYYY-MM</div>
            </div>
            <button
              type="button"
              disabled={submitting === 'MONTHLY'}
              onClick={() => handleRunJob('MONTHLY')}
              className="mt-3 w-full py-1.5 bg-tertiary hover:bg-tertiary/90 text-on-tertiary-container font-bold text-xs transition"
            >
              {submitting === 'MONTHLY' ? 'SUBMITTING...' : 'RUN MONTHLY JOB'}
            </button>
          </div>

          <div className="bg-surface-container p-3 border border-outline-variant flex flex-col justify-between">
            <div>
              <div className="font-bold text-on-surface">PEAK DETECTION</div>
              <div className="text-[11px] text-outline mt-1">Surge window analysis exceeding 5.0 kW</div>
            </div>
            <button
              type="button"
              disabled={submitting === 'PEAK'}
              onClick={() => handleRunJob('PEAK')}
              className="mt-3 w-full py-1.5 bg-error hover:bg-error/90 text-on-error font-bold text-xs transition"
            >
              {submitting === 'PEAK' ? 'SUBMITTING...' : 'RUN PEAK JOB'}
            </button>
          </div>
        </div>
      </div>

      {/* Active & Recent Job Execution Table */}
      <div className="bg-surface-container-low p-space-md border border-outline-variant shadow-sm font-mono text-xs">
        <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant mb-space-md">
          <span className="font-bold uppercase text-outline">Recent Job Execution History</span>
          <span className="text-outline">Showing {jobs.length} executions</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant text-outline">
                <th className="py-2 px-3">JOB ID</th>
                <th className="py-2 px-3">TYPE</th>
                <th className="py-2 px-3">STATUS</th>
                <th className="py-2 px-3">SUBMITTED AT</th>
                <th className="py-2 px-3">OUTPUT SINK</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant">
              {jobs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-outline">
                    No active jobs in queue. Click any "RUN ... JOB" button above to submit a MapReduce task.
                  </td>
                </tr>
              ) : (
                jobs.map((jb) => (
                  <tr key={jb.id} className="hover:bg-surface-container/60 transition">
                    <td className="py-2 px-3 text-on-surface font-semibold">{jb.id}</td>
                    <td className="py-2 px-3 text-primary">{jb.job_type}</td>
                    <td className="py-2 px-3">
                      <span className={`px-1.5 py-0.5 text-[10px] border ${
                        jb.status === 'COMPLETED' ? 'bg-primary/20 text-primary border-primary/40' :
                        jb.status === 'RUNNING' ? 'bg-secondary/20 text-secondary border-secondary/40 animate-pulse' :
                        'bg-outline/20 text-outline border-outline/40'
                      }`}>
                        {jb.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-outline">{jb.created_at || 'Just now'}</td>
                    <td className="py-2 px-3 text-secondary">MongoDB &bull; HDFS /output</td>
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
