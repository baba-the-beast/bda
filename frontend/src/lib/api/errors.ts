/**
 * The platform's error envelope.
 *
 * `docs/API.md` heads this section "RFC 7807", but the shape is the platform's
 * own, not `application/problem+json` (docs/FRONTEND_AUDIT.md F7). Parsing
 * follows what the services actually send.
 */
export interface ErrorEnvelope {
  error: {
    code: string;
    message: string;
    request_id: string | null;
    details: unknown[];
  };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  /**
   * The gateway's X-Correlation-ID for this request, so a message shown to a
   * user can be traced to a line in the logs. Null when the service did not
   * populate it (BR-3).
   */
  readonly correlationId: string | null;
  readonly details: unknown[];

  constructor(init: {
    status: number;
    code: string;
    message: string;
    correlationId: string | null;
    details?: unknown[];
  }) {
    super(init.message);
    this.name = 'ApiError';
    this.status = init.status;
    this.code = init.code;
    this.correlationId = init.correlationId;
    this.details = init.details ?? [];
  }

  /** A 401 means the access token is gone or stale and a refresh may help. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null || !('error' in value)) return false;
  const { error: inner } = value;
  return typeof inner === 'object' && inner !== null && 'message' in inner;
}

/**
 * Turn a failed Response into an ApiError, preferring the service's own
 * message and never throwing while doing so.
 */
export async function toApiError(response: Response): Promise<ApiError> {
  const headerCorrelationId = response.headers.get('X-Correlation-ID');

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }

  if (isErrorEnvelope(body)) {
    const { code, message, request_id, details } = body.error;
    return new ApiError({
      status: response.status,
      code: typeof code === 'string' ? code : 'UNKNOWN_ERROR',
      message,
      correlationId: request_id ?? headerCorrelationId,
      details: Array.isArray(details) ? details : [],
    });
  }

  return new ApiError({
    status: response.status,
    code: 'UNEXPECTED_RESPONSE',
    message: response.statusText || `Request failed with status ${String(response.status)}`,
    correlationId: headerCorrelationId,
  });
}
