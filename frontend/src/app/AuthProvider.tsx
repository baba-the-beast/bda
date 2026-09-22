import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { onSessionEnded } from '../lib/api/client';
import { auth, type User } from '../lib/api/endpoints';
import { tokenStore } from '../lib/api/tokens';

export type AuthStatus = 'checking' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  status: AuthStatus;
  user: User | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === null) {
    throw new Error('useAuth must be used inside an <AuthProvider>');
  }
  return context;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('checking');
  const [user, setUser] = useState<User | null>(null);

  // Restore the session on load. The access token is memory-only, so after a
  // refresh the only thing left is the refresh token; the first request 401s
  // and the client silently exchanges it.
  useEffect(() => {
    let cancelled = false;

    async function restore(): Promise<void> {
      if (!tokenStore.hasSession()) {
        if (!cancelled) setStatus('anonymous');
        return;
      }
      try {
        const profile = await auth.profile();
        if (cancelled) return;
        setUser(profile);
        setStatus('authenticated');
      } catch {
        if (cancelled) return;
        tokenStore.clear();
        setUser(null);
        setStatus('anonymous');
      }
    }

    void restore();
    return () => {
      cancelled = true;
    };
  }, []);

  // The client ends the session when a refresh fails; reflect that in the UI
  // rather than leaving every panel showing an auth error.
  useEffect(
    () =>
      onSessionEnded(() => {
        setUser(null);
        setStatus('anonymous');
      }),
    [],
  );

  const signIn = useCallback(async (email: string, password: string) => {
    const profile = await auth.login(email, password);
    setUser(profile);
    setStatus('authenticated');
  }, []);

  const signOut = useCallback(async () => {
    await auth.logout();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo(() => ({ status, user, signIn, signOut }), [status, user, signIn, signOut]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
