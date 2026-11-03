// v6.1 stream W4 (docs/plans/v6-1-wheel-feel.md, rulings 1 to 3), headless at 1280×800: the docked
// wheel follows a trackpad at half speed, a mouse notch glides it one row and it settles there; the
// band passing or resting on Make your own never opens the editor, a click (or Enter, or Space) on
// it does; ↓ steps the pattern and → Listen for. Screenshots (and, with W4_VIDEO, a recording of a
// trackpad-like scroll) go to W4_SHOTS, or e2e/shots/.
import { mkdirSync } from 'node:fs';
import { PRESETS } from '../src/app/presets';
import { expect, test, type Page } from './fixtures';

const SHOTS = process.env.W4_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const ROW_PX = 44;
const ROWS = PRESETS.length + 1;
const notation = (page: Page) => page.locator('.deck-notation');
/** The row a point at the middle of the band hits: its data-row, or data-echo for a copy. */
const bandHit = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.deck-row');
    return hit?.getAttribute('data-row') ?? hit?.getAttribute('data-echo') ?? null;
  });
/** How far Cascade's row sits above the band, in px: 0 with Cascade in the band, 44 a row on. */
const cascadeAbove = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const row = document.querySelector('.deck-row[data-id="cascade"]')!.getBoundingClientRect();
    return box.top + box.height / 2 - (row.top + row.height / 2);
  });
