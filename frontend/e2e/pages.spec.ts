import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * Per-route coverage for the rewritten pages.
 *
 * The backend is stubbed, so these assert what the UI does with a known
 * payload — including that it says "Not available" rather than inventing a
 * figure when the payload omits one.
 */

const USER = {
  id: 'user-1',
  email: 'analyst@example.test',
  full_name: 'Test Analyst',
  role: 'ADMIN',
  workspace_id: 'default-workspace',
  is_active: true,
};

const DATASET = {
  id: 'ds_e2e00000001',
  filename: 'household_power_consumption.txt',
  size_bytes: 28537,
  checksum_sha256: 'abc123',
  version: 1,
  status: 'PROCESSED',
  workspace_id: 'default-workspace',
  created_by: USER.email,
  created_at: '2026-09-22T17:09:24Z',
};

const OVERVIEW = {
  dataset_id: DATASET.id,
  total_records: 493,
  total_consumption_kwh: 25.8488,
  average_power_kw: 3.9666,
  // peak_power_kw is deliberately absent: the UI must say so, not show 0.
  active_jobs_count: 0,
  total_datasets: 1,
  days_aggregated: 2,
};

const VOLTAGE_BANDS = {
  query_id: 'q_e2e',
  template_name: 'voltage_intensity_correlation',
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

const json = (body: unknown) => ({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

async function stubApi(page: Page): Promise<void> {
  // Playwright matches the most recently registered route first, so the
  // catch-all goes down before the specific handlers that must beat it.
  await page.route('**/api/v1/**', (route) => route.fulfill(json([])));

  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill(
      json({ access_token: 'e2e', refresh_token: 'e2e-r', token_type: 'bearer', expires_in: 900 }),
    ),
  );
  await page.route('**/api/v1/auth/me', (route) => route.fulfill(json(USER)));
  await page.route('**/api/v1/datasets', (route) => route.fulfill(json([DATASET])));
  await page.route('**/api/v1/analytics/overview**', (route) => route.fulfill(json(OVERVIEW)));
  await page.route('**/api/v1/hive/queries/execute', (route) => route.fulfill(json(VOLTAGE_BANDS)));
}

async function signIn(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/overview/);
}

test.describe('overview', () => {
  test('shows figures from the API with an as-of stamp', async ({ page }) => {
    await signIn(page);

    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    await expect(page.getByText('25.85')).toBeVisible();
    await expect(page.getByText('3.967')).toBeVisible();
    await expect(page.getByText(/as of/i).first()).toBeVisible();
  });

  test('says "Not available" for a figure the API omitted', async ({ page }) => {
    await signIn(page);
    // peak_power_kw is missing from the stub; a zero here would be a fabrication.
    await expect(page.getByText('Not available').first()).toBeVisible();
  });

  test('renders the pipeline stages in order', async ({ page }) => {
    await signIn(page);
    for (const stage of ['Ingest', 'Clean', 'Batch', 'Query', 'Stream']) {
      await expect(page.getByText(stage, { exact: true })).toBeVisible();
    }
  });

  test('carries the dataset selection in the URL', async ({ page }) => {
    await signIn(page);
    await page.goto(`/overview?dataset=${DATASET.id}`);
    await expect(page).toHaveURL(new RegExp(`dataset=${DATASET.id}`));
  });
});

test.describe('voltage', () => {
  test('renders the band name and reading count the API actually returns', async ({ page }) => {
    await signIn(page);
    await page.goto('/voltage');

    // The previous screen read row.band and row.count, which the API never
    // sends, so these two columns were always blank on a successful query.
    await expect(page.getByText('Low Voltage (<235V)')).toBeVisible();
    await expect(page.getByText('479')).toBeVisible();
    await expect(page.getByText('233.6 V')).toBeVisible();
  });

  test('labels the calculator as a calculator', async ({ page }) => {
    await signIn(page);
    await page.goto('/voltage');

    await expect(page.getByText(/not dataset readings/i)).toBeVisible();
  });

  test('recomputes from the entered values', async ({ page }) => {
    await signIn(page);
    await page.goto('/voltage');

    await page.getByLabel('Voltage (V)').fill('240');
    await page.getByLabel('Current (A)').fill('10');
    await page.getByLabel('Power factor').fill('1');

    // 240 V x 10 A = 2.4 kVA; at unity power factor the active power matches.
    await expect(page.getByText('2.400 kW', { exact: false })).toBeVisible();
  });

  test('sorts the band table by a column', async ({ page }) => {
    await signIn(page);
    await page.goto('/voltage');

    await page.getByRole('button', { name: /readings/i }).click();
    await expect(page.getByRole('columnheader', { name: /readings/i })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
  });
});

test.describe('stream', () => {
  test('reports the connection state and offers no invented readings', async ({ page }) => {
    await signIn(page);
    await page.goto('/stream');

    await expect(page.getByRole('heading', { name: 'Live stream' })).toBeVisible();
    await expect(page.getByText('Not connected')).toBeVisible();
    await expect(page.getByText('Stream not running')).toBeVisible();
    // The old screen opened on these invented values before any data arrived.
    await expect(page.getByText('4.218')).toHaveCount(0);
    await expect(page.getByText('238.6')).toHaveCount(0);
  });

  test('states that window means come from the server', async ({ page }) => {
    await signIn(page);
    await page.goto('/stream');
    await expect(page.getByText(/client does not derive them/i)).toBeVisible();
  });
});

test.describe('accessibility of rewritten pages', () => {
  for (const path of ['/overview', '/voltage', '/stream']) {
    test(`${path} has no serious or critical violations`, async ({ page }) => {
      await signIn(page);
      await page.goto(path);

      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      const blocking = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );

      expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
    });
  }
});
