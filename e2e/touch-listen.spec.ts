// v6.9 stream S2 (docs/plans/v6-9-full-view.md, ruling 3): on a touch screen the wide layout's
// key bar becomes three Listen for buttons. Headless. `isMobile` + `hasTouch` make the pointer
// coarse; the desktop run keeps the key caps.
import { mkdirSync } from 'node:fs';
import { expect, test } from './fixtures';

mkdirSync('e2e/shots', { recursive: true });
const options = (page: import('@playwright/test').Page) => page.locator('.deck-listen-option');

test.describe('a coarse pointer, wide layout', () => {
  test.use({ viewport: { width: 1180, height: 820 }, isMobile: true, hasTouch: true });

  test('the buttons replace the key bar and follow Listen for', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'isMobile is Chromium and WebKit only; one engine is enough');
    await page.goto('/');
    await expect(page.locator('#app')).toHaveClass(/is-web/);
    await expect(page.locator('#app')).toHaveClass(/is-coarse/);
    await expect(page.locator('.deck-keys')).toBeHidden();
    await expect(options(page)).toHaveText(['Height', 'Each ball', 'Pitch']);
    await expect(page.getByRole('group', { name: 'Listen for' }).first()).toBeVisible();
    for (const b of await options(page).all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(options(page).nth(1)).toHaveAttribute('aria-pressed', 'true');

    await options(page).nth(2).tap();
    await expect(options(page).nth(2)).toHaveAttribute('aria-pressed', 'true');
    await expect(options(page).nth(1)).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator('#deck-listen')).toHaveValue('pitch');
    await expect(page.locator('.sp-choice[aria-pressed="true"]')).toHaveAttribute('data-listen', 'pitch');

    // The keys still work, and the lit button follows.
    await page.locator('#play').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(options(page).nth(1)).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: 'e2e/shots/touch-listen-1180x820.png' });
  });
});

test.describe('a fine pointer, wide layout', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('the key bar shows and the buttons do not', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#app')).toHaveClass(/is-web/);
    await expect(page.locator('#app')).not.toHaveClass(/is-coarse/);
    await expect(page.locator('.deck-keys')).toBeVisible();
    await expect(options(page).first()).toBeHidden();
  });
});

test.describe('the phone layout', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('keeps its select; the buttons do not show', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine is enough');
    await page.goto('/');
    await expect(options(page).first()).toBeHidden();
  });
});
