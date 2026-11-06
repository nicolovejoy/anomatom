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
 * issue 119). Each finger has an identifier, kept while it is down, and the event names the
 * fingers it changed (`changedTouches`): the wheel knows its fingers by identifier (v6.7 ruling 3).
 * WebKit on a laptop has no TouchEvent constructor, so the lists are set on an Event. `on: 'chip'`
 * sends the event to the chip instead of the list. Returns when it was sent, in the page's clock.
 */
const list = (page: Page) => page.locator('.deck-wheel-list');
type Finger = { identifier: number; target: EventTarget };
type Fingers = { downTouches?: Finger[]; nextTouch?: number };
const touch = (page: Page, type: 'touchstart' | 'touchend', fingers: number, away = 0, on: 'list' | 'chip' = 'list') =>
  list(page).evaluate(
    (l, [type, fingers, away, on]) => {
      const chip = document.querySelector('.deck-filter')!;
      const w = window as unknown as Fingers;
      const before = w.downTouches ?? [];
      let next = w.nextTouch ?? 1;
      // The fingers down on `target` after this event: those already there, then new ones.
      const keep = (target: EventTarget, n: number) => {
        const there = before.filter((t) => t.target === target).slice(0, n);
        while (there.length < n) there.push({ identifier: next++, target });
        return there;
      };
      const down = [...keep(l, fingers as number), ...keep(chip, away as number)];
      w.downTouches = down;
      w.nextTouch = next;
      const changed = type === 'touchstart' ? down.filter((t) => !before.includes(t)) : before.filter((t) => !down.includes(t));
      const e = new Event(type as string, { bubbles: true });
      Object.defineProperty(e, 'touches', { value: down });
      Object.defineProperty(e, 'changedTouches', { value: changed });
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
        const w = window as unknown as Fingers;
        const e = new Event('touchend', { bubbles: true });
        Object.defineProperty(e, 'touches', { value: [] });
        Object.defineProperty(e, 'changedTouches', { value: w.downTouches ?? [] });
        w.downTouches = [];
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

  // Review of round 1: restOwn went stale after Make your own, and the band's return ran under a
  // live finger, where its scroll read as a turn and grew the card again (#116).
  test('after Make your own, a turn back to the card on stage, then a turn cancelled by Escape under a held finger: compact while held, the band home on the stage’s card when it lifts', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await page.locator('.deck-own').click();
    await expect(page.locator('.deck-own')).toHaveClass(/in-band/);
    // Make your own opened the sheet, where the card is its band row alone (v6.7 ruling 1): closed
    // again, the three rows this test turns.
    await page.keyboard.press('Escape');
    await expect(page.locator('#app')).not.toHaveClass(/sheet-open/);
    await expect(page.locator('.deck-own')).toHaveClass(/in-band/);
    await quiet(page);
    // Back to Cascade, the card on stage, by a drag; it settles there and loads nothing new.
    await touch(page, 'touchstart', 1);
    await list(page).evaluate((l) => (l.scrollTop = 0));
    await expect.poll(() => phase(page)).toBe('settling');
    await touch(page, 'touchend', 0);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '0');
    await expectCompact(page);
    await quiet(page);
    // A turn of two rows, and Escape before it settles, the finger still down.
    await touch(page, 'touchstart', 1);
    // The scroll and Escape in one task, before the settle (DECK.settleMs) can pick the row.
    await list(page).evaluate(
      (l, px) =>
        new Promise<void>((done) => {
          l.addEventListener('scroll', () => setTimeout(() => (document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), done()), 20), { once: true });
          l.scrollTop += px;
        }),
      2 * DECK.rowPx,
    );
    expect(await phase(page)).toBe('compact');
    await page.waitForTimeout(500);
    expect(await phase(page)).toBe('compact');
    await touch(page, 'touchend', 0);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '0');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('aria-current', 'true');
    await expect(onStage(page)).toHaveText('3');
    await page.waitForTimeout(800);
    expect(await phase(page)).toBe('compact');
  });

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
    await expect.poll(() => shownRows(page)).toBeGreaterThan(DECK.sheetRows);
    await expectSheetOpen(page, true);
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

/**
 * Ruling 7: the sheet open shares the play view with the band; Play, the band row and the tabs in
 * view, nothing scrolls. At rest (v6.7 ruling 1) the card is the chips and its band row alone
 * (DECK.sheetRows); `grown`, a turn has grown it.
 */
