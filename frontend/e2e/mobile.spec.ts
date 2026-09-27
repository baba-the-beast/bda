import { expect, test, type Page } from '@playwright/test';

/**
 * Phone-width layout. The smallest common phone is 320 CSS pixels wide; every
 * page has to fit it without a sideways scroll, and every text field has to
 * stay at 16px or iOS Safari zooms the page when it takes focus.
 */

import { ROUTES, signIn, stubApi } from './fixtures';

test.use({ viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true });

async function expectFitsWidth(page: Page): Promise<void> {
  // The app shell scrolls inside <main>, so content that is too wide scrolls
  // that element sideways rather than the document: check both.
  const overflow = await page.evaluate(() =>
    [document.documentElement, document.getElementById('main')]
      .filter((el): el is HTMLElement => el !== null)
      .map((el) => el.scrollWidth - el.clientWidth),
  );
  expect(Math.max(...overflow), 'page scrolls sideways').toBeLessThanOrEqual(0);
}

async function expectFieldsDoNotZoom(page: Page): Promise<void> {
  const small = await page.evaluate(() =>
    [...document.querySelectorAll('input:not([type=checkbox]):not([type=radio]), textarea')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => parseFloat(getComputedStyle(el).fontSize))
      .filter((size) => size < 16),
  );
  expect(small, 'fields under 16px').toEqual([]);
}

test('sign-in puts the form on the first screen', async ({ page }) => {
  await stubApi(page);
  await page.goto('/sign-in');

  const box = await page.getByLabel('Password').boundingBox();
  expect(box).not.toBeNull();
  expect((box?.y ?? Infinity) + (box?.height ?? 0)).toBeLessThanOrEqual(568);
  await expectFitsWidth(page);
  await expectFieldsDoNotZoom(page);
});

test('every page fits a 320px screen', async ({ page }) => {
  await signIn(page);

  for (const route of ROUTES) {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading, level: 1 })).toBeVisible();
    await expectFitsWidth(page);
    await expectFieldsDoNotZoom(page);
  }
});
