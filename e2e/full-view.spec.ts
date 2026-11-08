// Full view (docs/plans/v6-9-full-view.md, stream S3): the jugglers take the screen. ⤢ enters,
// ⤡ and Escape leave, and a drag, a pinch or a wheel tick on the 3D view enters too; a click or
// a tap never does. In full view the stage holds at least 80% of the screen (75% on a phone), a thin
// strip sits under it and one row of controls under that (two on a phone upright). Leaving
// restores the panel the reader had. Headless; screenshots go to e2e/shots (gitignored) and to
// test-results.
import { mkdirSync } from 'node:fs';
import { FULL, LADDER } from '../src/tunables';
import { expect, needWebGL, test, type Page } from './fixtures';

const SHOTS = 'e2e/shots';
const shot = async (page: Page, name: string) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${name}.png` });
};
const app = (page: Page) => page.locator('#app');
const three = (page: Page) => page.locator('canvas.juggler-3d');
const full = (page: Page) => page.locator('.juggler-full');
const camera = (page: Page) => three(page).getAttribute('data-camera');
const box = async (page: Page, selector: string) => (await page.locator(selector).first().boundingBox())!;
const inFull = (page: Page) => expect(app(page)).toHaveClass(/\bis-full\b/);
const outOfFull = (page: Page) => expect(app(page)).not.toHaveClass(/\bis-full\b/);
const STRIP = Math.round(LADDER.heightPx * FULL.stripFractionWide);

/** Opens `#3` with the 3D view drawn. */
async function open(page: Page, browserName: string) {
  await page.goto('/#3');
  await needWebGL(page, browserName);
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '3d');
}
const centre = async (page: Page) => {
  const b = (await three(page).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
async function mouseDrag(page: Page, dx: number) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y, { steps: 12 });
  await page.mouse.up();
}

