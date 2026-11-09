// True fullscreen with full view (docs/plans/v6-9-full-view.md, stream S4): ⤢ asks for it inside
// its click, a stage gesture never does, and leaving either leaves both. The browser is never
// asked for real fullscreen: a script stubs the request and exit, counts the calls and plays the
// browser's part (a fullscreen element, then fullscreenchange). Headless.
import { expect, needWebGL, test, type Page } from './fixtures';

declare global {
  interface Window {
    __fs: { requests: number; exits: number; on: boolean };
  }
}

const app = (page: Page) => page.locator('#app');
const full = (page: Page) => page.locator('.juggler-full');
const inFull = (page: Page) => expect(app(page)).toHaveClass(/(^|\s)is-full(\s|$)/);
const outOfFull = (page: Page) => expect(app(page)).not.toHaveClass(/(^|\s)is-full(\s|$)/);
const counts = (page: Page) => page.evaluate(() => ({ requests: window.__fs.requests, exits: window.__fs.exits }));

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const fs = { requests: 0, exits: 0, on: false };
    window.__fs = fs;
    const change = () => document.dispatchEvent(new Event('fullscreenchange'));
    const request = () => {
      fs.requests += 1;
      fs.on = true;
      queueMicrotask(change);
      return Promise.resolve();
    };
    const exit = () => {
      fs.exits += 1;
      fs.on = false;
      queueMicrotask(change);
      return Promise.resolve();
    };
    Element.prototype.requestFullscreen = request;
    (Element.prototype as unknown as Record<string, unknown>).webkitRequestFullscreen = request;
    Document.prototype.exitFullscreen = exit;
    (Document.prototype as unknown as Record<string, unknown>).webkitExitFullscreen = exit;
    for (const prop of ['fullscreenElement', 'webkitFullscreenElement']) {
      Object.defineProperty(document, prop, { configurable: true, get: () => (fs.on ? document.documentElement : null) });
    }
  });
});

test.use({ viewport: { width: 1440, height: 900 } });

test('a drag on the 3D view enters full view and asks for no fullscreen', async ({ page, browserName }) => {
  await page.goto('/#3');
  await needWebGL(page, browserName);
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '3d');
  const b = (await page.locator('canvas.juggler-3d').boundingBox())!;
  const x = b.x + b.width / 2;
  const y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 80, y, { steps: 12 });
  await page.mouse.up();
  await inFull(page);
  expect(await counts(page)).toEqual({ requests: 0, exits: 0 });
  // Leaving a full view that never had fullscreen exits nothing.
  await full(page).click();
  await outOfFull(page);
  expect(await counts(page)).toEqual({ requests: 0, exits: 0 });
});

test('⤢ asks once; ⤡ leaves fullscreen with it', async ({ page }) => {
  await page.goto('/#3');
  await full(page).click();
  await inFull(page);
  expect(await counts(page)).toEqual({ requests: 1, exits: 0 });
  await full(page).click();
  await outOfFull(page);
  expect(await counts(page)).toEqual({ requests: 1, exits: 1 });
});

test('Escape in full view leaves fullscreen too', async ({ page }) => {
  await page.goto('/#3');
  await full(page).click();
  await inFull(page);
  await page.keyboard.press('Escape');
  await outOfFull(page);
  expect(await counts(page)).toEqual({ requests: 1, exits: 1 });
});

test("the browser's own exit (fullscreenchange with no element) leaves full view", async ({ page }) => {
  await page.goto('/#3');
  await full(page).click();
  await inFull(page);
  await page.evaluate(() => {
    window.__fs.on = false;
    document.dispatchEvent(new Event('fullscreenchange'));
  });
  await outOfFull(page);
  // The browser already left fullscreen: nothing is asked to leave it again.
  expect(await counts(page)).toEqual({ requests: 1, exits: 0 });
});

test('a refused request leaves full view standing and says nothing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(() => {
    const refuse = () => Promise.reject(new Error('refused'));
    Element.prototype.requestFullscreen = refuse;
    (Element.prototype as unknown as Record<string, unknown>).webkitRequestFullscreen = refuse;
  });
  await page.goto('/#3');
  await full(page).click();
  await inFull(page);
  await page.waitForTimeout(200);
  expect(errors).toEqual([]);
});
