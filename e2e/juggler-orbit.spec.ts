// The orbit on the 3D juggler (docs/plans/v6-8-orbit-3d.md, T2, ruling 10): a drag turns the
// view round the jugglers, the wheel (or a pinch) moves it nearer or farther within its limits,
// the elevation stays between 5° and 80°, Reset view returns the default camera. On a phone a
// one-finger drag on the 3D canvas (real touch points, by CDP) turns the view and neither scrolls
// the page nor grows the deck's card. A new card with as many jugglers keeps the reader's camera;
// one with another number resets it. The camera is never in the link.
// Screenshots go to test-results, and to E2E_SHOTS when it names a directory.
import { mkdirSync } from 'node:fs';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { VIEW3D } from '../src/tunables';
import { expect, isCdnError, needWebGL, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;
const DESK = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

const hashOf = (id: string) => {
  const card = PRESETS.find((p) => p.id === id)!;
  return encodeHash({ ...defaultState(), parts: card.parts, ratio: card.ratio });
};
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
};
const three = (page: Page) => page.locator('canvas.juggler-3d');
/** `data-camera` as numbers: azimuth and elevation in whole degrees, distance in metres. */
const camera = async (page: Page) => {
  const [azimuth, elevation, distance] = ((await three(page).getAttribute('data-camera')) ?? '').split(',').map(Number);
  return { azimuth: azimuth!, elevation: elevation!, distance: distance! };
};
/**
 * `data-camera` once the drag's last moves are drawn: unchanged over ten frames. `data-camera-moved`
 * turns true on the first frame of a drag, so a read straight after it can catch the camera
 * part-way (#160, seen on WebKit).
 */
