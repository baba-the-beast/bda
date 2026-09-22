import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

/**
 * Phase 1 smoke coverage.
 *
 * The app has no router yet, so only the unauthenticated entry point is
 * reachable. This file grows a case per route as Phase 5 lands them; by the end
 * it covers sign in, dataset selection, every route, and stream start/stop.
 */
test.describe('application shell', () => {
  test('serves the built app and renders the sign-in form', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('textbox', { name: /email/i })).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /authenticate console session/i })).toBeVisible();
  });

  test('sign-in fields expose accessible names', async ({ page }) => {
    await page.goto('/');

    // Regression guard: the labels were unassociated, so screen readers
    // announced these fields by their value (docs/FRONTEND_AUDIT.md §9).
    await expect(page.getByLabel(/operator identifier/i)).toHaveAttribute('type', 'email');
    await expect(page.getByLabel(/access cipher/i)).toHaveAttribute('type', 'password');
  });

  test('has no serious or critical accessibility violations', async ({ page }) => {
    await page.goto('/');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact === 'serious' || v.impact === 'critical',
    );

    expect(
      blocking,
      `Blocking a11y violations:\n${blocking.map((v) => `${v.id}: ${v.help}`).join('\n')}`,
    ).toEqual([]);
  });

  test('keyboard alone reaches the submit button', async ({ page }) => {
    await page.goto('/');

    await page.getByLabel(/operator identifier/i).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel(/access cipher/i)).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: /authenticate console session/i })).toBeFocused();
  });

  test('reports a failed sign-in instead of hanging', async ({ page }) => {
    await page.route('**/api/v1/auth/login', async (route) => {
      await route.fulfill({
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
      });
    });

    await page.goto('/');
    await page.getByRole('button', { name: /authenticate console session/i }).click();

    await expect(page.getByText(/invalid credentials provided/i)).toBeVisible();
  });
});
