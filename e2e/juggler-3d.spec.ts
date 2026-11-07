// The juggler in 3D by default (docs/plans/v6-8-orbit-3d.md, T1): one, two, three and four
// jugglers at a phone and a laptop size draw on the 3D canvas, the same balls as the 2D hooks,
// inside the viewport, captioned from three parts; WebGL off or three.js failing to load leaves
// the 2D view, with no switch; the switch goes both ways and never touches the link.
// Screenshots go to test-results, and to E2E_SHOTS when it names a directory.
import { mkdirSync } from 'node:fs';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { JUGGLER } from '../src/tunables';
import { expect, hasWebGL, isCdnError, needWebGL, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;
const CARDS = [
  ['cascade', 1],
  ['passing', 2],
  ['three-triangle', 3],
  ['four-square', 4],
] as const;
const SIZES = [
  ['390x844', { width: 390, height: 844 }],
  ['1280x800', { width: 1280, height: 800 }],
] as const;

const hashOf = (id: string) => {
  const card = PRESETS.find((p) => p.id === id)!;
  return encodeHash({ ...defaultState(), parts: card.parts, ratio: card.ratio });
};
const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
  return errors;
};
const shot = async (page: Page, name: string) => {
  await page.screenshot({ path: test.info().outputPath(`${name}.png`) });
  if (SHOTS) {
    mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: `${SHOTS}/${name}.png` });
  }
};
const region = (page: Page) => page.locator('.region-juggler');

for (const [id, jugglers] of CARDS) {
  for (const [name, viewport] of SIZES) {
    test(`${id} at ${name}: drawn in 3D, ${jugglers} juggler${jugglers > 1 ? 's' : ''}, the 2D hooks’ balls`, async ({ page, browserName }) => {
      await needWebGL(page, browserName);
      const errors = watchErrors(page);
      await page.setViewportSize(viewport);
      await page.goto(`/${hashOf(id)}`);
      await expect(page.locator('#play')).toBeEnabled();
      await expect(region(page)).toHaveAttribute('data-view', '3d');
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');

      const three = page.locator('canvas.juggler-3d');
      const flat = page.locator('canvas.juggler');
      await expect(three).toBeVisible();
      await expect(flat).toBeHidden();
      await expect(three).toHaveAttribute('role', 'img');
      expect(await three.getAttribute('aria-label')).toBe(await flat.getAttribute('aria-label'));
      // The same balls as the 2D view counts, which keeps counting while hidden.
      await expect(three).toHaveAttribute('data-balls', /^[1-9]\d*$/);
      await expect.poll(async () => (await three.getAttribute('data-balls')) === (await flat.getAttribute('data-balls'))).toBe(true);
      // Captions from three parts on, one per figure, as the 2D hook counts them.
      const figures = jugglers * 2 > 2 ? jugglers : 0;
      await expect(three).toHaveAttribute('data-figures', String(figures));
      await expect(flat).toHaveAttribute('data-figures', String(figures));
      await expect(page.locator('.juggler-captions span:not([hidden])')).toHaveCount(figures);
      if (figures) await expect(page.locator('.juggler-captions span').first()).toHaveText('Juggler 1');

      // Inside the viewport, and drawn at its laid-out size.
      const box = (await three.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 0.5);
      expect(box.width).toBeGreaterThan(100);
      expect(box.height).toBeGreaterThan(100);
      await expect.poll(() => three.evaluate((c: HTMLCanvasElement) => c.width > 0 && c.height > 0)).toBe(true);
      // The switch shows, naming 2D, in the juggler region's top-right corner (its node is after the deck).
      const toggle = page.locator('.juggler-switch');
      await expect(toggle).toHaveText('2D');
      const area = (await region(page).boundingBox())!;
      const corner = (await toggle.boundingBox())!;
      expect(corner.x + corner.width).toBeLessThanOrEqual(area.x + area.width + 0.5);
      expect(area.x + area.width - (corner.x + corner.width)).toBeLessThan(24);
      expect(corner.y).toBeGreaterThanOrEqual(area.y - 0.5);
      expect(corner.y - area.y).toBeLessThan(24);
      expect(corner.y + corner.height).toBeLessThanOrEqual(area.y + area.height);
      expect(await toggle.evaluate((t) => !t.closest('.region-juggler') && !!t.previousElementSibling?.matches('.region-deck'))).toBe(true);
      await page.waitForTimeout(800);
      await shot(page, `3d-${id}-${name}`);
      expect(errors).toEqual([]);
    });
  }
}

