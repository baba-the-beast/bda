import { LogOut, Menu, Monitor, Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

import { useTheme, type ThemePreference } from '../app/ThemeProvider';
import type { User } from '../lib/api/endpoints';

import { Button } from './ui/Button';

export interface NavbarProps {
  user: User | null;
  onLogout: () => void;
  /** Opens section navigation on screens too narrow for the sidebar. */
  onOpenMenu?: () => void;
}

const THEME_ORDER: readonly ThemePreference[] = ['system', 'light', 'dark'];
const THEME_LABEL: Record<ThemePreference, string> = {
  system: 'System theme',
  light: 'Light theme',
  dark: 'Dark theme',
};
const THEME_ICON = { system: Monitor, light: Sun, dark: Moon } as const;

/** Cycles system → light → dark. The label says what it is now and what is next. */
function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const next = THEME_ORDER[(THEME_ORDER.indexOf(preference) + 1) % THEME_ORDER.length] ?? 'system';
  const Icon = THEME_ICON[preference];

  return (
    <Button
      size="sm"
      variant="ghost"
      className="size-[2rem] px-0"
      aria-label={`${THEME_LABEL[preference]}. Switch to ${THEME_LABEL[next].toLowerCase()}`}
      title={`${THEME_LABEL[preference]} — switch to ${THEME_LABEL[next].toLowerCase()}`}
      onClick={() => {
        setPreference(next);
      }}
      icon={<Icon aria-hidden className="size-4" />}
    />
  );
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
export function Navbar({ user, onLogout, onOpenMenu }: NavbarProps) {
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
    <header className="sticky top-0 z-header flex h-12 items-center justify-between gap-2 border-b border-border bg-surface px-3 sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        {onOpenMenu !== undefined && (
          <Button
            size="sm"
            variant="ghost"
            className="size-[2rem] px-0 md:hidden"
            aria-label="Open navigation"
            onClick={onOpenMenu}
            icon={<Menu aria-hidden className="size-4" />}
          />
        )}
        <img src="/logo.svg" alt="" aria-hidden className="size-6 shrink-0" />
        <span className="truncate text-sm font-semibold tracking-wide text-text">GridPulse</span>
        <span className="hidden text-2xs text-text-subtle sm:inline">Energy Analytics</span>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <time
          dateTime={now.toISOString()}
          data-numeric
          className="hidden text-xs text-text-muted md:inline"
        >
          {now.toISOString().slice(11, 19)} UTC
        </time>

        <ThemeToggle />

        {user && (
          <div className="flex items-center gap-3 border-l border-border pl-2 sm:pl-4">
            <div className="hidden flex-col text-right sm:flex">
              <span className="text-xs font-medium text-text">{user.full_name}</span>
              <span className="text-2xs text-text-subtle">{user.role.toLowerCase()}</span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={onLogout}
              icon={<LogOut aria-hidden className="size-3.5" />}
            >
              <span className="sr-only sm:not-sr-only">Sign out</span>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}
