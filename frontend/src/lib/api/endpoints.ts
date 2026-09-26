import type { components, operations } from '../../types/generated/api';

import { apiRequest, type TokenPair } from './client';
import { tokenStore } from './tokens';

/**
 * Typed endpoint wrappers.
 *
 * Every response type comes from src/types/generated/api.ts, generated from the
 * gateway's own OpenAPI schema by `npm run gen:api`. Nothing here is a
 * hand-written guess, so a backend contract change surfaces as a type error.
 */

type Schema = components['schemas'];

export type User = Schema['UserResponse'];
export type Dataset = Schema['DatasetMetadata'];
export type DataQualityReport = Schema['DataQualityReport'];
export type AnalyticsJob = Schema['AnalyticsJobResponse'];
export type DailyAggregate = Schema['DailyAggregate'];
export type HourlyAggregate = Schema['HourlyAggregate'];
export type MonthlyAggregate = Schema['MonthlyAggregate'];
export type PeakEvent = Schema['PeakEvent'];
export type StreamWindow = Schema['StreamWindow'];
export type HiveQueryResult = Schema['QueryExecutionResponse'];
export type JobType = Schema['JobType'];

type OverviewResponse =
  operations['get_overview_summary_api_v1_analytics_overview_get']['responses'][200]['content']['application/json'];

const query = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, String(value));
  }
  const serialised = search.toString();
  return serialised === '' ? '' : `?${serialised}`;
};

export const auth = {
  async login(email: string, password: string): Promise<User> {
    const tokens = await apiRequest<TokenPair>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    tokenStore.setAccessToken(tokens.access_token);
    // Previously discarded, which ended every session after 15 minutes.
    tokenStore.setRefreshToken(tokens.refresh_token);
    return auth.profile();
  },

  profile: (): Promise<User> => apiRequest<User>('/auth/me'),

  async logout(): Promise<void> {
    try {
      await apiRequest<unknown>('/auth/logout', { method: 'POST' });
    } finally {
      tokenStore.clear();
    }
  },

  users: (): Promise<User[]> => apiRequest<User[]>('/auth/users'),
};

export const datasets = {
  list: (): Promise<Dataset[]> => apiRequest<Dataset[]>('/datasets'),

  get: (datasetId: string): Promise<Dataset> => apiRequest<Dataset>(`/datasets/${datasetId}`),

  /** Multipart upload. The UI had no path to this endpoint at all (F10). */
  upload(file: File, workspaceId?: string): Promise<Dataset> {
    const form = new FormData();
    form.append('file', file);
    if (workspaceId !== undefined) form.append('workspace_id', workspaceId);
    return apiRequest<Dataset>('/datasets/upload', { method: 'POST', body: form });
  },

  importLocal: (filePath: string): Promise<Dataset> =>
    apiRequest<Dataset>('/datasets/import-local', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    }),

  preprocess: (datasetId: string): Promise<DataQualityReport> =>
    apiRequest<DataQualityReport>(`/datasets/${datasetId}/preprocess`, { method: 'POST' }),

  quality: (datasetId: string): Promise<DataQualityReport> =>
    apiRequest<DataQualityReport>(`/datasets/${datasetId}/quality`),
};

export const jobs = {
  list: (datasetId?: string): Promise<AnalyticsJob[]> =>
    apiRequest<AnalyticsJob[]>(`/jobs${query({ dataset_id: datasetId })}`),

  get: (jobId: string): Promise<AnalyticsJob> => apiRequest<AnalyticsJob>(`/jobs/${jobId}`),

  create: (datasetId: string, jobType: JobType): Promise<AnalyticsJob> =>
    apiRequest<AnalyticsJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, job_type: jobType }),
    }),

  retry: (jobId: string): Promise<AnalyticsJob> =>
    apiRequest<AnalyticsJob>(`/jobs/${jobId}/retry`, { method: 'POST' }),

  cancel: (jobId: string): Promise<AnalyticsJob> =>
    apiRequest<AnalyticsJob>(`/jobs/${jobId}/cancel`, { method: 'POST' }),
};

export const analytics = {
  overview: (datasetId?: string): Promise<OverviewResponse> =>
    apiRequest<OverviewResponse>(`/analytics/overview${query({ dataset_id: datasetId })}`),

  daily: (datasetId: string): Promise<DailyAggregate[]> =>
    apiRequest<DailyAggregate[]>(`/analytics/daily${query({ dataset_id: datasetId })}`),

  hourly: (datasetId: string): Promise<HourlyAggregate[]> =>
    apiRequest<HourlyAggregate[]>(`/analytics/hourly${query({ dataset_id: datasetId })}`),

  monthly: (datasetId: string): Promise<MonthlyAggregate[]> =>
    apiRequest<MonthlyAggregate[]>(`/analytics/monthly${query({ dataset_id: datasetId })}`),

  peak: (datasetId: string): Promise<PeakEvent[]> =>
    apiRequest<PeakEvent[]>(`/analytics/peak${query({ dataset_id: datasetId })}`),

  /** Sub-meter totals over every recorded day. Untyped upstream (BR-5); narrow at the caller. */
  submeters: (datasetId: string): Promise<unknown> =>
    apiRequest<unknown>(`/analytics/submeters${query({ dataset_id: datasetId })}`),
};

export const hive = {
  templates: (): Promise<unknown[]> => apiRequest<unknown[]>('/hive/templates'),

  execute: (
    datasetId: string,
    templateName: string,
    parameters: Record<string, string | number> = {},
  ): Promise<HiveQueryResult> =>
    apiRequest<HiveQueryResult>('/hive/queries/execute', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: datasetId,
        template_name: templateName,
        parameters,
      }),
    }),
};

export const stream = {
  status: (): Promise<unknown> => apiRequest<unknown>('/stream/status'),

  windows: (datasetId: string, limit = 30): Promise<StreamWindow[]> =>
    apiRequest<StreamWindow[]>(`/stream/windows${query({ dataset_id: datasetId, limit })}`),

  start: (datasetId: string, eventsPerSecond = 5): Promise<unknown> =>
    apiRequest<unknown>('/stream/start', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, events_per_second: eventsPerSecond }),
    }),

  pause: (): Promise<unknown> => apiRequest<unknown>('/stream/pause', { method: 'POST' }),
  resume: (): Promise<unknown> => apiRequest<unknown>('/stream/resume', { method: 'POST' }),
  stop: (): Promise<unknown> => apiRequest<unknown>('/stream/stop', { method: 'POST' }),

  /** Short-lived, stream-only credential for the SSE URL (BR-1). */
  ticket: (): Promise<{ ticket: string; expires_in: number }> =>
    apiRequest<{ ticket: string; expires_in: number }>('/stream/ticket', { method: 'POST' }),
};