test.describe('at 1440×900, a keyboard and a mouse', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the top bar holds two tabs, Patterns and Sound', async ({ page }) => {
    await page.goto('/#3');
    await expect(page.locator('.panel-option')).toHaveText(['Patterns', 'Sound']);
  });

  test('⤢ gives the jugglers the screen: the bars and the column go, one row and a thin strip stay', async ({ page, browserName }) => {
    await open(page, browserName);
    await expect(full(page)).toHaveAccessibleName('Full view');
    await expect(full(page)).toHaveText('⤢');
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.deck-keys')).toBeVisible();
    await full(page).click();
    await inFull(page);
    await expect(full(page)).toHaveAccessibleName('Leave full view');
    await expect(full(page)).toHaveText('⤡');
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.region-sheet')).toBeHidden();
    await expect(page.locator('.deck-wheel')).toBeHidden();
    await expect(page.locator('.deck-keys')).toBeHidden();
    await expect(page.locator('.deck-pattern')).toBeHidden();
    await expect(page.locator('.deck-volume')).toBeHidden();
    // The stage fills the height the row leaves; the strip is a third of the wide strip.
    const vh = page.viewportSize()!.height;
    expect((await box(page, '.stage')).height).toBeGreaterThanOrEqual(0.8 * vh);
    expect((await box(page, '.region-juggler')).height).toBeGreaterThanOrEqual(0.8 * vh);
    expect((await box(page, '.stage')).width).toBe(1440);
    await expect.poll(async () => (await box(page, '.ladder')).height).toBe(STRIP);
    // The row: Play with its word, ‹ ›, the name, Listen for and its caps, the keys at the right.
    await expect(page.locator('#play')).toBeVisible();
    await expect(page.locator('#play')).toContainText('Play');
    await expect(page.locator('.deck-prev')).toBeVisible();
    await expect(page.locator('.deck-next')).toBeVisible();
    await expect(page.locator('.deck-full-name')).toHaveText('3 Cascade · 3 balls');
    await expect(page.locator('.deck-full-readout')).toHaveText('each ball');
    await expect(page.locator('.deck-full-listen kbd')).toHaveText(['←', '→']);
    await expect(page.locator('.deck-full-keys')).toContainText('esc back');
    await expect(page.locator('.deck-full-keys')).toContainText('space play');
    await expect(page.locator('.deck-full-keys')).toContainText('↑↓ pattern');
    await expect(page.locator('.deck-listen')).toBeHidden();
    // One row.
    const row = await box(page, '.deck-bar');
    expect(row.height).toBeCloseTo(FULL.rowPx, 0);
    await page.waitForTimeout(500);
    await shot(page, 'full-1440x900');
  });

  test('⤡ leaves with the Patterns column back; with Sound open it comes back to Sound', async ({ page, browserName }) => {
    await open(page, browserName);
    await full(page).click();
    await inFull(page);
    await full(page).click();
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.deck-wheel')).toBeVisible();
    await expect(page.locator('.deck-keys')).toBeVisible();
    await expect(page.locator('.panel-option[data-panel="patterns"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.ladder')).toHaveJSProperty('clientHeight', LADDER.heightPx);

    await page.locator('.panel-option[data-panel="sound"]').click();
    await expect(page.locator('#panel-sound')).toBeVisible();
    await full(page).click();
    await inFull(page);
    await expect(page.locator('#panel-sound')).toBeHidden();
    await full(page).click();
    await outOfFull(page);
    await expect(page.locator('.panel-option[data-panel="sound"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#panel-sound')).toBeVisible();
    await expect(page.locator('.deck-wheel')).toBeHidden();
  });

  test('Escape leaves; it plays nothing, and Space inside still plays', async ({ page, browserName }) => {
    await open(page, browserName);
    await full(page).click();
    await inFull(page);
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toContainText('Pause');
    await page.keyboard.press('Escape');
    await outOfFull(page);
    await expect(page.locator('#play')).toContainText('Pause');
    // Escape outside full view does nothing to it.
    await page.keyboard.press('Escape');
    await outOfFull(page);
  });

  test('inside, Play, ‹ › and ↑ ↓ keep you there; ‹ › step the pattern and the name follows', async ({ page, browserName }) => {
    await open(page, browserName);
    await full(page).click();
    await inFull(page);
    await page.locator('#play').click();
    await expect(page.locator('#play')).toContainText('Pause');
    await inFull(page);
    await page.locator('.deck-next').click();
    await expect(page.locator('.deck-full-name')).toContainText('51');
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.deck-full-name')).toContainText('Cascade');
    await page.keyboard.press('ArrowRight');
    await expect(page.locator('.deck-full-readout')).toHaveText('the height, as a pitch');
    await inFull(page);
    // The wheel over the name steps too.
    const name = await box(page, '.deck-full-name');
    await page.mouse.move(name.x + name.width / 2, name.y + name.height / 2);
    await page.mouse.wheel(0, 200);
    await expect(page.locator('.deck-full-name')).not.toContainText('Cascade');
    await inFull(page);
  });

  test('a drag on the 3D view enters full view and still turns it', async ({ page, browserName }) => {
    await open(page, browserName);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
    const before = await camera(page);
    await mouseDrag(page, 200);
    await inFull(page);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    expect(await camera(page)).not.toBe(before);
  });

  test('a wheel tick on the 3D view enters full view and still zooms', async ({ page, browserName }) => {
    await open(page, browserName);
    const before = (await camera(page))!.split(',').map(Number)[2];
    const c = await centre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, -300);
    await inFull(page);
    await expect.poll(async () => (await camera(page))!.split(',').map(Number)[2]).toBeLessThan(before!);
  });

  test('a click on the 3D view, or a press with no move, does not enter', async ({ page, browserName }) => {
    await open(page, browserName);
    const c = await centre(page);
    await page.mouse.click(c.x, c.y);
    await page.mouse.move(c.x, c.y);
    await page.mouse.down();
    await page.mouse.move(c.x + 2, c.y + 2);
    await page.mouse.up();
    await page.waitForTimeout(300);
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.deck-wheel')).toBeVisible();
  });

  test('a drag on the 2D view does not enter; ⤢ does, from 2D too', async ({ page, browserName }) => {
    await open(page, browserName);
    await page.locator('.juggler-switch').click();
    await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '2d');
    const b = (await page.locator('canvas.juggler').boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 200, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    await page.mouse.wheel(0, 200);
    await page.waitForTimeout(300);
    await outOfFull(page);
    await full(page).click();
    await inFull(page);
    await expect(full(page)).toBeVisible();
  });

  test('a reload opens normal, and the link never carries it', async ({ page, browserName }) => {
    await open(page, browserName);
    await full(page).click();
    await inFull(page);
    expect(await page.evaluate(() => location.hash)).toBe('#3');
    await page.reload();
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
  });

  test('About has no way back from full view, so reaching it leaves', async ({ page, browserName }) => {
    await open(page, browserName);
    await full(page).click();
    await inFull(page);
    await page.evaluate(() => (location.hash = '#about'));
    await outOfFull(page);
    await expect(page.locator('.topbar')).toBeVisible();
  });
});

