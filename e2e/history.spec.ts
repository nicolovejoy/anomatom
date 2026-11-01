// v4 D2: Back and Forward, and the wordmark reset (docs/plans/v4-deck.md rulings 6 and 7), headless.
import { expect, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

/** A pasted link: the same change the share path makes (a new entry, then the hash is restored). */
async function pasteLink(page: Page, hash: string) {
  await page.evaluate((h) => {
    history.pushState(null, '', h);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }, hash);
}

test('a parts change is a history entry: Back restores 3, Forward restores 531', async ({ page }) => {
  await page.goto('/#3');
  await page.locator('#tab-pattern').click();
  await page.locator('#hand-0').fill('531');
  await expect.poll(() => new URL(page.url()).hash).toBe('#531');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).hash).toBe('#3');
  await expect(page.locator('#hand-0')).toHaveValue('3');
  await page.goForward();
  await expect.poll(() => new URL(page.url()).hash).toBe('#531');
  await expect(page.locator('#hand-0')).toHaveValue('531');
});

test('a tempo change replaces the entry: Back goes to the pattern before, not the old tempo', async ({ page }) => {
  await page.goto('/#3');
  await pasteLink(page, '#531');
  await page.locator('#tab-rhythm').click();
  await page.locator('#bpm').fill('90');
  await page.locator('#bpm').press('Enter');
  await expect.poll(() => new URL(page.url()).hash).toBe('#531@90');
  await page.goBack();
  await expect.poll(() => new URL(page.url()).hash).toBe('#3');
});

test('a pasted link then Back restores the earlier pattern', async ({ page }) => {
  await page.goto('/#3');
  await pasteLink(page, '#531');
  await expect(page.locator('#hand-0')).toHaveValue('531');
  await page.goBack();
  await expect(page.locator('#hand-0')).toHaveValue('3');
  await page.goForward();
  await expect(page.locator('#hand-0')).toHaveValue('531');
});

test('the wordmark asks first: Cancel keeps the hash, Reset lands on the bare address at 104', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/#531@90');
  await page.locator('.wordmark').click();
  await expect(page.locator('.reset-question')).toHaveText('Start over?');
  await expect(page.locator('.topbar-main')).toBeHidden();
  await page.locator('.reset-cancel').click();
  await expect(page.locator('.topbar-main')).toBeVisible();
  expect(new URL(page.url()).hash).toBe('#531@90');
  // Escape does the same.
  await page.locator('.wordmark').click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.topbar-main')).toBeVisible();
  // Reset.
  await page.locator('.wordmark').click();
  await page.locator('.reset-go').click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('#hand-0')).toHaveValue('3');
  // The tempo input exists whether or not its tab (or the card screen over it) is showing.
  await expect(page.locator('#bpm')).toHaveValue('104');
  expect(errors).toEqual([]);
});

test('the top-bar share button copies the live link', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/#531@140');
  await page.locator('#share-top').click();
  await expect(page.locator('#share-status-top')).toHaveText('Link copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(new URL('/#531@140', page.url()).href);
});
