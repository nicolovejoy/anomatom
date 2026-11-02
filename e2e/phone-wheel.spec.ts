// v5 stream B2 (docs/plans/v5-sound-model.md, ruling 9; issues 79 and 82). At 390×844 the pattern
// wheel takes the whole sheet while it turns, and 1.5 s after it settles the controls return;
// Swap is in view under the input, above the digit pad. Issue 79 (the docked wheel's band one
// row off a typed 97531) is checked where it was found, 1280×800. Headless; screenshots go to
// the scratchpad when E2E_SHOTS names a directory, else nowhere.
import { expect, openTab, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');

test.describe('phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the wheel takes the sheet while it turns; the controls return 1.5 s after it settles', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    const bar = page.locator('.deck-bar');
    await expect(wheel).toBeVisible();

    // Open, the wheel covers the deck and the sheet, edge to edge along the bottom of the page.
    const w = (await wheel.boundingBox())!;
    const b = (await bar.boundingBox())!;
    expect(w.x).toBe(0);
    expect(w.width).toBe(390);
    expect(w.y).toBeLessThanOrEqual(b.y);
    expect(w.y + w.height).toBeGreaterThanOrEqual(844 - 1);
    // Hands only on the stage: the figure is still in view above the wheel.
    const stage = (await page.locator('.region-juggler').boundingBox())!;
    expect(stage.height - Math.max(0, stage.y + stage.height - w.y)).toBeGreaterThanOrEqual(200);

    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).not.toBe('rest');
    await expect(wheel).toBeVisible();
    await shot(page, 'wheel-turning');

    // Stopped, the wheel keeps the sheet for the settle delay, then gives it back.
    await expect.poll(() => phase(page)).toBe('settling');
    const settledAt = Date.now();
    await page.waitForTimeout(700);
    await expect(wheel).toBeVisible();
    await expect(wheel).toBeHidden({ timeout: 3000 });
    expect(Date.now() - settledAt).toBeGreaterThan(1000);
    expect(await phase(page)).toBe('rest');

    // The controls are back, showing the pattern the wheel settled on.
    await expect(page.locator('#play')).toBeInViewport();
    await expect(page.locator('.deck-sound')).toBeInViewport();
    await expect(page.locator('.deck-notation')).not.toHaveText('3');
    await shot(page, 'wheel-settled');
  });

  test('a turn during the settle delay keeps the wheel open', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).toBe('settling');
    await page.waitForTimeout(1000);
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).not.toBe('rest');
    await page.waitForTimeout(900);
    // 1.9 s after the first stop: the first delay would have closed it by now.
    await expect(wheel).toBeVisible();
    await expect(wheel).toBeHidden({ timeout: 3000 });
  });

  test('issue 82: Swap is in view under the input, above the pad, with nothing scrolled', async ({ page }) => {
    await page.goto('/');
    await page.locator('.deck-own').click();
    await openTab(page, 'pattern');
    const input = page.locator('#hand-0');
    await input.fill('');
    const key = (k: string) => page.locator(`.digit-pad [data-key="${k}"]`);
    for (const k of ['(', '4', ',', '2', 'x', ')', '(', '2', 'x', ',', '4', ')']) await key(k).click();
    await expect(input).toHaveValue('(4,2x)(2x,4)');

    const swap = page.locator('#swap');
    await expect(swap).toBeVisible();
    await expect(swap).toBeInViewport({ ratio: 1 });
    const s = (await swap.boundingBox())!;
    const pad = (await page.locator('.digit-pad').boundingBox())!;
    const field = (await input.boundingBox())!;
    expect(s.y).toBeGreaterThan(field.y);
    expect(s.y + s.height).toBeLessThanOrEqual(pad.y);
    expect(s.y + s.height).toBeLessThanOrEqual(844);
    // The pad is whole: every key is there, and the first row of digits is a tap away.
    await expect(page.locator('.digit-pad .key:not([hidden])')).toHaveCount(15);
    await expect(key('1')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await shot(page, 'make-your-own-swap');
  });
});

test.describe('wide, 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // The band sat two rows short of a typed 97531: the smooth scroll to a row far round the loop
  // crossed the margin where the list turns itself, which cut the scroll off.
  for (const text of ['97531', '744', '(4,2x)(2x,4)']) {
    test(`issue 79: typing ${text} in Make your own puts the docked wheel's band on its row`, async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-own').click();
      const input = page.locator('#hand-0');
      await input.fill('');
      await input.pressSequentially(text, { delay: 40 });
      const lit = page.locator('.deck-row.on');
      await expect(lit).toHaveCount(1);
      const row = await lit.getAttribute('data-row');
      await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', row!, { timeout: 4000 });
      // And the drawn band, not just the class: the lit row sits at the middle of the wheel.
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const wheelBox = document.querySelector('.deck-wheel')!.getBoundingClientRect();
            const on = document.querySelector('.deck-row.on')!.getBoundingClientRect();
            return Math.abs(on.top + on.height / 2 - (wheelBox.top + wheelBox.height / 2));
          }),
        )
        .toBeLessThan(2);
    });
  }
});
