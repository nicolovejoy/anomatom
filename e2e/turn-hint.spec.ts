// Say the view turns (docs/plans/v6-9-full-view.md, item 6, ruling 2): in 3D the canvas shows a grab
// cursor (grabbing mid-drag), and a hint under the buttons says "Drag to turn, scroll to zoom"
// until the reader's first turn; a reload shows it again; in 2D it is hidden.
// Screenshots go to e2e/shots (gitignored).
import { mkdirSync } from 'node:fs';
import { expect, needWebGL, test, type Page } from './fixtures';

const three = (page: Page) => page.locator('canvas.juggler-3d');
const hint = (page: Page) => page.locator('.juggler-hint');
const shot = async (page: Page, name: string) => {
  mkdirSync('e2e/shots', { recursive: true });
  await page.screenshot({ path: `e2e/shots/${name}.png` });
};
async function open(page: Page) {
  await page.goto('/');
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-three', 'ready');
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '3d');
}

test.describe('at 1440×900, by mouse', () => {
  test.beforeEach(async ({ page, browserName }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await needWebGL(page, browserName);
  });

  test('the hint sits under the buttons; the cursor is grab; a drag ends the hint; a reload brings it back', async ({ page }) => {
    await open(page);
    await expect(hint(page)).toBeVisible();
    await expect(hint(page)).toHaveText('Drag to turn, scroll to zoom');
    await expect(hint(page)).toHaveAttribute('aria-hidden', 'true');
    const h = (await hint(page).boundingBox())!;
    const r = (await page.locator('.juggler-reset').boundingBox())!;
    const s = (await page.locator('.juggler-switch').boundingBox())!;
    expect(h.y).toBeGreaterThanOrEqual(r.y + r.height);
    expect(h.x + h.width).toBeLessThanOrEqual(s.x + s.width + 1);
    expect(await hint(page).evaluate((e) => !!e.previousElementSibling?.matches('.juggler-reset'))).toBe(true);
    await expect(three(page)).toHaveCSS('cursor', 'grab');
    await shot(page, 'turn-hint-1440x900');

    const b = (await three(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await expect(three(page)).toHaveCSS('cursor', 'grabbing');
    await page.mouse.move(b.x + b.width / 2 + 200, b.y + b.height / 2, { steps: 10 });
    await page.mouse.up();
    await expect(three(page)).toHaveCSS('cursor', 'grab');
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    await expect(hint(page)).toBeHidden();
    // Gone for the page's life, 2D and back included.
    await page.locator('.juggler-switch').click();
    await page.locator('.juggler-switch').click();
    await expect(hint(page)).toBeHidden();

    await page.reload();
    await open(page);
    await expect(hint(page)).toBeVisible();
  });

  test('in 2D the hint is hidden and the canvas keeps the default cursor', async ({ page }) => {
    await open(page);
    await page.locator('.juggler-switch').click();
    await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '2d');
    await expect(hint(page)).toBeHidden();
    await expect(page.locator('canvas.juggler:not(.juggler-3d)')).not.toHaveCSS('cursor', 'grab');
    await page.locator('.juggler-switch').click();
    await expect(hint(page)).toBeVisible();
  });

  test('a wheel tick ends the hint', async ({ page }) => {
    await open(page);
    const b = (await three(page).boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.wheel(0, 200);
    await expect(hint(page)).toBeHidden();
  });
});

test.describe('at 390×844, by touch', () => {
  test.use({ hasTouch: true });
  test('the hint sits under the buttons, its text chosen by the main pointer', async ({ page, browserName }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await needWebGL(page, browserName);
    await open(page);
    await expect(hint(page)).toBeVisible();
    // Headless Edge reports a fine pointer even with touch on; the copy is chosen by (pointer: coarse).
    const coarse = await page.evaluate(() => matchMedia('(pointer: coarse)').matches);
    await expect(hint(page)).toHaveText(coarse ? 'Drag to turn, pinch to zoom' : 'Drag to turn, scroll to zoom');
    const h = (await hint(page).boundingBox())!;
    const r = (await page.locator('.juggler-reset').boundingBox())!;
    expect(h.y).toBeGreaterThanOrEqual(r.y + r.height);
    expect(h.x).toBeGreaterThanOrEqual(0);
    await shot(page, 'turn-hint-390x844');
  });
});
