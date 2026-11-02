// v5 stream B1 (docs/plans/v5-sound-model.md, ruling 8): the wide layout, headless at 1280×800.
// One panel at a time beside the stage, picked in the top bar (Patterns / Sound / Stage); the
// pattern's name in the top bar; the bar under the stage is Play alone with key caps; no ‹ ›
// anywhere; one volume slider. Each key: ← → pattern, ↑ ↓ Listen for, Space play, none of them
// in a text field. Screenshots go to e2e/shots/, or to WEB_LAYOUT_SHOTS when it names a directory.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test, type Page } from './fixtures';

const SHOTS = process.env.WEB_LAYOUT_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

test.use({ viewport: { width: 1280, height: 800 } });

const option = (page: Page, panel: string) => page.locator(`.panel-option[data-panel="${panel}"]`);
const notation = (page: Page) => page.locator('.deck-notation');
const listen = (page: Page) => page.locator('.sp-choice[aria-pressed="true"]');

/** No ‹ or › on screen: neither the arrow buttons nor the characters anywhere visible. */
async function noCarets(page: Page) {
  await expect(page.locator('.deck-prev')).toBeHidden();
  await expect(page.locator('.deck-next')).toBeHidden();
  expect(await page.evaluate(() => /[‹›]/.test(document.body.innerText))).toBe(false);
}

