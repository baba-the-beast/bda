export interface User {
  id: string;
  email: string;
  full_name: string;
  role: 'ADMIN' | 'ANALYST' | 'VIEWER';
  workspace_id: string;
  is_active: boolean;
}

export interface DataQualityReport {
  total_input_rows: number;
  valid_rows: number;
  invalid_rows: number;
  missing_value_rows: number;
  rejected_rows: number;
  processing_duration_sec: number;
  extreme_candidate_count: number;
  checksum_sha256: string;
  schema_version: string;
  rejection_reasons: Record<string, number>;
}

export interface Dataset {
  id: string;
  filename: string;
  size_bytes: number;
  checksum_sha256: string;
  version: number;
  status: 'UPLOADED' | 'VALIDATING' | 'VALIDATED' | 'PREPROCESSING' | 'PROCESSED' | 'FAILED';
  workspace_id: string;
  created_by: string;
  created_at: string;
  raw_hdfs_path?: string;
  cleaned_hdfs_path?: string;
  quality_report?: DataQualityReport;
}

export interface AnalyticsJob {
  id: string;
  run_id: string;
  dataset_id: string;
  job_type: 'DAILY' | 'HOURLY' | 'MONTHLY' | 'PEAK';
  status: 'QUEUED' | 'RUNNING' | 'SUCCEEDED' | 'FAILED' | 'CANCELLED' | 'RETRYING';
  workspace_id: string;
  created_by: string;
  start_time?: string;
  end_time?: string;
  duration_seconds?: number;
  input_path: string;
  output_path: string;
  retry_count: number;
  error_message?: string;
  progress_percent: number;
  created_at: string;
}

export interface DailyAggregate {
  dataset_id: string;
  date: string;
  total_consumption_kwh: number;
  average_power: number;
  minimum_power: number;
  maximum_power: number;
  sub_metering_1_total: number;
  sub_metering_2_total: number;
  sub_metering_3_total: number;
  reading_count: number;
}

export interface HourlyAggregate {
  dataset_id: string;
  hour: number;
  total_consumption_kwh: number;
  average_power: number;
  minimum_power: number;
  maximum_power: number;
  reading_count: number;
}

export interface MonthlyAggregate {
  dataset_id: string;
  year: number;
  month: number;
  total_consumption_kwh: number;
  average_power: number;
  minimum_power: number;
  maximum_power: number;
  reading_count: number;
}

export interface PeakEvent {
  dataset_id: string;
  timestamp: string;
  date: string;
  hour: number;
  power: number;
  voltage: number;
  intensity: number;
  sub_metering_1: number;
  sub_metering_2: number;
  sub_metering_3: number;
  threshold_applied: number;
}

export interface StreamWindow {
  dataset_id: string;
  window_start: string;
  window_end: string;
  average_power: number;
  minimum_power: number;
  maximum_power: number;
  reading_count: number;
  event_rate: number;
  sub_metering_total: number;
  recent_trend: string;
}

export interface StreamTelemetryEvent {
  type: string;
  reading: {
    timestamp: string;
    global_active_power: number;
    global_reactive_power: number;
    voltage: number;
    global_intensity: number;
    sub_metering_1: number;
    sub_metering_2: number;
    sub_metering_3: number;
    dataset_id: string;
  };
  window?: StreamWindow;
  total_emitted: number;
}
