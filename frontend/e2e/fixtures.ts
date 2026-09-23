import { expect, type Page } from '@playwright/test';

/**
 * Shared e2e fixtures.
 *
 * The backend is stubbed with route interception, so the suite runs against the
 * production build with no services required.
 */

export const USER = {
  id: 'user-1',
  email: 'analyst@example.test',
  full_name: 'Test Analyst',
  role: 'ADMIN',
  workspace_id: 'default-workspace',
  is_active: true,
};

export const DATASET = {
  id: 'ds_e2e00000001',
  filename: 'household_power_consumption.txt',
  size_bytes: 28537,
  checksum_sha256: 'aa072b064e46136e8f3dd2554e10c7fe85b0affad8e1c5a7fcdcee04fc671fb0',
  version: 1,
  status: 'PROCESSED',
  workspace_id: 'default-workspace',
  created_by: USER.email,
  created_at: '2026-09-22T17:09:24Z',
  raw_hdfs_path: '/user/bda/energy/raw/ds_e2e00000001/household_power_consumption.txt',
  cleaned_hdfs_path: '/user/bda/energy/cleaned/ds_e2e00000001/cleaned.csv',
};

/** peak_power_kw is deliberately absent: the UI must say so, not show a zero. */
export const OVERVIEW = {
  dataset_id: DATASET.id,
  total_records: 493,
  total_consumption_kwh: 25.8488,
  average_power_kw: 3.9666,
  active_jobs_count: 0,
  total_datasets: 1,
  days_aggregated: 2,
};

export const VOLTAGE_BANDS = {
  query_id: 'q_e2e',
  template_name: 'voltage_intensity_correlation',
  dataset_id: DATASET.id,
  execution_duration_sec: 0.5157,
  row_count: 2,
  columns: ['voltage_band', 'avg_voltage', 'avg_intensity', 'avg_active_power', 'reading_count'],
  results: [
    {
      voltage_band: 'Low Voltage (<235V)',
      avg_voltage: 233.57,
      avg_intensity: 15.32,
      avg_active_power: 3.405,
      avg_reactive_power: 0.265,
      reading_count: 14,
    },
    {
      voltage_band: 'Nominal (235V-245V)',
      avg_voltage: 240.12,
      avg_intensity: 4.61,
      avg_active_power: 1.094,
      avg_reactive_power: 0.12,
      reading_count: 479,
    },
  ],
};

const DAILY = [
  {
    dataset_id: DATASET.id,
    dataset_version: 1,
    date: '2006-12-16',
    total_consumption_kwh: 25.8488,
    average_power_kw: 3.9666,
    minimum_power_kw: 0.801,
    maximum_power_kw: 10.523,
    sub_metering_1_total: 1004,
    sub_metering_2_total: 45,
    sub_metering_3_total: 7345,
    reading_count: 391,
  },
  {
    dataset_id: DATASET.id,
    dataset_version: 1,
    date: '2006-12-17',
    total_consumption_kwh: 1.08,
    average_power_kw: 0.6353,
    minimum_power_kw: 0.204,
    maximum_power_kw: 4.803,
    sub_metering_1_total: 0,
    sub_metering_2_total: 9,
    sub_metering_3_total: 120,
    reading_count: 102,
  },
];

const TEMPLATES = [
  {
    id: 'daily_aggregates',
    name: 'Daily Power Aggregates',
    description: 'Total daily energy, power bounds and submeter totals.',
    parameters: [],
  },
  {
    id: 'voltage_intensity_correlation',
    name: 'Voltage & Intensity Correlation',
    description: 'Readings grouped into voltage bands.',
    parameters: [],
  },
];

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

/** Every route that requires authentication, with its page heading. */
export const ROUTES = [
  { path: '/overview', heading: 'Overview' },
  { path: '/datasets', heading: 'Datasets & quality' },
  { path: '/jobs', heading: 'MapReduce jobs' },
  { path: '/analysis', heading: 'Consumption analysis' },
  { path: '/voltage', heading: 'Voltage & power' },
  { path: '/query', heading: 'Hive query lab' },
  { path: '/stream', heading: 'Live stream' },
  { path: '/platform', heading: 'Platform metrics' },
  { path: '/admin', heading: 'Administration' },
  { path: '/demo', heading: 'Guided demo' },
] as const;

export async function stubApi(page: Page): Promise<void> {
  // Playwright matches the most recently registered route first, so the
  // catch-all goes down before the specific handlers that must beat it.
  await page.route('**/api/v1/**', (route) => route.fulfill(json([])));

  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill(
      json({ access_token: 'e2e', refresh_token: 'e2e-r', token_type: 'bearer', expires_in: 900 }),
    ),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill(json(USER)));
  await page.route('**/api/v1/auth/users', (route) => route.fulfill(json([USER])));
  await page.route('**/api/v1/datasets', (route) => route.fulfill(json([DATASET])));
  await page.route('**/api/v1/analytics/overview**', (route) => route.fulfill(json(OVERVIEW)));
  await page.route('**/api/v1/analytics/daily**', (route) => route.fulfill(json(DAILY)));
  await page.route('**/api/v1/analytics/metrics', (route) =>
    route.fulfill(json({ total_datasets: 1, total_jobs: 4, verification_status: 'VERIFIED' })),
  );
  await page.route('**/api/v1/hive/templates', (route) => route.fulfill(json(TEMPLATES)));
  await page.route('**/api/v1/hive/queries/execute', (route) => route.fulfill(json(VOLTAGE_BANDS)));
}

export async function signIn(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/overview/);
}
