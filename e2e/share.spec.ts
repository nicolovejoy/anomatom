// The share button in the head row (v2 plan, ruling 5) and the short links it copies (ruling 4),
// headless. The clipboard is read for real, so this runs on Chromium-family browsers only.
import { expect, test } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

test('share copies the live short link when navigator.share is absent', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
  });
  await page.goto('/#531@140');
  await expect(page.locator('#share')).toBeVisible();
  await expect(page.locator('#share')).toHaveAttribute('aria-label', 'Share this pattern');
  const box = (await page.locator('#share').boundingBox())!;
  expect(box.width).toBeGreaterThanOrEqual(44);
  expect(box.height).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: 'test-results/share-head-row.png' });
  await page.locator('#tab-pattern').click();
  // Straight after an edit: the live state, not the debounced hash.
  await page.locator('#hand-0').fill('441');
  await page.locator('#share').click();
  await expect(page.locator('#share-status')).toHaveText('Link copied');
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(new URL('/#441@140', page.url()).href);
  await page.screenshot({ path: 'test-results/share-copied.png' });
  // The copied link opens to the same pattern.
  const other = await context.newPage();
  await other.goto(copied);
  await expect(other.locator('#hand-0')).toHaveValue('441');
});

test('the Sound tab no longer has a copy button', async ({ page }) => {
  await page.goto('/#531');
  await page.locator('#tab-sound').click();
  await expect(page.locator('#sp-copy')).toHaveCount(0);
});

test('an old #v2. link still opens', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('#share')).toBeVisible();
});
