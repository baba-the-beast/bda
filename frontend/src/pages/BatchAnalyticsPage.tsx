import React, { useEffect, useState } from 'react';
import { Download, Calendar, Clock, BarChart2, PieChart as PieIcon, Flame, Filter } from 'lucide-react';
import { api } from '../api';
import { Dataset, DailyAggregate, HourlyAggregate, MonthlyAggregate, PeakEvent } from '../types';

export const BatchAnalyticsPage: React.FC = () => {
  const [datasets, setDatasets] = useState<Dataset[]>([]);
  const [selectedDataset, setSelectedDataset] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'daily' | 'hourly' | 'monthly' | 'submeters' | 'peak'>('daily');

  const [dailyData, setDailyData] = useState<DailyAggregate[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyAggregate[]>([]);
  const [monthlyData, setMonthlyData] = useState<MonthlyAggregate[]>([]);
  const [submetersData, setSubmetersData] = useState<any>(null);
  const [peakData, setPeakData] = useState<PeakEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    loadDatasets();
  }, []);

  const loadDatasets = async () => {
    try {
      const list = await api.listDatasets();
      setDatasets(list);
      if (list.length > 0) {
        setSelectedDataset(list[0].id);
        fetchAnalytics(list[0].id, activeTab);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const fetchAnalytics = async (datasetId: string, tab: string) => {
    if (!datasetId) return;
    setLoading(true);
    try {
      if (tab === 'daily') {
        const d = await api.getDailyAnalytics(datasetId);
        setDailyData(d);
      } else if (tab === 'hourly') {
        const h = await api.getHourlyAnalytics(datasetId);
        setHourlyData(h);
      } else if (tab === 'monthly') {
        const m = await api.getMonthlyAnalytics(datasetId);
        setMonthlyData(m);
      } else if (tab === 'submeters') {
        const s = await api.getSubmeters(datasetId);
        setSubmetersData(s);
      } else if (tab === 'peak') {
        const p = await api.getPeakAnalytics(datasetId);
        setPeakData(p);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleDatasetChange = (newId: string) => {
    setSelectedDataset(newId);
    fetchAnalytics(newId, activeTab);
  };

  const handleTabChange = (tab: any) => {
    setActiveTab(tab);
    fetchAnalytics(selectedDataset, tab);
  };

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      await api.downloadFile(
        `/analytics/export?dataset_id=${selectedDataset}&export_type=${activeTab}&export_format=${format}`,
        `analytics_${selectedDataset}_${activeTab}.${format}`
      );
    } catch (err: any) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err.message || 'Please check authorization'}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Batch Analytics</h1>
          <p className="text-sm text-slate-400">
            Hadoop MapReduce &amp; Apache Hive analytical read-models persisted in MongoDB
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <select
            value={selectedDataset}
            onChange={(e) => handleDatasetChange(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-sm text-slate-200 rounded-xl px-3 py-2 outline-none focus:border-cyan-500"
          >
            {datasets.map((d) => (
              <option key={d.id} value={d.id}>
                {d.filename} ({d.id})
              </option>
            ))}
          </select>

          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-700 rounded-xl p-1">
            <button
              onClick={() => handleExport('csv')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </button>
            <button
              onClick={() => handleExport('json')}
              className="px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white rounded-lg hover:bg-slate-800 transition flex items-center space-x-1"
            >
              <Download className="w-3.5 h-3.5" />
              <span>JSON</span>
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800 space-x-2">
        <button
          onClick={() => handleTabChange('daily')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            activeTab === 'daily'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span>Daily Consumption</span>
        </button>

        <button
          onClick={() => handleTabChange('hourly')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            activeTab === 'hourly'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Clock className="w-4 h-4" />
          <span>Hourly Profile</span>
        </button>

        <button
          onClick={() => handleTabChange('monthly')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            activeTab === 'monthly'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>Monthly Trends</span>
        </button>

        <button
          onClick={() => handleTabChange('submeters')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            activeTab === 'submeters'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <PieIcon className="w-4 h-4" />
          <span>Sub-Meters</span>
        </button>

        <button
          onClick={() => handleTabChange('peak')}
          className={`pb-3 px-4 font-semibold text-sm flex items-center space-x-2 border-b-2 transition ${
            activeTab === 'peak'
              ? 'border-cyan-500 text-cyan-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Flame className="w-4 h-4" />
          <span>Peak Events</span>
        </button>
      </div>

      {loading && (
        <div className="p-12 text-center text-slate-400">Loading analytical records from MongoDB...</div>
      )}

      {/* Tab Contents */}
      {!loading && activeTab === 'daily' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <h3 className="text-base font-semibold text-white mb-4">Daily Total Consumption (kWh)</h3>
            {/* Simple Accessible Responsive SVG Chart */}
            <div className="h-64 flex items-end space-x-2 pt-6">
              {dailyData.slice(-14).map((d, i) => {
                const maxKwh = Math.max(...dailyData.map((x) => x.total_consumption_kwh), 60);
                const heightPct = Math.round((d.total_consumption_kwh / maxKwh) * 100);
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-8 bg-slate-800 text-xs px-2 py-1 rounded text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                      {d.date}: {d.total_consumption_kwh} kWh
                    </div>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-gradient-to-t from-cyan-600 to-cyan-400 rounded-t-md hover:from-cyan-500 hover:to-cyan-300 transition"
                    />
                    <span className="text-[10px] text-slate-500 mt-2 truncate w-full text-center">
                      {d.date.slice(5)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
            <table className="w-full text-left text-sm text-slate-300">
              <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Total (kWh)</th>
                  <th className="p-3">Avg Power (kW)</th>
                  <th className="p-3">Min / Max (kW)</th>
                  <th className="p-3">Sub-1 (Kitchen)</th>
                  <th className="p-3">Sub-2 (Laundry)</th>
                  <th className="p-3">Sub-3 (Climate)</th>
                  <th className="p-3">Readings</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {dailyData.slice(0, 15).map((d) => (
                  <tr key={d.date} className="hover:bg-slate-800/30">
                    <td className="p-3 font-mono text-cyan-400">{d.date}</td>
                    <td className="p-3 font-semibold text-white">{d.total_consumption_kwh}</td>
                    <td className="p-3">{d.average_power}</td>
                    <td className="p-3 text-slate-400">{d.minimum_power} / {d.maximum_power}</td>
                    <td className="p-3">{d.sub_metering_1_total} Wh</td>
                    <td className="p-3">{d.sub_metering_2_total} Wh</td>
                    <td className="p-3">{d.sub_metering_3_total} Wh</td>
                    <td className="p-3">{d.reading_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && activeTab === 'hourly' && (
        <div className="space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <h3 className="text-base font-semibold text-white mb-4">Diurnal Hourly Power Distribution (00:00 - 23:00)</h3>
            <div className="h-64 flex items-end space-x-2 pt-6">
              {hourlyData.map((h) => {
                const maxAvg = Math.max(...hourlyData.map((x) => x.average_power), 4.5);
                const heightPct = Math.round((h.average_power / maxAvg) * 100);
                return (
                  <div key={h.hour} className="flex-1 flex flex-col items-center group relative">
                    <div className="absolute -top-8 bg-slate-800 text-xs px-2 py-1 rounded text-white opacity-0 group-hover:opacity-100 transition whitespace-nowrap z-10">
                      {String(h.hour).padStart(2, '0')}:00 - {h.average_power} kW
                    </div>
                    <div
                      style={{ height: `${heightPct}%` }}
                      className="w-full bg-gradient-to-t from-blue-600 to-cyan-400 rounded-t-md hover:opacity-90 transition"
                    />
                    <span className="text-[10px] text-slate-500 mt-2">{h.hour}h</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'submeters' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase">Sub-Metering No. 1</span>
            <div className="text-xl font-bold text-white mt-1">Kitchen Appliances</div>
            <p className="text-xs text-slate-400 mt-1">Dishwasher, microwave, oven</p>
            <div className="text-3xl font-extrabold text-cyan-400 mt-4">
              {submetersData?.kitchen_kwh || '0'} <span className="text-sm font-normal text-slate-400">kWh</span>
            </div>
            <div className="text-sm text-slate-300 mt-1 font-semibold">{submetersData?.kitchen_percentage || '0'}% of active total</div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase">Sub-Metering No. 2</span>
            <div className="text-xl font-bold text-white mt-1">Laundry &amp; Lighting</div>
            <p className="text-xs text-slate-400 mt-1">Washing machine, dryer, fridge</p>
            <div className="text-3xl font-extrabold text-indigo-400 mt-4">
              {submetersData?.laundry_kwh || '0'} <span className="text-sm font-normal text-slate-400">kWh</span>
            </div>
            <div className="text-sm text-slate-300 mt-1 font-semibold">{submetersData?.laundry_percentage || '0'}% of active total</div>
          </div>

          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <span className="text-xs font-semibold text-slate-400 uppercase">Sub-Metering No. 3</span>
            <div className="text-xl font-bold text-white mt-1">Climate &amp; Heating</div>
            <p className="text-xs text-slate-400 mt-1">Electric water heater &amp; air conditioning</p>
            <div className="text-3xl font-extrabold text-emerald-400 mt-4">
              {submetersData?.climate_kwh || '0'} <span className="text-sm font-normal text-slate-400">kWh</span>
            </div>
            <div className="text-sm text-slate-300 mt-1 font-semibold">{submetersData?.climate_percentage || '0'}% of active total</div>
          </div>
        </div>
      )}

      {!loading && activeTab === 'peak' && (
        <div className="rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-slate-800/60 text-xs uppercase text-slate-400">
              <tr>
                <th className="p-3">Peak Timestamp</th>
                <th className="p-3">Power (kW)</th>
                <th className="p-3">Voltage (V)</th>
                <th className="p-3">Current (A)</th>
                <th className="p-3">Kitchen</th>
                <th className="p-3">Laundry</th>
                <th className="p-3">Climate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {peakData.slice(0, 20).map((p, idx) => (
                <tr key={idx} className="hover:bg-slate-800/30">
                  <td className="p-3 font-mono text-cyan-400">{p.timestamp}</td>
                  <td className="p-3 font-bold text-amber-400">{p.power} kW</td>
                  <td className="p-3">{p.voltage} V</td>
                  <td className="p-3">{p.intensity} A</td>
                  <td className="p-3">{p.sub_metering_1} Wh</td>
                  <td className="p-3">{p.sub_metering_2} Wh</td>
                  <td className="p-3">{p.sub_metering_3} Wh</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