test('a bare address: the mark, the pattern’s name and the panel choice in the top bar; Patterns shows', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => !isCdnError(e.message) && errors.push(e.message));
  await page.goto('/');
  const top = page.locator('.topbar');
  await expect(top.locator('.wordmark')).toBeVisible();
  await expect(top.locator('.deck-name')).toHaveText('Cascade');
  await expect(top.locator('.deck-notation')).toHaveText('3');
  await expect(option(page, 'patterns')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.panel-option')).toHaveText(['Patterns', 'Sound', 'Stage']);
  // The name sits beside the mark, left of the panel choice.
  const mark = (await top.locator('.wordmark').boundingBox())!;
  const name = (await top.locator('.deck-pattern').boundingBox())!;
  const choice = (await page.locator('.panel-choice').boundingBox())!;
  expect(name.x).toBeGreaterThan(mark.x + mark.width);
  expect(name.x + name.width).toBeLessThanOrEqual(choice.x);
  // Patterns: the wheel, then Pattern and Rhythm; no Sound tab, no Sound panel.
  await expect(page.locator('.deck-wheel')).toBeVisible();
  await expect(page.locator('#tab-pattern')).toBeVisible();
  await expect(page.locator('#tab-rhythm')).toBeVisible();
  await expect(page.locator('#tab-sound')).toBeHidden();
  await expect(page.locator('#panel-sound')).toBeHidden();
  // The bar: Play and the key caps; no volume, no sound row, no carets.
  await expect(page.locator('#play')).toHaveText('Play');
  await expect(page.locator('.deck-keys kbd')).toHaveText(['space', '←', '→', '↑', '↓']);
  await expect(page.locator('.deck-volume')).toBeHidden();
  await expect(page.locator('.deck-sound')).toBeHidden();
  await noCarets(page);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/web-patterns-1280x800.png` });
  expect(errors).toEqual([]);
});

test('Sound: the Sound panel alone, with the one volume slider; Stage: the stage alone, the whole width', async ({ page }) => {
  await page.goto('/#3');
  const stageWide = (await page.locator('.stage').boundingBox())!.width;

  await option(page, 'sound').click();
  await expect(option(page, 'sound')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#panel-sound')).toBeVisible();
  await expect(page.locator('.sheet-tabs')).toBeHidden();
  await expect(page.locator('.deck-wheel')).toBeHidden();
  await expect(page.locator('#panel-pattern')).toBeHidden();
  // One volume slider on screen: the Sound panel's.
  await expect(page.locator('#sp-volume')).toBeVisible();
  await expect(page.locator('#volume')).toBeHidden();
  await expect(page.locator('.sp-keys kbd')).toHaveText(['↑', '↓']);
  await noCarets(page);
  await page.screenshot({ path: `${SHOTS}/web-sound-1280x800.png` });

  await option(page, 'stage').click();
  await expect(option(page, 'stage')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.region-sheet')).toBeHidden();
  await expect(page.locator('.deck-wheel')).toBeHidden();
  await expect(page.locator('#play')).toBeVisible();
  await expect.poll(async () => (await page.locator('.stage').boundingBox())!.width).toBeGreaterThan(stageWide + 300);
  await noCarets(page);
  await page.screenshot({ path: `${SHOTS}/web-stage-1280x800.png` });

  // Back to Patterns: the wheel and the Pattern tab again, the wheel on the loaded pattern.
  await option(page, 'patterns').click();
  await expect(page.locator('.deck-wheel')).toBeVisible();
  await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.deck-row.on')).toHaveAttribute('data-id', 'cascade');
});

test('the pattern’s name in the top bar shows the patterns from another panel', async ({ page }) => {
  await page.goto('/#3');
  await option(page, 'stage').click();
  await page.locator('.topbar .deck-pattern').click();
  await expect(option(page, 'patterns')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.deck-wheel')).toBeVisible();
  await expect(page.locator('.deck-row:focus')).toHaveCount(1);
});

test('each key: ← → the pattern, ↑ ↓ Listen for, Space plays; from every panel', async ({ page }) => {
  await page.goto('/#3');
  for (const panel of ['patterns', 'sound', 'stage']) {
    await option(page, panel).click();
    await page.locator('body').click({ position: { x: 600, y: 200 } });
    await page.keyboard.press('ArrowRight');
    await expect(notation(page)).toHaveText('51');
    await page.keyboard.press('ArrowLeft');
    await expect(notation(page)).toHaveText('3');
    // ↓ goes down the Listen for list (ball → pitch), ↑ back up, wrapping (height → pitch).
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3~pitch');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3~height');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3~pitch');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#3');
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toHaveText('Play');
  }
  // The Sound panel follows ↑ ↓.
  await option(page, 'sound').click();
  await page.locator('body').click({ position: { x: 600, y: 200 } });
  await page.keyboard.press('ArrowDown');
  await expect(listen(page)).toHaveAttribute('data-listen', 'pitch');
});

test('no key fires while a text field has focus', async ({ page }) => {
  await page.goto('/#3');
  await page.locator('#hand-0').focus();
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
  await page.keyboard.press('Space');
  await expect(notation(page)).toHaveText('3');
  await expect(page.locator('#play')).toHaveText('Play');
  await option(page, 'sound').click();
  await expect(listen(page)).toHaveAttribute('data-listen', 'ball');
  // The tempo box is a text field too.
  await page.locator('#bpm').focus();
  for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']) await page.keyboard.press(key);
  await expect(notation(page)).toHaveText('3');
  await expect(listen(page)).toHaveAttribute('data-listen', 'ball');
});

test('a mute set at phone width is cleared when the wide layout takes over', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#3');
  const master = () => page.locator('.region-deck').getAttribute('data-master');
  await page.locator('#mute').click();
  await expect.poll(master).toBe('0');
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator('#mute')).toBeHidden();
  await expect.poll(master).toBe('0.5');
  await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
});

test('a phone on its side keeps the phone’s deck: carets, volume, no panel choice', async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto('/#3');
  await expect(page.locator('.panel-choice')).toBeHidden();
  await expect(page.locator('.deck-prev')).toBeVisible();
  await expect(page.locator('#volume')).toBeVisible();
  await expect(page.locator('.deck-keys')).toBeHidden();
  // ↑ ↓ do nothing here: no key caps say they would.
  await page.locator('body').click({ position: { x: 5, y: 60 } });
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(400);
  expect(await page.evaluate(() => location.hash)).toBe('#3');
});
