// Pick a pattern without leaving full view (docs/plans/v6-10-pick-in-full-view.md, stream S1). In
// full view a tap on the pattern box opens the one wheel there: beside the jugglers on a landscape
// screen (they take the largest square at the right), under a square of them at the top on the
// iPad in portrait, popped up from the bar on the phone upright. A tap on a row picks it, plays it
// and closes the wheel; a tap on the jugglers or outside, or Escape, closes it; a second Escape
// leaves full view. Headless; screenshots go to e2e/shots (gitignored).
import { mkdirSync } from 'node:fs';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { expect, needWebGL, test, type Page } from './fixtures';

const SHOTS = 'e2e/shots';
const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const app = (page: Page) => page.locator('#app');
const full = (page: Page) => page.locator('.juggler-full');
const nameBox = (page: Page) => page.locator('button.deck-full-name');
const picker = (page: Page) => page.locator('.deck-picker');
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const inFull = (page: Page) => expect(app(page)).toHaveClass(/(^|\s)is-full(\s|$)/);
const outOfFull = (page: Page) => expect(app(page)).not.toHaveClass(/(^|\s)is-full(\s|$)/);
const hash = (page: Page) => page.evaluate(() => location.hash);

/** Opens `#3` in full view, the 3D view drawn. */
async function openFull(page: Page, browserName: string, touch: boolean) {
  await page.goto('/#3');
  await needWebGL(page, browserName);
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '3d');
  if (touch) await full(page).tap();
  else await full(page).click();
  await inFull(page);
  await expect(picker(page)).toBeHidden();
}
const tap = (page: Page, touch: boolean, selector: string) => (touch ? page.locator(selector).tap() : page.locator(selector).click());

/** What is true once the wheel is open, whatever the layout. */
async function expectOpen(page: Page) {
  await inFull(page);
  await expect(picker(page)).toBeVisible();
  await expect(page.locator('.deck-wheel')).toBeVisible();
  await expect(nameBox(page)).toBeHidden();
  await expect(page.locator('.deck-prev')).toBeHidden();
  await expect(page.locator('.deck-next')).toBeHidden();
  // The one picker: the page has exactly one, and its filters are in it.
  await expect(page.locator('.deck-picker')).toHaveCount(1);
  await expect(picker(page).locator('.deck-filter')).toHaveCount(7);
  await expect(page.locator('#play')).toBeVisible();
  // Listen for stays: the buttons for a finger, the ← → readout for a keyboard.
  await expect(page.locator('.deck-listen-option:visible, .deck-full-listen:visible').first()).toBeVisible();
}

