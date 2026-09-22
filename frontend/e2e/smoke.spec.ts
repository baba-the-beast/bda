import { expect, test } from '@playwright/test';

/**
 * End-to-end smoke coverage.
 *
 * The backend is stubbed with route interception, so this runs against the
 * production build with no services required. It grows a case per route as
 * Phase 5 replaces the page components.
 */

import { USER, signIn, stubApi } from './fixtures';

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
