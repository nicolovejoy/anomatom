// The upright phone's deck on top (docs/plans/v6-6-deck-on-top-four-jugglers.md, rulings 1 to 13):
// under the top bar the wheel is a card with the filter chips, always shown, three rows at rest
// (compact), grown in place while it is turned and DECK.returnMs (3 s) after the last finger
// lifts compact again; beside it Play, mute and the volume; the ladder strip stays at the stage's
// foot, the juggler gives way. The touch rules of v6.4 and v6.5 hold on it (issues 114, 116, 118,
// 119). Issue 79 (the docked wheel's band one row off a typed 97531) is checked where it was
// found, 1280×800, on the docked menu of v6.2. Headless; screenshots go to the scratchpad when
// E2E_SHOTS names a directory, else nowhere.
import { expect, openTab, test, type Page } from './fixtures';
import { DECK } from '../src/tunables';

/**
 * The return delay (DECK.returnMs, 3 s since v6.5 ruling 11), and a hold that outlasts it: a
 * settle (DECK.settleMs), then the return delay, and a margin, as in phone-chip-turning.
 */
const RETURN = DECK.returnMs;
const PAST_RETURN = DECK.settleMs + RETURN + 500;
/** The compact drum's height: three rows less any cut at both edges (DECK.compactRows, compactCut: 0 since v6.6's revised ruling 4). */
const COMPACT_PX = Math.round(DECK.rowPx * (DECK.compactRows - 2 * DECK.compactCut));
/** The grown drum where the juggler keeps its room: seven rows (DECK.wheelRows). */
const GROWN_PX = DECK.rowPx * DECK.wheelRows;

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const phase = (page: Page) => page.locator('.deck-wheel').getAttribute('data-phase');
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
/** The rows the drum shows, from its height. */
const shownRows = async (page: Page) => Math.round((await box(page, '.deck-wheel')).height / DECK.rowPx);
const noPageScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight);

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
/** When the wheel went compact: the first stamp in `compact`. */
const compactIn = (log: Stamp[]) => log.find((p) => p.phase === 'compact');
/** When a press grew it: the first stamp in `grown`. */
const grownIn = (log: Stamp[]) => log.find((p) => p.phase === 'grown');

/**
 * The compact card (v6.6 rulings 2 to 4): under the top bar, the chips over three rows, never
 * hidden; the strip at the stage's foot above the sound row; Play in view.
 */
async function expectCompact(page: Page) {
  const wheel = page.locator('.deck-wheel');
  await expect(wheel).toHaveAttribute('data-phase', 'compact', { timeout: RETURN + 2000 });
  await expect(wheel).toBeVisible();
  await expect(page.locator('.deck-filters')).toBeVisible();
  await expect.poll(async () => Math.round((await box(page, '.deck-wheel')).height)).toBe(COMPACT_PX);
  const card = await box(page, '.deck-picker');
  const top = await box(page, '.topbar');
  expect(Math.abs(card.y - (top.y + top.height + DECK.cardMarginPx))).toBeLessThanOrEqual(1);
  const strip = await box(page, '.region-ladder');
  expect(strip.y + strip.height).toBeLessThanOrEqual((await box(page, '.deck-sound')).y + 1);
  await expect(page.locator('.region-ladder')).toBeInViewport();
  await expect(page.locator('#play')).toBeInViewport();
}

/**
 * A touch on the list, made in the page: `fingers` is how many stay down on the list after it,
 * and `away` how many stay down on a filter chip (TouchEvent's `touches`, each with its target:
 * issue 119). WebKit on a laptop has no TouchEvent constructor, so the list is set on an Event.
 * `on: 'chip'` sends the event to the chip instead of the list. Returns when it was sent, in the
 * page's clock.
 */
