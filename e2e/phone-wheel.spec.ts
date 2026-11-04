// v5 stream B2 (docs/plans/v5-sound-model.md, ruling 9; issues 79 and 82). At 390×844 the pattern
// wheel takes the whole sheet while it turns, and 1.5 s after it settles the controls return;
// Swap is in view under the input, above the digit pad. Issue 79 (the docked wheel's band one
// row off a typed 97531) is checked where it was found, 1280×800, on the docked menu of v6.2
// (docs/plans/v6-2-wheel-ends.md, ruling 3). Headless; screenshots go to
// the scratchpad when E2E_SHOTS names a directory, else nowhere.
import { expect, openTab, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');

test.describe('phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  // The wheel moves to the sheet on the first scroll of a turn, not on the touch: the row under the
  // finger must still be there when the tap's click fires.
  test('a tap on a row of the open wheel at rest picks it', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('.deck-row[data-id="shower"]');
    await expect(row).toBeInViewport();
    await row.tap();
    await expect(page.locator('.deck-notation')).toHaveText('51');
    await expect(page.locator('.deck-wheel')).toBeHidden();
  });

  test('the wheel takes the sheet while it turns; the controls return 1.5 s after it settles', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    const bar = page.locator('.deck-bar');
    await expect(wheel).toBeVisible();

    // At rest, a first visit's open wheel is over the stage: Play and the deck show under it.
    const rest = (await wheel.boundingBox())!;
    expect(rest.y + rest.height).toBeLessThanOrEqual((await bar.boundingBox())!.y + 1);
    await expect(page.locator('#play')).toBeInViewport();
    await shot(page, 'wheel-rest-first-visit');

    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).not.toBe('rest');
    await expect(wheel).toBeVisible();
    // Turning, it takes the sheet: the deck and the sheet are under it, the figure above.
    const w = (await wheel.boundingBox())!;
    const b = (await bar.boundingBox())!;
    expect(w.x).toBe(0);
    expect(w.width).toBe(390);
    expect(w.y).toBeLessThanOrEqual(b.y);
    expect(w.y + w.height).toBeGreaterThanOrEqual(844 - 1);
    const stage = (await page.locator('.region-juggler').boundingBox())!;
    expect(stage.height - Math.max(0, stage.y + stage.height - w.y)).toBeGreaterThanOrEqual(200);
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

  // Timed in the page, from when the wheel stopped (issue 106): a poll notices `settling` up to
  // half a second late, and a second turn timed from then reached a slow runner (WebKit on CI) after
  // the first delay had closed the wheel.
  test('a turn during the settle delay keeps the wheel open', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    // Each phase the wheel enters, and when it hides, stamped as it happens.
    await wheel.evaluate((w) => {
      const log: { at: number; phase: string | null; hidden: boolean }[] = [];
      (window as unknown as { phases: typeof log }).phases = log;
      new MutationObserver(() => log.push({ at: performance.now(), phase: w.getAttribute('data-phase'), hidden: (w as HTMLElement).hidden })).observe(w, {
        attributes: true,
        attributeFilter: ['data-phase', 'hidden'],
      });
    });
    const phases = () => page.evaluate(() => (window as unknown as { phases: { at: number; phase: string | null; hidden: boolean }[] }).phases);
    const stops = async () => (await phases()).filter((p, i, all) => p.phase === 'settling' && all[i - 1]?.phase !== 'settling');
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(1);
    const first = (await stops())[0]!.at;
    // A second turn well inside the first delay (DECK.returnMs, 1.5 s): 0.7 s after the stop.
    await page.waitForFunction((t) => performance.now() >= t, first + 700);
    // The wheel moved to the sheet when the turn began: the pointer goes to it again.
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(2);
    const second = (await stops())[1]!.at;
    // The wheel stayed open through the first delay, and closes the delay after the second stop.
    await expect(wheel).toBeHidden({ timeout: 3000 });
    const shut = (await phases()).find((p) => p.hidden)!.at;
    expect(shut - first).toBeGreaterThan(1500 + 700);
    expect(shut - second).toBeGreaterThanOrEqual(1500 - 20);
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
    // The pad is whole: every key is there, and the first row of digits is a tap away. A coarse
    // pointer adds ⌨ in the fourth row's free cell (v6.3 ruling 4), not a new row.
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    await expect(page.locator('.digit-pad .key:not([hidden])')).toHaveCount(coarse ? 16 : 15);
    await expect(key('1')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    await shot(page, 'make-your-own-swap');
  });
});

test.describe('wide, 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  // A stale goal at rest dragged the docked wheel back when the browser scrolled a focused row into
  // view. Typing the pattern the band is already on issues no scroll, and left the goal set. Focus a
  // row off screen: the browser brings it in, and nothing pulls it back or picks. The menu's band
  // stays on the card on stage: a scroll only browses (v6.2 ruling 3).
  test('typing the banded pattern, then a row focused off screen: it stays in view, the pattern and the band stay', async ({ page }) => {
    await page.goto('/#3');
    await page.locator('.deck-own').click();
    await page.locator('#hand-0').fill('');
    await page.locator('#hand-0').pressSequentially('3');
    await expect(page.locator('.deck-row.on')).toHaveAttribute('data-row', '0');
    await page.waitForTimeout(800);
    const row = page.locator('.deck-row[data-row="7"]');
    // Seven rows down: outside the five rows the wheel shows above the editor.
    const within = () =>
      row.evaluate((r) => {
        const w = document.querySelector('.deck-wheel')!.getBoundingClientRect();
        const b = r.getBoundingClientRect();
        return b.top >= w.top - 1 && b.bottom <= w.bottom + 1;
      });
    expect(await within()).toBe(false);
    await row.focus();
    await page.waitForTimeout(1200);
    expect(await within()).toBe(true);
    // The band stays on the card on stage, scrolled past.
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '0');
    await expect(page.locator('.deck-notation')).toHaveText('3');
  });

  // The band sat two rows short of a typed 97531: the smooth scroll to a row far round the loop
  // crossed the margin where the list turned itself, which cut the scroll off. The loop is gone
  // (v6.2): the band is the lit row's own, and the row is brought whole into view.
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
      // And in view, not just the class: the lit row is whole in the wheel.
      await expect
        .poll(async () =>
          page.evaluate(() => {
            const wheelBox = document.querySelector('.deck-wheel')!.getBoundingClientRect();
            const on = document.querySelector('.deck-row.on')!.getBoundingClientRect();
            return on.top >= wheelBox.top - 1 && on.bottom <= wheelBox.bottom + 1;
          }),
        )
        .toBe(true);
    });
  }
});
