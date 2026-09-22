import { http, HttpResponse } from 'msw';

/**
 * Default handlers mirroring the real gateway contract (docs/API.md).
 *
 * The error envelope is the platform's own shape — `docs/API.md` labels it
 * RFC 7807 but it is not; see docs/FRONTEND_AUDIT.md F7.
 */
export const errorEnvelope = (
  code: string,
  message: string,
  requestId: string | null = 'test-correlation-id',
) => ({ error: { code, message, request_id: requestId, details: [] } });

export const handlers = [
  http.post('/api/v1/auth/login', async ({ request }) => {
    const body = (await request.json()) as { email?: string; password?: string };
    if (body.email === 'analyst@example.test' && body.password === 'correct-horse') {
      return HttpResponse.json({
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        token_type: 'bearer',
        expires_in: 900,
      });
    }
    return HttpResponse.json(
      errorEnvelope('AUTHENTICATION_FAILED', 'Invalid credentials provided'),
      { status: 401 },
    );
  }),

  http.get('/api/v1/auth/me', () =>
    HttpResponse.json({
      id: 'user-1',
      email: 'analyst@example.test',
      full_name: 'Test Analyst',
      role: 'ANALYST',
      workspace_id: 'default-workspace',
      is_active: true,
    }),
  ),

  http.get('/api/v1/datasets', () =>
    HttpResponse.json([
      {
        id: 'ds_test000000',
        filename: 'household_power_consumption.txt',
        size_bytes: 28537,
        status: 'CLEANED',
        version: 1,
        workspace_id: 'default-workspace',
      },
    ]),
  ),
];