async function expectSheetOpen(page: Page, grown = false) {
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.deck-filters')).toBeVisible();
  if (!grown) {
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
    // The rows' height: the card's rule over the drum is outside the one row (deck.css).
    await expect.poll(async () => Math.round((await box(page, '.deck-wheel-list')).height)).toBe(DECK.rowPx * DECK.sheetRows);
  }
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

// ---------------------------------------------------------------------------------------------
// v6.7 (docs/plans/v6-7-wheel-loose-ends.md): the phone wheel's loose ends.
// ---------------------------------------------------------------------------------------------

/** The drum's height, rounded. */
const drumPx = async (page: Page) => Math.round((await box(page, '.deck-wheel')).height);
/** The list's blank slot before the first row (`before`) or after the last: its height and background. */
const slot = (page: Page, which: 'before' | 'after') =>
  list(page).evaluate((l, which) => {
    const c = getComputedStyle(l, `::${which}`);
    return { display: c.display, height: parseFloat(c.height) || 0, image: c.backgroundImage };
  }, which);

/** Ruling 1: the sheet open, the card is its chips and the band row; a turn grows it in place, and it goes back to one row. */
for (const size of [
  { width: 390, height: 844 },
  { width: 375, height: 667 },
]) {
  test.describe(`v6.7 ruling 1 (#133) at ${size.width}×${size.height}`, () => {
    test.use({ viewport: size, hasTouch: true });

    test('the sheet open: the chips and the band row, naming the card on stage, undimmed; a turn grows it and it is one row again 3 s after the stop; closed, three rows on the same band row', async ({ page }, info) => {
      await page.goto('/#3');
      await expectCompact(page);
      await quiet(page);
      await page.locator('.deck-details').click();
      await expectSheetOpen(page);
      const band = page.locator('.deck-row.in-band');
      await expect(band).toHaveAttribute('data-id', 'cascade');
      await expect(band).toContainText('Cascade');
      await expect(band.locator('.deck-band-meta')).toHaveText('3 balls');
      // The band row alone: no blank slots, nothing dimmed over it.
      expect((await slot(page, 'before')).height).toBe(0);
      expect((await slot(page, 'after')).height).toBe(0);
      expect(await page.locator('.deck-wheel').evaluate((w) => getComputedStyle(w, '::after').backgroundImage)).toBe('none');
      await shot(page, `v67-${size.width}-${info.project.name}-sheet-rest`);

      // A turn grows it in place; it stops, and DECK.returnMs later it is the band row again.
      const phases = await stampPhases(page);
      await list(page).hover();
      await page.mouse.wheel(0, 64);
      await expect.poll(() => phase(page)).not.toBe('compact');
      await expect.poll(() => shownRows(page)).toBeGreaterThan(DECK.sheetRows);
      await expectSheetOpen(page, true);
      await expect.poll(async () => stopsIn(await phases()).length).toBe(1);
      await shot(page, `v67-${size.width}-${info.project.name}-sheet-grown`);
      await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact', { timeout: RETURN + 2000 });
      const log = await phases();
      expect(compactIn(log)!.at - stopsIn(log)[0]!.at).toBeGreaterThanOrEqual(RETURN - 20);
      await expectSheetOpen(page);
      const row = await bandRow(page);
      expect(row).toBeGreaterThan(0);
      await expect(onStage(page)).toHaveText((await bandCode(page))!);

      // Closed (Escape on the compact card closes the sheet): three rows at once, the same band row.
      await page.keyboard.press('Escape');
      await expect(page.locator('#app')).not.toHaveClass(/sheet-open/);
      await expect.poll(() => drumPx(page)).toBe(COMPACT_PX);
      expect(await bandRow(page)).toBe(row);
      await expectCompact(page);
    });

    test('the sheet open: Escape and a tap outside make a grown card one row again; the sheet stays open', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-details').click();
      await expectSheetOpen(page);
      for (const how of ['escape', 'tap'] as const) {
        await touch(page, 'touchstart', 1);
        await page.waitForTimeout(100);
        await touch(page, 'touchend', 0);
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'grown');
        expect(await shownRows(page)).toBeGreaterThan(DECK.sheetRows);
        if (how === 'escape') await page.keyboard.press('Escape');
        else await page.locator('.region-juggler').tap();
        await expectSheetOpen(page);
      }
    });
  });
}

