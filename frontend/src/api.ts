import {
  User,
  Dataset,
  DataQualityReport,
  AnalyticsJob,
  DailyAggregate,
  HourlyAggregate,
  MonthlyAggregate,
  PeakEvent,
} from './types';

const getApiBase = () => {
  if (import.meta.env.VITE_API_URL) {
    let base = String(import.meta.env.VITE_API_URL).trim();
    if (!base.startsWith('http://') && !base.startsWith('https://')) {
      base = `https://${base}`;
    }
    return base.endsWith('/api/v1') ? base : `${base.replace(/\/+$/, '')}/api/v1`;
  }
  return '/api/v1';
};

const API_BASE = getApiBase();

class ApiClient {
  private token: string | null = localStorage.getItem('access_token');

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('access_token', token);
    } else {
      localStorage.removeItem('access_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
      headers.set('Content-Type', 'application/json');
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      this.setToken(null);
      window.dispatchEvent(new Event('auth:unauthorized'));
    }

    if (!response.ok) {
      let errorData;
      try {
        errorData = await response.json();
      } catch {
        errorData = { error: { message: response.statusText } };
      }
      throw new Error(errorData.error?.message || 'API request failed');
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const data = await this.request<{ access_token: string; refresh_token: string }>(
      '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      },
    );
    this.setToken(data.access_token);
    return data;
  }

  async getProfile(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  // Datasets
  async listDatasets(): Promise<Dataset[]> {
    return this.request<Dataset[]>('/datasets');
  }

  async importLocalDataset(filePath: string): Promise<Dataset> {
    return this.request<Dataset>('/datasets/import-local', {
      method: 'POST',
      body: JSON.stringify({ file_path: filePath }),
    });
  }

  async preprocessDataset(datasetId: string): Promise<DataQualityReport> {
    return this.request<DataQualityReport>(`/datasets/${datasetId}/preprocess`, {
      method: 'POST',
    });
  }

  // Jobs
  async listJobs(datasetId?: string): Promise<AnalyticsJob[]> {
    const query = datasetId ? `?dataset_id=${datasetId}` : '';
    return this.request<AnalyticsJob[]>(`/jobs${query}`);
  }

  async createJob(datasetId: string, jobType: string): Promise<AnalyticsJob> {
    return this.request<AnalyticsJob>('/jobs', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, job_type: jobType }),
    });
  }

  async retryJob(jobId: string): Promise<AnalyticsJob> {
    return this.request<AnalyticsJob>(`/jobs/${jobId}/retry`, { method: 'POST' });
  }

  // Analytics
  async getOverview(datasetId?: string) {
    const query = datasetId ? `?dataset_id=${datasetId}` : '';
    return this.request<any>(`/analytics/overview${query}`);
  }

  async getDailyAnalytics(datasetId: string): Promise<DailyAggregate[]> {
    return this.request<DailyAggregate[]>(`/analytics/daily?dataset_id=${datasetId}`);
  }

  async getHourlyAnalytics(datasetId: string): Promise<HourlyAggregate[]> {
    return this.request<HourlyAggregate[]>(`/analytics/hourly?dataset_id=${datasetId}`);
  }

  async getMonthlyAnalytics(datasetId: string): Promise<MonthlyAggregate[]> {
    return this.request<MonthlyAggregate[]>(`/analytics/monthly?dataset_id=${datasetId}`);
  }

  async getPeakAnalytics(datasetId: string): Promise<PeakEvent[]> {
    return this.request<PeakEvent[]>(`/analytics/peak?dataset_id=${datasetId}`);
  }

  async getSubmeters(datasetId: string) {
    return this.request<any>(`/analytics/submeters?dataset_id=${datasetId}`);
  }

  async getProjectMetrics() {
    return this.request<any>('/analytics/metrics');
  }

  // Hive
  async listHiveTemplates() {
    return this.request<any[]>('/hive/templates');
  }

  async executeHiveQuery(datasetId: string, templateName: string, params: any = {}) {
    return this.request<any>('/hive/queries/execute', {
      method: 'POST',
      body: JSON.stringify({
        dataset_id: datasetId,
        template_name: templateName,
        parameters: params,
      }),
    });
  }

  // Stream
  async getStreamStatus() {
    return this.request<any>('/stream/status');
  }

  async startStream(datasetId: string, rate = 5) {
    return this.request<any>('/stream/start', {
      method: 'POST',
      body: JSON.stringify({ dataset_id: datasetId, events_per_second: rate }),
    });
  }

  async pauseStream() {
    return this.request<any>('/stream/pause', { method: 'POST' });
  }

  async resumeStream() {
    return this.request<any>('/stream/resume', { method: 'POST' });
  }

  async stopStream() {
    return this.request<any>('/stream/stop', { method: 'POST' });
  }

  // Authenticated file download helper
  async downloadFile(endpoint: string, defaultFilename = 'export.csv'): Promise<void> {
    const headers = new Headers();
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }
    const cleanPath = endpoint.startsWith('/api/v1')
      ? endpoint.slice(7)
      : endpoint.startsWith('/')
        ? endpoint
        : `/${endpoint}`;
    const url = `${API_BASE}${cleanPath}`;

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Download failed: HTTP ${response.status} ${response.statusText}`);
    }
    const blob = await response.blob();
    const objectUrl = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = defaultFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(objectUrl);
  }

  /** Exchange the access token for a short-lived, stream-only ticket. */
  async getStreamTicket(): Promise<string> {
    const data = await this.request<{ ticket: string; expires_in: number }>('/stream/ticket', {
      method: 'POST',
    });
    return data.ticket;
  }

  // Live Stream SSE Subscriber
  subscribeLiveStream(
    onData: (data: any) => void,
    onError?: (err: any) => void,
    ticket?: string,
  ): EventSource {
    // The ticket expires in 30 seconds and grants nothing but the telemetry
    // feed, so exposing it in the URL is bounded (docs/FRONTEND_BACKEND_REQUESTS.md).
    const ticketQuery = ticket ? `?ticket=${encodeURIComponent(ticket)}` : '';
    const es = new EventSource(`${API_BASE}/stream/live${ticketQuery}`);

    const parseAndDispatch = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);
        onData(parsed);
      } catch (e) {
        console.error('Failed to parse SSE payload', e);
      }
    };

    // Listen to custom named telemetry events and standard SSE message events
    es.addEventListener('telemetry', parseAndDispatch);
    es.onmessage = parseAndDispatch;

    if (onError) {
      es.onerror = onError;
    }
    return es;
  }

  // Dynamic dataset resolution
  async getDefaultDatasetId(): Promise<string | null> {
    try {
      const datasets = await this.listDatasets();
      return datasets[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  // Friendly aliases with dynamic dataset resolution
  async getDailyAggregates(datasetId?: string): Promise<DailyAggregate[]> {
    const target = datasetId || (await this.getDefaultDatasetId());
    return target ? this.getDailyAnalytics(target) : [];
  }

  async getHourlyAggregates(datasetId?: string): Promise<HourlyAggregate[]> {
    const target = datasetId || (await this.getDefaultDatasetId());
    return target ? this.getHourlyAnalytics(target) : [];
  }

  async getJobs(datasetId?: string): Promise<AnalyticsJob[]> {
    return this.listJobs(datasetId);
  }

  async getDatasets(): Promise<Dataset[]> {
    return this.listDatasets();
  }

  async submitJob(datasetId: string, jobType: string): Promise<AnalyticsJob> {
    return this.createJob(datasetId, jobType);
  }

  // Admin
  async listUsers(): Promise<User[]> {
    return this.request<User[]>('/auth/users');
  }

  async getAuditLogs(limit = 50) {
    return this.request<any[]>(`/auth/audit-logs?limit=${limit}`);
  }

  async getSecurityEvents(limit = 50) {
    return this.request<any[]>(`/auth/security-events?limit=${limit}`);
  }
}

export const api = new ApiClient();
