import React, { useState, useEffect } from 'react';
import { User } from '../types';

interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  isDark: boolean;
  onToggleTheme: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ user, onLogout }) => {
  const [utcTime, setUtcTime] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setUtcTime(now.toISOString().slice(11, 23));
    };
    updateTime();
    const interval = setInterval(updateTime, 200);
    return () => clearInterval(interval);
  }, []);

  return (
    <header className="h-14 bg-surface-container-lowest border-b border-outline-variant px-margin flex items-center justify-between sticky top-0 z-50 font-sans">
      {/* Left: Brand Identity */}
      <div className="flex items-center gap-space-lg">
        <div className="flex items-center gap-2">
          <img src="/logo.svg" alt="VoltPulse Industrial Telemetry Logo" className="h-8 w-8 object-contain" />
          <div className="flex flex-col">
            <span className="font-mono text-base font-bold text-on-surface tracking-wider">GRIDPULSE</span>
            <span className="font-mono text-[10px] text-outline tracking-wider uppercase">Energy Analytics Telemetry</span>
          </div>
        </div>
      </div>

      {/* Center: Live SCADA Telemetry Status Pills */}
      <div className="hidden xl:flex items-center gap-space-sm font-mono text-xs">
        <div className="flex items-center gap-space-xs bg-surface-container-low border border-outline-variant px-space-md py-1">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
          <span className="text-outline">GRID FREQ:</span>
          <span className="text-primary font-bold">60.02 Hz</span>
        </div>

        <div className="flex items-center gap-space-xs bg-surface-container-low border border-outline-variant px-space-md py-1">
          <span className="text-outline">INGEST P99:</span>
          <span className="text-on-surface font-semibold">18ms</span>
        </div>

        <div className="flex items-center gap-space-xs bg-surface-container-low border border-outline-variant px-space-md py-1">
          <span className="text-outline">TRIPS:</span>
          <span className="text-primary font-semibold">0 CRIT</span>
        </div>

        <div className="flex items-center gap-space-xs bg-surface-container-low border border-outline-variant px-space-md py-1">
          <span className="text-outline">CLUSTER:</span>
          <span className="text-secondary font-semibold">K8S // NODE-EAST-04 SYNCD</span>
        </div>
      </div>

      {/* Right: Clock & User Profile */}
      <div className="flex items-center gap-space-lg font-mono">
        <div className="hidden md:flex flex-col text-right">
          <span className="text-xs text-on-surface font-semibold">UTC {utcTime}</span>
          <span className="text-[10px] text-primary font-bold">SCADA SYNC OK</span>
        </div>

        {user && (
          <div className="flex items-center gap-space-md pl-space-md border-l border-outline-variant">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-semibold text-on-surface">{user.full_name}</span>
              <span className="text-[10px] text-primary uppercase font-bold">{user.role}</span>
            </div>

            <button
              type="button"
              onClick={onLogout}
              className="h-8 px-2.5 bg-surface-container hover:bg-error/20 text-on-surface hover:text-error border border-outline-variant hover:border-error text-xs transition-colors flex items-center gap-1 font-mono"
              title="Sign Out"
            >
              <span className="material-symbols-outlined text-[16px]">logout</span>
              <span className="hidden sm:inline">EXIT</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