test.describe('v6.7 ruling 1, the gate (#133) at 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('the sheet open on the Pattern tab: the hand input and Swap inside the panel, the panel unscrolled, no page scroll', async ({ page }, info) => {
    await page.goto('/#3');
    await page.locator('.deck-details').click();
    await page.locator('#tab-pattern').click();
    await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
    // The stubbed sample CDN leaves the failed drums' row (and Retry) in the sheet's head; a reader
    // whose drums load has none (sheet.css: only a failure shows). The gate is the reader's: the row
    // is taken out of the layout as the loaded state has it.
    await expect(page.locator('.sound-status')).toHaveAttribute('data-state', 'failed');
    await page.locator('.sound-status').evaluate((s) => s.removeAttribute('data-held'));
    await expect.poll(async () => Math.round((await box(page, '.deck-wheel-list')).height)).toBe(DECK.rowPx * DECK.sheetRows);
    const panels = page.locator('.sheet-panels');
    await expect.poll(async () => {
      const p = await box(page, '.sheet-panels');
      const hand = await box(page, '#hand-0');
      const swap = await box(page, '#swap');
      return hand.y >= p.y && swap.y + swap.height <= p.y + p.height + 0.5;
    }).toBe(true);
    expect(await panels.evaluate((p) => p.scrollTop)).toBe(0);
    await expect(page.locator('#swap')).toBeVisible();
    expect(await noPageScroll(page)).toBe(true);
    await expect(page.locator('#play')).toBeInViewport({ ratio: 1 });
    await shot(page, `v67-375-${info.project.name}-gate`);
  });
});

/** Ruling 2: PageUp and PageDown page by the rows the card will show. */
test.describe('v6.7 ruling 2 (#134) at 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('from compact on the band row, PageDown turns as many rows as the grown card shows, fewer than seven; PageUp back the same', async ({ page }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    const from = await bandRow(page);
    await page.locator('.deck-row.in-band').focus();
    await page.keyboard.press('PageDown');
    await expect.poll(() => phase(page)).not.toBe('compact');
    const shown = await shownRows(page);
    expect(shown).toBeLessThan(DECK.wheelRows);
    expect(shown).toBeGreaterThanOrEqual(DECK.compactRows);
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from + shown));
    await expect(page.locator(`.deck-row[data-row="${from + shown}"]`)).toBeFocused();
    await page.keyboard.press('PageUp');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(from));
    expect(await shownRows(page)).toBe(shown);
  });
});

/**
 * Rulings 3 and 4 (#121): finger A held on a row, finger B taps a chip, which rebuilds the list
 * (A's row is then detached), and the lifts. Chromium by real touch points (CDP, two ids: the
 * browser hit-tests, clicks the chip and keeps A's target on its detached row); elsewhere by
 * events made in the page, each finger with its identifier, A's lift sent to its detached row.
 * The card is grown and settling first (a turn by the mouse wheel), so a lift that is never heard
 * would leave it grown.
 */
type Pt = { x: number; y: number };
const centre = (b: { x: number; y: number; width: number; height: number }): Pt => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
async function fingersOnRowAndChip(page: Page, browserName: string) {
  const row = centre(await box(page, '.deck-row.in-band'));
  const chip = centre(await box(page, '.deck-filter'));
  // Stamps A's lift on its own row, which the rebuild detaches: the time the page heard it.
  await page.locator('.deck-row.in-band').evaluate((r) => {
    (window as unknown as { rowA: Element }).rowA = r;
    r.addEventListener('touchend', () => ((window as unknown as { liftA: number }).liftA = performance.now()));
  });
  const detached = () => page.evaluate(() => !(window as unknown as { rowA: Element }).rowA.isConnected);
  const liftA = () => page.evaluate(() => (window as unknown as { liftA: number }).liftA);
  if (browserName === 'chromium') {
    // CDP's touchStart lists every point down; its touchEnd lists the points that lift. Chromium
    // makes no click of a second finger's tap, so the chip's click is the browser's own mouse click
    // where finger B was, after B lifts.
    const cdp = await page.context().newCDPSession(page);
    const A = { ...row, id: 1 };
    const B = { ...chip, id: 2 };
    const liftB = async () => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [B] });
      await page.mouse.click(chip.x, chip.y);
    };
    return {
      downA: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [A] }),
      tapB: async () => {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [A, B] });
        await page.waitForTimeout(60);
        await liftB();
      },
      downB: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [A, B] }),
      liftB,
      liftA: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [A] }),
      detached,
      liftedAt: liftA,
    };
  }
  // Events made in the page: A is identifier 1 on its row, B identifier 2 on the chip.
  const send = (type: string, on: 'A' | 'B', down: ('A' | 'B')[], click = false) =>
    page.evaluate(
      ([type, on, down, click]) => {
        const w = window as unknown as { rowA: Element };
        const chip = document.querySelector('.deck-filter') as HTMLElement;
        const t = { A: { identifier: 1, target: w.rowA }, B: { identifier: 2, target: chip } } as const;
        const e = new Event(type as string, { bubbles: true });
        Object.defineProperty(e, 'touches', { value: (down as ('A' | 'B')[]).map((k) => t[k]) });
        Object.defineProperty(e, 'changedTouches', { value: [t[on as 'A' | 'B']] });
        t[on as 'A' | 'B'].target.dispatchEvent(e);
        if (click) chip.click();
      },
      [type, on, down, click] as const,
    );
  return {
    downA: () => send('touchstart', 'A', ['A']),
    tapB: async () => {
      await send('touchstart', 'B', ['A', 'B']);
      await page.waitForTimeout(60);
      await send('touchend', 'B', ['A'], true);
    },
    downB: () => send('touchstart', 'B', ['A', 'B']),
    liftB: () => send('touchend', 'B', ['A'], true),
    liftA: () => send('touchend', 'A', []),
    detached,
    liftedAt: liftA,
  };
}

