import {
  Activity,
  Database,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  type LucideIcon,
  PlayCircle,
  Radio,
  ShieldCheck,
  Terminal,
  Zap,
} from 'lucide-react';

import { cn } from '../lib/cn';

import { Badge } from './ui/Status';

export type PageId =
  | 'overview'
  | 'datasets'
  | 'jobs'
  | 'analysis'
  | 'voltage'
  | 'query'
  | 'stream'
  | 'platform'
  | 'admin'
  | 'demo';

/** Single source of truth for the URL of each section. */
export const ROUTE_FOR_PAGE: Record<PageId, string> = {
  overview: '/overview',
  datasets: '/datasets',
  jobs: '/jobs',
  analysis: '/analysis',
  voltage: '/voltage',
  query: '/query',
  stream: '/stream',
  platform: '/platform',
  admin: '/admin',
  demo: '/demo',
};

interface NavItem {
  id: PageId;
  label: string;
  Icon: LucideIcon;
  badge?: string;
  adminOnly?: boolean;
}

/**
 * Navigation grouped by pipeline stage, so the path from raw data to live
 * telemetry is legible.
 *
 * `pipelines` and `sub-meters` are separate entries for now. The target IA
 * folds them into `jobs` and `analysis` as tabs in Phase 5; routing them here
 * keeps the functionality reachable until then (docs/FRONTEND_AUDIT.md §5).
 */
const SECTIONS: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Overview',
    items: [{ id: 'overview', label: 'Overview', Icon: LayoutDashboard }],
  },
  {
    heading: 'Data pipeline',
    items: [
      { id: 'datasets', label: 'Datasets & quality', Icon: Database },
      { id: 'jobs', label: 'MapReduce jobs', Icon: Activity, badge: 'HDFS' },
    ],
  },
  {
    heading: 'Analysis',
    items: [
      { id: 'analysis', label: 'Consumption analysis', Icon: Gauge },
      { id: 'voltage', label: 'Voltage & power', Icon: Zap },
      { id: 'query', label: 'Hive query lab', Icon: Terminal },
    ],
  },
  {
    heading: 'Live & platform',
    items: [
      { id: 'stream', label: 'Live stream', Icon: Radio, badge: 'SSE' },
      { id: 'platform', label: 'Platform metrics', Icon: FileCheck2 },
      { id: 'demo', label: 'Guided demo', Icon: PlayCircle },
      { id: 'admin', label: 'Administration', Icon: ShieldCheck, adminOnly: true },
    ],
  },
];

export interface SidebarProps {
  currentPage: PageId;
  onSelectPage: (page: PageId) => void;
  userRole?: string | undefined;
}

export function Sidebar({ currentPage, onSelectPage, userRole }: SidebarProps) {
  return (
    <nav
      aria-label="Sections"
      className="flex w-56 shrink-0 flex-col gap-4 overflow-y-auto border-r border-border bg-surface py-3"
    >
      {SECTIONS.map((section) => {
        const items = section.items.filter(
          (item) => item.adminOnly !== true || userRole === 'ADMIN',
        );
        if (items.length === 0) return null;

        return (
          <div key={section.heading} className="flex flex-col gap-0.5">
            <h2 className="px-3 pb-1 text-2xs font-medium uppercase tracking-wide text-text-subtle">
              {section.heading}
            </h2>

            {items.map(({ id, label, Icon, badge }) => {
              const active = currentPage === id;
              return (
                <button
                  key={id}
                  type="button"
                  // Announces the current section rather than leaving the
                  // active state to colour alone.
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    onSelectPage(id);
                  }}
                  className={cn(
                    'flex items-center gap-2 px-3 py-1.5 text-left text-xs',
                    'transition-colors duration-base',
                    // A left bar marks the active item, visible without colour.
                    'border-l-2',
                    active
                      ? 'border-accent bg-accent/10 font-medium text-text'
                      : 'border-transparent text-text-muted hover:bg-surface-raised hover:text-text',
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="truncate">{label}</span>
                  {badge !== undefined && <Badge className="ml-auto">{badge}</Badge>}
                </button>
              );
            })}
          </div>
        );
      })}
    </nav>
  );
}