const editorHidden = (page: Page) => page.locator('#app').evaluate((app) => app.classList.contains('deck-editor-hidden'));
/** Points the mouse at the middle of the wheel. */
const overWheel = async (page: Page) => {
  const box = (await page.locator('.deck-wheel').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
};

test.use({ viewport: { width: 1280, height: 800 } });

test('a trackpad: ten deltas of 8 move the list about 40 px, a little each, never a row at a time', async ({ page }) => {
  await page.goto('/#3');
  await expect.poll(() => bandHit(page)).toBe('0');
  await overWheel(page);
  // Where Cascade sits after each event, read as the event bubbles past the wheel's own handler.
  await page.evaluate(() => {
    const w = window as unknown as { log: number[] };
    w.log = [];
    const wheel = document.querySelector('.deck-wheel')!;
    document.addEventListener('wheel', () => {
      const box = wheel.getBoundingClientRect();
      const row = document.querySelector('.deck-row[data-id="cascade"]')!.getBoundingClientRect();
      w.log.push(box.top + box.height / 2 - (row.top + row.height / 2));
    });
  });
  for (let i = 0; i < 10; i++) await page.mouse.wheel(0, 8);
  const log = await page.evaluate(() => (window as unknown as { log: number[] }).log);
  expect(log).toHaveLength(10);
  // Half the scroll, 4 px an event: about 40 px in all, and every step a small one.
  log.forEach((at, i) => expect(Math.abs(at - 4 * (i + 1))).toBeLessThanOrEqual(1.5));
  expect(log[9]).toBeGreaterThan(35);
  expect(log[9]).toBeLessThan(44);
  // Stopped between rows, it settles onto the nearest (51, a row on) and picks it.
  await expect(notation(page)).toHaveText('51');
  await expect.poll(() => bandHit(page)).toBe('1');
  await expect.poll(() => cascadeAbove(page)).toBe(ROW_PX);
  expect(await editorHidden(page)).toBe(true);
});

test('a mouse notch of 100 glides to the next row, through the rows between, and settles there', async ({ page }) => {
  await page.goto('/#3');
  await expect.poll(() => bandHit(page)).toBe('0');
  await overWheel(page);
  // Cascade's place on every frame from here.
  await page.evaluate(() => {
    const w = window as unknown as { frames: number[] };
    w.frames = [];
    const wheel = document.querySelector('.deck-wheel')!;
    const t0 = performance.now();
    const frame = () => {
      const box = wheel.getBoundingClientRect();
      const row = document.querySelector('.deck-row[data-id="cascade"]')!.getBoundingClientRect();
      w.frames.push(box.top + box.height / 2 - (row.top + row.height / 2));
      if (performance.now() - t0 < 1500) requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });
  await page.mouse.wheel(0, 100);
  await expect(notation(page)).toHaveText('51');
  await page.waitForTimeout(1600);
  const frames = await page.evaluate(() => (window as unknown as { frames: number[] }).frames);
  // A glide: frames part way between the rows, never past the next one, never back.
  expect(frames.filter((f) => f > 2 && f < ROW_PX - 2).length).toBeGreaterThanOrEqual(2);
  expect(Math.max(...frames)).toBeLessThanOrEqual(ROW_PX + 0.5);
  for (let i = 1; i < frames.length; i++) expect(frames[i]!).toBeGreaterThanOrEqual(frames[i - 1]! - 0.5);
  expect(frames[frames.length - 1]).toBeCloseTo(ROW_PX, 0);
  expect(await bandHit(page)).toBe('1');
  // Back up a notch: Cascade again.
  await page.mouse.wheel(0, -100);
  await expect(notation(page)).toHaveText('3');
  await expect.poll(() => cascadeAbove(page)).toBe(0);
  await page.screenshot({ path: `${SHOTS}/w4-notch-settled-1280x800.png` });
});

test('scrolling the whole loop twice never shows the editor, resting on Make your own included', async ({ page }) => {
  await page.goto('/#3');
  await expect.poll(() => bandHit(page)).toBe('0');
  // Any moment the editor shows, from here on, is counted.
  await page.evaluate(() => {
    const w = window as unknown as { shown: number };
    w.shown = 0;
    const app = document.querySelector('#app')!;
    new MutationObserver(() => {
      if (!app.classList.contains('deck-editor-hidden')) w.shown += 1;
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
  });
  await overWheel(page);
  // Up a notch from Cascade: Make your own, and the wheel rests there.
  await page.mouse.wheel(0, -100);
  await expect.poll(() => bandHit(page)).toBe(String(ROWS - 1));
  await page.waitForTimeout(800);
  expect(await editorHidden(page)).toBe(true);
  await expect(page.locator('#tab-pattern')).toBeHidden();
  await expect(notation(page)).toHaveText('3');
  await page.screenshot({ path: `${SHOTS}/w4-rest-on-own-1280x800.png` });
  // Then twice round, notches and a trackpad's drags mixed.
  for (let i = 0; i < 2 * ROWS; i++) {
    await page.mouse.wheel(0, 100);
    for (let j = 0; j < 3; j++) await page.mouse.wheel(0, 6);
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(1000);
  expect(await page.evaluate(() => (window as unknown as { shown: number }).shown)).toBe(0);
  await expect(page.locator('#tab-pattern')).toBeHidden();
  // The band rests on a row, and the row is the one on stage (or Make your own, which loads nothing).
  await expect.poll(async () => Math.abs((await cascadeAbove(page)) % ROW_PX)).toBe(0);
  const banded = page.locator('.deck-row.in-band');
  const own = (await banded.getAttribute('class'))!.includes('deck-own');
  if (!own) await expect.poll(async () => (await banded.locator('code').textContent()) === (await notation(page).textContent())).toBe(true);
  else await expect(page.locator('.deck-row[aria-current]')).toHaveCount(1);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
});

test('a click on Make your own shows the editor; so do Enter and Space on it', async ({ page }) => {
  await page.goto('/#3');
  await page.locator('.deck-own').click();
  await expect(page.locator('#tab-pattern')).toBeVisible();
  await expect(page.locator('#hand-0')).toBeVisible();
  await expect(notation(page)).toHaveText('3');
  await page.screenshot({ path: `${SHOTS}/w4-editor-on-click-1280x800.png` });
  for (const key of ['Enter', 'Space']) {
    await page.locator('.deck-row[data-id="pause"]').click();
    await expect(page.locator('#tab-pattern')).toBeHidden();
    await page.locator('.deck-own').focus();
    await page.keyboard.press(key);
    await expect(page.locator('#tab-pattern')).toBeVisible();
    // Space opened the editor and played nothing new: the pick of Pause started it, Space left it be.
    await expect(notation(page)).toHaveText('441');
  }
});

test('↓ steps to the next card, ↑ back; → and ← change Listen for; the key caps say so', async ({ page }) => {
  await page.goto('/#3');
  await expect(page.locator('.deck-key kbd')).toHaveText(['space', '↑', '↓', '←', '→']);
  await expect(page.locator('.deck-key').nth(1)).toContainText('pattern');
  await expect(page.locator('.deck-key').nth(2)).toContainText('listen for');
  await page.locator('body').click({ position: { x: 600, y: 200 } });
  await page.keyboard.press('ArrowDown');
  await expect(notation(page)).toHaveText('51');
  await expect.poll(() => bandHit(page)).toBe('1');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#51~pitch');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#51');
  await page.keyboard.press('ArrowUp');
  await expect(notation(page)).toHaveText('3');
  await page.screenshot({ path: `${SHOTS}/w4-keys-1280x800.png` });
  // About says the same.
  await page.goto('/#about');
  await expect(page.locator('.region-about')).toContainText('↑ and ↓ change the pattern, and ← and → change what you listen for');
});

if (process.env.W4_VIDEO) {
  test('a recording of a trackpad-like scroll, then a notch', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, recordVideo: { dir: SHOTS, size: { width: 1280, height: 800 } } });
    await context.route('**/smpldsnds.github.io/**', (route) => route.abort());
    const page = await context.newPage();
    await page.goto('/#3');
    await page.waitForTimeout(600);
    await overWheel(page);
    // A swipe: deltas rising then a momentum tail, 16 ms apart.
    const swipe = [2, 4, 8, 12, 16, 20, 22, 22, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 3, 2, 2, 1, 1];
    for (const d of swipe) {
      await page.mouse.wheel(0, d);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(900);
    for (let i = 0; i < 3; i++) {
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(250);
    }
    await page.waitForTimeout(900);
    await context.close();
  });
}
