import { expect, test } from '@playwright/test';

/**
 * Per-route coverage for the rewritten pages.
 *
 * The backend is stubbed, so these assert what the UI does with a known
 * payload — including that it says "Not available" rather than inventing a
 * figure when the payload omits one.
 */

import { DATASET, signIn } from './fixtures';

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
