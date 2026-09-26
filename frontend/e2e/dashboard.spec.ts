import { expect, test, type Page } from '@playwright/test';

import { signIn } from './fixtures';

/**
 * The overview's widget grid, driven the way people drive it: a mouse drag,
 * the keyboard, a narrow screen, and a reload to prove the layout was kept.
 */

/** The grid's own items; cards contain lists of their own. */
const cards = (page: Page) =>
  page.locator('[role="list"][aria-label="Overview cards"] > [role="listitem"]');

async function order(page: Page): Promise<string[]> {
  return cards(page).evaluateAll((items) =>
    items.map((item) => item.getAttribute('aria-label') ?? ''),
  );
}

/** Signs in and waits for the board, which renders once the dataset list loads. */
async function openBoard(page: Page): Promise<void> {
  await signIn(page);
  await expect(cards(page)).toHaveCount(8);
}

test.describe('overview dashboard', () => {
  test('lists every card with its position and a visible instruction', async ({ page }) => {
    await openBoard(page);
    await expect(cards(page).first()).toHaveAttribute('aria-posinset', '1');
    await expect(cards(page).first()).toHaveAttribute('aria-setsize', '8');
    await expect(page.getByText(/Alt \+ arrow keys/)).toBeVisible();
  });

  test('reorders with Alt + arrow keys and keeps the order across a reload', async ({ page }) => {
    await openBoard(page);
    const before = await order(page);
    expect(before[0]).toBe('Total consumption');

    const first = page.getByRole('listitem', { name: 'Total consumption' });
    await first.focus();
    await page.keyboard.press('Alt+ArrowRight');

    await expect.poll(() => order(page)).not.toEqual(before);
    await expect(page.getByRole('listitem', { name: 'Total consumption' })).toBeFocused();
    const after = await order(page);

    await page.reload();
    await expect(cards(page)).toHaveCount(8);
    expect(await order(page)).toEqual(after);

    // Reset puts the default board back and disables itself.
    await page.getByRole('button', { name: 'Reset layout' }).click();
    expect(await order(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Reset layout' })).toBeDisabled();
  });

  test('drags a card to a new slot with the mouse', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openBoard(page);
    const before = await order(page);

    const source = page.getByRole('listitem', { name: 'Dataset health' });
    const target = page.getByRole('listitem', { name: 'Total consumption' });
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) throw new Error('cards not laid out');

    // Grab the card's body, not a control inside it.
    await page.mouse.move(from.x + from.width / 2, from.y + from.height - 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height - 30, { steps: 4 });
    await page.mouse.move(to.x + 40, to.y + 40, { steps: 20 });
    // Hold still past the settle delay so the board commits to the new slot.
    await page.waitForTimeout(400);
    await page.mouse.up();

    await expect.poll(() => order(page)).not.toEqual(before);
    const after = await order(page);
    expect(after.indexOf('Dataset health')).toBeLessThan(before.indexOf('Dataset health'));
    await expect(page.getByText(/Dataset health dropped at position/)).toBeAttached();
  });

  test('a drag the browser cancels puts the card back and saves nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await openBoard(page);
    const before = await order(page);
    // The pointer the drag runs on, so the cancel can name it.
    await page.evaluate(() => {
      window.addEventListener('pointerdown', (event) => {
        (window as unknown as { lastPointerId: number }).lastPointerId = event.pointerId;
      });
    });

    const source = page.getByRole('listitem', { name: 'Dataset health' });
    const target = page.getByRole('listitem', { name: 'Total consumption' });
    const from = await source.boundingBox();
    const to = await target.boundingBox();
    if (from === null || to === null) throw new Error('cards not laid out');

    await page.mouse.move(from.x + from.width / 2, from.y + from.height - 12);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2 - 20, from.y + from.height - 30, { steps: 4 });
    await page.mouse.move(to.x + 40, to.y + 40, { steps: 20 });
    await page.waitForTimeout(400);
    // Mid-drag, the order on screen has moved; the browser now takes the pointer.
    await expect.poll(() => order(page)).not.toEqual(before);
    await page.evaluate(() => {
      const pointerId = (window as unknown as { lastPointerId: number }).lastPointerId;
      window.dispatchEvent(new PointerEvent('pointercancel', { pointerId, bubbles: true }));
    });
    await page.mouse.up();

    await expect.poll(() => order(page)).toEqual(before);
    await expect(page.getByText(/Dataset health returned to position/)).toBeAttached();
    await page.reload();
    await expect(cards(page)).toHaveCount(8);
    expect(await order(page)).toEqual(before);
  });

  test('a click on a control inside a card is not a drag', async ({ page }) => {
    await openBoard(page);
    const before = await order(page);
    await page.getByRole('button', { name: 'Make Total consumption large' }).click();
    // The size changed, the order did not.
    expect(await order(page)).toEqual(before);
    await expect(page.getByRole('button', { name: 'Make Total consumption small' })).toBeVisible();
  });

  test('falls back to one column on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await openBoard(page);
    const lefts = await cards(page).evaluateAll((items) =>
      items.map((item) => Math.round(item.getBoundingClientRect().left)),
    );
    expect(new Set(lefts).size).toBe(1);
  });
});

