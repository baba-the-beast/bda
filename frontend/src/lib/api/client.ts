import { ApiError, toApiError } from './errors';
import { tokenStore } from './tokens';

function resolveBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL;
  if (configured === undefined || configured.trim() === '') {
    // Same-origin through the dev server or nginx proxy.
    return '/api/v1';
  }
  const base = configured.trim().replace(/\/+$/, '');
  const withScheme = /^https?:\/\//.test(base) ? base : `https://${base}`;
  return withScheme.endsWith('/api/v1') ? withScheme : `${withScheme}/api/v1`;
}

export const API_BASE = resolveBaseUrl();

export interface TokenPair {
  access_token: string;
  refresh_token: string;
}

type SessionEndedListener = () => void;

const sessionEndedListeners = new Set<SessionEndedListener>();

/** Notifies the app that the session is unrecoverable and sign-in is required. */
export function onSessionEnded(listener: SessionEndedListener): () => void {
  sessionEndedListeners.add(listener);
  return () => sessionEndedListeners.delete(listener);
}

function endSession(): void {
  tokenStore.clear();
  for (const listener of sessionEndedListeners) listener();
}

/**
 * The in-flight refresh, if any.
 *
 * Single-flight matters: a dashboard fires several queries at once, and an
 * expired token fails all of them together. Without this they would each post a
 * refresh, and because the backend rotates refresh tokens and treats reuse as
 * compromise, the later ones would revoke every session for that user.
 */
let refreshInFlight: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  refreshInFlight ??= (async () => {
    const refreshToken = tokenStore.getRefreshToken();
    if (refreshToken === null) {
      throw new ApiError({
        status: 401,
        code: 'NO_REFRESH_TOKEN',
        message: 'Your session has ended. Please sign in again.',
        correlationId: null,
      });
    }

    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      throw await toApiError(response);
    }

    const tokens = (await response.json()) as TokenPair;
    tokenStore.setAccessToken(tokens.access_token);
    // The backend rotates on every refresh, so the old one is now dead.
    tokenStore.setRefreshToken(tokens.refresh_token);
    return tokens.access_token;
  })().finally(() => {
    refreshInFlight = null;
  });

  return refreshInFlight;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: BodyInit | null;
  /** Internal: prevents a refreshed request from retrying forever. */
  retryOnUnauthorized?: boolean;
}

/**
 * Perform an authenticated request, refreshing once on a 401.
 *
 * Refresh failure ends the session rather than leaving the app in a state where
 * every panel shows an authentication error.
 */
export async function apiFetch(path: string, options: RequestOptions = {}): Promise<Response> {
  const { retryOnUnauthorized = true, headers, ...rest } = options;

  const requestHeaders = new Headers(headers);
  const accessToken = tokenStore.getAccessToken();
  if (accessToken !== null) {
    requestHeaders.set('Authorization', `Bearer ${accessToken}`);
  }
  if (!requestHeaders.has('Content-Type') && !(rest.body instanceof FormData)) {
    requestHeaders.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE}${path}`, { ...rest, headers: requestHeaders });

  if (response.status !== 401 || !retryOnUnauthorized) {
    return response;
  }

  try {
    await refreshAccessToken();
  } catch {
    endSession();
    return response;
  }

  return apiFetch(path, { ...options, retryOnUnauthorized: false });
}

/** Authenticated request returning parsed JSON, or throwing an ApiError. */
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);

  if (!response.ok) {
    const error = await toApiError(response);
    if (error.isUnauthorized) endSession();
    throw error;
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

/** Exposed for tests: discards any refresh currently in flight. */
export function __resetRefreshState(): void {
  refreshInFlight = null;
}
