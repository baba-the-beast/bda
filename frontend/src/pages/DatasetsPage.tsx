import React, { useEffect, useState } from 'react';
import { Upload, HardDrive, CheckCircle, AlertOctagon, Clock, Play, FileText, ShieldCheck } from 'lucide-react';
import { api } from '../api';
import { Dataset } from '../types';

export const DatasetsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [localPathInput, setLocalPathInput] = useState<string>('data/household_power_consumption_sample.txt');
  const [importing, setImporting] = useState<boolean>(false);
  const [preprocessing, setPreprocessing] = useState<boolean>(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      if (list.length > 0 && !selectedDataset) {
        setSelectedDataset(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleImportLocal = async () => {
    if (!localPathInput) return;
    setImporting(true);
    try {
      const meta = await api.importLocalDataset(localPathInput);
      await loadDatasets();
      setSelectedDataset(meta);
    } catch (e: any) {
      alert(e.message || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const handlePreprocess = async () => {
    if (!selectedDataset) return;
    setPreprocessing(true);
    try {
      await api.preprocessDataset(selectedDataset.id);
      await loadDatasets();
      // Reload selected dataset
      const updatedList = await api.listDatasets();
      const updated = updatedList.find((d) => d.id === selectedDataset.id);
      if (updated) setSelectedDataset(updated);
    } catch (e: any) {
      alert(e.message || 'Preprocessing failed');
    } finally {
      setPreprocessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Dataset Lifecycle &amp; Quality</h1>
          <p className="text-sm text-slate-400">
            Ingestion &bull; SHA-256 Checksum Validation &bull; Cleaning &bull; Data Quality Audit &bull; HDFS Staging
          </p>
        </div>
      </div>

      {/* Ingestion Dropzone & Importer */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4">
          <div className="flex items-center space-x-2">
            <Upload className="w-5 h-5 text-cyan-400" />
            <h3 className="text-sm font-semibold text-white">Import Energy Dataset</h3>
          </div>
          <p className="text-xs text-slate-400">
            Staged files (e.g. official 2M UCI dataset or sample files) can be imported into HDFS raw storage.
          </p>
          <div className="space-y-3">
            <input
              type="text"
              value={localPathInput}
              onChange={(e) => setLocalPathInput(e.target.value)}
              placeholder="e.g. data/household_power_consumption_sample.txt"
              className="w-full bg-slate-950 border border-slate-700 text-xs text-slate-200 rounded-xl p-2.5 outline-none focus:border-cyan-500 font-mono"
            />
            <button
              onClick={handleImportLocal}
              disabled={importing}
              className="w-full py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition"
            >
              {importing ? 'Importing to HDFS...' : 'Stage Dataset into HDFS'}
            </button>
          </div>
        </div>

        {/* Registered Datasets List */}
        <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
          <h3 className="text-sm font-semibold text-white mb-3">Registered Datasets in HDFS</h3>
          <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
            {datasets.map((ds) => (
              <div
                key={ds.id}
                onClick={() => setSelectedDataset(ds)}
                className={`p-3 rounded-xl border transition cursor-pointer flex items-center justify-between ${
                  selectedDataset?.id === ds.id
                    ? 'bg-cyan-500/10 border-cyan-500/30'
                    : 'bg-slate-950/40 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <FileText className="w-4 h-4 text-cyan-400" />
                  <div>
                    <div className="text-xs font-semibold text-white">{ds.filename}</div>
                    <div className="text-[10px] text-slate-500 font-mono">ID: {ds.id}</div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                    ds.status === 'PROCESSED'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : ds.status === 'PREPROCESSING'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                      : 'bg-slate-800 text-slate-400'
                  }`}>
                    {ds.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {(ds.size_bytes / (1024 * 1024)).toFixed(2)} MB
                  </span>
                </div>
              </div>
            ))}

            {datasets.length === 0 && (
              <div className="text-xs text-slate-500 py-6 text-center">
                No datasets registered yet. Stage a dataset using the form on the left.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Selected Dataset Detail & Quality Audit Card */}
      {selectedDataset && (
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-lg font-bold text-white">{selectedDataset.filename}</span>
                <span className="text-xs text-slate-500 font-mono">({selectedDataset.id})</span>
              </div>
              <div className="text-xs text-slate-400 mt-1 flex items-center space-x-2">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>SHA-256:</span>
                <span className="font-mono text-slate-300">{selectedDataset.checksum_sha256}</span>
              </div>
            </div>

            {selectedDataset.status !== 'PROCESSED' && (
              <button
                onClick={handlePreprocess}
                disabled={preprocessing}
                className="px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center space-x-2"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>{preprocessing ? 'Cleaning Data...' : 'Run Data Preprocessing'}</span>
              </button>
            )}
          </div>

          {/* Quality Audit Breakdown */}
          {selectedDataset.quality_report ? (
            <div className="space-y-4">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Data Quality &amp; Validation Subsystem Report
              </h4>

              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-400">Total Input</span>
                  <div className="text-lg font-bold text-white mt-1">
                    {selectedDataset.quality_report.total_input_rows.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-emerald-400">Valid Cleaned</span>
                  <div className="text-lg font-bold text-emerald-400 mt-1">
                    {selectedDataset.quality_report.valid_rows.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-amber-400">Missing '?' Rows</span>
                  <div className="text-lg font-bold text-amber-400 mt-1">
                    {selectedDataset.quality_report.missing_value_rows.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-rose-400">Isolated Rejections</span>
                  <div className="text-lg font-bold text-rose-400 mt-1">
                    {selectedDataset.quality_report.rejected_rows.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-purple-400">Extreme Load (&gt;8kW)</span>
                  <div className="text-lg font-bold text-purple-400 mt-1">
                    {selectedDataset.quality_report.extreme_candidate_count.toLocaleString()}
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                  <span className="text-[11px] text-slate-400">Duration</span>
                  <div className="text-lg font-bold text-cyan-400 mt-1">
                    {selectedDataset.quality_report.processing_duration_sec}s
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/40 border border-slate-800 text-xs text-slate-400 space-y-1">
                <div>Clean HDFS Storage Path: <span className="font-mono text-cyan-400">{selectedDataset.cleaned_hdfs_path}</span></div>
                <div>Rejected Records Isolation: <span className="font-mono text-rose-400">/user/bda/energy/rejected/{selectedDataset.id}/rejected_records.log</span></div>
              </div>
            </div>
          ) : (
            <div className="p-6 rounded-xl bg-slate-950/40 border border-slate-800 text-center text-xs text-slate-400">
              This dataset is staged in HDFS raw storage. Click "Run Data Preprocessing" to validate schema, isolate missing '?' records, and generate the cleaned analytical time series.
            </div>
          )}
        </div>
      )}
    </div>
  );
};