/** The jugglers' square, and that the strip and the bar still run the full width. */
async function expectSquareAndFullWidth(page: Page, width: number) {
  const juggler = await box(page, '.region-juggler');
  expect(Math.abs(juggler.width - juggler.height)).toBeLessThanOrEqual(1);
  const canvas = await box(page, 'canvas.juggler-3d');
  expect(Math.abs(canvas.width - juggler.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(canvas.height - juggler.height)).toBeLessThanOrEqual(1);
  const strip = await box(page, '.region-ladder');
  const bar = await box(page, '.deck-bar');
  expect(strip.x).toBe(0);
  expect(strip.width).toBe(width);
  expect(bar.x).toBe(0);
  expect(bar.width).toBe(width);
  return juggler;
}

test.describe('at 1440×900, a keyboard and a mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('a click on the pattern box opens the wheel at the left and full view stays; the jugglers take the square at the right', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    // Closed: the box is there, ‹ › are not, in full view always.
    await expect(nameBox(page)).toBeVisible();
    await expect(nameBox(page)).toHaveAccessibleName('3, Cascade. Choose a pattern');
    await expect(page.locator('.deck-prev')).toBeHidden();
    await expect(page.locator('.deck-next')).toBeHidden();
    const closed = await box(page, '.region-juggler');
    await nameBox(page).click();
    await expectOpen(page);
    const juggler = await expectSquareAndFullWidth(page, 1440);
    // The largest square at the right: as tall as the stage, against the right edge.
    expect(juggler.x + juggler.width).toBe(1440);
    expect(juggler.y).toBe(0);
    expect(juggler.height).toBeLessThan(closed.height + 1);
    expect(juggler.height).toBeGreaterThan(0.75 * 900);
    const wheel = await box(page, '.deck-picker');
    expect(wheel.x).toBe(0);
    expect(wheel.x + wheel.width).toBeLessThanOrEqual(juggler.x + 1);
    // Full height: the picker runs from the top to the strip.
    expect(wheel.y).toBe(0);
    expect(wheel.y + wheel.height).toBeCloseTo((await box(page, '.region-ladder')).y, 0);
    await page.waitForTimeout(600);
    await shot(page, 'full-pick-1440x900-open');
  });

  test('a click on a row picks it, plays it and closes the wheel, still in full view', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    await page.locator('.deck-row[data-id]').nth(1).click();
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect.poll(() => hash(page)).toBe('#51');
    await expect(nameBox(page)).toBeVisible();
    await expect(page.locator('.deck-full-label')).toHaveText('Shower');
    await expect(page.locator('#play')).toHaveAttribute('data-state', 'playing');
    // The jugglers have the whole stage again.
    expect((await box(page, '.region-juggler')).width).toBe(1440);
  });

  test('turning the wheel changes the pattern as it settles, and the wheel stays open', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    const wheel = await box(page, '.deck-wheel');
    await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
    await page.mouse.wheel(0, 140);
    await expect.poll(() => hash(page)).not.toBe('#3');
    await expect(picker(page)).toBeVisible();
    await inFull(page);
    // The jugglers' square is still the stage's: the picture follows the pattern, not a layout.
    await expectSquareAndFullWidth(page, 1440);
  });

  test('a click on the jugglers closes the wheel', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    const j = await box(page, '.region-juggler');
    await page.mouse.click(j.x + j.width / 2, j.y + j.height / 2);
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect(nameBox(page)).toBeVisible();
  });

  test('a click outside the wheel, on the bar or the strip, closes it too', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    const strip = await box(page, '.region-ladder');
    await page.mouse.click(strip.x + strip.width / 2, strip.y + strip.height / 2);
    await expect(picker(page)).toBeHidden();
    await inFull(page);
  });

  test('Escape closes the wheel; a second Escape leaves full view', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    await page.keyboard.press('Escape');
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect(nameBox(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await outOfFull(page);
  });

  test('the pattern box opens from the keyboard, with a row focused; Enter on the row picks it', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).focus();
    await page.keyboard.press('Enter');
    await expectOpen(page);
    await expect(page.locator('.deck-row:focus')).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect.poll(() => hash(page)).not.toBe('#3');
  });

  test('⤡ with the wheel open leaves full view, and a reload opens normal', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    await full(page).click();
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(app(page)).not.toHaveClass(/full-pick/);
    await page.reload();
    await outOfFull(page);
    await expect(app(page)).not.toHaveClass(/full-pick/);
    await expect(page.locator('.topbar')).toBeVisible();
  });

  test('Make your own leaves full view and opens the editor, as it does outside', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    await page.locator('.deck-own').click();
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('#tab-pattern')).toBeVisible();
  });

  test('the wheel never opens outside full view from the box: leaving and entering again shows it closed', async ({ page, browserName }) => {
    await openFull(page, browserName, false);
    await nameBox(page).click();
    await expectOpen(page);
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await outOfFull(page);
    await expect(page.locator('.deck-wheel')).toBeVisible();
    await full(page).click();
    await inFull(page);
    await expect(picker(page)).toBeHidden();
  });
});

test.describe('at 1180×820, a finger (iPad landscape)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test('a tap on the box opens the wheel at the left; a tap on a row picks, plays and closes', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    await nameBox(page).tap();
    await expectOpen(page);
    const juggler = await expectSquareAndFullWidth(page, 1180);
    expect(juggler.x + juggler.width).toBe(1180);
    const wheel = await box(page, '.deck-picker');
    expect(wheel.x).toBe(0);
    expect(wheel.width).toBeGreaterThan(300);
    await page.waitForTimeout(600);
    await shot(page, 'full-pick-1180x820-open');
    await page.locator('.deck-row[data-id]').nth(1).tap();
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect.poll(() => hash(page)).toBe('#51');
    await expect(page.locator('#play')).toHaveAttribute('data-state', 'playing');
  });

  test('a tap on the jugglers closes it', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    await nameBox(page).tap();
    await expectOpen(page);
    const j = await box(page, '.region-juggler');
    await page.touchscreen.tap(j.x + j.width / 2, j.y + j.height / 2);
    await expect(picker(page)).toBeHidden();
    await inFull(page);
  });
});

test.describe('at 820×1180, a finger (iPad portrait)', () => {
  test.use({ viewport: { width: 820, height: 1180 }, hasTouch: true });

  test('the jugglers go up into a square at the top, centred; the wheel takes the width under it', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    await nameBox(page).tap();
    await expectOpen(page);
    const juggler = await expectSquareAndFullWidth(page, 820);
    expect(juggler.y).toBe(0);
    expect(Math.abs(juggler.x + juggler.width / 2 - 410)).toBeLessThanOrEqual(1);
    const wheel = await box(page, '.deck-picker');
    expect(wheel.x).toBe(0);
    expect(wheel.width).toBe(820);
    expect(wheel.y).toBeGreaterThanOrEqual(juggler.y + juggler.height - 1);
    // Room for the filters and about five rows.
    const rows = await box(page, '.deck-wheel');
    expect(rows.height).toBeGreaterThanOrEqual(5 * 32 - 1);
    await page.waitForTimeout(600);
    await shot(page, 'full-pick-820x1180-open');
    await page.locator('.deck-row[data-id]').nth(2).tap();
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    // Closed, the jugglers have the stage again.
    expect((await box(page, '.region-juggler')).width).toBe(820);
  });
});

