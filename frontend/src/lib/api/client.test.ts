import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { errorEnvelope } from '../../test/handlers';
import { server } from '../../test/server';

import { __resetRefreshState, apiRequest, onSessionEnded } from './client';
import { ApiError } from './errors';
import { tokenStore } from './tokens';

describe('apiRequest', () => {
  beforeEach(() => {
    tokenStore.clear();
    __resetRefreshState();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches the access token', async () => {
    tokenStore.setAccessToken('access-1');
    let seen: string | null = null;
    server.use(
      http.get('/api/v1/datasets', ({ request }) => {
        seen = request.headers.get('Authorization');
        return HttpResponse.json([]);
      }),
    );

    await apiRequest('/datasets');
    expect(seen).toBe('Bearer access-1');
  });

  it('parses the platform error envelope into an ApiError with its correlation id', async () => {
    server.use(
      http.get('/api/v1/datasets', () =>
        HttpResponse.json(errorEnvelope('VALIDATION_FAILED', 'Dataset id is malformed', 'corr-9'), {
          status: 400,
        }),
      ),
    );

    const error = await apiRequest('/datasets').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.status).toBe(400);
    expect(apiError.code).toBe('VALIDATION_FAILED');
    expect(apiError.message).toBe('Dataset id is malformed');
    expect(apiError.correlationId).toBe('corr-9');
  });

  it('falls back to the correlation id header when the body omits it', async () => {
    server.use(
      http.get('/api/v1/datasets', () =>
        HttpResponse.json(errorEnvelope('SERVER_ERROR', 'boom', null), {
          status: 500,
          headers: { 'X-Correlation-ID': 'from-header' },
        }),
      ),
    );

    const error = (await apiRequest('/datasets').catch((e: unknown) => e)) as ApiError;
    expect(error.correlationId).toBe('from-header');
  });

  it('does not throw while parsing a non-JSON error body', async () => {
    server.use(
      http.get('/api/v1/datasets', () => new HttpResponse('<html>502</html>', { status: 502 })),
    );

    const error = (await apiRequest('/datasets').catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe('UNEXPECTED_RESPONSE');
  });
});

describe('token refresh', () => {
  beforeEach(() => {
    tokenStore.clear();
    __resetRefreshState();
  });

  it('refreshes once on a 401 and replays the request', async () => {
    tokenStore.setAccessToken('stale');
    tokenStore.setRefreshToken('refresh-1');

    let refreshCalls = 0;
    let attempt = 0;
    server.use(
      http.post('/api/v1/auth/refresh', () => {
        refreshCalls += 1;
        return HttpResponse.json({ access_token: 'fresh', refresh_token: 'refresh-2' });
      }),
      http.get('/api/v1/datasets', ({ request }) => {
        attempt += 1;
        if (request.headers.get('Authorization') === 'Bearer fresh') {
          return HttpResponse.json([{ id: 'ds_1' }]);
        }
        return HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'Token has expired'), {
          status: 401,
        });
      }),
    );

    const result = await apiRequest<{ id: string }[]>('/datasets');

    expect(result).toEqual([{ id: 'ds_1' }]);
    expect(refreshCalls).toBe(1);
    expect(attempt).toBe(2);
    expect(tokenStore.getAccessToken()).toBe('fresh');
  });

  it('stores the rotated refresh token', async () => {
    tokenStore.setAccessToken('stale');
    tokenStore.setRefreshToken('refresh-1');

    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ access_token: 'fresh', refresh_token: 'rotated' }),
      ),
      http.get('/api/v1/datasets', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json([])
          : HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'expired'), { status: 401 }),
      ),
    );

    await apiRequest('/datasets');
    expect(tokenStore.getRefreshToken()).toBe('rotated');
  });

  it('issues a single refresh for concurrent 401s', async () => {
    // The backend treats refresh-token reuse as compromise and revokes every
    // session, so three parallel refreshes would sign the user out entirely.
    tokenStore.setAccessToken('stale');
    tokenStore.setRefreshToken('refresh-1');

    let refreshCalls = 0;
    server.use(
      http.post('/api/v1/auth/refresh', async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return HttpResponse.json({ access_token: 'fresh', refresh_token: 'refresh-2' });
      }),
      http.get('/api/v1/datasets', ({ request }) =>
        request.headers.get('Authorization') === 'Bearer fresh'
          ? HttpResponse.json([])
          : HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'expired'), { status: 401 }),
      ),
    );

    await Promise.all([apiRequest('/datasets'), apiRequest('/datasets'), apiRequest('/datasets')]);
    expect(refreshCalls).toBe(1);
  });

  it('ends the session when there is no refresh token', async () => {
    tokenStore.setAccessToken('stale');
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);

    server.use(
      http.get('/api/v1/datasets', () =>
        HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'expired'), { status: 401 }),
      ),
    );

    await expect(apiRequest('/datasets')).rejects.toBeInstanceOf(ApiError);
    expect(ended).toHaveBeenCalled();
    expect(tokenStore.getAccessToken()).toBeNull();
    unsubscribe();
  });

  it('ends the session when the refresh itself is rejected', async () => {
    tokenStore.setAccessToken('stale');
    tokenStore.setRefreshToken('revoked');
    const ended = vi.fn();
    const unsubscribe = onSessionEnded(ended);

    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json(errorEnvelope('TOKEN_REUSE_REVOKED', 'Refresh token reused'), {
          status: 401,
        }),
      ),
      http.get('/api/v1/datasets', () =>
        HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'expired'), { status: 401 }),
      ),
    );

    await expect(apiRequest('/datasets')).rejects.toBeInstanceOf(ApiError);
    expect(ended).toHaveBeenCalled();
    expect(tokenStore.getRefreshToken()).toBeNull();
    unsubscribe();
  });

  it('does not retry forever when the replay also 401s', async () => {
    tokenStore.setAccessToken('stale');
    tokenStore.setRefreshToken('refresh-1');

    let dataCalls = 0;
    server.use(
      http.post('/api/v1/auth/refresh', () =>
        HttpResponse.json({ access_token: 'still-bad', refresh_token: 'refresh-2' }),
      ),
      http.get('/api/v1/datasets', () => {
        dataCalls += 1;
        return HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'expired'), {
          status: 401,
        });
      }),
    );

    await expect(apiRequest('/datasets')).rejects.toBeInstanceOf(ApiError);
    expect(dataCalls).toBe(2);
  });
});

describe('tokenStore', () => {
  beforeEach(() => {
    tokenStore.clear();
  });

  it('keeps the access token out of persistent storage', () => {
    tokenStore.setAccessToken('in-memory-only');
    expect(localStorage.getItem('bda.refresh_token')).toBeNull();
    expect(Object.values(localStorage)).not.toContain('in-memory-only');
  });

  it('persists the refresh token so a reload can recover the session', () => {
    tokenStore.setRefreshToken('refresh-1');
    expect(localStorage.getItem('bda.refresh_token')).toBe('refresh-1');
    expect(tokenStore.hasSession()).toBe(true);
  });

  it('survives storage being unavailable', () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Storage disabled');
    });
    expect(tokenStore.getRefreshToken()).toBeNull();
    getItem.mockRestore();
  });
});
