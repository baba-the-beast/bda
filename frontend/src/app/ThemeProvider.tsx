import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'gridpulse.theme';

interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Private windows and blocked storage: fall back to the system theme.
    return 'system';
  }
}

function systemTheme(): ResolvedTheme {
  if (typeof window.matchMedia !== 'function') return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

const resolve = (preference: ThemePreference, system: ResolvedTheme): ResolvedTheme =>
  preference === 'system' ? system : preference;

/**
 * Put the theme on <html> *before* React re-renders with it.
 *
 * Canvas charts read their axis and text colours from the computed tokens while
 * rendering. Set from an effect, the attribute would land after they had
 * already read the previous theme's values.
 */
function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

/**
 * Light and dark, following the system until the reader picks one.
 *
 * The CSS already follows `prefers-color-scheme` on its own (tokens.css), so
 * the page is right before this runs. This adds the explicit choice, and tells
 * canvas-rendered charts — which cannot read a media query — which palette to
 * draw with.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => {
    const stored = readStoredPreference();
    applyTheme(resolve(stored, systemTheme()));
    return stored;
  });
  const [system, setSystem] = useState<ResolvedTheme>(systemTheme);
  const preferenceRef = useRef(preference);
  preferenceRef.current = preference;

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => {
      const next = query.matches ? 'light' : 'dark';
      applyTheme(resolve(preferenceRef.current, next));
      setSystem(next);
    };
    query.addEventListener('change', onChange);
    return () => {
      query.removeEventListener('change', onChange);
    };
  }, []);

  const resolved = resolve(preference, system);

  const setPreference = useCallback((next: ThemePreference) => {
    applyTheme(resolve(next, systemTheme()));
    setPreferenceState(next);
    try {
      if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice still applies for this visit.
    }
  }, []);

  const value = useMemo(
    () => ({ preference, resolved, setPreference }),
    [preference, resolved, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Outside a provider (isolated component tests) this reports the dark default. */
export function useTheme(): ThemeContextValue {
  return (
    useContext(ThemeContext) ?? {
      preference: 'system',
      resolved: 'dark',
      setPreference: () => undefined,
    }
  );
}