const list = (page: Page) => page.locator('.deck-wheel-list');
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
/** A turn by the mouse wheel, until it has stopped (settling, the return timer running). */
const turnAndStop = async (page: Page) => {
  const phases = await stampPhases(page);
  await list(page).hover();
  await page.mouse.wheel(0, 64);
  await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
};
/** A drag of `rows` rows under a finger that stays down (a row, DECK.rowPx, a step: the list snaps to rows). */
const drag = async (page: Page, rows: number) => {
  for (let i = 0; i < rows; i += 1) {
    await list(page).evaluate((l, px) => (l.scrollTop += px), DECK.rowPx);
    await page.waitForTimeout(30);
  }
};
/** A press and lift that turns nothing: the card grows DECK.growGraceMs after the lift. Returns the lift's time. */
const pressAndLift = async (page: Page) => {
  await touch(page, 'touchstart', 1);
  await page.waitForTimeout(100);
  const lifted = await touch(page, 'touchend', 0);
  await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'grown');
  return lifted;
};
/** The band's row number, and its notation. */
const bandRow = async (page: Page) => Number(await page.locator('.deck-row.in-band').getAttribute('data-row'));
const bandCode = (page: Page) => page.locator('.deck-row.in-band code').textContent();
/** The pattern on stage: the hidden pattern button's notation still names it. */
const onStage = (page: Page) => page.locator('.deck-notation');

