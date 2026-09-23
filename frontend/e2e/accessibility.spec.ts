import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { ROUTES, signIn, stubApi } from './fixtures';

/**
 * Accessibility pass over every route.
 *
 * Serious and critical violations fail the build. Moderate and minor findings
 * are reported in the failure message when something else breaks, but do not
 * gate on their own — they are judgement calls, not defects.
 */
async function blockingViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  return results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
}

test.describe('every route passes axe', () => {
  for (const route of ROUTES) {
    test(`${route.path} has no serious or critical violations`, async ({ page }) => {
      await signIn(page);
      await page.goto(route.path);
      await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();

      const blocking = await blockingViolations(page);
      expect(
        blocking,
        blocking.map((v) => `${v.id} (${String(v.impact)}): ${v.help}`).join('\n'),
      ).toEqual([]);
    });
  }

  test('sign-in has no serious or critical violations', async ({ page }) => {
    await stubApi(page);
    await page.goto('/sign-in');

    const blocking = await blockingViolations(page);
    expect(blocking, blocking.map((v) => `${v.id}: ${v.help}`).join('\n')).toEqual([]);
  });
});

test.describe('keyboard operation', () => {
  test('every section is reachable from the keyboard alone', async ({ page }) => {
    await signIn(page);

    // Tab into the sidebar and drive it without a mouse.
    const overview = page.getByRole('button', { name: 'Overview', exact: true });
    await overview.focus();
    await expect(overview).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/overview/);

    const datasets = page.getByRole('button', { name: /datasets & quality/i });
    await datasets.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/datasets/);
  });

  test('the current section is announced, not just coloured', async ({ page }) => {
    await signIn(page);
    await page.goto('/jobs');

    await expect(page.getByRole('button', { name: /mapreduce jobs/i })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('focus is visible on the element that has it', async ({ page }) => {
    await stubApi(page);
    await page.goto('/sign-in');

    await page.getByLabel('Email').focus();
    const outline = await page
      .getByLabel('Email')
      .evaluate((el) => getComputedStyle(el).outlineStyle);
    // :focus-visible sets a real outline; `none` would mean it was removed.
    expect(outline).not.toBe('none');
  });

  test('a dialog traps focus and returns it on close', async ({ page }) => {
    await signIn(page);
    await page.goto('/datasets');

    await page
      .getByRole('button', { name: /upload dataset/i })
      .first()
      .click();
    await expect(page.getByRole('dialog', { name: 'Upload dataset' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toBeHidden();
  });
});

test.describe('data honesty', () => {
  test('no route renders a value the API did not send', async ({ page }) => {
    await signIn(page);

    // The stub omits peak_power_kw; the overview must say so rather than
    // showing a zero (docs/FRONTEND_AUDIT.md §3.2).
    await page.goto('/overview');
    await expect(page.getByText('Not available').first()).toBeVisible();
  });

  test('every panel names its source and when it was read', async ({ page }) => {
    await signIn(page);
    await page.goto('/overview');

    await expect(page.getByText(/analytics ·/i).first()).toBeVisible();
    await expect(page.getByText(/as of/i).first()).toBeVisible();
  });
});