test.describe('shell on a phone', () => {
  test('moves section navigation into a drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await signIn(page);

    await expect(page.getByRole('navigation', { name: 'Sections' })).toBeHidden();
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog');
    await drawer.getByRole('button', { name: 'Voltage & power' }).click();

    await expect(page).toHaveURL(/\/voltage/);
    await expect(drawer).toBeHidden();
  });

  test('switches theme and keeps the choice', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await signIn(page);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: /System theme\. Switch to light theme/ }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});

test.describe('overview dashboard on touch', () => {
  // Wide enough for four columns, so source and target are both on screen.
  test.use({ hasTouch: true, viewport: { width: 1440, height: 1000 } });

  /** Real touch input through DevTools, so Chrome derives the pointer events itself. */
  async function touch(page: Page, points: { x: number; y: number }[], holdMs: number) {
    const cdp = await page.context().newCDPSession(page);
    const [start, ...rest] = points;
    if (start === undefined) return;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
    await page.waitForTimeout(holdMs);
    for (const point of rest) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  const path = (from: { x: number; y: number }, to: { x: number; y: number }, steps = 20) =>
    Array.from({ length: steps + 1 }, (_, i) => ({
      x: from.x + ((to.x - from.x) * i) / steps,
      y: from.y + ((to.y - from.y) * i) / steps,
    }));

  test('a quick swipe scrolls instead of picking a card up', async ({ page }) => {
    await openBoard(page);
    const before = await order(page);
    const box = await page.getByRole('listitem', { name: 'Dataset health' }).boundingBox();
    if (box === null) throw new Error('not laid out');
    const start = { x: box.x + box.width / 2, y: box.y + box.height - 16 };

    await touch(page, path(start, { x: start.x, y: start.y - 300 }), 0);
    expect(await order(page)).toEqual(before);
  });

  test('press and hold picks a card up and moves it', async ({ page }) => {
    await openBoard(page);
    const before = await order(page);
    const from = await page.getByRole('listitem', { name: 'Dataset health' }).boundingBox();
    const to = await page.getByRole('listitem', { name: 'Total consumption' }).boundingBox();
    if (from === null || to === null) throw new Error('not laid out');

    await touch(
      page,
      path(
        { x: from.x + from.width / 2, y: from.y + from.height - 16 },
        { x: to.x + 40, y: to.y + 40 },
      ),
      600,
    );
    await expect.poll(() => order(page)).not.toEqual(before);
    const after = await order(page);
    expect(after.indexOf('Dataset health')).toBeLessThan(before.indexOf('Dataset health'));
  });
});
