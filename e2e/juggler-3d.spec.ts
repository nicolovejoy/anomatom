// The juggler in 3D by default (docs/plans/v6-8-orbit-3d.md, T1): one, two, three and four
// jugglers at a phone and a laptop size draw on the 3D canvas, the same balls as the 2D hooks,
// inside the viewport, captioned from three parts; WebGL off or three.js failing to load leaves
// the 2D view, with no switch; the switch goes both ways and never touches the link.
// Screenshots go to test-results, and to E2E_SHOTS when it names a directory.
import { mkdirSync } from 'node:fs';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { expect, isCdnError, test, type Page } from './fixtures';

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
    test(`${id} at ${name}: drawn in 3D, ${jugglers} juggler${jugglers > 1 ? 's' : ''}, the 2D hooks’ balls`, async ({ page }) => {
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
      // The switch shows, naming 2D.
      await expect(page.locator('.juggler-switch')).toHaveText('2D');
      await page.waitForTimeout(800);
      await shot(page, `3d-${id}-${name}`);
      expect(errors).toEqual([]);
    });
  }
}

test('the switch: 3D to 2D and back, the link unchanged', async ({ page }) => {
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

test('a reload opens in 3D again', async ({ page }) => {
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
