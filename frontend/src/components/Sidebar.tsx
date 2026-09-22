import React from 'react';

export type PageId =
  | 'live-telemetry'
  | 'load-profile'
  | 'sub-meters'
  | 'data-engine'
  | 'substation'
  | 'query-lab'
  | 'metrics'
  | 'datasets'
  | 'jobs'
  | 'admin'
  | 'viva-demo';

interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  userRole?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentPage, onSelectPage, userRole }) => {
  const stitchNavItems = [
    { id: 'live-telemetry' as PageId, label: 'Live Telemetry', icon: 'monitoring', badge: 'LIVE' },
    { id: 'load-profile' as PageId, label: 'Load Profile', icon: 'ssid_chart', badge: null },
    { id: 'sub-meters' as PageId, label: 'Sub-Meters', icon: 'speed', badge: null },
    { id: 'data-engine' as PageId, label: 'Pipelines & Batch', icon: 'schema', badge: 'HDFS' },
    { id: 'substation' as PageId, label: 'Transformer Substation', icon: 'electric_bolt', badge: null },
  ];

  const analyticalNavItems = [
    { id: 'query-lab' as PageId, label: 'Hive Query Lab', icon: 'terminal' },
    { id: 'metrics' as PageId, label: 'Project Metrics', icon: 'verified' },
    { id: 'datasets' as PageId, label: 'Datasets & Quality', icon: 'database' },
    { id: 'jobs' as PageId, label: 'MapReduce Jobs', icon: 'memory' },
    { id: 'viva-demo' as PageId, label: 'Viva / Demo Mode', icon: 'play_circle' },
  ];

  if (userRole === 'ADMIN') {
    analyticalNavItems.push({ id: 'admin' as PageId, label: 'Administration', icon: 'admin_panel_settings' });
  }

  return (
    <aside className="w-64 bg-surface-container-lowest border-r border-outline-variant flex flex-col justify-between shrink-0 font-sans z-40 select-none">
      <div className="flex flex-col">
        {/* Section 1: Operational Subsystems (Stitch Command Room) */}
        <div className="px-space-md py-space-xs border-b border-outline-variant bg-surface-container-low font-mono">
          <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Operational Subsystems
          </span>
        </div>

        <nav className="p-space-xs space-y-0.5">
          {stitchNavItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center justify-between px-space-md py-2 text-xs transition-colors font-mono ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <div className="flex items-center gap-space-sm">
                  <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className={`px-1 py-0.2 text-[9px] font-bold ${
                    isActive ? 'bg-black/30 text-white' : 'bg-primary/20 text-primary border border-primary/40'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Section 2: Platform Computing & Analytical Engines */}
        <div className="px-space-md py-space-xs border-y border-outline-variant bg-surface-container-low font-mono mt-space-sm">
          <span className="text-[10px] font-bold text-outline uppercase tracking-wider">
            Big Data Platform Tools
          </span>
        </div>

        <nav className="p-space-xs space-y-0.5">
          {analyticalNavItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectPage(item.id)}
                className={`w-full flex items-center gap-space-sm px-space-md py-2 text-xs transition-colors font-mono ${
                  isActive
                    ? 'bg-primary-container text-on-primary-container font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[18px]">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer SCADA Metadata */}
      <div className="p-space-md border-t border-outline-variant bg-surface-container-low font-mono text-[11px]">
        <div className="flex items-center justify-between text-outline">
          <span>CONSOLE PROTOCOL</span>
          <span className="text-primary font-bold">IEC 61850</span>
        </div>
        <div className="mt-1 text-[10px] text-on-surface-variant truncate">
          BUS A/B VOLT BALANCED &bull; CLUSTER OK
        </div>
      </div>
    </aside>
  );
};
