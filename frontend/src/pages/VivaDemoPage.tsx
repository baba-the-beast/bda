import React, { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Play, Zap } from 'lucide-react';
import { api } from '../api';
import { Dataset } from '../types';

interface Step {
  id: number;
  title: string;
  desc: string;
  actionText: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  output?: string;
}

export const VivaDemoPage: React.FC = () => {
  const [, setDatasets] = useState<Dataset[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [, setCurrentStep] = useState<number>(1);
  const [running, setRunning] = useState<boolean>(false);

  const [steps, setSteps] = useState<Step[]>([
    {
      id: 1,
      title: 'Stage UCI Dataset into HDFS',
      desc: 'Stages household power consumption records into HDFS raw storage and generates SHA-256 checksum verification.',
      actionText: 'Execute Ingestion',
      status: 'PENDING',
    },
    {
      id: 2,
      title: 'Run Data Validation & Preprocessing',
      desc: 'Parses Date+Time into ISO 8601, isolates missing "?" records, checks physics limits, and produces cleaned tabular dataset in HDFS.',
      actionText: 'Execute Preprocessing',
      status: 'PENDING',
    },
    {
      id: 3,
      title: 'Execute Hadoop MapReduce Suite',
      desc: 'Runs Daily, Hourly, Monthly, and Peak MapReduce batch jobs with key-based shuffle/sort and writes aggregates to MongoDB.',
      actionText: 'Run MapReduce Jobs',
      status: 'PENDING',
    },
    {
      id: 4,
      title: 'Execute Apache Hive Analytical Query',
      desc: 'Runs approved HiveQL analytical query calculating sub-meter breakdown and energy proportions.',
      actionText: 'Run HiveQL Query',
      status: 'PENDING',
    },
    {
      id: 5,
      title: 'Activate Spark Streaming & Live Telemetry',
      desc: 'Replays historical smart-meter readings through the streaming producer and aggregates rolling 1-minute windows in MongoDB.',
      actionText: 'Start Live Stream',
      status: 'PENDING',
    },
  ]);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      const first = list[0];
      if (first) {
        setSelectedDatasetId(first.id);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const updateStep = (id: number, updates: Partial<Step>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  };

  const handleRunStep = async (stepId: number) => {
    setRunning(true);
    updateStep(stepId, { status: 'RUNNING', output: 'Processing...' });

    try {
      if (stepId === 1) {
        // Ingestion
        const meta = await api.importLocalDataset('data/household_power_consumption_sample.txt');
        await loadDatasets();
        setSelectedDatasetId(meta.id);
        updateStep(1, {
          status: 'COMPLETED',
          output: `Staged dataset ${meta.id} in HDFS (${meta.filename}). SHA-256 Checksum: ${meta.checksum_sha256.slice(0, 16)}...`,
        });
        setCurrentStep(2);
      } else if (stepId === 2) {
        // Preprocessing
        const report = await api.preprocessDataset(selectedDatasetId);
        await loadDatasets();
        updateStep(2, {
          status: 'COMPLETED',
          output: `Preprocessed ${report.valid_rows.toLocaleString()} valid rows in ${report.processing_duration_sec}s. ${report.missing_value_rows} '?' rows isolated to /user/bda/energy/rejected/.`,
        });
        setCurrentStep(3);
      } else if (stepId === 3) {
        // MapReduce
        const dailyJob = await api.createJob(selectedDatasetId, 'DAILY');
        const peakJob = await api.createJob(selectedDatasetId, 'PEAK');
        updateStep(3, {
          status: 'COMPLETED',
          output: `MapReduce batch jobs triggered: Daily (${dailyJob.id}) & Peak (${peakJob.id}). Read models written to MongoDB collections daily_aggregates and peak_events.`,
        });
        setCurrentStep(4);
      } else if (stepId === 4) {
        // Hive
        const hiveRes = await api.executeHiveQuery(selectedDatasetId, 'submeter_comparison', {});
        updateStep(4, {
          status: 'COMPLETED',
          output: `HiveQL analytics completed in ${hiveRes.execution_duration_sec}s. Evaluated Kitchen, Laundry, and Climate power proportions.`,
        });
        setCurrentStep(5);
      } else if (stepId === 5) {
        // Streaming
        await api.startStream(selectedDatasetId, 10);
        updateStep(5, {
          status: 'COMPLETED',
          output: `Real-time stream producer active at 10 records/sec. Spark window aggregates streaming to MongoDB and SSE live clients.`,
        });
      }
    } catch (e: any) {
      updateStep(stepId, { status: 'FAILED', output: `Error: ${e.message}` });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Viva &amp; Demonstration Workflow
          </h1>
          <p className="text-sm text-slate-400">
            End-to-End Guided BDA Pipeline: Ingestion &rarr; Preprocessing &rarr; HDFS &rarr;
            MapReduce &rarr; Hive &rarr; Streaming &rarr; MongoDB &rarr; UI
          </p>
        </div>
      </div>

      <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 space-y-6">
        <div className="flex items-center space-x-2 text-cyan-400 text-xs font-bold uppercase tracking-wider">
          <Zap className="w-4 h-4" />
          <span>Interactive Examination Pipeline Execution</span>
        </div>

        <div className="space-y-4">
          {steps.map((s) => {
            const isDone = s.status === 'COMPLETED';
            const isRun = s.status === 'RUNNING';
            const isFail = s.status === 'FAILED';

            return (
              <div
                key={s.id}
                className={`p-5 rounded-xl border transition ${
                  isDone
                    ? 'bg-slate-950/60 border-emerald-500/30'
                    : isRun
                      ? 'bg-slate-950/80 border-cyan-500/50 ring-1 ring-cyan-500/30'
                      : 'bg-slate-950/30 border-slate-800/80'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-start space-x-3">
                    <div className="mt-0.5">
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : isRun ? (
                        <div className="w-5 h-5 rounded-full border-2 border-cyan-400 border-t-transparent animate-spin" />
                      ) : isFail ? (
                        <div className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-xs">
                          !
                        </div>
                      ) : (
                        <Circle className="w-5 h-5 text-slate-600" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white flex items-center space-x-2">
                        <span>
                          Step {s.id}: {s.title}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1 max-w-2xl">{s.desc}</p>
                    </div>
                  </div>

                  <button
                    onClick={() => handleRunStep(s.id)}
                    disabled={running || isRun}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl transition flex items-center space-x-1.5 whitespace-nowrap ${
                      isDone
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                        : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white shadow-md shadow-cyan-500/20'
                    }`}
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>{isDone ? 'Re-run Step' : s.actionText}</span>
                  </button>
                </div>

                {s.output && (
                  <div className="mt-3 text-xs font-mono p-3 rounded-lg bg-slate-900/90 border border-slate-800 text-slate-300">
                    <span className="text-cyan-400">&gt; </span>
                    {s.output}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
