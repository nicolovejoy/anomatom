// v5 stream B2 (docs/plans/v5-sound-model.md, ruling 9; issues 79 and 82). At 390×844 the pattern
// wheel takes the whole sheet while it turns, and 3 s after it settles (DECK.returnMs) the controls
// return and the wheel shrinks to three rows (docs/plans/v6-4-wheel-shrinks.md), directly above
// the ladder strip, the strip and the deck under it (docs/plans/v6-5-audio-session-wheel-place.md);
// Swap is in view under the input, above the digit pad. Issue 79 (the docked wheel's band one
// row off a typed 97531) is checked where it was found, 1280×800, on the docked menu of v6.2
// (docs/plans/v6-2-wheel-ends.md, ruling 3). Headless; screenshots go to
// the scratchpad when E2E_SHOTS names a directory, else nowhere.
import { expect, openTab, test, type Page } from './fixtures';
import { DECK } from '../src/tunables';

/** The return delay (DECK.returnMs, 3 s since v6.5 ruling 11), and a hold that outlasts it. */
const RETURN = DECK.returnMs;
const PAST_RETURN = RETURN + 500;

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');

type Stamp = { at: number; phase: string | null; hidden: boolean };
/**
 * Stamps each phase the wheel enters, and when it hides, as it happens in the page (issues 106,
 * 109): a poll notices a phase up to half a second late on a slow runner, so a delay timed from
 * the poll comes out short. Returns a reader for the stamps.
 */
async function stampPhases(page: Page) {
  await page.locator('.deck-wheel').evaluate((w) => {
    const log: Stamp[] = [];
    (window as unknown as { phases: typeof log }).phases = log;
    new MutationObserver(() => log.push({ at: performance.now(), phase: w.getAttribute('data-phase'), hidden: (w as HTMLElement).hidden })).observe(w, {
      attributes: true,
      attributeFilter: ['data-phase', 'hidden'],
    });
  });
  return () => page.evaluate(() => (window as unknown as { phases: Stamp[] }).phases);
}
/** When the wheel stopped: each stamp that enters `settling`. */
const stopsIn = (log: Stamp[]) => log.filter((p, i, all) => p.phase === 'settling' && all[i - 1]?.phase !== 'settling');
/** When the wheel went compact (v6.4 ruling 1): the first stamp in `compact`. */
const compactIn = (log: Stamp[]) => log.find((p) => p.phase === 'compact');

/**
 * The compact wheel (v6.4 rulings 1 and 2): shown, three rows, no chips, directly above the
 * ladder strip (v6.5 ruling 9), the strip, Play and the deck under it.
 */
async function expectCompact(page: Page) {
  const wheel = page.locator('.deck-wheel');
  await expect(wheel).toHaveAttribute('data-phase', 'compact', { timeout: RETURN + 2000 });
  await expect(wheel).toBeVisible();
  await expect(page.locator('.deck-filters')).toBeHidden();
  await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-expanded', 'true');
  const w = (await wheel.boundingBox())!;
  // Three rows less a quarter row cut at each edge (DECK.compactRows, compactCut).
  expect(Math.round(w.height)).toBe(80);
  const strip = page.locator('.region-ladder');
  const s = (await strip.boundingBox())!;
  const bar = (await page.locator('.deck-bar').boundingBox())!;
  expect(w.y + w.height).toBeLessThanOrEqual(s.y + 1);
  expect(s.y + s.height).toBeLessThanOrEqual(bar.y + 1);
  await expect(strip).toBeInViewport();
  await expect(page.locator('#play')).toBeInViewport();
  await expect(page.locator('.deck-sound')).toBeInViewport();
}

