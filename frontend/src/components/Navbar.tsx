import { LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';

import type { User } from '../types';

import { Button } from './ui/Button';

export interface NavbarProps {
  user: User | null;
  onLogout: () => void;
}

/**
 * Application header.
 *
 * It deliberately carries no telemetry. The previous version rendered five
 * hardcoded readouts — grid frequency, ingest p99, trip count, cluster node and
 * a sync indicator — none backed by anything, and one of them (60.02 Hz) wrong
 * for a European dataset. Service health belongs on Overview, sourced from the
 * gateway (docs/FRONTEND_AUDIT.md F2).
 */
export function Navbar({ user, onLogout }: NavbarProps) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    // One tick a second. The previous 200 ms interval re-rendered the header
    // five times a second on every page, forever.
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-header flex h-12 items-center justify-between border-b border-border bg-surface px-4">
      <div className="flex items-center gap-2">
        <img src="/logo.svg" alt="" aria-hidden className="size-6" />
        <span className="text-sm font-semibold tracking-wide text-text">GridPulse</span>
        <span className="hidden text-2xs text-text-subtle sm:inline">Energy Analytics</span>
      </div>

      <div className="flex items-center gap-4">
        <time
          dateTime={now.toISOString()}
          data-numeric
          className="hidden text-xs text-text-muted md:inline"
        >
          {now.toISOString().slice(11, 19)} UTC
        </time>

        {user && (
          <div className="flex items-center gap-3 border-l border-border pl-4">
            <div className="hidden flex-col text-right sm:flex">
              <span className="text-xs font-medium text-text">{user.full_name}</span>
              <span className="text-2xs uppercase tracking-wide text-text-subtle">{user.role}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onLogout}
              icon={<LogOut aria-hidden className="size-3.5" />}
            >
              Sign out
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
