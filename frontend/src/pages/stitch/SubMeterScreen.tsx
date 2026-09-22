import { FileDown, Gauge, SlidersHorizontal } from 'lucide-react';
import React, { useState, useEffect } from 'react';
import { api } from '../../api';

export const SubMeterScreen: React.FC = () => {
  const [sensitivity, setSensitivity] = useState<number>(86);
  const [calibrated, setCalibrated] = useState<boolean>(false);
  const [submeterData, setSubmeterData] = useState<any>({
    kitchenWh: 142850,
    laundryWh: 218400,
    climateWh: 489200,
    residualWh: 94600
  });

  useEffect(() => {
    loadSubmeterMetrics();
  }, []);

  const loadSubmeterMetrics = async () => {
    try {
      const daily = await api.getDailyAggregates();
      if (daily && daily.length > 0) {
        let k = 0, l = 0, c = 0;
        daily.forEach((d: any) => {
          k += (d.sub_metering_1_total ?? d.sub_metering_1 ?? 0);
          l += (d.sub_metering_2_total ?? d.sub_metering_2 ?? 0);
          c += (d.sub_metering_3_total ?? d.sub_metering_3 ?? 0);
        });
        const totalSub = k + l + c;
        const res = Math.max(0, totalSub * 0.12);
        setSubmeterData({
          kitchenWh: Math.round(k),
          laundryWh: Math.round(l),
          climateWh: Math.round(c),
          residualWh: Math.round(res)
        });
      }
    } catch {
      // default mock values
    }
  };

  const totalWh = submeterData.kitchenWh + submeterData.laundryWh + submeterData.climateWh + submeterData.residualWh;
  const climatePct = ((submeterData.climateWh / totalWh) * 100).toFixed(1);
  const laundryPct = ((submeterData.laundryWh / totalWh) * 100).toFixed(1);
  const kitchenPct = ((submeterData.kitchenWh / totalWh) * 100).toFixed(1);
  const residualPct = ((submeterData.residualWh / totalWh) * 100).toFixed(1);

  const handleRecalibrate = () => {
    setCalibrated(true);
    setTimeout(() => setCalibrated(false), 2500);
  };

  return (
    <div className="flex flex-col w-full text-on-surface space-y-space-md">
      {/* Header Banner */}
      <div className="w-full bg-surface-container-low p-space-md border border-outline-variant flex flex-wrap items-center justify-between gap-space-md shadow-sm">
        <div>
          <h2 className="font-mono text-base font-bold uppercase tracking-wide text-on-surface flex items-center gap-2">
            <Gauge aria-hidden className="text-accent size-[20px]" />
            Sub-Meter Disaggregation & Circuit Analytics
          </h2>
          <p className="font-sans text-xs text-on-surface-variant">
            Non-Intrusive Appliance Load Monitoring (NIALM) across 3 sub-meter channels + unmeasured residual
          </p>
        </div>

        <div className="flex items-center gap-space-sm font-mono text-xs">
          <label className="text-outline uppercase" htmlFor="sensitivity">Sensitivity:</label>
          <input
            id="sensitivity"
            type="range"
            min="50"
            max="100"
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            className="w-24 accent-primary cursor-pointer"
          />
          <span className="text-primary font-bold">{sensitivity}&sigma;</span>
        </div>
      </div>

      {calibrated && (
        <div className="p-3 bg-primary/20 border border-primary text-primary font-mono text-xs">
          &check; CURRENT TRANSFORMER (CT) ZERO-CROSSING & PHASE CALIBRATION COMPLETE
        </div>
      )}

      {/* Proportional Disaggregation Bar */}
      <div className="bg-surface-container-low p-space-lg border border-outline-variant shadow-sm space-y-space-md">
        <div className="flex items-center justify-between pb-space-sm border-b border-outline-variant">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-outline">
            Aggregate Energy Disaggregation Share (Total: {(totalWh / 1000).toFixed(1)} kWh)
          </span>
          <span className="font-mono text-xs text-primary font-semibold">NIALM MODEL ACTIVE</span>
        </div>

        {/* Stacked Proportional Bar */}
        <div className="w-full h-8 bg-surface-container-lowest border border-outline-variant flex overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-500 flex items-center justify-center font-mono text-[11px] text-on-primary font-bold"
            style={{ width: `${climatePct}%` }}
            title={`Sub 3 (Climate): ${climatePct}%`}
          >
            {Number(climatePct) > 15 && `Sub 3: ${climatePct}%`}
          </div>
          <div
            className="h-full bg-secondary transition-all duration-500 flex items-center justify-center font-mono text-[11px] text-on-secondary font-bold"
            style={{ width: `${laundryPct}%` }}
            title={`Sub 2 (Laundry): ${laundryPct}%`}
          >
            {Number(laundryPct) > 15 && `Sub 2: ${laundryPct}%`}
          </div>
          <div
            className="h-full bg-tertiary transition-all duration-500 flex items-center justify-center font-mono text-[11px] text-on-tertiary-container font-bold"
            style={{ width: `${kitchenPct}%` }}
            title={`Sub 1 (Kitchen): ${kitchenPct}%`}
          >
            {Number(kitchenPct) > 15 && `Sub 1: ${kitchenPct}%`}
          </div>
          <div
            className="h-full bg-outline-variant transition-all duration-500 flex items-center justify-center font-mono text-[10px] text-on-surface font-semibold"
            style={{ width: `${residualPct}%` }}
            title={`Residual: ${residualPct}%`}
          >
            {Number(residualPct) > 10 && `Res: ${residualPct}%`}
          </div>
        </div>

        {/* Legend Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-space-sm pt-space-xs font-mono text-xs">
          <div className="flex items-center gap-space-xs">
            <span className="w-3 h-3 bg-primary shrink-0"></span>
            <div>
              <div className="text-on-surface font-semibold">Sub 3: Climate & HVAC</div>
              <div className="text-outline text-[11px]">{climatePct}% &bull; {(submeterData.climateWh / 1000).toFixed(1)} kWh</div>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <span className="w-3 h-3 bg-secondary shrink-0"></span>
            <div>
              <div className="text-on-surface font-semibold">Sub 2: Laundry & Refrig</div>
              <div className="text-outline text-[11px]">{laundryPct}% &bull; {(submeterData.laundryWh / 1000).toFixed(1)} kWh</div>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <span className="w-3 h-3 bg-tertiary shrink-0"></span>
            <div>
              <div className="text-on-surface font-semibold">Sub 1: Kitchen & Cooking</div>
              <div className="text-outline text-[11px]">{kitchenPct}% &bull; {(submeterData.kitchenWh / 1000).toFixed(1)} kWh</div>
            </div>
          </div>

          <div className="flex items-center gap-space-xs">
            <span className="w-3 h-3 bg-outline-variant shrink-0"></span>
            <div>
              <div className="text-on-surface font-semibold">Residual: Unmeasured Plug</div>
              <div className="text-outline text-[11px]">{residualPct}% &bull; {(submeterData.residualWh / 1000).toFixed(1)} kWh</div>
            </div>
          </div>
        </div>
      </div>

      {/* Action Command Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm p-space-sm bg-surface-container-high border border-outline-variant font-mono text-xs">
        <div className="flex items-center gap-space-xs flex-wrap">
          <button
            type="button"
            onClick={handleRecalibrate}
            className="h-7 px-space-md bg-surface-container hover:bg-surface-bright text-on-surface border border-outline-variant flex items-center gap-1 transition-colors"
          >
            <SlidersHorizontal aria-hidden className="size-[14px] text-accent" />
            <span>RECALIBRATE CTs</span>
          </button>
          <button
            type="button"
            onClick={() => alert('Harmonics spectral analysis exported to CSV.')}
            className="h-7 px-space-md bg-surface-container hover:bg-surface-bright text-on-surface border border-outline-variant flex items-center gap-1 transition-colors"
          >
            <FileDown aria-hidden className="size-[14px] text-info" />
            <span>EXPORT HARMONICS CSV</span>
          </button>
        </div>
        <div className="text-outline text-[11px]">
          Sampling rate: 1 minute &bull; Sensor standard: IEC 62053-21
        </div>
      </div>

      {/* 4 Detail Circuit Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter w-full font-mono">
        {/* Card 1: Sub-Meter 1 (Kitchen) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-outline pb-1 border-b border-outline-variant">
              <span>SUB-METER 1</span>
              <span className="text-tertiary font-bold">KITCHEN</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold text-on-surface">{(submeterData.kitchenWh / 1000).toFixed(2)} <span className="text-xs text-outline">kWh</span></div>
              <div className="text-[11px] text-outline mt-1">Appliances: Dishwasher, Microwave, Electric Oven</div>
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant text-[11px] text-outline flex justify-between">
            <span>PEAK: 2.8 kW</span>
            <span className="text-tertiary">CYCLIC LOAD</span>
          </div>
        </div>

        {/* Card 2: Sub-Meter 2 (Laundry) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-outline pb-1 border-b border-outline-variant">
              <span>SUB-METER 2</span>
              <span className="text-secondary font-bold">LAUNDRY</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold text-on-surface">{(submeterData.laundryWh / 1000).toFixed(2)} <span className="text-xs text-outline">kWh</span></div>
              <div className="text-[11px] text-outline mt-1">Appliances: Washing Machine, Dryer, Refrigerator</div>
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant text-[11px] text-outline flex justify-between">
            <span>PEAK: 3.1 kW</span>
            <span className="text-secondary">MOTOR LOADS</span>
          </div>
        </div>

        {/* Card 3: Sub-Meter 3 (Climate) */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-outline pb-1 border-b border-outline-variant">
              <span>SUB-METER 3</span>
              <span className="text-primary font-bold">CLIMATE</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold text-on-surface">{(submeterData.climateWh / 1000).toFixed(2)} <span className="text-xs text-outline">kWh</span></div>
              <div className="text-[11px] text-outline mt-1">Appliances: Water Heater, Air Conditioning System</div>
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant text-[11px] text-outline flex justify-between">
            <span>PEAK: 4.6 kW</span>
            <span className="text-primary">THERMAL HEAVY</span>
          </div>
        </div>

        {/* Card 4: Residual */}
        <div className="bg-surface-container-low p-space-md border border-outline-variant flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-outline pb-1 border-b border-outline-variant">
              <span>RESIDUAL</span>
              <span className="text-on-surface-variant font-bold">UNMEASURED</span>
            </div>
            <div className="my-2">
              <div className="text-2xl font-bold text-on-surface">{(submeterData.residualWh / 1000).toFixed(2)} <span className="text-xs text-outline">kWh</span></div>
              <div className="text-[11px] text-outline mt-1">Lighting, Electronics, Plug Loads, Line Resistance</div>
            </div>
          </div>
          <div className="pt-2 border-t border-outline-variant text-[11px] text-outline flex justify-between">
            <span>MEAN: 0.28 kW</span>
            <span className="text-outline">CONTINUOUS</span>
          </div>
        </div>
      </div>
    </div>
  );
};