test.describe('phone, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  const list = (page: Page) => page.locator('.deck-wheel-list');
  /** A turn of the open wheel by the mouse wheel, until it has stopped (settling, the return timer running). */
  const turnAndStop = async (page: Page) => {
    const phases = await stampPhases(page);
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
  };
  /**
   * A touch on the list, made in the page: `fingers` is how many stay down on the list after it,
   * and `away` how many stay down on a filter chip (TouchEvent's `touches`, each with its target:
   * issue 119). WebKit on a laptop has no TouchEvent constructor, so the list is set on an Event.
   * `on: 'chip'` sends the event to the chip instead of the list. Returns when it was sent, in the
   * page's clock.
   */
  const touch = (page: Page, type: 'touchstart' | 'touchend', fingers: number, away = 0, on: 'list' | 'chip' = 'list') =>
    list(page).evaluate(
      (l, [type, fingers, away, on]) => {
        const chip = document.querySelector('.deck-filter')!;
        const e = new Event(type as string, { bubbles: true });
        const touches = [
          ...Array.from({ length: fingers as number }, () => ({ target: l })),
          ...Array.from({ length: away as number }, () => ({ target: chip })),
        ];
        Object.defineProperty(e, 'touches', { value: touches });
        (on === 'chip' ? chip : l).dispatchEvent(e);
        return performance.now();
      },
      [type, fingers, away, on] as const,
    );
  /** Waits until the list has not scrolled for a while: the scroll that brings the loaded row to the band on load is over. */
  const quiet = (page: Page) =>
    list(page).evaluate(
      (l) =>
        new Promise<void>((done) => {
          let t: ReturnType<typeof setTimeout> | undefined;
          const again = () => {
            clearTimeout(t);
            t = setTimeout(() => (l.removeEventListener('scroll', again), done()), 400);
          };
          l.addEventListener('scroll', again);
          again();
        }),
    );


  // The wheel moves to the sheet on the first scroll of a turn, not on the touch: the row under the
  // finger must still be there when the tap's click fires.
  test('a tap on a row of the open wheel at rest picks it', async ({ page }) => {
    await page.goto('/');
    const row = page.locator('.deck-row[data-id="shower"]');
    await expect(row).toBeInViewport();
    await row.tap();
    await expect(page.locator('.deck-notation')).toHaveText('51');
    // It plays, and the wheel shrinks rather than closing (v6.4 ruling 4).
    await expect(page.locator('#play')).toHaveText('Pause');
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'shower');
  });

  test('the wheel takes the sheet while it turns; 3 s after it settles the controls return and it is compact', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    const bar = page.locator('.deck-bar');
    await expect(wheel).toBeVisible();

    // At rest, a first visit's open wheel is over the stage, its foot on the strip's top (v6.5
    // ruling 9): the strip, Play and the deck show under it, the juggler wholly above it.
    const rest = (await wheel.boundingBox())!;
    const strip = (await page.locator('.region-ladder').boundingBox())!;
    expect(Math.abs(rest.y + rest.height - strip.y)).toBeLessThanOrEqual(1);
    expect(strip.y + strip.height).toBeLessThanOrEqual((await bar.boundingBox())!.y + 1);
    const figure = (await page.locator('.region-juggler').boundingBox())!;
    expect(figure.y + figure.height).toBeLessThanOrEqual((await page.locator('.deck-filters').boundingBox())!.y + 1);
    await expect(page.locator('#play')).toBeInViewport();
    await shot(page, 'wheel-rest-first-visit');

    const phases = await stampPhases(page);
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

    // Stopped, the wheel keeps the sheet for the settle delay (DECK.returnMs, 3 s), then gives it
    // back and shrinks (v6.4 ruling 1). Timed in the page, from when it stopped.
    await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
    await expectCompact(page);
    const log = await phases();
    expect(compactIn(log)!.at - stopsIn(log)[0]!.at).toBeGreaterThanOrEqual(RETURN - 20);
    expect(log.some((p) => p.hidden)).toBe(false);

    // The controls are back, showing the pattern the wheel settled on; the band is on its row.
    await expect(page.locator('.deck-notation')).not.toHaveText('3');
    const settled = await page.locator('.deck-notation').textContent();
    await expect(page.locator('.deck-row.in-band code')).toHaveText(settled!);
    // Three rows show: the band's in the middle, a row each side.
    const c = (await wheel.boundingBox())!;
    const band = (await page.locator('.deck-row.in-band').boundingBox())!;
    expect(Math.abs(band.y + band.height / 2 - (c.y + c.height / 2))).toBeLessThanOrEqual(2);
    // The juggler draws wholly above the compact wheel, taller than above the seven-row one.
    await expect.poll(async () => {
      const j = (await page.locator('.region-juggler').boundingBox())!;
      return j.y + j.height <= c.y + 1 && j.y + j.height > rest.y;
    }).toBe(true);
    await shot(page, 'wheel-settled');
  });

  // v6.4 ruling 3: a touch on the compact wheel that turns nothing (and taps no row) grows it back
  // to the open wheel at rest, seven rows and the chips, which stays; a turn of it takes the sheet
  // and it is compact again 3 s after it settles.
  test('v6.4: a touch on the compact wheel grows it back; a turn of it takes the sheet and shrinks it again', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const banded = await page.locator('.deck-row.in-band').getAttribute('data-row');
    // A press and lift, no scroll, no click.
    await touch(page, 'touchstart', 1);
    await page.waitForTimeout(100);
    await touch(page, 'touchend', 0);
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toHaveAttribute('data-phase', 'rest');
    await expect(page.locator('.deck-filters')).toBeVisible();
    await expect.poll(async () => Math.round((await wheel.boundingBox())!.height)).toBe(224);
    // The band stays on its row through both changes of size.
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', banded!);
    // It stays open at rest: no return timer runs.
    await page.waitForTimeout(PAST_RETURN);
    await expect(wheel).toHaveAttribute('data-phase', 'rest');
    await expect(wheel).toBeVisible();

    // Back to compact, then a turn on the compact wheel: it takes the sheet, settles, and is
    // compact again the return delay after it stopped.
    await turnAndStop(page);
    await expectCompact(page);
    const phases = await stampPhases(page);
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).toBe('spinning');
    const w = (await wheel.boundingBox())!;
    expect(w.y + w.height).toBeGreaterThanOrEqual(844 - 1);
    await expect(page.locator('.deck-filters')).toBeVisible();
    await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
    await expectCompact(page);
    const log = await phases();
    expect(compactIn(log)!.at - stopsIn(log)[0]!.at).toBeGreaterThanOrEqual(RETURN - 20);
    const settled = await page.locator('.deck-notation').textContent();
    await expect(page.locator('.deck-row.in-band code')).toHaveText(settled!);
  });

  // v6.4 ruling 4: a row tapped on the compact wheel plays it and leaves the wheel compact.
  test('v6.4: a tap on a row of the compact wheel plays it; the wheel stays compact', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const band = Number(await page.locator('.deck-row.in-band').getAttribute('data-row'));
    // The row under the band, its upper three quarters in view.
    const next = page.locator(`.deck-row[data-row="${band + 1}"]`);
    const code = await next.locator('code').textContent();
    const w = (await page.locator('.deck-wheel').boundingBox())!;
    await page.touchscreen.tap(w.x + w.width / 2, w.y + w.height - 10);
    await expect(page.locator('.deck-notation')).toHaveText(code!);
    await expect(page.locator('#play')).toHaveText('Pause');
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(band + 1));
    // Still compact well after: a tap arms no return timer and grows nothing.
    await page.waitForTimeout(PAST_RETURN);
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
  });

  // Review of #120, finding 1: a tap held past the turn's lapse (320 ms) grew the drum at touchend,
  // before the tap's click, which then landed on another row. The grow waits DECK.growGraceMs; the
  // click cancels it. In the page, the click comes right after the lift and is hit-tested where
  // the finger was, as a browser's is.
  test('v6.4: a slow tap (400 ms) on the compact band row plays that row; the wheel stays compact', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const phases = await stampPhases(page);
    const band = page.locator('.deck-row.in-band');
    const row = await band.getAttribute('data-row');
    const code = await band.locator('code').textContent();
    const b = (await band.boundingBox())!;
    await touch(page, 'touchstart', 1);
    await page.waitForTimeout(400);
    const clicked = await list(page).evaluate(
      (l, [x, y]) => {
        const e = new Event('touchend', { bubbles: true });
        Object.defineProperty(e, 'touches', { value: [] });
        l.dispatchEvent(e);
        const hit = document.elementFromPoint(x as number, y as number)?.closest<HTMLElement>('.deck-row');
        hit?.click();
        return hit?.dataset.row ?? null;
      },
      [b.x + b.width / 2, b.y + b.height / 2],
    );
    expect(clicked).toBe(row);
    await expect(page.locator('.deck-notation')).toHaveText(code!);
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.waitForTimeout(800);
    await expectCompact(page);
    expect((await phases()).some((p) => p.phase === 'rest')).toBe(false);
  });

  test('v6.4: a slow tap (400 ms) on the compact band row, by real touch events: that row plays', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch events are Chromium only');
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const band = page.locator('.deck-row.in-band');
    const code = await band.locator('code').textContent();
    const b = (await band.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(page.locator('.deck-notation')).toHaveText(code!);
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.waitForTimeout(800);
    await expectCompact(page);
  });

  test('v6.4: a long press (800 ms, no click) on the compact wheel grows it, the grace after the lift', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const phases = await stampPhases(page);
    await touch(page, 'touchstart', 1);
    await page.waitForTimeout(800);
    expect(await phase(page)).toBe('compact');
    const lifted = await touch(page, 'touchend', 0);
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
    await expect(page.locator('.deck-filters')).toBeVisible();
    const grown = (await phases()).find((p) => p.phase === 'rest')!.at;
    // DECK.growGraceMs, 350 ms.
    expect(grown - lifted).toBeGreaterThanOrEqual(350 - 20);
  });

  // Review of #120, finding 2: turned on its side, the compact wheel becomes the column's open wheel.
  test('v6.4: turned on its side, the compact wheel leaves compact', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
    await expect(page.locator('.deck-picker')).not.toHaveClass(/is-compact/);
    await expect(page.locator('.deck-filters')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
    await expect.poll(async () => Math.round((await page.locator('.deck-wheel').boundingBox())!.height)).toBe(224);
  });

  // v6.4 ruling 5, revised by the governor: a tap on the deck under the compact wheel (Play, ‹ ›,
  // mute, volume, Listen for) leaves it compact, and the band follows the pattern.
  test('v6.4: Play, › and mute under the compact wheel leave it compact; the band follows', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    await expectCompact(page);
    const before = await page.locator('.deck-notation').textContent();
    await page.locator('.deck-next').click();
    await expect(page.locator('.deck-notation')).not.toHaveText(before!);
    const now = await page.locator('.deck-notation').textContent();
    await expect(page.locator('.deck-row.in-band code')).toHaveText(now!);
    await expectCompact(page);
    await page.locator('#mute').click();
    await page.locator('#deck-listen').selectOption('height');
    await expectCompact(page);
    // Details still closes it.
    await page.locator('.deck-details').click();
    await expect(page.locator('.deck-wheel')).toBeHidden();
  });

  // Review of #120, finding 4: from the compact wheel PageDown pages by the full drum (DECK.wheelRows), not three.
  test('v6.4: PageDown on the compact wheel turns it seven rows', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    const from = Number(await page.locator('.deck-row.in-band').getAttribute('data-row'));
    await page.locator(`.deck-row[data-row="${from}"]`).focus();
    await page.keyboard.press('PageDown');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from + 7));
  });

  // v6.4 ruling 5: the pattern name, Escape, Details, Make your own and a tap elsewhere (the stage)
  // close the compact wheel fully; the pattern name opens it again at seven rows with the chips.
  for (const how of ['pattern', 'escape', 'details', 'outside', 'make-your-own'] as const) {
    test(`v6.4: ${how} closes the compact wheel`, async ({ page }) => {
      await page.goto('/');
      await turnAndStop(page);
      await expectCompact(page);
      if (how === 'pattern') await page.locator('.deck-pattern').click();
      if (how === 'escape') await page.keyboard.press('Escape');
      if (how === 'details') await page.locator('.deck-details').click();
      if (how === 'outside') await page.locator('.region-juggler').click({ position: { x: 20, y: 20 } });
      if (how === 'make-your-own') {
        await list(page).evaluate((l) => (l.scrollTop = l.scrollHeight));
        await expect(page.locator('.deck-own')).toHaveClass(/in-band/);
        await page.locator('.deck-own').click();
        await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
      }
      await expect(page.locator('.deck-wheel')).toBeHidden();
      expect(await phase(page)).toBe('rest');
      await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-expanded', 'false');
      if (how !== 'pattern') return;
      await page.locator('.deck-pattern').click();
      await expect(page.locator('.deck-filters')).toBeVisible();
      await expect.poll(async () => Math.round((await page.locator('.deck-wheel').boundingBox())!.height)).toBe(224);
    });
  }

  // v6.4 ruling 7: compact is still open, and keeps focus where it was.
  test('v6.4: keys turn the wheel; when it goes compact the focused row keeps its focus', async ({ page }) => {
    await page.goto('/');
    await page.locator('.deck-row[data-row="0"]').focus();
    await page.keyboard.press('ArrowDown');
    await expectCompact(page);
    await expect(page.locator('.deck-row[data-row="1"]')).toBeFocused();
    await expect(page.locator('.deck-row[tabindex="0"]')).toHaveCount(1);
  });

  // Timed in the page, from when the wheel stopped (issue 106): a poll notices `settling` up to
  // half a second late, and a second turn timed from then reached a slow runner (WebKit on CI) after
  // the first delay had closed the wheel.
  test('a turn during the settle delay keeps the wheel on the sheet', async ({ page }) => {
    await page.goto('/');
    const wheel = page.locator('.deck-wheel');
    const phases = await stampPhases(page);
    const stops = async () => stopsIn(await phases());
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(1);
    const first = (await stops())[0]!.at;
    // A second turn well inside the first delay (DECK.returnMs, 3 s): 0.7 s after the stop.
    await page.waitForFunction((t) => performance.now() >= t, first + 700);
    // The wheel moved to the sheet when the turn began: the pointer goes to it again.
    await page.locator('.deck-wheel-list').hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(2);
    const second = (await stops())[1]!.at;
    // The wheel kept the sheet through the first delay, and goes compact the delay after the second stop.
    await expectCompact(page);
    await expect(wheel).toBeVisible();
    const shut = compactIn(await phases())!.at;
    expect(shut - first).toBeGreaterThan(RETURN + 700);
    expect(shut - second).toBeGreaterThanOrEqual(RETURN - 20);
  });

  // Issue 114: a wheel or a touch that scrolls nothing (a sideways swipe, a wheel at the end of the
  // list, a finger lifted without a tap) began a turn that never ended, and the sheet stayed the
  // wheel's for good. The wheel goes compact (v6.4) as after the turn before it.
  test('issue 114: a sideways wheel while the wheel settles: it still goes compact', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await list(page).evaluate((l) => l.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, bubbles: true })));
    await expectCompact(page);
  });

  test('issue 114: a touch held and lifted without a tap while the wheel settles: on the sheet while held, compact after', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await touch(page, 'touchstart', 1);
    // Held past the return delay (DECK.returnMs, 3 s): the finger keeps the wheel on the sheet.
    await page.waitForTimeout(PAST_RETURN);
    await expect(page.locator('.deck-wheel')).toBeVisible();
    expect(await phase(page)).toBe('settling');
    await touch(page, 'touchend', 0);
    await expectCompact(page);
  });

  // Issue 116: while any finger is on the list the wheel never changes size; it goes compact
  // (v6.4) the return delay (DECK.returnMs, 3 s) after the last finger lifts.
  test('issue 116: two fingers down, one lifts: on the sheet while the other is held, compact after it lifts', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await touch(page, 'touchstart', 1);
    await touch(page, 'touchstart', 2);
    // Past the turn's lapse (two settles, 320 ms), one finger lifts; the other stays.
    await page.waitForTimeout(500);
    await touch(page, 'touchend', 1);
    await page.waitForTimeout(PAST_RETURN);
    await expect(page.locator('.deck-wheel')).toBeVisible();
    expect(await phase(page)).toBe('settling');
    const phases = await stampPhases(page);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('issue 116: a drag, then the finger held still: on the sheet while held, compact 3 s after it lifts', async ({ page }) => {
    await page.goto('/');
    await quiet(page);
    const phases = await stampPhases(page);
    // A drag: the finger lands, and the list scrolls under it a few rows.
    await touch(page, 'touchstart', 1);
    for (let i = 1; i <= 4; i += 1) {
      await list(page).evaluate((l, i) => (l.scrollTop += 16 * i), i);
      await page.waitForTimeout(30);
    }
    await expect.poll(() => phase(page)).not.toBe('rest');
    // Held still well past the settle (160 ms) and the return delay (3 s).
    await page.waitForTimeout(PAST_RETURN);
    await expect(page.locator('.deck-wheel')).toBeVisible();
    expect((await phases()).some((p) => p.hidden || p.phase === 'compact')).toBe(false);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  // Issue 118: the settle (160 ms still) ended the turn under a held finger, and a scroll that
  // resumed under it moved the band but was not counted as a turn, so its row never loaded.
  test('issue 118: a drag, held still, then dragged on: the stage plays the row the band lands on', async ({ page }) => {
    await page.goto('/');
    await quiet(page);
    const start = Number(await page.locator('.deck-row.in-band').getAttribute('data-row'));
    const drag = async () => {
      // A row (DECK.rowPx, 32 px) a step: the list snaps to rows, so a smaller step snaps back.
      for (let i = 0; i < 2; i += 1) {
        await list(page).evaluate((l) => (l.scrollTop += 32), undefined);
        await page.waitForTimeout(30);
      }
    };
    await touch(page, 'touchstart', 1);
    await drag();
    // Held still: the wheel settles under the finger and loads the row two down.
    await expect.poll(() => phase(page)).toBe('settling');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(start + 2));
    await expect(page.locator('.deck-notation')).toHaveText((await page.locator('.deck-row.in-band code').textContent())!);
    await page.waitForTimeout(500);
    // Dragged on two more rows under the same finger, then lifted.
    await drag();
    await touch(page, 'touchend', 0);
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(start + 4));
    await expect(page.locator('.deck-notation')).toHaveText((await page.locator('.deck-row.in-band code').textContent())!);
  });

  // Issue 119: a finger held on a chip counted as one on the list, so after the list's finger lifted
  // the wheel waited for a touchend on the list that never came, and stayed on the sheet.
  test('issue 119: a finger on the list and one on a chip; the list finger lifts, then the chip finger: compact 3 s later', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await touch(page, 'touchstart', 1);
    await touch(page, 'touchstart', 1, 1, 'chip');
    // Past the turn's lapse (two settles, 320 ms), the list's finger lifts; the chip's stays.
    await page.waitForTimeout(500);
    const phases = await stampPhases(page);
    const lifted = await touch(page, 'touchend', 0, 1);
    await touch(page, 'touchend', 0, 0, 'chip');
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  // v6.4 ruling 1 with issue 116: a turn of the compact wheel under a finger takes the sheet, and
  // the wheel does not shrink again while the finger is down.
  test('issue 116, v6.4: a drag on the compact wheel, then held: on the sheet while held, compact 3 s after it lifts', async ({ page }) => {
    await page.goto('/');
    await turnAndStop(page);
    await expectCompact(page);
    await quiet(page);
    const phases = await stampPhases(page);
    await touch(page, 'touchstart', 1);
    for (let i = 1; i <= 4; i += 1) {
      await list(page).evaluate((l, i) => (l.scrollTop += 16 * i), i);
      await page.waitForTimeout(30);
    }
    await expect.poll(() => phase(page)).not.toBe('compact');
    await page.waitForTimeout(PAST_RETURN);
    expect((await phases()).some((p) => p.phase === 'compact')).toBe(false);
    expect(Math.round((await page.locator('.deck-wheel').boundingBox())!.height)).toBeGreaterThan(80);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('issue 114: a wheel past the last row mid-turn: the wheel still settles and goes compact', async ({ page }) => {
    await page.goto('/');
    await quiet(page);
    // In the page: a turn to the end of the list, then, once its scroll (and any snap after it) is
    // over but before it settles (DECK.settleMs, 160 ms), a wheel that scrolls nothing more.
    await list(page).evaluate(
      (l) =>
        new Promise<void>((done) => {
          let quiet: ReturnType<typeof setTimeout> | undefined;
          const onScroll = () => {
            clearTimeout(quiet);
            quiet = setTimeout(() => {
              l.removeEventListener('scroll', onScroll);
              l.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
              done();
            }, 60);
          };
          l.addEventListener('scroll', onScroll);
          l.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true }));
          l.scrollTop = l.scrollHeight;
        }),
    );
    expect(await phase(page)).toBe('spinning');
    await expectCompact(page);
  });

  test('issue 114: the mouse wheel kept turning at the end of the list: it goes compact', async ({ page }) => {
    await page.goto('/');
    await list(page).hover();
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(40);
    }
    await expectCompact(page);
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