test.describe('phone upright, 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('at rest: the card under the top bar, chips over three rows, Play mute and the slider beside it, nothing else; the juggler between card and strip', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    // The band row is the card on stage, and names it: notation, name, meta (ruling 9).
    const band = page.locator('.deck-row.in-band');
    await expect(band).toHaveAttribute('data-id', 'cascade');
    await expect(band.locator('code')).toHaveText('3');
    await expect(band).toContainText('Cascade');
    await expect(band.locator('.deck-band-meta')).toHaveText('3 balls');
    await expect(band.locator('em')).toBeHidden();
    // The side column: Play, mute, the slider, and nothing else that shows (ruling 1).
    const side = page.locator('.deck-bar');
    await expect(side.locator('#play')).toBeVisible();
    await expect(side.locator('#mute')).toBeVisible();
    await expect(side.locator('#volume')).toBeVisible();
    for (const hidden of ['.deck-prev', '.deck-next', '.deck-pattern', '.deck-keys']) await expect(page.locator(hidden)).toBeHidden();
    const visible = await side.evaluate((s) => [...s.querySelectorAll('button, input, select, a')].filter((e) => (e as HTMLElement).offsetParent !== null).map((e) => e.id));
    expect(visible).toEqual(['play', 'mute', 'volume']);
    const card = await box(page, '.deck-picker');
    const play = await box(page, '#play');
    expect(play.width).toBe(DECK.sidePlayPx);
    expect(play.height).toBe(DECK.sidePlayPx);
    expect(play.x).toBeGreaterThanOrEqual(card.x + card.width);
    expect(Math.abs(card.x - DECK.cardMarginPx)).toBeLessThanOrEqual(1);
    expect(Math.abs((await box(page, '.deck-bar')).width - DECK.sideColumnPx)).toBeLessThanOrEqual(1);
    // The juggler between the band and the strip, the strip above the sound row; nothing scrolls.
    const juggler = await box(page, '.region-juggler');
    const strip = await box(page, '.region-ladder');
    expect(juggler.y).toBeGreaterThanOrEqual(card.y + card.height);
    expect(juggler.y + juggler.height).toBeLessThanOrEqual(strip.y + 1);
    expect(juggler.height).toBeGreaterThanOrEqual(DECK.minFigurePx);
    expect(await noPageScroll(page)).toBe(true);
    await shot(page, 'upright-rest');
  });

  test('a first visit (bare address): the compact card, Play reads Play, and still so 4 s later with nothing playing', async ({ page }) => {
    await page.goto('/');
    await expectCompact(page);
    const phases = await stampPhases(page);
    await expect(page.locator('#play')).toHaveText('Play');
    await page.waitForTimeout(4000);
    expect(await phase(page)).toBe('compact');
    expect(await phases()).toEqual([]);
    await expect(page.locator('#play')).toHaveText('Play');
    await expect(page.locator('#app')).toHaveAttribute('data-events-scheduled', '0');
  });

  test('a turn grows the card in place: same top and width, seven rows, Play and the strip unmoved, the juggler shorter; compact again 3 s after it stops', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    const card = await box(page, '.deck-picker');
    const play = await box(page, '#play');
    const strip = await box(page, '.region-ladder');
    const rest = (await box(page, '.region-juggler')).height;
    const phases = await stampPhases(page);
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).not.toBe('compact');
    await expect.poll(() => shownRows(page)).toBe(DECK.wheelRows);
    const grown = await box(page, '.deck-picker');
    expect(grown.y).toBe(card.y);
    expect(grown.x).toBe(card.x);
    expect(grown.width).toBe(card.width);
    expect(grown.height - card.height).toBe(GROWN_PX - COMPACT_PX);
    await expect(page.locator('.deck-filters')).toBeVisible();
    expect(await box(page, '#play')).toEqual(play);
    expect(await box(page, '.region-ladder')).toEqual(strip);
    expect((await box(page, '.region-juggler')).height).toBeLessThan(rest);
    expect(await noPageScroll(page)).toBe(true);
    await shot(page, 'upright-grown-turning');
    // It stops, loads the band's row, and goes compact the return delay after (timed in the page).
    await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
    await expect(onStage(page)).not.toHaveText('3');
    await expect(onStage(page)).toHaveText((await bandCode(page))!);
    await expectCompact(page);
    const log = await phases();
    expect(compactIn(log)!.at - stopsIn(log)[0]!.at).toBeGreaterThanOrEqual(RETURN - 20);
    expect(log.some((p) => p.hidden)).toBe(false);
    await expect.poll(async () => Math.abs((await box(page, '.region-juggler')).height - rest)).toBeLessThanOrEqual(1);
    expect(await box(page, '.region-ladder')).toEqual(strip);
  });

  test('a drag begun on the compact card settles on the row it was turned to', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    const from = await bandRow(page);
    await touch(page, 'touchstart', 1);
    await drag(page, 3);
    await touch(page, 'touchend', 0);
    await expect.poll(() => phase(page)).toBe('settling');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from + 3));
    await expect(onStage(page)).toHaveText((await bandCode(page))!);
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from + 3));
  });

  test('a press and lift grows it after the grace, and it goes compact 3 s after the lift', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    const band = await bandRow(page);
    const phases = await stampPhases(page);
    const lifted = await pressAndLift(page);
    expect(await shownRows(page)).toBe(DECK.wheelRows);
    await expect(page.locator('.deck-filters')).toBeVisible();
    await shot(page, 'upright-grown-pressed');
    // The band stays on its row through both changes of size, and nothing loads.
    expect(await bandRow(page)).toBe(band);
    await expectCompact(page);
    const log = await phases();
    expect(grownIn(log)!.at - lifted).toBeGreaterThanOrEqual(DECK.growGraceMs - 20);
    expect(compactIn(log)!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
    expect(compactIn(log)!.at - lifted).toBeLessThan(RETURN + 1000);
    expect(await bandRow(page)).toBe(band);
    await expect(onStage(page)).toHaveText('3');
  });

  // Review of #120, finding 1: a tap held past the turn's lapse grew the drum before the tap's
  // click, which then landed on another row. The grow waits DECK.growGraceMs; the click cancels it.
  test('a slow tap (400 ms) on the band row, by touch events and a click hit-tested where the finger was: that row plays; still compact', async ({ page }) => {
    await page.goto('/#51');
    await expectCompact(page);
    await quiet(page);
    const phases = await stampPhases(page);
    // Stop first, so the tap is what plays it.
    const band = page.locator('.deck-row.in-band');
    const row = await band.getAttribute('data-row');
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
    await expect(onStage(page)).toHaveText('51');
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.waitForTimeout(800);
    await expectCompact(page);
    expect((await phases()).some((p) => p.phase === 'grown' || p.phase === 'spinning')).toBe(false);
  });

  test('a slow tap (400 ms) on the band row, by real touch events: that row plays; still compact', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch events are Chromium only');
    await page.goto('/#51');
    await expectCompact(page);
    await quiet(page);
    const b = await box(page, '.deck-row.in-band');
    const cdp = await page.context().newCDPSession(page);
    const at = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at] });
    await page.waitForTimeout(400);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(onStage(page)).toHaveText('51');
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.waitForTimeout(800);
    await expectCompact(page);
  });

  test("a tap (Playwright's) on the band row plays it; still compact", async ({ page }) => {
    await page.goto('/#441');
    await expectCompact(page);
    await quiet(page);
    await page.locator('.deck-row.in-band').tap();
    await expect(onStage(page)).toHaveText('441');
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.waitForTimeout(800);
    await expectCompact(page);
  });

  test('a tap on a row of the grown card plays it, and the card is compact at once', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    await pressAndLift(page);
    const next = page.locator(`.deck-row[data-row="${(await bandRow(page)) + 2}"]`);
    const code = await next.locator('code').textContent();
    await next.tap();
    await expect(onStage(page)).toHaveText(code!);
    await expect(page.locator('#play')).toHaveText('Pause');
    expect(await phase(page)).toBe('compact');
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band code')).toHaveText(code!);
  });

  // Issue 116: while any finger is on the list the card never shrinks; it goes compact the return
  // delay after the last finger lifts.
  test('issue 116: two fingers down, one lifts: grown while the other is held, compact 3 s after it lifts', async ({ page }) => {
    await page.goto('/#3');
    await turnAndStop(page);
    await touch(page, 'touchstart', 1);
    await touch(page, 'touchstart', 2);
    await page.waitForTimeout(500);
    await touch(page, 'touchend', 1);
    await page.waitForTimeout(PAST_RETURN);
    expect(await phase(page)).toBe('settling');
    expect(await shownRows(page)).toBe(DECK.wheelRows);
    const phases = await stampPhases(page);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('issue 116: a drag on the compact card, then the finger held still: grown while held, compact 3 s after it lifts', async ({ page }) => {
    await page.goto('/#3');
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
    expect(await shownRows(page)).toBe(DECK.wheelRows);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  // Issue 119: a finger held on a chip counted as one on the list.
  test('issue 119: a finger on the list and one on a chip; the list finger lifts, then the chip finger: compact 3 s later', async ({ page }) => {
    await page.goto('/#3');
    await turnAndStop(page);
    await touch(page, 'touchstart', 1);
    await touch(page, 'touchstart', 1, 1, 'chip');
    await page.waitForTimeout(500);
    const phases = await stampPhases(page);
    const lifted = await touch(page, 'touchend', 0, 1);
    await touch(page, 'touchend', 0, 0, 'chip');
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('a press held on the grown card keeps it grown; compact 3 s after the lift', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await pressAndLift(page);
    await touch(page, 'touchstart', 1);
    await page.waitForTimeout(PAST_RETURN);
    expect(await phase(page)).toBe('grown');
    const phases = await stampPhases(page);
    const lifted = await touch(page, 'touchend', 0);
    await expectCompact(page);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  // Issue 114: a wheel or a touch that scrolls nothing began a turn that never ended.
  test('issue 114: a sideways wheel while the card settles: it still goes compact', async ({ page }) => {
    await page.goto('/#3');
    await turnAndStop(page);
    await list(page).evaluate((l) => l.dispatchEvent(new WheelEvent('wheel', { deltaX: 40, bubbles: true })));
    await expectCompact(page);
  });

  test('issue 114: the mouse wheel kept turning past the end of the list: it settles and goes compact', async ({ page }) => {
    await page.goto('/#3');
    await list(page).hover();
    for (let i = 0; i < 12; i += 1) {
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(40);
    }
    await expect.poll(() => phase(page)).toBe('settling');
    await expectCompact(page);
    await expect(page.locator('.deck-own')).toHaveClass(/in-band/);
  });

  // Issue 118: a scroll that resumed under a held finger moved the band but was not a turn.
  test('issue 118: a drag, held still, then dragged on: the stage plays the row the band lands on', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    const start = await bandRow(page);
    await touch(page, 'touchstart', 1);
    await drag(page, 2);
    await expect.poll(() => phase(page)).toBe('settling');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(start + 2));
    await expect(onStage(page)).toHaveText((await bandCode(page))!);
    await page.waitForTimeout(500);
    await drag(page, 2);
    await touch(page, 'touchend', 0);
    await expectCompact(page);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(start + 4));
    await expect(onStage(page)).toHaveText((await bandCode(page))!);
  });

  test('a turn during the settle delay keeps the card grown; compact 3 s after the second stop', async ({ page }) => {
    await page.goto('/#3');
    const phases = await stampPhases(page);
    const stops = async () => stopsIn(await phases());
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(1);
    const first = (await stops())[0]!.at;
    await page.waitForFunction((t) => performance.now() >= t, first + 700);
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(async () => (await stops()).length).toBe(2);
    const second = (await stops())[1]!.at;
    await expectCompact(page);
    const shut = compactIn(await phases())!.at;
    expect(shut - first).toBeGreaterThan(RETURN + 700);
    expect(shut - second).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('Play, mute and the slider leave a grown card grown and a compact one compact', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.locator('#mute').click();
    await page.locator('#volume').fill('0.3');
    expect(await phase(page)).toBe('compact');
    await pressAndLift(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Play');
    await page.locator('#mute').click();
    await page.locator('#volume').fill('0.6');
    expect(await phase(page)).toBe('grown');
  });

  test('← and → step the band; PageDown on the band row grows the card and turns it seven rows', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.keyboard.press('ArrowRight');
    await expect(onStage(page)).toHaveText('51');
    await expect(page.locator('.deck-row.in-band code')).toHaveText('51');
    await page.keyboard.press('ArrowLeft');
    await expect(onStage(page)).toHaveText('3');
    await expect(page.locator('.deck-row.in-band code')).toHaveText('3');
    expect(await phase(page)).toBe('compact');
    const from = await bandRow(page);
    await page.locator('.deck-row.in-band').focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => phase(page)).not.toBe('compact');
    expect(await shownRows(page)).toBe(DECK.wheelRows);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from + DECK.wheelRows));
  });

  // v6.4 ruling 7: the focused row keeps its focus through every grow and shrink.
  test('keys turn the card; when it goes compact the focused row keeps its focus', async ({ page }) => {
    await page.goto('/#3');
    await page.locator('.deck-row[data-row="0"]').focus();
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => phase(page)).not.toBe('compact');
    await expectCompact(page);
    await expect(page.locator('.deck-row[data-row="1"]')).toBeFocused();
    await expect(page.locator('.deck-row[tabindex="0"]')).toHaveCount(1);
  });

  test('ruling 10: Tab from About reaches the wheel first, then the chips, Play, mute, the slider, Listen for, Details', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.locator('.about-link').focus();
    // The chips the deck has (stream B brings a sixth): counted, not pinned.
    const chips = await page.locator('.deck-filter').count();
    const expected = ['row', ...Array<string>(chips).fill('chip'), 'play', 'mute', 'volume', 'deck-listen', 'deck-details'];
    const order: string[] = [];
    for (let i = 0; i < expected.length; i += 1) {
      await page.keyboard.press('Tab');
      order.push(
        await page.evaluate(() => {
          const e = document.activeElement as HTMLElement;
          return e.classList.contains('deck-row') ? 'row' : e.classList.contains('deck-filter') ? 'chip' : e.id || e.className;
        }),
      );
    }
    expect(order).toEqual(expected);
    await expect(page.locator('.deck-row[aria-current="true"]')).toHaveClass(/in-band/);
  });

  for (const how of ['escape', 'stage'] as const) {
    test(`${how === 'escape' ? 'Escape' : 'a tap on the stage'} makes a grown card compact, and changes nothing on a compact one`, async ({ page }) => {
      await page.goto('/#3');
      await expectCompact(page);
      const act = async () => {
        if (how === 'escape') await page.keyboard.press('Escape');
        else await page.locator('.region-juggler').click({ position: { x: 20, y: 20 } });
      };
      const phases = await stampPhases(page);
      await act();
      await page.waitForTimeout(300);
      expect(await phases()).toEqual([]);
      await pressAndLift(page);
      await act();
      expect(await phase(page)).toBe('compact');
      await expectCompact(page);
    });
  }

  test('Details: the Sound tab, the card compact, Play visible', async ({ page }) => {
    await page.goto('/#3');
    await pressAndLift(page);
    await page.locator('.deck-details').click();
    await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
    expect(await phase(page)).toBe('compact');
    await expect(page.locator('#play')).toBeInViewport();
  });

  test('Make your own: the Pattern tab, the band on Make your own, which shows the typed pattern as the deck label', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.locator('.deck-own').click();
    await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
    expect(await phase(page)).toBe('compact');
    await expect(page.locator('.deck-own')).toHaveClass(/in-band/);
    const input = page.locator('#hand-0');
    await input.fill('');
    await input.pressSequentially('5551');
    const own = page.locator('.deck-own');
    await expect(own).toHaveClass(/is-yours/);
    await expect(own.locator('.deck-own-code')).toHaveText('5551');
    await expect(own.locator('.deck-own-yours')).toHaveText('Your pattern');
    await expect(own.locator('.deck-own-make')).toBeHidden();
    await expect(own.locator('.deck-band-meta')).toHaveText('4 balls');
    await expect(own).toHaveClass(/in-band/);
    // Not juggleable: the invalid colour, as the pattern button showed it.
    await input.fill('');
    await input.pressSequentially('54');
    await expect(own).toHaveClass(/invalid/);
    await expect(own.locator('.deck-own-code')).toHaveText('54');
    // A tap on it still opens the Pattern tab.
    await page.locator('#tab-rhythm').click();
    await own.click();
    await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
  });

  test('the sheet open: Play, the band row and the tabs in view, no page scroll; a turn grows the card and the sheet gives the room', async ({ page }) => {
    await page.goto('/#3');
    await page.locator('.deck-details').click();
    await expectSheetOpen(page);
    await shot(page, 'upright-sheet-open');
    await list(page).hover();
    await page.mouse.wheel(0, 64);
    await expect.poll(() => phase(page)).not.toBe('compact');
    await expect.poll(() => shownRows(page)).toBeGreaterThan(DECK.compactRows);
    await expectSheetOpen(page);
  });

  // Review of #120, finding 2, with v6.6 ruling 11: on its side the wheel is the column's open
  // wheel; upright again, the compact card.
  test('turned on its side the compact card becomes the open wheel in the column; turned upright, compact again', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
    await expect(page.locator('.deck-wheel')).toBeVisible();
    await expect(page.locator('.deck-picker')).not.toHaveClass(/is-compact/);
    await expect(page.locator('.deck-pattern')).toBeVisible();
    await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-expanded', 'true');
    await page.setViewportSize({ width: 390, height: 844 });
    await expectCompact(page);
    await expect(page.locator('.deck-pattern')).toBeHidden();
  });

  test('issue 82: Swap is in view under the input, above the pad, with the page not scrolled', async ({ page }) => {
    await page.goto('/');
    await page.locator('.deck-own').click();
    await openTab(page, 'pattern');
    const input = page.locator('#hand-0');
    await input.fill('');
    const key = (k: string) => page.locator(`.digit-pad [data-key="${k}"]`);
    for (const k of ['(', '4', ',', '2', 'x', ')', '(', '2', 'x', ',', '4', ')']) await key(k).click();
    await expect(input).toHaveValue('(4,2x)(2x,4)');
    // With the deck on top (v6.6 ruling 7) the open sheet has less height: its panels scroll to
    // reach the pad's last row, which the keys above did. Back at their top, as a reader opens them.
    await page.locator('.sheet-panels').evaluate((p) => (p.scrollTop = 0));

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

/**
 * Ruling 3: the chips on one line inside the card, whatever chips the deck has (stream B brings a
 * sixth): the row's content not wider than the row, every chip's box inside the card, each
 * DECK.cardChipPx square.
 */
async function expectChipsFit(page: Page) {
  await expect(page.locator('.deck-filters')).toBeVisible();
  const fit = await page.evaluate(() => {
    const row = document.querySelector('.deck-filters') as HTMLElement;
    const card = document.querySelector('.deck-picker')!.getBoundingClientRect();
    const chips = [...row.querySelectorAll('.deck-filter')].map((c) => c.getBoundingClientRect());
    return {
      overflow: row.scrollWidth > row.clientWidth,
      inside: chips.every((c) => c.left >= card.left && c.right <= card.right && c.top >= card.top),
      oneLine: chips.every((c) => Math.abs(c.top - chips[0]!.top) < 1),
      sizes: [...new Set(chips.map((c) => `${Math.round(c.width)}x${Math.round(c.height)}`))],
    };
  });
  expect(fit).toEqual({ overflow: false, inside: true, oneLine: true, sizes: [`${DECK.cardChipPx}x${DECK.cardChipPx}`] });
}

/** Ruling 7: the sheet open shares the play view with the band; Play, the band row and the tabs in view, nothing scrolls. */
async function expectSheetOpen(page: Page) {
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#play')).toBeInViewport({ ratio: 1 });
  await expect(page.locator('.deck-row.in-band')).toBeInViewport({ ratio: 1 });
  for (const tab of ['pattern', 'rhythm', 'sound']) await expect(page.locator(`#tab-${tab}`)).toBeInViewport({ ratio: 1 });
  expect(await noPageScroll(page)).toBe(true);
}

/**
 * Ruling 5: on a shorter phone the grown card shows only as many rows as leave the juggler
 * DECK.minFigurePx; the chips and the compact rows never give way; the strip stays put. The
 * stubbed sample CDN leaves the sound's status row showing under the sound row, so these sizes
 * are a little tighter than a reader's.
 */
for (const size of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
  { width: 360, height: 640 },
]) {
  test.describe(`phone upright at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    test('compact and grown: the juggler keeps its room above the strip, the strip unmoved and on screen', async ({ page }, info) => {
      await page.goto('/#3');
      await expectCompact(page);
      const strip = await box(page, '.region-ladder');
      expect((await box(page, '.region-juggler')).height).toBeGreaterThanOrEqual(DECK.minFigurePx);
      await shot(page, `upright-${size.width}-${info.project.name}-rest`);
      await pressAndLift(page);
      expect((await box(page, '.region-juggler')).height).toBeGreaterThanOrEqual(DECK.minFigurePx);
      const rows = await shownRows(page);
      expect(rows).toBeGreaterThanOrEqual(DECK.compactRows);
      if (size.height < 844) expect(rows).toBeLessThan(DECK.wheelRows);
      else expect(rows).toBe(DECK.wheelRows);
      expect(await box(page, '.region-ladder')).toEqual(strip);
      await expect(page.locator('.region-ladder')).toBeInViewport({ ratio: 1 });
      await expect(page.locator('.deck-sound')).toBeInViewport({ ratio: 1 });
      expect(await noPageScroll(page)).toBe(true);
      await shot(page, `upright-${size.width}-${info.project.name}-grown`);
    });

    test('the chips: one line inside the card', async ({ page }) => {
      await page.goto('/#3');
      await expectChipsFit(page);
    });

    test('the sheet open: Play, the band row and the tabs in view, no page scroll', async ({ page }, info) => {
      await page.goto('/#3');
      await page.locator('.deck-details').click();
      await expectSheetOpen(page);
      await shot(page, `upright-${size.width}-${info.project.name}-sheet`);
    });
  });
}

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
