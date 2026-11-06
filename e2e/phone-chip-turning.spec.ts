// Issue 110 (found in the review of #108): on a phone, ending the wheel's phase while the drum
// still turns ends the turn: the settle the turn left pending must neither pick a row nor arm a
// return of its own. Upright (docs/plans/v6-6-deck-on-top-four-jugglers.md) the ways in are a
// filter chip tapped mid-turn (the card stays grown and goes compact the return delay later), and
// Escape or Details mid-turn (compact at once). Headless, 390×844.
import { expect, test, type Page } from './fixtures';
import { DECK } from '../src/tunables';

/** Past the would-be shrink: a settle (DECK.settleMs), then the return delay (DECK.returnMs), and a margin. */
const PAST_RETURN = DECK.settleMs + DECK.returnMs + 500;

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

  // Upright a chip neither grows nor shrinks the card (docs/plans/v6-6-deck-on-top-four-jugglers.md,
  // ruling 4): the turn ends without a pick, and the grown card goes compact the return delay later.
  test('a chip tapped while the drum turns: the turn picks nothing more, the card goes compact the return delay later', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toBeVisible();
    await expect(page.locator('.deck-notation')).toHaveText('3');

    await clickWhileSpinning(page, [BALLS_5]);

    // The chip ends the turn: the card stays grown, the filter lit, its first card loaded.
    expect(await phase(page)).toBe('settling');
    await expect(page.locator('.deck-filter[aria-pressed="true"]')).toHaveCount(1);
    await expect(balls5(page)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.deck-row[data-id]')).toHaveCount(3);
    await expect(page.locator('.deck-notation')).toHaveText('5');

    // The turn's settle was cancelled: nothing else loads, and the card is compact again later.
    await expect(wheel).toHaveAttribute('data-phase', 'compact', { timeout: PAST_RETURN });
    await expect(wheel).toBeVisible();
    await expect(page.locator('.deck-notation')).toHaveText('5');
    await expect(balls5(page)).toHaveAttribute('aria-pressed', 'true');
  });

  // The pattern button that issue 110 was found with is gone upright (v6.6 ruling 1); Escape and
  // Details end the phase in its place.
  for (const how of ['Escape', 'Details'] as const) {
    test(`${how} while the drum turns: compact at once, and the turn's pending settle picks nothing`, async ({ page }) => {
      await page.goto('/');
      const wheel = page.locator('.deck-wheel');
      await expect(wheel).toBeVisible();
      const before = await page.locator('.deck-notation').textContent();
      if (how === 'Escape') {
        await expect(async () => {
          await page.locator('.deck-wheel-list').hover();
          await page.mouse.wheel(0, 64);
          await expect.poll(() => phase(page), { timeout: 1000, intervals: [20] }).toBe('spinning');
          const pressed = await page.evaluate(() => {
            if (document.querySelector('.deck-wheel')?.getAttribute('data-phase') !== 'spinning') return false;
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
            return true;
          });
          expect(pressed).toBe(true);
        }).toPass({ timeout: 10_000 });
      } else await clickWhileSpinning(page, ['.deck-details']);
      expect(await phase(page)).toBe('compact');
      // The band goes back to the pattern on stage: the band row names what plays (v6.6 ruling 9).
      await expect(page.locator('.deck-row.in-band code')).toHaveText(before!);
      await expect(page.locator('.deck-row.in-band')).toHaveAttribute('aria-current', 'true');
      await page.waitForTimeout(PAST_RETURN);
      await expect(wheel).toBeVisible();
      expect(await phase(page)).toBe('compact');
      await expect(page.locator('.deck-notation')).toHaveText(before!);
      await expect(page.locator('.deck-row.in-band code')).toHaveText(before!);
    });
  }
});
