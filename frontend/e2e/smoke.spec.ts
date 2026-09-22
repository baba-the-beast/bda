import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end smoke coverage.
 *
 * The backend is stubbed with route interception, so this runs against the
 * production build with no services required. It grows a case per route as
 * Phase 5 replaces the page components.
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

async function stubApi(page: Page): Promise<void> {
  // Playwright matches the most recently registered route first, so the
  // catch-all goes down before the specific handlers that must beat it.
  await page.route('**/api/v1/**', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }),
  );

  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        access_token: 'e2e-access',
        refresh_token: 'e2e-refresh',
        token_type: 'bearer',
        expires_in: 900,
      }),
    }),
  );
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(USER) }),
  );
  await page.route('**/api/v1/datasets', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([DATASET]),
    }),
  );
}

async function signIn(page: Page): Promise<void> {
  await stubApi(page);
  await page.goto('/sign-in');
  await page.getByLabel('Email').fill(USER.email);
  await page.getByLabel('Password').fill('correct-horse-battery');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/overview/);
}

test.describe('sign-in', () => {
  test.beforeEach(async ({ page }) => {
    await stubApi(page);
  });

  test('renders labelled fields and a plainly worded submit', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByLabel('Email')).toHaveAttribute('type', 'email');
    await expect(page.getByLabel('Password')).toHaveAttribute('type', 'password');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  });

  test('ships no credentials in the bundle by default', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByLabel('Email')).toHaveValue('');
    await expect(page.getByLabel('Password')).toHaveValue('');
    await expect(page.getByText(/demo accounts/i)).toBeHidden();
    await expect(page.getByText(/AdminPass/i)).toHaveCount(0);
  });

  test('validates before calling the API', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByText('Enter a valid email address')).toBeVisible();
  });

  test('surfaces a rejected sign-in', async ({ page }) => {
    await page.route('**/api/v1/auth/login', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: {
            code: 'AUTHENTICATION_FAILED',
            message: 'Invalid credentials provided',
            request_id: 'e2e-correlation-id',
            details: [],
          },
        }),
      }),
    );

    await page.goto('/sign-in');
    await page.getByLabel('Email').fill(USER.email);
    await page.getByLabel('Password').fill('wrong');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('alert')).toContainText('Invalid credentials provided');
  });

  test('reaches the submit button by keyboard alone', async ({ page }) => {
    await page.goto('/sign-in');
    await page.getByLabel('Email').focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Password')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Sign in' })).toBeFocused();
  });
});

test.describe('routing', () => {
  test('redirects an anonymous visitor to sign-in', async ({ page }) => {
    await stubApi(page);
    await page.goto('/jobs');
    await expect(page).toHaveURL(/\/sign-in/);
  });

  test('returns the visitor to where they were heading after signing in', async ({ page }) => {
    await stubApi(page);
    await page.goto('/query');
    await expect(page).toHaveURL(/\/sign-in/);

    await page.getByLabel('Email').fill(USER.email);
    await page.getByLabel('Password').fill('correct-horse-battery');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/query/);
  });

  test('gives every section its own URL', async ({ page }) => {
    await signIn(page);

    for (const path of [
      '/datasets',
      '/jobs',
      '/analysis',
      '/voltage',
      '/query',
      '/platform',
      '/demo',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(path));
      await expect(page.getByRole('navigation', { name: 'Sections' })).toBeVisible();
    }
  });

  test('survives a reload and the back button', async ({ page }) => {
    await signIn(page);

    await page.goto('/query');
    await page.reload();
    await expect(page).toHaveURL(/\/query/);

    await page.goto('/jobs');
    await page.goBack();
    await expect(page).toHaveURL(/\/query/);
  });

  test('shows a 404 for an unknown address', async ({ page }) => {
    await signIn(page);
    await page.goto('/not-a-section');
    await expect(page.getByText('Page not found')).toBeVisible();
  });
});

test.describe('accessibility', () => {
  test('sign-in has no serious or critical violations', async ({ page }) => {
    await stubApi(page);
    await page.goto('/sign-in');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });

  test('the signed-in shell has no serious or critical violations', async ({ page }) => {
    await signIn(page);

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .include('nav[aria-label="Sections"]')
      .analyze();
    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
});