test.describe('v6.7 rulings 3 and 4 (#121) at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a finger held on a row, a chip tapped with another (the list rebuilt), the first lifts: compact 3 s after that lift, grown just before', async ({ page, browserName }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    await turnAndStop(page);
    const f = await fingersOnRowAndChip(page, browserName);
    await f.downA();
    await f.tapB();
    // The chip filtered the deck: the list was rebuilt under finger A.
    await expect(page.locator('.deck-filter').first()).toHaveAttribute('aria-pressed', 'true');
    expect(await f.detached()).toBe(true);
    await page.waitForTimeout(PAST_RETURN);
    expect(await phase(page)).not.toBe('compact');
    const phases = await stampPhases(page);
    await f.liftA();
    await expectCompact(page);
    const lifted = await f.liftedAt();
    expect(lifted).toBeGreaterThan(0);
    expect(compactIn(await phases())!.at - lifted).toBeGreaterThanOrEqual(RETURN - 20);
  });

  test('issue 116 kept: a finger held on a row, a chip tapped and lifted with another: grown while the first is held', async ({ page, browserName }) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    await turnAndStop(page);
    const f = await fingersOnRowAndChip(page, browserName);
    const phases = await stampPhases(page);
    await f.downA();
    await f.downB();
    await page.waitForTimeout(100);
    await f.liftB();
    await expect(page.locator('.deck-filter').first()).toHaveAttribute('aria-pressed', 'true');
    expect(await f.detached()).toBe(true);
    await page.waitForTimeout(PAST_RETURN);
    expect(compactIn(await phases())).toBeUndefined();
    expect(await shownRows(page)).toBeGreaterThan(DECK.compactRows);
    await f.liftA();
    await expectCompact(page);
  });
});

/** Ruling 5: past either end of the wheel a short faint line marks the end; docked, none. */
test.describe('v6.7 ruling 5 at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('at rest on Cascade the slot above the first row draws the end mark; on Make your own the slot below the last', async ({ page }, info) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    expect(await bandRow(page)).toBe(0);
    const before = await slot(page, 'before');
    expect(before.image).not.toBe('none');
    expect(before.height).toBe(DECK.rowPx * ((DECK.compactRows - 1) / 2));
    await shot(page, `v67-390-${info.project.name}-rest-cascade`);
    await page.locator('.deck-own').click();
    await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
    await page.keyboard.press('Escape');
    await expectCompact(page);
    const after = await slot(page, 'after');
    expect(after.image).not.toBe('none');
    expect(after.height).toBe(DECK.rowPx * ((DECK.compactRows - 1) / 2));
    await shot(page, `v67-390-${info.project.name}-rest-own`);
  });
});

test.describe('v6.7 ruling 5, screenshots at 375×667', () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test('at rest on Cascade and on Make your own: the end marks', async ({ page }, info) => {
    await page.goto('/#3');
    await expectCompact(page);
    await quiet(page);
    expect((await slot(page, 'before')).image).not.toBe('none');
    await shot(page, `v67-375-${info.project.name}-rest-cascade`);
    await page.locator('.deck-own').click();
    await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
    await page.keyboard.press('Escape');
    await expectCompact(page);
    expect((await slot(page, 'after')).image).not.toBe('none');
    await shot(page, `v67-375-${info.project.name}-rest-own`);
  });
});

test.describe('v6.7 ruling 5, docked at 1280×800', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('the docked menu has no blank slots and no end marks', async ({ page }) => {
    await page.goto('/#3');
    await expect(page.locator('.deck-wheel')).toBeVisible();
    expect((await slot(page, 'before')).display).toBe('none');
    expect((await slot(page, 'after')).display).toBe('none');
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
