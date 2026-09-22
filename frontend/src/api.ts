/**
 * Compatibility shim for the pre-overhaul page components.
 *
 * The real client is `src/lib/api/` — typed against the generated OpenAPI
 * schema, with single-flight refresh and correlation-ID-carrying errors. This
 * module only re-exposes the old method names on top of it so `src/pages/**`
 * keeps working while Phase 5 rewrites those pages one domain at a time.
 *
 * Do not add to this file, and do not import it from new code. It is deleted
 * with the last legacy page (docs/FRONTEND_AUDIT.md, legacy ledger).
 */

import { API_BASE, apiFetch, apiRequest } from './lib/api/client';
import type {
  AnalyticsJob as LegacyJob,
  DailyAggregate as LegacyDaily,
  DataQualityReport as LegacyQuality,
  Dataset as LegacyDataset,
  HourlyAggregate as LegacyHourly,
  MonthlyAggregate as LegacyMonthly,
  PeakEvent as LegacyPeak,
  User as LegacyUser,
} from './types';
import { analytics, auth, datasets, hive, jobs, stream, type JobType } from './lib/api/endpoints';
import { tokenStore } from './lib/api/tokens';

/**
 * The legacy pages are typed against the hand-written shapes in src/types.ts,
 * which describe the same payloads as the generated schema but differ in which
 * fields are optional. Reconciling them is this adapter's job, so the casts
 * live here rather than being scattered through the pages.
 */
const adapt = <T>(value: unknown): T => value as T;

export const api = {
  // Auth
  getToken: () => tokenStore.getAccessToken(),
  setToken: (token: string | null) => {
    tokenStore.setAccessToken(token);
  },
  login: (email: string, password: string) => auth.login(email, password).then(adapt<LegacyUser>),
  getProfile: () => auth.profile().then(adapt<LegacyUser>),
  logout: () => auth.logout(),
  listUsers: () => auth.users().then(adapt<LegacyUser[]>),
  getAuditLogs: (limit = 50) => apiRequest<any[]>(`/auth/audit-logs?limit=${String(limit)}`),
  getSecurityEvents: (limit = 50) =>
    apiRequest<any[]>(`/auth/security-events?limit=${String(limit)}`),

  // Datasets
  listDatasets: () => datasets.list().then(adapt<LegacyDataset[]>),
  getDatasets: () => datasets.list().then(adapt<LegacyDataset[]>),
  importLocalDataset: (filePath: string) =>
    datasets.importLocal(filePath).then(adapt<LegacyDataset>),
  preprocessDataset: (datasetId: string) =>
    datasets.preprocess(datasetId).then(adapt<LegacyQuality>),
  async getDefaultDatasetId(): Promise<string | null> {
    try {
      const list = await datasets.list();
      return list[0]?.id ?? null;
    } catch {
      return null;
    }
  },

  // Jobs
  listJobs: (datasetId?: string) => jobs.list(datasetId).then(adapt<LegacyJob[]>),
  getJobs: (datasetId?: string) => jobs.list(datasetId).then(adapt<LegacyJob[]>),
  createJob: (datasetId: string, jobType: string) =>
    jobs.create(datasetId, jobType as JobType).then(adapt<LegacyJob>),
  submitJob: (datasetId: string, jobType: string) =>
    jobs.create(datasetId, jobType as JobType).then(adapt<LegacyJob>),
  retryJob: (jobId: string) => jobs.retry(jobId).then(adapt<LegacyJob>),

  // Analytics
  getOverview: (datasetId?: string) => analytics.overview(datasetId),
  getDailyAnalytics: (datasetId: string) => analytics.daily(datasetId).then(adapt<LegacyDaily[]>),
  getHourlyAnalytics: (datasetId: string) =>
    analytics.hourly(datasetId).then(adapt<LegacyHourly[]>),
  getMonthlyAnalytics: (datasetId: string) =>
    analytics.monthly(datasetId).then(adapt<LegacyMonthly[]>),
  getPeakAnalytics: (datasetId: string) => analytics.peak(datasetId).then(adapt<LegacyPeak[]>),
  getSubmeters: (datasetId: string) =>
    apiRequest<any>(`/analytics/submeters?dataset_id=${datasetId}`),
  getProjectMetrics: () => apiRequest<any>('/analytics/metrics'),
  async getDailyAggregates(datasetId?: string) {
    const target = datasetId ?? (await api.getDefaultDatasetId());
    return target === null ? [] : analytics.daily(target).then(adapt<LegacyDaily[]>);
  },
  async getHourlyAggregates(datasetId?: string) {
    const target = datasetId ?? (await api.getDefaultDatasetId());
    return target === null ? [] : analytics.hourly(target).then(adapt<LegacyHourly[]>);
  },

  // Hive
  listHiveTemplates: () => hive.templates(),
  executeHiveQuery: (datasetId: string, templateName: string, params: any = {}) =>
    hive.execute(datasetId, templateName, params),

  // Stream
  getStreamStatus: () => apiRequest<any>('/stream/status'),
  startStream: (datasetId: string, rate = 5) => stream.start(datasetId, rate),
  pauseStream: () => stream.pause(),
  resumeStream: () => stream.resume(),
  stopStream: () => stream.stop(),
  async getStreamTicket(): Promise<string> {
    const { ticket } = await stream.ticket();
    return ticket;
  },

  subscribeLiveStream(
    onData: (data: any) => void,
    onError?: (err: any) => void,
    ticket?: string,
  ): EventSource {
    const ticketQuery = ticket === undefined ? '' : `?ticket=${encodeURIComponent(ticket)}`;
    const source = new EventSource(`${API_BASE}/stream/live${ticketQuery}`);

    const dispatch = (event: MessageEvent<string>) => {
      try {
        onData(JSON.parse(event.data));
      } catch {
        // A malformed frame is dropped rather than tearing down the stream.
      }
    };

    source.addEventListener('telemetry', dispatch);
    source.onmessage = dispatch;
    if (onError !== undefined) source.onerror = onError;
    return source;
  },

  async downloadFile(endpoint: string, defaultFilename = 'export.csv'): Promise<void> {
    const path = endpoint.startsWith('/api/v1')
      ? endpoint.slice('/api/v1'.length)
      : endpoint.startsWith('/')
        ? endpoint
        : `/${endpoint}`;

    const response = await apiFetch(path);
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${String(response.status)}`);
    }

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = defaultFilename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(objectUrl);
  },
};
