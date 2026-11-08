// v6.1 stream W4 (docs/plans/v6-1-wheel-feel.md, rulings 2 and 3), the docked wheel a menu since
// v6.2 W6 (docs/plans/v6-2-wheel-ends.md, ruling 3), headless at 1280×800: a mouse wheel or a
// trackpad scrolls the list natively and only browses (the card on stage and the band stay); a
// click picks; the band passing over Make your own never opens the editor, a click (or Enter, or
// Space) on it does; ↓ steps the pattern and → Listen for. Screenshots go to W4_SHOTS, or e2e/shots/.
import { mkdirSync } from 'node:fs';
import { expect, test, type Page } from './fixtures';

const SHOTS = process.env.W4_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const notation = (page: Page) => page.locator('.deck-notation');
const editorHidden = (page: Page) => page.locator('#app').evaluate((app) => app.classList.contains('deck-editor-hidden'));
const scrollTop = (page: Page) => page.locator('.deck-wheel-list').evaluate((l) => l.scrollTop);
/** Points the mouse at the middle of the wheel. */
const overWheel = async (page: Page) => {
  const box = (await page.locator('.deck-wheel').boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
};

test.use({ viewport: { width: 1280, height: 800 } });

test('a wheel scroll over the full deck moves the list, not the card on stage nor the band; a click picks', async ({ page }) => {
  await page.goto('/#3');
  await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
  // Any load and any moment the editor shows, from here on, is counted.
  await page.evaluate(() => {
    const w = window as unknown as { loads: string[]; shown: number };
    w.loads = [];
    w.shown = 0;
    const el = document.querySelector('.deck-notation')!;
    new MutationObserver(() => {
      const t = el.textContent ?? '';
      if (w.loads[w.loads.length - 1] !== t) w.loads.push(t);
    }).observe(el, { childList: true, characterData: true, subtree: true });
    const app = document.querySelector('#app')!;
    new MutationObserver(() => {
      if (!app.classList.contains('deck-editor-hidden')) w.shown += 1;
    }).observe(app, { attributes: true, attributeFilter: ['class'] });
  });
  await overWheel(page);
  // Mouse notches and a trackpad's small deltas, mixed, all the way down and past the end.
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 100);
    for (let j = 0; j < 3; j++) await page.mouse.wheel(0, 6);
  }
  await expect.poll(() => scrollTop(page)).toBeGreaterThan(0);
  await page.waitForTimeout(800);
  // The list moved: Make your own, the last row, is at the foot of the wheel.
  const own = (await page.locator('.deck-own').boundingBox())!;
  const wheel = (await page.locator('.deck-wheel').boundingBox())!;
  expect(Math.abs(own.y + own.height - (wheel.y + wheel.height))).toBeLessThan(2);
  // Nothing was picked and nothing opened; the band is still on Cascade, scrolled out of view.
  await expect(notation(page)).toHaveText('3');
  await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
  expect(await page.evaluate(() => (window as unknown as { loads: string[] }).loads)).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { shown: number }).shown)).toBe(0);
  expect(await editorHidden(page)).toBe(true);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.screenshot({ path: `${SHOTS}/w6-scrolled-1280x800.png` });
  // And back up: still Cascade.
  await page.mouse.wheel(0, -2000);
  await expect.poll(() => scrollTop(page)).toBe(0);
  await expect(notation(page)).toHaveText('3');
  // A click picks: the band moves to it, the card loads and plays.
  await page.locator('.deck-row[data-id="classic"]').click();
  await expect(notation(page)).toHaveText('531');
  await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'classic');
  await expect(page.locator('.deck-row.in-band')).toHaveCount(1);
  await expect(page.locator('#play')).toHaveText('Pause');
});

test('a click on Make your own shows the editor; so do Enter and Space on it', async ({ page }) => {
  await page.goto('/#3');
  await page.locator('.deck-own').click();
  await expect(page.locator('#tab-pattern')).toBeVisible();
  await expect(page.locator('#hand-0')).toBeVisible();
  await expect(notation(page)).toHaveText('3');
  await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
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

test('↓ steps to the next card, ↑ back, the band with them; → and ← change Listen for; the key caps say so', async ({ page }) => {
  await page.goto('/#3');
  await expect(page.locator('.deck-keys .deck-key kbd')).toHaveText(['space', '↑', '↓', '←', '→']);
  await expect(page.locator('.deck-keys .deck-key').nth(1)).toContainText('pattern');
  await expect(page.locator('.deck-keys .deck-key').nth(2)).toContainText('listen for');
  await page.locator('body').click({ position: { x: 600, y: 200 } });
  await page.keyboard.press('ArrowDown');
  await expect(notation(page)).toHaveText('51');
  await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '1');
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#51~pitch');
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#51');
  await page.keyboard.press('ArrowUp');
  await expect(notation(page)).toHaveText('3');
  await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '0');
  // ↑ on the first card: nothing (v6.2 ruling 2).
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(300);
  await expect(notation(page)).toHaveText('3');
  await page.screenshot({ path: `${SHOTS}/w4-keys-1280x800.png` });
  // About says the same.
  await page.goto('/#about');
  await expect(page.locator('.region-about')).toContainText('↑ and ↓ change the pattern, and ← and → change what you listen for');
});

test('↓ held from Cascade walks the cards to the last, brought into view, and stops there', async ({ page }) => {
  await page.goto('/#3');
  await page.locator('body').click({ position: { x: 600, y: 200 } });
  const cards = await page.locator('.deck-row[data-id] code').allTextContents();
  for (let i = 0; i < cards.length + 3; i++) await page.keyboard.press('ArrowDown');
  await expect(notation(page)).toHaveText(cards[cards.length - 1]!);
  const band = page.locator('.deck-row.in-band');
  await expect(band).toHaveAttribute('data-row', String(cards.length - 1));
  await expect(band).toBeInViewport({ ratio: 1 });
  const b = (await band.boundingBox())!;
  const w = (await page.locator('.deck-wheel').boundingBox())!;
  expect(b.y + b.height).toBeLessThanOrEqual(w.y + w.height + 1);
  expect(await editorHidden(page)).toBe(true);
});
