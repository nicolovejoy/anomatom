// Issue 110 (found in the review of #108): on a phone, ending the wheel's phase while the drum
// still turns ends the turn. The settle the turn left pending must not arm the return timer that
// shrinks the wheel 1.5 s later (DECK.returnMs; before v6.4 it closed it). Two ways in: a filter
// chip tapped mid-turn (the wheel stays open while the reader filters), and the pattern button
// tapped twice mid-turn (the wheel closes and opens again, and stays open). Headless, 390×844.
import { expect, test, type Page } from './fixtures';

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');
const BALLS_5 = '.deck-filter[data-by="balls"][data-n="5"]';
const balls5 = (page: Page) => page.locator(BALLS_5);

/**
 * Turns the drum and, while it still spins, clicks each of `selectors` in turn. The phase is read
 * and the clicks fired in one task, so the settle (DECK.settleMs after the last scroll) is still
 * pending when they land: a slow runner cannot click after it and pass on code that has the bug.
 * A loaded WebKit may send the first scroll after the turn has lapsed, so the wheel stays at rest
 * (the open phone-wheel flake, #108 review finding 4), or the settle may beat the clicks: turn again.
 */
const clickWhileSpinning = async (page: Page, selectors: string[]) => {
  await expect(async () => {
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page), { timeout: 1000, intervals: [20] }).toBe('spinning');
    const clicked = await page.evaluate((sels) => {
      if (document.querySelector('.deck-wheel')?.getAttribute('data-phase') !== 'spinning') return false;
      for (const s of sels) document.querySelector<HTMLElement>(s)!.click();
      return true;
    }, selectors);
    expect(clicked).toBe(true);
  }).toPass({ timeout: 10_000 });
};

test.describe('phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a chip tapped while the drum turns keeps the wheel open', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toBeVisible();
    await expect(page.locator('.deck-notation')).toHaveText('3');

    await clickWhileSpinning(page, [BALLS_5]);

    // The chip ends the turn: the phase is back at rest, the filter lit, its first card loaded.
    expect(await phase(page)).toBe('rest');
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

  test('the pattern button tapped twice while the drum turns leaves the wheel open', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toBeVisible();

    // The first tap closes the wheel, the second opens it again.
    await clickWhileSpinning(page, ['.deck-pattern', '.deck-pattern']);
    await expect(wheel).toBeVisible();
    expect(await phase(page)).toBe('rest');
    await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-expanded', 'true');

    // Past the would-be close: the turn's settle was cancelled with it, so nothing closes the wheel.
    await page.waitForTimeout(2500);
    await expect(wheel).toBeVisible();
    expect(await phase(page)).toBe('rest');
  });
});
