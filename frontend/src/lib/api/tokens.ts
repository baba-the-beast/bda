/**
 * Token storage.
 *
 * The access token lives in memory only: it dies with the tab, and never
 * reaches disk where a stray script could read it. The refresh token is
 * persisted, because without it a session ends after 15 minutes and a demo
 * silently logs itself out mid-flow.
 *
 * Persisting the refresh token puts it within reach of XSS. That trade is
 * accepted and argued in docs/FRONTEND_BACKEND_REQUESTS.md (BR-2): the
 * deployment is cross-origin, so an httpOnly cookie would have to be
 * SameSite=None, which browsers are withdrawing. The backend rotates refresh
 * tokens and revokes every session on reuse, the app loads no third-party
 * script, and the CSP is default-src 'self'.
 */

const REFRESH_TOKEN_KEY = 'bda.refresh_token';

let accessToken: string | null = null;

export const tokenStore = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  getRefreshToken(): string | null {
    try {
      return localStorage.getItem(REFRESH_TOKEN_KEY);
    } catch {
      // Private mode or blocked storage: sessions just will not survive reload.
      return null;
    }
  },

  setRefreshToken(token: string | null): void {
    try {
      if (token === null) {
        localStorage.removeItem(REFRESH_TOKEN_KEY);
      } else {
        localStorage.setItem(REFRESH_TOKEN_KEY, token);
      }
    } catch {
      // Non-fatal: the in-memory access token still works for this tab.
    }
  },

  clear(): void {
    accessToken = null;
    this.setRefreshToken(null);
  },

  /** True when a reload might be recoverable without a new sign-in. */
  hasSession(): boolean {
    return accessToken !== null || this.getRefreshToken() !== null;
  },
};