test.describe('at 1180×820, a finger (iPad landscape)', () => {
  test.use({ viewport: { width: 1180, height: 820 }, hasTouch: true });

  test('⤢ gives one row: Play as an icon, ‹ name ›, and Listen for as three buttons that work', async ({ page, browserName }) => {
    await open(page, browserName);
    // Normal view: the keys are a keyboard's; full view never shows them to a finger.
    await full(page).click();
    await inFull(page);
    const vh = page.viewportSize()!.height;
    expect((await box(page, '.stage')).height).toBeGreaterThanOrEqual(0.8 * vh);
    expect((await box(page, '.region-juggler')).height).toBeGreaterThanOrEqual(0.8 * vh);
    await expect.poll(async () => (await box(page, '.ladder')).height).toBe(STRIP);
    expect((await box(page, '.deck-bar')).height).toBeCloseTo(FULL.rowCoarsePx, 0);
    await expect(page.locator('.deck-full-name')).toHaveText('3 Cascade · 3 balls');
    await expect(page.locator('.deck-full-keys')).toBeHidden();
    await expect(page.locator('.deck-full-listen')).toBeHidden();
    // The word is not drawn beside the icon.
    expect((await box(page, '#play')).width).toBeLessThan(80);
    await expect(page.locator('.deck-listen-option')).toHaveText(['Height', 'Each ball', 'Pitch']);
    await expect(page.locator('.deck-listen-option[data-listen="ball"]')).toHaveAttribute('aria-pressed', 'true');
    await page.locator('.deck-listen-option[data-listen="pitch"]').tap();
    await expect(page.locator('.deck-listen-option[data-listen="pitch"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.deck-listen-option[data-listen="ball"]')).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3~pitch');
    await inFull(page);
    await page.locator('#play').tap();
    await expect(page.locator('#play')).toHaveAttribute('data-state', 'playing');
    await inFull(page);
    await page.waitForTimeout(500);
    await shot(page, 'full-1180x820');
    // Leaving: the Sound tab's select agrees with the button.
    await full(page).tap();
    await outOfFull(page);
    await page.locator('.panel-option[data-panel="sound"]').tap();
    await expect(page.locator('.sp-choice[aria-pressed="true"]')).toHaveAttribute('data-listen', 'pitch');
  });

  test('a tap on the 3D view does not enter; a drag does', async ({ page, browserName }) => {
    await open(page, browserName);
    const c = await centre(page);
    await page.touchscreen.tap(c.x, c.y);
    await page.waitForTimeout(300);
    await outOfFull(page);
    test.skip(browserName !== 'chromium', 'CDP touch events are Chromium only');
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
    for (let k = 1; k <= 10; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + k * 12, y: c.y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await inFull(page);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
  });

  test('a second finger down (a pinch) enters', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch events are Chromium only');
    await open(page, browserName);
    const c = await centre(page);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x - 30, y: c.y, id: 1 }] });
    await page.waitForTimeout(100);
    await outOfFull(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { x: c.x - 30, y: c.y, id: 1 },
        { x: c.x + 30, y: c.y, id: 2 },
      ],
    });
    await inFull(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});

test.describe('at 390×844, a phone upright', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('⤢ gives two rows: Play and the name over the three Listen for buttons; the card and the bottom bar go', async ({ page, browserName }) => {
    await page.goto('/#3');
    await needWebGL(page, browserName);
    await expect(page.locator('.deck-details')).toBeVisible();
    await expect(page.locator('.deck-picker')).toBeVisible();
    await full(page).tap();
    await inFull(page);
    await expect(app(page)).toHaveClass(/is-full-two-rows/);
    await expect(page.locator('.topbar')).toBeHidden();
    await expect(page.locator('.deck-picker')).toBeHidden();
    await expect(page.locator('.deck-sound')).toBeHidden();
    await expect(page.locator('.deck-details')).toBeHidden();
    await expect(page.locator('.deck-volume')).toBeHidden();
    const vh = page.viewportSize()!.height;
    const stage = await box(page, '.stage');
    expect(stage.height).toBeGreaterThanOrEqual(0.75 * vh);
    expect((await box(page, '.region-juggler')).height).toBeGreaterThanOrEqual(0.75 * vh);
    await expect.poll(async () => (await box(page, '.ladder')).height).toBe(FULL.stripPhonePx);
    // The name drops its ball count where the row splits.
    await expect(page.locator('.deck-full-name')).toHaveText('3 Cascade');
    const play = await box(page, '#play');
    const options = await page.locator('.deck-listen-option').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
    expect(options).toHaveLength(3);
    for (const o of options) expect(o.y).toBeGreaterThan(play.y + play.height - 1);
    // Stretched across the second row.
    expect(options[0]!.x).toBeLessThan(20);
    expect(options[2]!.x + options[2]!.width).toBeGreaterThan(370);
    await page.locator('.deck-listen-option[data-listen="height"]').tap();
    await expect(page.locator('.deck-listen-option[data-listen="height"]')).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3~height');
    await inFull(page);
    await page.waitForTimeout(500);
    await shot(page, 'full-390x844');
    // Leaving puts the card back, compact, as it was.
    await full(page).tap();
    await outOfFull(page);
    await expect(page.locator('.deck-picker')).toBeVisible();
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
    await expect(page.locator('.deck-details')).toBeVisible();
  });
});