test('the switch: 3D to 2D and back, the link unchanged', async ({ page, browserName }) => {
  await needWebGL(page, browserName);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${hashOf('three-triangle')}`);
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  const hash = await page.evaluate(() => location.hash);
  const toggle = page.locator('.juggler-switch');
  await expect(toggle).toHaveText('2D');
  await expect(toggle).toHaveAccessibleName('Show the juggler in 2D, from the front');
  await toggle.click();
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await expect(page.locator('canvas.juggler')).toBeVisible();
  await expect(page.locator('canvas.juggler-3d')).toBeHidden();
  await expect(page.locator('.juggler-captions')).toBeHidden();
  await expect(toggle).toHaveText('3D');
  await expect(toggle).toHaveAccessibleName('Show the juggler in 3D');
  await page.locator('#play').click();
  await page.waitForTimeout(800);
  await shot(page, '2d-three-triangle-390x844');
  await toggle.click();
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  await expect(page.locator('canvas.juggler-3d')).toBeVisible();
  await expect(page.locator('canvas.juggler')).toBeHidden();
  await expect(toggle).toHaveText('2D');
  expect(await page.evaluate(() => location.hash)).toBe(hash);
});

test('a reload opens in 3D again', async ({ page, browserName }) => {
  await needWebGL(page, browserName);
  await page.goto(`/${hashOf('cascade')}`);
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  await page.locator('.juggler-switch').click();
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await page.reload();
  await expect(region(page)).toHaveAttribute('data-view', '3d');
});

test('no WebGL: the 2D view stays, with no switch', async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
      if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
      return (original as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
    } as typeof original;
  });
  const errors = watchErrors(page);
  const loaded = page.waitForRequest(/\/three-[^/]*\.js$/);
  await page.goto(`/${hashOf('four-square')}`);
  await loaded;
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.waitForTimeout(1000);
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await expect(page.locator('canvas.juggler')).toBeVisible();
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '12');
  await expect(page.locator('canvas.juggler-3d')).toHaveCount(0);
  await expect(page.locator('.juggler-switch')).toBeHidden();
  expect(errors).toEqual([]);
});

test('three.js failing to load: the 2D view stays, with no switch', async ({ page }) => {
  let refused = 0;
  await page.route(/\/three-[^/]*\.js$/, (route) => {
    refused++;
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto(`/${hashOf('passing')}`);
  await expect.poll(() => refused).toBeGreaterThan(0);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.waitForTimeout(1000);
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await expect(page.locator('canvas.juggler')).toBeVisible();
  await expect(page.locator('canvas.juggler-3d')).toHaveCount(0);
  await expect(page.locator('.juggler-switch')).toBeHidden();
});

test('a flight longer than a human throw draws dimmed in 3D, as the note says', async ({ page, browserName }) => {
  await needWebGL(page, browserName);
  // One ball, one hit in 16 steps at 120 bpm: its flight is over HUMAN_AIRTIME_SECONDS.
  const parts = [{ s: 1, f: 0, u: 1, o: '1000000000000000', k: 1 }];
  const link = '/#v3.' + Buffer.from(JSON.stringify({ p: parts, r: [1, 1], t: 120, l: 'height' })).toString('base64url');
  // A card first, so the ball meshes are made and drawn undimmed before the long flight.
  await page.goto(`/${hashOf('cascade')}`);
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  await page.locator('#play').click();
  const three = page.locator('canvas.juggler-3d');
  await expect(three).toHaveAttribute('data-dimmed', '0');
  await page.goto('about:blank');
  await page.goto(link);
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  await page.locator('#play').click();
  await expect(page.locator('.juggler-note')).toBeVisible();
  // While the note shows, the ball in the air draws see-through, at JUGGLER.inhumanAlpha.
  await expect
    .poll(() => page.evaluate(() => !(document.querySelector('.juggler-note') as HTMLElement).hidden && document.querySelector('canvas.juggler-3d')!.getAttribute('data-dimmed') === '1'))
    .toBe(true);
  expect(JUGGLER.inhumanAlpha).toBeLessThan(1);
  await shot(page, '3d-not-human-1280x720');
});

test('the WebGL context lost mid-play: the 2D view takes over and keeps counting', async ({ page, browserName }) => {
  await needWebGL(page, browserName);
  const errors = watchErrors(page);
  await page.goto(`/${hashOf('three-triangle')}`);
  await expect(region(page)).toHaveAttribute('data-view', '3d');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('canvas.juggler-3d')).toHaveAttribute('data-balls', '9');
  await page.evaluate(() => {
    const gl = (document.querySelector('canvas.juggler-3d') as HTMLCanvasElement).getContext('webgl2')!;
    gl.getExtension('WEBGL_lose_context')!.loseContext();
  });
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await expect(region(page)).toHaveAttribute('data-three', 'none');
  await expect(page.locator('canvas.juggler-3d')).toHaveCount(0);
  await expect(page.locator('.juggler-switch')).toBeHidden();
  const flat = page.locator('canvas.juggler');
  await expect(flat).toBeVisible();
  await expect(flat).toHaveAttribute('data-balls', '9');
  await expect(flat).toHaveAttribute('data-figures', '3');
  // Still drawing: the 2D canvas's pixels change from frame to frame.
  const pixels = () => flat.evaluate((c: HTMLCanvasElement) => c.toDataURL());
  const first = await pixels();
  await expect.poll(pixels).not.toBe(first);
  expect(errors.filter((e) => !/WebGL|context/i.test(e))).toEqual([]);
});

test('a browser without WebGL 2: the 2D view, and no switch', async ({ page }) => {
  test.skip(await hasWebGL(page), 'this browser has WebGL: the 3D tests above run instead');
  // Forced (E2E_NO_WEBGL) where WebGL exists: the browser is made to lack it, as CI's headless Firefox does.
  if (process.env.E2E_NO_WEBGL) {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string, ...rest: unknown[]) {
        if (kind === 'webgl' || kind === 'webgl2' || kind === 'experimental-webgl') return null;
        return (original as (...a: unknown[]) => RenderingContext | null).call(this, kind, ...rest);
      } as typeof original;
    });
  }
  await page.goto(`/${hashOf('three-triangle')}`);
  await expect(region(page)).toHaveAttribute('data-three', 'none');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(region(page)).toHaveAttribute('data-view', '2d');
  await expect(page.locator('canvas.juggler')).toBeVisible();
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '9');
  await expect(page.locator('canvas.juggler-3d')).toHaveCount(0);
  await expect(page.locator('.juggler-switch')).toBeHidden();
});
