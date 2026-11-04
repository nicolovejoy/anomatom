// Issue 110 (found in the review of #108): on a phone, a filter chip tapped while the drum still
// turns ends the turn, and the wheel stays open while the reader filters. The settle the turn left
// pending must not arm the return timer that closes it 1.5 s later (DECK.returnMs). Headless,
// 390×844.
import { expect, test, type Page } from './fixtures';

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');
const balls5 = (page: Page) => page.locator('.deck-filter[data-by="balls"][data-n="5"]');

test.describe('phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a chip tapped while the drum turns keeps the wheel open', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toBeVisible();
    await expect(page.locator('.deck-notation')).toHaveText('3');

    // Turn the drum. A loaded WebKit may send the first scroll after the turn has lapsed, so the
    // wheel then stays at rest (the open phone-wheel flake, #108 review finding 4): turn again.
    await expect(async () => {
      await page.locator('.deck-wheel-list').hover();
      await page.mouse.wheel(0, 64);
      await expect.poll(() => phase(page), { timeout: 1000, intervals: [20] }).toBe('spinning');
    }).toPass({ timeout: 10_000 });
    // Still spinning: the settle is pending when the chip is tapped.
    await balls5(page).tap();

    // The chip ends the turn: the phase is back at rest, the filter lit, its first card loaded.
    await expect.poll(() => phase(page)).toBe('rest');
    await expect(page.locator('.deck-filter[aria-pressed="true"]')).toHaveCount(1);
    await expect(balls5(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.deck-row[data-id]')).toHaveCount(3);
    await expect(page.locator('.deck-notation')).toHaveText('5');

    // Past the would-be close (a settle of 160 ms, then the return delay of 1.5 s): still open,
    // still at rest, the card and the filter unchanged.
    await page.waitForTimeout(2500);
    await expect(wheel).toBeVisible();
    expect(await phase(page)).toBe('rest');
    await expect(page.locator('.deck-notation')).toHaveText('5');
    await expect(balls5(page)).toHaveAttribute('aria-pressed', 'true');
  });
});