const settledCamera = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<string>((done) => {
        const c = document.querySelector('canvas.juggler-3d')!;
        let last = c.getAttribute('data-camera');
        let still = 0;
        const tick = () => {
          const now = c.getAttribute('data-camera');
          still = now === last ? still + 1 : 0;
          last = now;
          if (still >= 10) done(now ?? '');
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
  );
/** The canvas's centre, in page pixels. */
const centre = async (page: Page) => {
  const b = (await three(page).boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};

/** Opens `id` in 3D and plays it, the camera at its default (`hook`). */
async function open(page: Page, id: string, hook: string) {
  await page.goto(`/${hashOf(id)}`);
  await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '3d');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(three(page)).toHaveAttribute('data-camera', hook);
  await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
}

async function mouseDrag(page: Page, dx: number, dy: number) {
  const c = await centre(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  await page.mouse.move(c.x + dx, c.y + dy, { steps: 12 });
  await page.mouse.up();
}

// Two jugglers face to face: the default camera is turned 30° toward juggler 1, raised 20°, 8 m off.
const PASSING = `${VIEW3D.twoAzimuthDeg},${VIEW3D.elevationDeg},${VIEW3D.cameraMetres.toFixed(1)}`;
const CASCADE = `0,${VIEW3D.elevationDeg},${VIEW3D.cameraMetres.toFixed(1)}`;

test.describe('at 1280×800, by mouse', () => {
  test.beforeEach(async ({ page, browserName }) => {
    await page.setViewportSize(DESK);
    await needWebGL(page, browserName);
  });

  test('a drag turns the view round the jugglers; Reset view brings the default back', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
    await open(page, 'passing', PASSING);
    const reset = page.locator('.juggler-reset');
    await expect(reset).toBeVisible();
    await expect(reset).toHaveAccessibleName('Reset view');
    // Beside the switch, left of it, and after it in the page (the wheel still the first Tab stop after About).
    const r = (await reset.boundingBox())!;
    const s = (await page.locator('.juggler-switch').boundingBox())!;
    expect(r.x + r.width).toBeLessThanOrEqual(s.x);
    expect(Math.abs(r.y - s.y)).toBeLessThan(1);
    expect(await reset.evaluate((b) => !!b.previousElementSibling?.matches('.juggler-switch'))).toBe(true);
    await page.waitForTimeout(600);
    await shot(page, 'orbit-default-1280x800');
    const hash = await page.evaluate(() => location.hash);

    await mouseDrag(page, 240, 0);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    const moved = await camera(page);
    expect(moved.azimuth).not.toBe(VIEW3D.twoAzimuthDeg);
    expect(moved.elevation).toBe(VIEW3D.elevationDeg);
    expect(moved.distance).toBe(VIEW3D.cameraMetres);
    await page.waitForTimeout(400);
    await shot(page, 'orbit-turned-1280x800');
    // The camera is never in the link.
    expect(await page.evaluate(() => location.hash)).toBe(hash);

    await reset.click();
    await expect(three(page)).toHaveAttribute('data-camera', PASSING);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
    expect(errors).toEqual([]);
  });

  test('the wheel moves the camera nearer and farther, within its limits', async ({ page }) => {
    await open(page, 'passing', PASSING);
    const c = await centre(page);
    await page.mouse.move(c.x, c.y);
    await page.mouse.wheel(0, 200);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    await expect.poll(async () => (await camera(page)).distance).toBeGreaterThan(VIEW3D.cameraMetres);
    for (let i = 0; i < 30; i++) await page.mouse.wheel(0, 400);
    await expect.poll(async () => (await camera(page)).distance).toBe(VIEW3D.maxDistance);
    for (let i = 0; i < 60; i++) await page.mouse.wheel(0, -400);
    await expect.poll(async () => (await camera(page)).distance).toBe(VIEW3D.minDistance);
    const { azimuth, elevation } = await camera(page);
    expect([azimuth, elevation]).toEqual([VIEW3D.twoAzimuthDeg, VIEW3D.elevationDeg]);
    await page.locator('.juggler-reset').click();
    await expect(three(page)).toHaveAttribute('data-camera', PASSING);
  });

  test('a drag far down or far up stops at 80° and at 5°', async ({ page }) => {
    await open(page, 'cascade', CASCADE);
    // Far: at rotateSpeed a drag the canvas's height turns about 160°; three drags of half its
    // height each way (each inside the canvas) go past either limit.
    const half = (await three(page).boundingBox())!.height * 0.45;
    for (let i = 0; i < 3; i++) await mouseDrag(page, 0, half);
    await expect.poll(async () => (await camera(page)).elevation).toBe(VIEW3D.maxElevationDeg);
    for (let i = 0; i < 3; i++) await mouseDrag(page, 0, -half);
    await expect.poll(async () => (await camera(page)).elevation).toBe(VIEW3D.minElevationDeg);
    await page.locator('.juggler-reset').click();
    await expect(three(page)).toHaveAttribute('data-camera', CASCADE);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
  });

  test('a new card with as many jugglers keeps the camera; another number resets it', async ({ page }) => {
    await open(page, 'passing', PASSING);
    await mouseDrag(page, -200, 60);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    const moved = await settledCamera(page);
    // Ultimates: two jugglers again.
    const before = await page.locator('.deck-notation').textContent();
    await page.evaluate((h) => (location.hash = h), hashOf('ultimates'));
    await expect(page.locator('.deck-notation')).not.toHaveText(before!);
    // Past the change at the cycle's end, and the framing's ease.
    await page.waitForTimeout(2500);
    await expect(three(page)).toHaveAttribute('data-camera', moved!);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    // The cascade: one juggler, so the default camera for one.
    await page.evaluate((h) => (location.hash = h), hashOf('cascade'));
    await expect(three(page)).toHaveAttribute('data-camera', CASCADE);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
  });

  test('in 2D there is no Reset view; back in 3D, the turned camera is still the reader’s', async ({ page }) => {
    await open(page, 'cascade', CASCADE);
    await mouseDrag(page, 150, 0);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    const moved = await settledCamera(page);
    await page.locator('.juggler-switch').click();
    await expect(page.locator('.region-juggler')).toHaveAttribute('data-view', '2d');
    await expect(page.locator('.juggler-reset')).toBeHidden();
    await page.locator('.juggler-switch').click();
    await expect(page.locator('.juggler-reset')).toBeVisible();
    await expect(three(page)).toHaveAttribute('data-camera', moved!);
  });
});

test.describe('at 390×844, by real touch', () => {
  test('a one-finger drag turns the view, and neither scrolls the page nor grows the card', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP touch events are Chromium only');
    await page.setViewportSize(PHONE);
    await needWebGL(page, browserName);
    await open(page, 'four-square', CASCADE);
    const wheel = page.locator('.deck-wheel');
    await expect(wheel).toHaveAttribute('data-phase', 'compact');
    const card = (await page.locator('.deck-picker').boundingBox())!;
    const scrollY = await page.evaluate(() => window.scrollY);
    await page.waitForTimeout(600);
    await shot(page, 'orbit-default-390x844');

    const c = await centre(page);
    const cdp = await page.context().newCDPSession(page);
    // Watch the card and the scroll through the whole drag, not just at its end.
    await page.evaluate(() => {
      const w = document.querySelector('.deck-wheel')!;
      const seen = new Set<string>();
      (window as unknown as { seen: Set<string> }).seen = seen;
      new MutationObserver(() => seen.add(w.getAttribute('data-phase') ?? '')).observe(w, { attributes: true, attributeFilter: ['data-phase'] });
      addEventListener('scroll', () => seen.add('scrolled'), { capture: true });
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y }] });
    for (let k = 1; k <= 12; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: c.x + k * 12, y: c.y + k * 6 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    await expect(three(page)).toHaveAttribute('data-camera-moved', 'true');
    expect((await camera(page)).azimuth).not.toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollY);
    await page.waitForTimeout(600);
    // The card never grows and the page never scrolls. v6.10: the drag enters full view, where the
    // card is hidden and reads as not upright (v6.10 ruling 1), so its phase may close to 'rest'.
    const seen = await page.evaluate(() => [...(window as unknown as { seen: Set<string> }).seen]);
    expect(seen.filter((s) => s !== 'rest')).toEqual([]);
    // v6.9: the drag also enters full view, which hides the card; ⤡ brings it back as it was, compact.
    await expect(page.locator('#app')).toHaveClass(/(^|\s)is-full(\s|$)/);
    await shot(page, 'orbit-turned-390x844');
    await page.locator('.juggler-full').click();
    await expect(wheel).toHaveAttribute('data-phase', 'compact');
    const after = (await page.locator('.deck-picker').boundingBox())!;
    expect(after.height).toBeCloseTo(card.height, 0);

    await page.locator('.juggler-reset').click();
    await expect(three(page)).toHaveAttribute('data-camera', CASCADE);
    await expect(three(page)).toHaveAttribute('data-camera-moved', 'false');
  });
});
