// The share button (v2 plan, ruling 5; in the top bar from v4) and the short links it copies
// (ruling 4), headless. The clipboard is read for real, so this runs on Chromium-family browsers only.
import { partsFromVanilla } from '../src/core';
import { encodeState } from '../src/app/hash';
import { defaultState } from '../src/app/state';
import { applyPreset } from '../src/sound/mapping';
import { expect, openTab, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test('share copies the live short link when navigator.share is absent', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/#531@140');
  // In the top bar since v4 (D2); the head row it sat in went with the deck (D1).
  await expect(page.locator('#share-top')).toBeVisible();
  await expect(page.locator('#share-top')).toHaveAttribute('aria-label', 'Share this pattern');
  const box = (await page.locator('#share-top').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/share-top-bar.png' });
  await openTab(page, 'pattern');
  // Straight after an edit: the live state, not the debounced hash.
  await page.locator('#hand-0').fill('441');
  await page.locator('#share-top').click();
  await expect(page.locator('#share-status-top')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(new URL('/#441@140', page.url()).href);
  await page.screenshot({ path: 'test-results/share-copied.png' });
  // The copied link opens to the same pattern.
  const other = await context.newPage();
  await other.goto(copied);
  await expect(other.locator('#hand-0')).toHaveValue('441');
});

test('typing passing siteswap writes the short link #3p-3|3p-3, and the link reopens it', async ({ page }) => {
  await page.goto('/#3');
  await openTab(page, 'pattern');
  await expect(page.locator('.key-pass')).toBeHidden();
  await page.locator('#hand-0').fill('<3p 3|3p 3>');
  await expect(page.locator('.key-pass')).toBeVisible();
  await expect(page.locator('#status')).toContainText('6');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#3p-3(\||%7C)3p-3$/i);
  await page.goto('/#3p-3|3p-3');
  await expect(page.locator('#hand-0')).toHaveValue('<3p 3|3p 3>');
  await page.goto('/#3p3');
  await expect(page.locator('#hand-0')).toHaveValue('3p3');
});

test('the p key types a pass mark at the caret', async ({ page }) => {
  await page.goto('/#3p-3|3p-3');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('<3|3>');
  await page.locator('.key-pass').click();
  await expect(page.locator('#hand-0')).toHaveValue('<3|3>p');
});

test('the Sound tab no longer has a copy button', async ({ page }) => {
  await page.goto('/#531');
  await openTab(page, 'sound');
  await expect(page.locator('#sp-copy')).toHaveCount(0);
});

test('an old #v2. link and an old #v1. link still open, and restore their state', async ({ page }) => {
  const parts = partsFromVanilla('441');
  if (!parts.ok) throw new Error('441 reads');
  const v2 = encodeState({ ...defaultState(), parts: parts.parts, bpm: 150, mapping: applyPreset('ball-pitch') });
  await page.goto('/' + v2);
  await expect(page.locator('#hand-0')).toHaveValue('441');
  await expect(page.locator('#bpm')).toHaveValue('150');
  const v1 = '#v1.' + Buffer.from(JSON.stringify({ p: ['531', ''], r: [1, 1], t: 95 })).toString('base64url');
  await page.goto('/' + v1);
  await page.reload();
  await expect(page.locator('#hand-0')).toHaveValue('531');
  await expect(page.locator('#bpm')).toHaveValue('95');
});

test('the Box card writes #(4,2x)(2x,4)~height-drum, unescaped, and the link plays the box in a new page', async ({ page, context }) => {
  await page.goto('/');
  await page.locator('.deck-row[data-id="box"]').click();
  await expect(page.locator('.deck-notation')).toHaveText('(4,2x)(2x,4)');
  // The browser keeps ( ) and , as written in location.hash; if one escaped them the text would differ.
  await expect.poll(() => page.evaluate(() => location.hash)).toBe('#(4,2x)(2x,4)~height-drum');
  const other = await context.newPage();
  await other.goto(page.url());
  await openTab(other, 'pattern');
  await expect(other.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');
  await expect(other.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
});

test('a percent-encoded sync link opens the box; a junk sync hash loads the defaults', async ({ page }) => {
  await page.goto('/#%284%2C2x%29%282x%2C4%29');
  await openTab(page, 'pattern');
  await expect(page.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
  await page.goto('/#(4,');
  await page.reload();
  await openTab(page, 'pattern');
  // The defaults: the cascade, three balls.
  await expect(page.locator('#hand-0')).toHaveValue('3');
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
});
