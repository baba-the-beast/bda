import React, { useEffect, useState } from 'react';
import { Play, CheckCircle2 } from 'lucide-react';
import { api } from '../api';
import { Dataset } from '../types';

export const QueryLabPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('daily_aggregates');
  const [limit, setLimit] = useState<number>(20);
  const [thresholdKw, setThresholdKw] = useState<number>(4.0);

  const [executing, setExecuting] = useState<boolean>(false);
  const [results, setResults] = useState<any | null>(null);

  useEffect(() => {
    loadInitial();
  }, []);

  const loadInitial = async () => {
    try {
      const dsList = await api.listDatasets();
      setDatasets(dsList);
      const first = dsList[0];
      if (first) {
        setSelectedDataset(first.id);
      }
      const tmpls = await api.listHiveTemplates();
      setTemplates(tmpls);
    } catch (e) {
      console.error(e);
    }
  };

  const handleExecute = async () => {
    if (!selectedDataset || !selectedTemplate) return;
    setExecuting(true);
    try {
      const resp = await api.executeHiveQuery(selectedDataset, selectedTemplate, {
        limit,
        threshold_kw: thresholdKw,
      });
      setResults(resp);
    } catch (e: any) {
      alert(e.message || 'Hive query execution failed');
    } finally {
      setExecuting(false);
    }
  };

  const activeTemplateObj = templates.find((t) => t.id === selectedTemplate);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">HiveQL Query Lab</h1>
          <p className="text-sm text-slate-400">
            Secure Parameterized Analytical Templates on HDFS &bull; Injection-Safe Execution
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

      {/* Query Template Selection & Parameter Bar */}
      <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Analytical Template
            </label>
            <select
              value={selectedTemplate}
              onChange={(e) => setSelectedTemplate(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-xl p-2.5 outline-none focus:border-cyan-500"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
              Result Row Limit
            </label>
            <input
              type="number"
              min="1"
              max="500"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              className="w-full bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-xl p-2.5 outline-none focus:border-cyan-500"
            />
          </div>

          {selectedTemplate === 'peak_power_analysis' && (
            <div>
              <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                Peak Threshold (kW)
              </label>
              <input
                type="number"
                step="0.5"
                min="1.0"
                max="15.0"
                value={thresholdKw}
                onChange={(e) => setThresholdKw(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 text-sm text-slate-200 rounded-xl p-2.5 outline-none focus:border-cyan-500"
              />
            </div>
          )}
        </div>

        {activeTemplateObj && (
          <div className="text-xs text-slate-400 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
            {activeTemplateObj.description}
          </div>
        )}

        <div className="flex justify-end pt-2">
          <button
            onClick={handleExecute}
            disabled={executing}
            className="px-6 py-2.5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-semibold text-sm rounded-xl shadow-lg shadow-cyan-500/20 transition flex items-center space-x-2"
          >
            <Play className="w-4 h-4 fill-white" />
            <span>{executing ? 'Executing HiveQL...' : 'Execute Query Template'}</span>
          </button>
        </div>
      </div>

      {/* Query Results View */}
      {results && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden space-y-4 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-xs text-slate-400">
              <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              <span>
                Query ID: <span className="font-mono text-white">{results.query_id}</span>
              </span>
              <span>&bull;</span>
              <span>
                Duration:{' '}
                <span className="font-mono text-cyan-400">{results.execution_duration_sec}s</span>
              </span>
              <span>&bull;</span>
              <span>
                Rows: <span className="font-semibold text-white">{results.row_count}</span>
              </span>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
                <tr>
                  {results.columns.map((c: string) => (
                    <th key={c} className="p-3">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {results.results.map((row: any, idx: number) => (
                  <tr key={idx} className="hover:bg-slate-800/30">
                    {results.columns.map((c: string) => (
                      <td key={c} className="p-3 font-mono text-xs">
                        {String(row[c] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
