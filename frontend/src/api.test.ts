import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';

import { api } from './api';
import { errorEnvelope } from './test/handlers';
import { server } from './test/server';

/**
 * Characterisation tests for the current API client.
 *
 * These pin the behaviour the replacement client (Phase 3) must preserve, and
 * document the two gaps the audit found: the discarded refresh token and the
 * absence of correlation-ID propagation on errors.
 */
describe('ApiClient', () => {
  beforeEach(() => {
    api.setToken(null);
  });

  it('stores the access token after a successful login', async () => {
    await api.login('analyst@example.test', 'correct-horse');
    expect(api.getToken()).toBe('test-access-token');
  });

  it('surfaces the platform error envelope message on failure', async () => {
    await expect(api.login('analyst@example.test', 'wrong-password')).rejects.toThrow(
      'Invalid credentials provided',
    );
  });

  it('clears the token and signals the app on a 401', async () => {
    api.setToken('expired-token');
    const unauthorized = new Promise<void>((resolve) => {
      window.addEventListener('auth:unauthorized', () => {
        resolve();
      });
    });

    server.use(
      http.get('/api/v1/auth/me', () =>
        HttpResponse.json(errorEnvelope('AUTHENTICATION_FAILED', 'Token has expired'), {
          status: 401,
        }),
      ),
    );

    await expect(api.getProfile()).rejects.toThrow('Token has expired');
    await unauthorized;
    expect(api.getToken()).toBeNull();
  });

  it('falls back to a generic message when the body is not JSON', async () => {
    server.use(
      http.get('/api/v1/datasets', () => new HttpResponse('upstream exploded', { status: 502 })),
    );
    await expect(api.listDatasets()).rejects.toThrow();
  });

  describe('known gaps (documented in docs/FRONTEND_AUDIT.md)', () => {
    it('discards the refresh token, so sessions cannot outlive the access token', async () => {
      const response = await api.login('analyst@example.test', 'correct-horse');
      expect(response.refresh_token).toBe('test-refresh-token');
      expect(localStorage.getItem('refresh_token')).toBeNull();
    });

    it('does not attach the correlation id to thrown errors', async () => {
      const error = await api
        .login('analyst@example.test', 'wrong-password')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(Error);
      expect(error).not.toHaveProperty('correlationId');
    });
  });
});
