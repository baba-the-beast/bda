/**
 * Capture a screenshot of every route against the production build.
 *
 * Deliberately not a Playwright *test*: the test runner's `webServer` block
 * fights an already-running preview and hangs. This drives the browser directly
 * and manages the preview server itself, so it works whether or not one is up.
 *
 *   npm run build && node scripts/capture-screenshots.mjs
 */
import { spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import process from 'node:process';

import { chromium } from '@playwright/test';

const PORT = 4180;
const BASE = `http://127.0.0.1:${PORT}`;
const OUT = 'screenshots';

const USER = {
  id: 'user-1',
  email: 'analyst@example.test',
  full_name: 'Test Analyst',
  role: 'ADMIN',
  workspace_id: 'default-workspace',
  is_active: true,
};

const DATASET = {
  id: 'ds_capture01',
  filename: 'household_power_consumption.txt',
  size_bytes: 28537,
  checksum_sha256: 'aa072b064e46136e8f3dd2554e10c7fe85b0affad8e1c5a7fcdcee04fc671fb0',
  version: 1,
  status: 'PROCESSED',
  workspace_id: 'default-workspace',
  created_by: USER.email,
  created_at: '2026-09-22T17:09:24Z',
  raw_hdfs_path: '/user/bda/energy/raw/ds_capture01/household_power_consumption.txt',
  cleaned_hdfs_path: '/user/bda/energy/cleaned/ds_capture01/cleaned.csv',
  quality_report: {
    total_input_rows: 499,
    valid_rows: 493,
    invalid_rows: 6,
    missing_value_rows: 6,
    rejected_rows: 6,
    processing_duration_sec: 0.075,
    extreme_candidate_count: 3,
    checksum_sha256: 'aa072b064e46136e8f3dd2554e10c7fe85b0affad8e1c5a7fcdcee04fc671fb0',
    schema_version: '1.0.0',
    rejection_reasons: { MISSING_VALUE_QUESTION_MARK: 6, NUMERIC_CONVERSION_ERROR: 0 },
  },
};

const days = (n) =>
  Array.from({ length: n }, (_, i) => {
    const date = new Date(Date.UTC(2006, 11, 16 + i));
    const wave = Math.sin(i / 3) * 6 + 14;
    return {
      dataset_id: DATASET.id,
      dataset_version: 1,
      date: date.toISOString().slice(0, 10),
      total_consumption_kwh: Number(wave.toFixed(4)),
      average_power_kw: Number((wave / 12).toFixed(4)),
      minimum_power_kw: 0.2,
      maximum_power_kw: Number((wave / 5).toFixed(3)),
      sub_metering_1_total: Math.round(wave * 40),
      sub_metering_2_total: Math.round(wave * 12),
      sub_metering_3_total: Math.round(wave * 260),
      reading_count: 1440,
    };
  });

const hours = Array.from({ length: 24 }, (_, hour) => ({
  dataset_id: DATASET.id,
  dataset_version: 1,
  hour,
  total_consumption_kwh: 1 + Math.abs(Math.sin(hour / 3)) * 2,
  average_power: Number((0.6 + Math.abs(Math.sin(hour / 3.2)) * 2.4).toFixed(3)),
  minimum_power: 0.2,
  maximum_power: 5.1,
  reading_count: 60,
}));

const jobs = [
  {
    id: 'job_5f1c22',
    run_id: 'run_91',
    dataset_id: DATASET.id,
    job_type: 'DAILY',
    status: 'SUCCEEDED',
    workspace_id: 'default-workspace',
    created_by: USER.email,
    duration_seconds: 8.3672,
    input_path: '/user/bda/energy/cleaned/ds_capture01/cleaned.csv',
    output_path: '/user/bda/energy/output/ds_capture01/daily',
    retry_count: 0,
    progress_percent: 100,
    created_at: '2026-09-22T17:12:04Z',
  },
  {
    id: 'job_7a9e04',
    run_id: 'run_92',
    dataset_id: DATASET.id,
    job_type: 'HOURLY',
    status: 'RUNNING',
    workspace_id: 'default-workspace',
    created_by: USER.email,
    input_path: '/user/bda/energy/cleaned/ds_capture01/cleaned.csv',
    output_path: '/user/bda/energy/output/ds_capture01/hourly',
    retry_count: 0,
    progress_percent: 62,
    created_at: '2026-09-22T17:18:41Z',
  },
];

const ROUTES = [
  ['sign-in', '/sign-in', false],
  ['overview', '/overview', true],
  ['datasets', '/datasets', true],
  ['jobs', '/jobs', true],
  ['analysis', '/analysis', true],
  ['voltage', '/voltage', true],
  ['query', '/query', true],
  ['stream', '/stream', true],
  ['platform', '/platform', true],
  ['admin', '/admin', true],
  ['demo', '/demo', true],
];

const json = (body) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function stub(page) {
  await page.route('**/api/v1/**', (r) => r.fulfill(json([])));
  await page.route('**/api/v1/auth/login', (r) =>
    r.fulfill(json({ access_token: 'cap', refresh_token: 'cap-r' })),
  );
  await page.route('**/api/v1/auth/me', (r) => r.fulfill(json(USER)));
  await page.route('**/api/v1/auth/users', (r) => r.fulfill(json([USER])));
  await page.route('**/api/v1/datasets', (r) => r.fulfill(json([DATASET])));
  await page.route('**/api/v1/analytics/overview**', (r) =>
    r.fulfill(
      json({
        dataset_id: DATASET.id,
        total_records: 21600,
        total_consumption_kwh: 284.31,
        average_power_kw: 1.184,
        active_jobs_count: 1,
        total_datasets: 1,
        days_aggregated: 15,
      }),
    ),
  );
  await page.route('**/api/v1/analytics/daily**', (r) => r.fulfill(json(days(15))));
  await page.route('**/api/v1/analytics/hourly**', (r) => r.fulfill(json(hours)));
  await page.route('**/api/v1/analytics/metrics', (r) =>
    r.fulfill(json({ total_datasets: 1, total_jobs: 2, verification_status: 'VERIFIED' })),
  );
  await page.route('**/api/v1/jobs**', (r) => r.fulfill(json(jobs)));
  await page.route('**/api/v1/hive/templates', (r) =>
    r.fulfill(
      json([
        {
          id: 'daily_aggregates',
          name: 'Daily Power Aggregates',
          description: 'Total daily energy, power bounds and submeter totals.',
          parameters: [],
        },
      ]),
    ),
  );
  await page.route('**/api/v1/hive/queries/execute', (r) =>
    r.fulfill(
      json({
        query_id: 'q_capture',
        template_name: 'voltage_intensity_correlation',
        dataset_id: DATASET.id,
        execution_duration_sec: 0.5157,
        row_count: 3,
        columns: [
          'voltage_band',
          'avg_voltage',
          'avg_intensity',
          'avg_active_power',
          'reading_count',
        ],
        results: [
          {
            voltage_band: 'Low Voltage (<235V)',
            avg_voltage: 233.57,
            avg_intensity: 15.32,
            avg_active_power: 3.405,
            reading_count: 1428,
          },
          {
            voltage_band: 'Nominal (235V-245V)',
            avg_voltage: 240.12,
            avg_intensity: 4.61,
            avg_active_power: 1.094,
            reading_count: 18942,
          },
          {
            voltage_band: 'High Voltage (>245V)',
            avg_voltage: 246.88,
            avg_intensity: 3.92,
            avg_active_power: 0.961,
            reading_count: 1230,
          },
        ],
      }),
    ),
  );
}

async function waitForServer(url, attempts = 60) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

async function main() {
  await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });

  const preview = spawn(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['vite', 'preview', '--port', String(PORT), '--strictPort'],
    { stdio: 'ignore', shell: process.platform === 'win32' },
  );

  try {
    if (!(await waitForServer(BASE))) {
      throw new Error(`Preview server did not start on ${BASE}. Run \`npm run build\` first.`);
    }

    const browser = await chromium.launch();
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await stub(page);

    let signedIn = false;
    for (const [name, path, needsAuth] of ROUTES) {
      if (needsAuth && !signedIn) {
        await page.goto(`${BASE}/sign-in`);
        await page.getByLabel('Email').fill(USER.email);
        await page.getByLabel('Password').fill('capture');
        await page.getByRole('button', { name: 'Sign in' }).click();
        await page.waitForURL(/\/overview/);
        signedIn = true;
      }

      await page.goto(`${BASE}${path}`);
      // Give lazy route chunks and any chart canvas a moment to paint.
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
      console.log(`captured ${name}`);
    }

    await browser.close();
  } finally {
    preview.kill();
  }
}

await main();
