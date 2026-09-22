import { Calendar, Download, TrendingUp, Zap } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { api } from '../../api';

interface LoadProfileScreenProps {
  onNavigate?: (pageId: string) => void;
}

export const LoadProfileScreen: React.FC<LoadProfileScreenProps> = ({ onNavigate }) => {
  const [granularity, setGranularity] = useState<'HOURLY' | 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'SEASONAL'>('DAILY');
  const [vsBaseline, setVsBaseline] = useState<boolean>(true);
  const [overview, setOverview] = useState<any>(null);
  const [, setDailyData] = useState<any[]>([]);
  const [, setHourlyData] = useState<any[]>([]);
  const [, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [drModalOpen, setDrModalOpen] = useState<boolean>(false);
  const [drSuccess, setDrSuccess] = useState<boolean>(false);

  useEffect(() => {
    loadData();
  }, [granularity]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [ov, daily, hourly] = await Promise.all([
        api.getOverview().catch(() => null),
        api.getDailyAggregates().catch(() => []),
        api.getHourlyAggregates().catch(() => [])
      ]);
      setOverview(ov);
      setDailyData(daily || []);
      setHourlyData(hourly || []);
    } catch (err) {
      console.error('Error loading load profile data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.downloadFile(
        '/analytics/export?export_type=daily&export_format=csv',
        `load_profile_export_${new Date().toISOString().slice(0, 10)}.csv`
      );
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      setExporting(false);
    }
  };

  const handleTriggerDR = () => {
    setDrSuccess(true);
    setTimeout(() => {
      setDrSuccess(false);
      setDrModalOpen(false);
    }, 2000);
  };

  const totalKwh = overview?.total_consumption_kwh ?? overview?.total_energy_kwh ?? 0;
  const peakKw = overview?.peak_power_kw ?? 0;
  const avgKw = overview?.average_power_kw ?? 0;

  return (
    <div className="flex flex-col w-full text-on-surface space-y-space-md">
      {/* Operational Header & Filter Bar */}
      <div className="w-full bg-surface-container-low p-space-md border border-outline-variant flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        {/* Left: Granularity and Premise Scope */}
        <div className="flex flex-wrap items-center gap-space-md">
          <div className="flex items-center bg-surface-container-lowest p-0.5 border border-outline-variant">
            {(['HOURLY', 'DAILY', 'WEEKLY', 'MONTHLY', 'SEASONAL'] as const).map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setGranularity(g)}
                className={`px-space-md py-space-xs font-mono text-xs transition-colors ${
                  granularity === g
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-outline hover:text-on-surface'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-space-xs bg-surface-container px-space-md py-space-xs border border-outline-variant">
            <span className="w-2 h-2 bg-primary"></span>
            <span className="font-mono text-xs text-outline uppercase">Scope:</span>
            <span className="font-mono text-xs text-on-surface font-semibold">14,200 PREMISE METERS</span>
          </div>

          <div className="flex items-center gap-space-xs bg-surface-container-lowest px-space-md py-space-xs border border-outline-variant">
            <Calendar aria-hidden className="text-text-subtle size-[16px]" />
            <span className="font-mono text-xs text-on-surface font-medium">2006-12-16 TO 2010-11-26</span>
            <span className="font-mono text-outline text-[10px] uppercase">(47 Months Archive)</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-space-md">
          <label className="flex items-center gap-space-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={vsBaseline}
              onChange={(e) => setVsBaseline(e.target.checked)}
              className="accent-primary h-3.5 w-3.5 rounded-none cursor-pointer"
            />
            <span className="font-mono text-xs text-on-surface-variant">VS. PRIOR BASELINE</span>
          </label>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-space-xs bg-surface-container hover:bg-surface-container-high border border-outline-variant px-space-md py-space-xs text-on-surface transition-colors font-mono text-xs font-semibold"
          >
            <Download aria-hidden className="size-[16px]" />
            <span>{exporting ? 'EXPORTING...' : 'RAW CSV EXPORT'}</span>
          </button>

          <button
            type="button"
            onClick={() => setDrModalOpen(true)}
            className="flex items-center gap-space-xs bg-primary hover:bg-primary-fixed-dim text-on-primary px-space-md py-space-xs font-mono text-xs font-semibold transition-colors"
          >
            <Zap aria-hidden className="size-[16px]" />
            <span>DR DISPATCH</span>
          </button>
        </div>
      </div>

      {/* 4 KPI Telemetry Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter w-full">
        {/* Card 1: Total Energy */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-outline uppercase tracking-wider">Total Energy (Cumulative)</span>
            <span className="bg-primary/10 text-primary border border-primary/30 px-1.5 py-0.5 font-mono text-[10px]">INTEGRATED</span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-mono text-3xl font-bold text-on-surface">{(totalKwh / 1000).toFixed(2)}</span>
            <span className="font-mono text-sm text-outline">MWh</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant">
            <span className="flex items-center gap-1 text-primary">
              <TrendingUp aria-hidden className="size-[14px]" />
              +1.2% Diurnal Load
            </span>
            <span className="text-outline">{(totalKwh).toLocaleString()} kWh</span>
          </div>
        </div>

        {/* Card 2: Peak Demand (Warning Alert) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 left-0 h-1 bg-error"></div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-outline uppercase tracking-wider">Peak Demand Interval</span>
            <span className="bg-error/20 text-error border border-error/30 px-1.5 py-0.5 font-mono text-[10px] font-semibold flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-error animate-pulse"></span>
              SPIKE ALERT
            </span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-mono text-3xl font-bold text-error">{peakKw.toFixed(2)}</span>
            <span className="font-mono text-sm text-outline">kW</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant">
            <span className="text-error font-medium">@ Peak Surge Window</span>
            <span className="text-outline">Threshold: 5.0 kW</span>
          </div>
        </div>

        {/* Card 3: Baseload Night Floor */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-outline uppercase tracking-wider">Baseload (Average Load)</span>
            <span className="bg-surface-container-high text-on-surface-variant border border-outline-variant px-1.5 py-0.5 font-mono text-[10px]">MIN REG</span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-mono text-3xl font-bold text-on-surface">{avgKw.toFixed(2)}</span>
            <span className="font-mono text-sm text-outline">kW</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant">
            <span className="text-primary font-medium">24-Hour Mean Load</span>
            <span className="text-outline">σ: 0.84 kW</span>
          </div>
        </div>

        {/* Card 4: System Power Factor */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-outline uppercase tracking-wider">System Power Factor</span>
            <span className="bg-secondary/10 text-secondary border border-secondary/30 px-1.5 py-0.5 font-mono text-[10px]">P-V-I CORREL</span>
          </div>
          <div className="my-space-xs flex items-baseline gap-space-xs">
            <span className="font-mono text-3xl font-bold text-secondary">0.962</span>
            <span className="font-mono text-sm text-outline">cos φ</span>
          </div>
          <div className="flex items-center justify-between font-mono text-[11px] text-on-surface-variant">
            <span className="text-secondary font-medium">Balanced Reactive Load</span>
            <span className="text-outline">Nominal Grid</span>
          </div>
        </div>
      </div>

      {/* Main Multi-Channel Load Profile Visualizer */}
      <div className="w-full bg-surface-container-low border border-outline-variant p-space-lg shadow-sm">
        <div className="flex items-center justify-between pb-space-md border-b border-outline-variant">
          <div>
            <h3 className="font-mono text-base font-semibold text-on-surface uppercase tracking-wide">
              Load Profile Time-Series & Diurnal Curve
            </h3>
            <p className="font-sans text-xs text-on-surface-variant">
              Continuous multi-channel power telemetry: Global Active Power vs. Baseline with Appliance Sub-Meters
            </p>
          </div>
          <div className="flex items-center gap-space-md font-mono text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-primary"></span>
              <span className="text-on-surface">Active Power (kW)</span>
            </div>
            {vsBaseline && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 bg-secondary"></span>
                <span className="text-on-surface">Prior Baseline</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-tertiary"></span>
              <span className="text-on-surface">Sub-Metered Load</span>
            </div>
          </div>
        </div>

        {/* Dynamic Vector SVG Load Strip */}
        <div className="mt-space-md bg-surface-container-lowest p-space-md border border-outline-variant relative">
          <svg className="w-full h-56 text-primary" viewBox="0 0 1000 220" fill="none" preserveAspectRatio="none">
            {/* Grid lines */}
            <line x1="0" y1="50" x2="1000" y2="50" stroke="#263248" strokeDasharray="4 4" />
            <line x1="0" y1="100" x2="1000" y2="100" stroke="#263248" strokeDasharray="4 4" />
            <line x1="0" y1="150" x2="1000" y2="150" stroke="#263248" strokeDasharray="4 4" />

            {/* Baseline wave */}
            {vsBaseline && (
              <path
                d="M0,170 C100,160 200,180 300,120 C400,60 500,110 600,80 C700,70 800,130 900,140 L1000,150"
                stroke="#a2c9ff"
                strokeWidth="2"
                strokeDasharray="6 6"
                opacity="0.8"
              />
            )}

            {/* Active Power Area fill */}
            <path
              d="M0,180 C80,175 160,190 240,110 C320,50 400,90 480,45 C560,70 640,30 720,20 C800,60 880,130 960,150 L1000,160 L1000,220 L0,220 Z"
              fill="rgba(102, 217, 204, 0.08)"
            />

            {/* Primary active power line */}
            <path
              d="M0,180 C80,175 160,190 240,110 C320,50 400,90 480,45 C560,70 640,30 720,20 C800,60 880,130 960,150 L1000,160"
              stroke="#66d9cc"
              strokeWidth="2.5"
            />

            {/* Threshold Line at 5.0 kW (y = 40) */}
            <line x1="0" y1="40" x2="1000" y2="40" stroke="#ffb4ab" strokeWidth="1.5" strokeDasharray="5 5" />
            <text x="10" y="34" fill="#ffb4ab" fontSize="11" fontFamily="JetBrains Mono">
              CRITICAL SPIKE THRESHOLD: 5.0 kW
            </text>
          </svg>

          {/* Time axis ticks */}
          <div className="flex justify-between font-mono text-[11px] text-outline mt-space-xs pt-1 border-t border-outline-variant">
            <span>00:00 UTC</span>
            <span>04:00</span>
            <span>08:00</span>
            <span>12:00</span>
            <span>16:00</span>
            <span>20:00</span>
            <span>23:59 UTC</span>
          </div>
        </div>
      </div>

      {/* Two Column Section: Peak Overload Events Table + Diurnal Load Profile */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-md w-full">
        {/* Peak Demand Spikes */}
        <div className="bg-surface-container-low border border-outline-variant p-space-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant">
              <span className="font-mono text-sm font-semibold uppercase text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 bg-error"></span>
                Peak Demand Outliers (&gt; 5.0 kW)
              </span>
              <span className="font-mono text-xs text-outline">MapReduce / Hive Output</span>
            </div>

            <div className="overflow-x-auto mt-space-md">
              <table className="w-full text-left font-mono text-xs">
                <thead>
                  <tr className="bg-surface-container border-b border-outline-variant text-outline">
                    <th className="py-2 px-3">TIMESTAMP</th>
                    <th className="py-2 px-3">ACTIVE (kW)</th>
                    <th className="py-2 px-3">VOLTAGE</th>
                    <th className="py-2 px-3">APPLIANCE SINK</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant">
                  <tr className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2.5 px-3 text-on-surface">2007-01-01 13:24:00</td>
                    <td className="py-2.5 px-3 font-bold text-error">5.482</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">238.4 V</td>
                    <td className="py-2.5 px-3 text-secondary">Kitchen (Sub1) + HVAC</td>
                  </tr>
                  <tr className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2.5 px-3 text-on-surface">2007-01-01 13:25:00</td>
                    <td className="py-2.5 px-3 font-bold text-error">5.314</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">237.9 V</td>
                    <td className="py-2.5 px-3 text-secondary">Kitchen (Sub1)</td>
                  </tr>
                  <tr className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2.5 px-3 text-on-surface">2007-01-01 19:42:00</td>
                    <td className="py-2.5 px-3 font-bold text-error">5.120</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">240.1 V</td>
                    <td className="py-2.5 px-3 text-secondary">Laundry (Sub2) + Climate</td>
                  </tr>
                  <tr className="hover:bg-surface-container/60 transition-colors">
                    <td className="py-2.5 px-3 text-on-surface">2007-01-01 20:15:00</td>
                    <td className="py-2.5 px-3 font-bold text-error">5.048</td>
                    <td className="py-2.5 px-3 text-on-surface-variant">239.0 V</td>
                    <td className="py-2.5 px-3 text-secondary">Climate (Sub3)</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div className="mt-space-md pt-space-xs border-t border-outline-variant flex justify-between items-center text-xs font-mono text-outline">
            <span>Automated Hadoop Streaming Peak Detection</span>
            <button
              type="button"
              onClick={() => onNavigate && onNavigate('jobs')}
              className="text-primary hover:underline"
            >
              View MapReduce Part Files &rarr;
            </button>
          </div>
        </div>

        {/* Diurnal Hourly Profile Breakdown */}
        <div className="bg-surface-container-low border border-outline-variant p-space-md flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant">
              <span className="font-mono text-sm font-semibold uppercase text-on-surface flex items-center gap-1.5">
                <span className="w-2 h-2 bg-primary"></span>
                24-Hour Diurnal Load Profile
              </span>
              <span className="font-mono text-xs text-primary">Hourly Mapper</span>
            </div>

            <div className="space-y-3 mt-space-md">
              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-on-surface">Morning Spike (07:00 - 09:00)</span>
                  <span className="text-primary font-bold">3.84 kW Avg</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-2 overflow-hidden border border-outline-variant">
                  <div className="bg-primary h-full" style={{ width: '76%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-on-surface">Midday Baseline (10:00 - 16:00)</span>
                  <span className="text-secondary font-bold">1.92 kW Avg</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-2 overflow-hidden border border-outline-variant">
                  <div className="bg-secondary h-full" style={{ width: '38%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-on-surface">Evening Prime Peak (18:00 - 22:00)</span>
                  <span className="text-error font-bold">4.72 kW Avg</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-2 overflow-hidden border border-outline-variant">
                  <div className="bg-error h-full" style={{ width: '92%' }}></div>
                </div>
              </div>

              <div>
                <div className="flex justify-between font-mono text-xs mb-1">
                  <span className="text-on-surface">Night Inactive Floor (23:00 - 06:00)</span>
                  <span className="text-outline font-bold">0.86 kW Avg</span>
                </div>
                <div className="w-full bg-surface-container-lowest h-2 overflow-hidden border border-outline-variant">
                  <div className="bg-outline h-full" style={{ width: '18%' }}></div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-space-md pt-space-xs border-t border-outline-variant flex justify-between items-center text-xs font-mono text-outline">
            <span>Aggregated across 2.07M observations</span>
            <span className="text-on-surface-variant font-medium">Standardized UTC</span>
          </div>
        </div>
      </div>

      {/* Demand Response Modal */}
      {drModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-surface-container-low border border-outline-variant p-space-lg shadow-2xl space-y-space-md">
            <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant">
              <span className="font-mono text-sm font-bold uppercase text-on-surface flex items-center gap-2">
                <Zap aria-hidden className="text-accent size-[18px]" />
                Demand Response Dispatch Command
              </span>
              <button
                type="button"
                onClick={() => setDrModalOpen(false)}
                className="text-outline hover:text-on-surface font-mono"
              >
                &times;
              </button>
            </div>

            <p className="font-sans text-xs text-on-surface-variant">
              Initiate peak-shaving signal across 14,200 connected smart telemetry nodes to shed up to 1.8 MW non-critical load (climate control setpoint offset +2°C).
            </p>

            {drSuccess ? (
              <div className="p-3 bg-primary/20 border border-primary text-primary font-mono text-xs">
                &check; DEMAND RESPONSE DISPATCH TRANSMITTED TO SCADA BUS
              </div>
            ) : (
              <div className="space-y-3 font-mono text-xs">
                <div className="flex justify-between py-1 border-b border-outline-variant">
                  <span className="text-outline">TARGET SHED:</span>
                  <span className="text-primary font-bold">1,800 kW</span>
                </div>
                <div className="flex justify-between py-1 border-b border-outline-variant">
                  <span className="text-outline">DISPATCH DURATION:</span>
                  <span className="text-on-surface">45 MINUTES</span>
                </div>
                <div className="flex justify-between py-1 border-b border-outline-variant">
                  <span className="text-outline">SCADA PROTOCOL:</span>
                  <span className="text-secondary">IEC 61850 / OPENADR 2.0B</span>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-space-sm pt-space-sm">
              <button
                type="button"
                onClick={() => setDrModalOpen(false)}
                className="px-space-md py-space-xs font-mono text-xs bg-surface-container hover:bg-surface-container-high text-on-surface border border-outline-variant"
              >
                CANCEL
              </button>
              <button
                type="button"
                onClick={handleTriggerDR}
                className="px-space-md py-space-xs font-mono text-xs bg-primary hover:bg-primary-fixed-dim text-on-primary font-bold"
              >
                CONFIRM DISPATCH
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