test.describe('at 844×390, a phone on its side', () => {
  test.use({ viewport: { width: 844, height: 390 }, hasTouch: true });

  test('the wheel at the left, the jugglers in the square at the right', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    await nameBox(page).tap();
    await expectOpen(page);
    const juggler = await expectSquareAndFullWidth(page, 844);
    expect(juggler.x + juggler.width).toBe(844);
    const wheel = await box(page, '.deck-picker');
    expect(wheel.x).toBe(0);
    expect(wheel.x + wheel.width).toBeLessThanOrEqual(juggler.x + 1);
    // The chips and at least three rows fit above the strip.
    expect((await box(page, '.deck-wheel')).height).toBeGreaterThanOrEqual(3 * 32 - 1);
    await page.waitForTimeout(600);
    await shot(page, 'full-pick-844x390-open');
    await page.locator('.deck-row[data-id]').nth(1).tap();
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect.poll(() => hash(page)).toBe('#51');
  });
});

test.describe('at 390×844, a phone upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the stage stays; the wheel pops up from the bar over its foot, nearly full width, the chips wrapped', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    const before = await box(page, '.region-juggler');
    await nameBox(page).tap();
    await expectOpen(page);
    // The jugglers keep the stage's place and width; it is taller by the bar's row that went.
    const after = await box(page, '.region-juggler');
    expect(after).toMatchObject({ x: before.x, y: before.y, width: before.width });
    expect(after.height).toBeGreaterThanOrEqual(before.height);
    const bar = await box(page, '.deck-bar');
    const wheel = await box(page, '.deck-picker');
    expect(wheel.width).toBeGreaterThanOrEqual(390 - 2 * 16);
    expect(wheel.x).toBeGreaterThan(0);
    expect(wheel.y + wheel.height).toBeLessThanOrEqual(bar.y);
    expect(bar.y - (wheel.y + wheel.height)).toBeLessThan(20);
    // Over the lower stage, not the top: the figure keeps clear above it.
    expect(wheel.y).toBeGreaterThan(0.4 * 844);
    // The chips wrap: BALLS on one line, JUGGLERS under it.
    const groups = await page.locator('.deck-filter-group').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().y));
    expect(groups).toHaveLength(2);
    expect(groups[1]!).toBeGreaterThan(groups[0]!);
    // The bar is one row of Play and the buttons.
    expect(bar.height).toBeLessThan(80);
    const play = await box(page, '#play');
    for (const o of await page.locator('.deck-listen-option').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()))) {
      expect(Math.abs(o.y - play.y)).toBeLessThan(10);
    }
    await page.waitForTimeout(600);
    await shot(page, 'full-pick-390x844-open');
    await tap(page, true, '.deck-row[data-id] >> nth=1');
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await expect.poll(() => hash(page)).toBe('#51');
    await expect(page.locator('.deck-full-label')).toHaveText('Shower');
  });

  test('a tap on the stage closes it, and leaving full view brings the compact card back', async ({ page, browserName }) => {
    await openFull(page, browserName, true);
    await nameBox(page).tap();
    await expectOpen(page);
    await page.touchscreen.tap(195, 120);
    await expect(picker(page)).toBeHidden();
    await inFull(page);
    await nameBox(page).tap();
    await expectOpen(page);
    // ⤡ works with the wheel open (its button is not under the wheel).
    await full(page).tap();
    await outOfFull(page);
    await expect(picker(page)).toBeVisible();
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
    await expect(page.locator('.deck-details')).toBeVisible();
  });
});

/** A card's address, as the link carries it. */
const hashOf = (id: string) => {
  const card = PRESETS.find((p) => p.id === id)!;
  return encodeHash({ ...defaultState(), parts: card.parts, ratio: card.ratio });
};

test.describe('the pattern box takes the width the controls leave (v6.10 1.7)', () => {
  test.describe('at 1440×900', () => {
    test.use({ viewport: { width: 1440, height: 900 } });
    test('it runs from the left edge of the bar to the controls, and keeps its ball count', async ({ page, browserName }) => {
      await openFull(page, browserName, false);
      const name = await box(page, '.deck-full-name');
      const play = await box(page, '#play');
      expect(name.x).toBe(0);
      expect(play.x - (name.x + name.width)).toBeLessThanOrEqual(12);
      expect(name.width).toBeGreaterThan(500);
      await expect(page.locator('.deck-full-balls')).toBeVisible();
    });
  });

  test.describe('at 390×844', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });
    test('a short name keeps its ball count; a long one drops it before its notation is cut', async ({ page, browserName }) => {
      await openFull(page, browserName, true);
      await expect(page.locator('.deck-full-balls')).toBeVisible();
      await expect(page.locator('.deck-full-name')).not.toHaveClass(/is-short/);
      await page.goto(`/${hashOf('four-typewriter')}`);
      await page.reload();
      await needWebGL(page, browserName);
      await full(page).tap();
      await inFull(page);
      await expect(page.locator('.deck-full-name')).toHaveClass(/is-short/);
      await expect(page.locator('.deck-full-balls')).toBeHidden();
      await expect(page.locator('.deck-full-label')).not.toHaveText('');
    });
  });
});
