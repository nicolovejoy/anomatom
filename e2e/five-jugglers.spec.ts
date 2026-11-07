// Five jugglers (docs/plans/v6-8-orbit-3d.md §4): each five-juggler card, Star and Typewriter
// feed, at desktop and phone sizes plays with five figures, the engine's fifteen balls and ten
// lanes in the strip, and the Sound panel lists five jugglers on the five drum machines, which
// Change drum machines moves together and keeps apart. The Jugglers 5 chip holds the two cards,
// both links round-trip, and a six-juggler pattern typed is refused naming five. `data-figures`
// and `data-balls` are the 2D hooks on canvas.juggler, set whichever view shows. In 3D (v6.8 T1,
// the default) the five stand on the ring, five captions shown. Screenshots go to FIVE_SHOTS when
// it names a directory.
import { mkdirSync } from 'node:fs';
import { buildSchedule } from '../src/core';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { DRUMMER_KITS, JUGGLER, MAX_JUGGLERS } from '../src/tunables';
import { copy } from '../src/ui/copy';
import { expect, hasWebGL, isCdnError, NO_WEBGL, openTab, show2d, test, type Page } from './fixtures';

const SHOTS = process.env.FIVE_SHOTS;
const cards = PRESETS.filter((p) => p.parts.length === 10);
const SIZES = [
  ['1280x800', { width: 1280, height: 800 }],
  ['390x844', { width: 390, height: 844 }],
] as const;

const watchErrors = (page: Page) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
  return errors;
};
const hashOf = (id: string) => {
  const card = PRESETS.find((p) => p.id === id)!;
  return encodeHash({ ...defaultState(), parts: card.parts, ratio: card.ratio });
};

test('there are two five-juggler cards, last in the deck, fifteen balls each by the engine', () => {
  expect(cards.map((c) => c.id)).toEqual(['five-star', 'five-typewriter']);
  expect(PRESETS.slice(-2)).toEqual(cards);
  for (const c of cards) expect([c.balls, buildSchedule(c.parts).balls], c.id).toEqual([15, 15]);
  expect(MAX_JUGGLERS).toBe(5);
  expect(DRUMMER_KITS).toHaveLength(5);
});

for (const card of cards) {
  for (const [name, viewport] of SIZES) {
    test(`${card.id} at ${name}: five figures, fifteen balls, ten lanes, five drum machines`, async ({ page }) => {
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const errors = watchErrors(page);
      await page.setViewportSize(viewport);
      await page.goto(`/${hashOf(card.id)}`);
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      const juggler = page.locator('canvas.juggler');
      await expect(juggler).toHaveAttribute('data-figures', '5');
      await expect(juggler).toHaveAttribute('data-balls', String(card.balls));
      const strip = page.locator('canvas.ladder');
      await expect(strip).toHaveAttribute('data-lanes', '10');
      await expect(strip).toHaveAttribute('data-balls', String(card.balls));
      const box = (await page.locator('.region-juggler canvas:visible').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      await page.waitForTimeout(1500);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-stage.png` });

      await openTab(page, 'sound');
      const rows = page.locator('.sp-drummer');
      await rows.first().scrollIntoViewIfNeeded();
      await expect(rows.locator('.sp-drummer-name')).toHaveText(['Juggler 1', 'Juggler 2', 'Juggler 3', 'Juggler 4', 'Juggler 5']);
      const kits = rows.locator('.sp-kit');
      const before = await kits.allTextContents();
      // All five drum machines, one each.
      expect(new Set(before)).toEqual(new Set(DRUMMER_KITS.map((k) => copy.kitNames[k])));
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-sound.png` });
      // Change drum machines moves all five at once, one step each, and keeps them apart.
      await page.locator('#sp-change-kits').click();
      await expect(kits).not.toHaveText(before);
      const after = await kits.allTextContents();
      expect(new Set(after).size).toBe(5);
      expect(after.slice(0, 4)).toEqual(before.slice(1));
      expect(after[4]).toBe(before[0]);
      await expect(page.locator('#play')).toHaveText('Pause');
      expect(errors).toEqual([]);
    });
  }
}

for (const [name, viewport] of SIZES) {
  test(`at ${name} the Jugglers 5 chip holds the two five-juggler cards`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    const five = page.locator('.deck-filter[data-by="jugglers"][data-n="5"]');
    if (!(await five.isVisible())) await page.locator('.deck-pattern').click();
    await expect(page.getByRole('group', { name: 'Jugglers', exact: true }).getByRole('button')).toHaveText(['2', '3', '4', '5']);
    // The chip row stays inside the viewport with its fifth chip.
    const chipBox = (await five.boundingBox())!;
    expect(chipBox.x + chipBox.width).toBeLessThanOrEqual(viewport.width);
    await five.click();
    await expect(five).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.deck-row[data-id]')).toHaveCount(2);
    expect(await page.locator('.deck-row[data-id]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-id')))).toEqual(cards.map((c) => c.id));
    await expect(page.locator('.deck-row[data-id] .deck-row-name')).toHaveText(['Star', 'Typewriter feed for 5']);
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-figures', '5');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/jugglers-5-chip-${name}.png` });
    expect(errors).toEqual([]);
  });
}

test('the links round-trip: the Star a short link, the long feed a #v3. one', async ({ page }) => {
  for (const card of cards) {
    const hash = hashOf(card.id);
    expect(hash.startsWith('#v3.'), card.id).toBe(card.id === 'five-typewriter');
    await page.goto(`/${hash}`);
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-figures', '5');
    await expect(page.locator('#play')).toBeEnabled();
    await page.locator('#play').click();
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '15');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
  }
  expect(hashOf('five-star')).toBe('#3p3-3|3p4-3|3p5-3|3p1-3|3p2-3');
});

test('a six-juggler pattern typed is refused, naming five; five is read', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('<3p2 3|3p3 3|3p4 3|3p5 3|3p6 3|3p1 3>');
  await expect(page.locator('#status')).toContainText(copy.parseError({ kind: 'too-many-jugglers', max: MAX_JUGGLERS }));
  await expect(page.locator('#status')).toContainText('at most 5 jugglers');
  await page.locator('#hand-0').fill('<3p3 3|3p4 3|3p5 3|3p1 3|3p2 3>');
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-figures', '5');
});

test('at 390 wide the caption "Juggler 5", in the canvas font, fits between five figures, the outer ones on the canvas', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${hashOf('five-star')}`);
  // About the 2D picture (v6.8 T1): the 2D view shown.
  await show2d(page);
  const juggler = page.locator('canvas.juggler');
  await expect(juggler).toHaveAttribute('data-figures', '5');
  const { width, caption } = await juggler.evaluate(
    async (c, { font, text }) => {
      await document.fonts.ready;
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = font;
      return { width: c.getBoundingClientRect().width, caption: ctx.measureText(text).width };
    },
    { font: `${JUGGLER.captionFontPx}px ${JUGGLER.captionFont}`, text: copy.jugglerCaption(4) },
  );
  expect(caption).toBeLessThanOrEqual(copy.jugglerCaption(4).length * 0.6 * JUGGLER.captionFontPx);
  // As four-jugglers.spec.ts: the scene recomputed from the tunables, 4 strides and one figure
  // (plus a ball either side) across the canvas less its margins.
  const scene = 4 * JUGGLER.figureStride + JUGGLER.catchX[1] + 2 * JUGGLER.radius;
  const stride = (JUGGLER.figureStride * (width - 2 * JUGGLER.minRadiusPx)) / scene;
  expect(stride).toBeGreaterThanOrEqual(caption + 8);
  const firstCentre = JUGGLER.minRadiusPx + ((JUGGLER.catchX[1] / 2 + JUGGLER.radius) * (width - 2 * JUGGLER.minRadiusPx)) / scene;
  expect(firstCentre - caption / 2).toBeGreaterThanOrEqual(0);
  // The canvas is symmetric, so the last caption ends as far from the right edge.
  expect(firstCentre + 4 * stride + caption / 2).toBeLessThanOrEqual(width + 1e-6);
});

for (const card of cards) {
  for (const [name, viewport] of SIZES) {
    test(`${card.id} at ${name} in 3D: five on the ring, fifteen balls, five captions`, async ({ page, browserName }) => {
      // Chromium always has WebGL here: there a missing context fails rather than skips.
      test.skip(!(await hasWebGL(page)) && browserName !== 'chromium', NO_WEBGL);
      const errors = watchErrors(page);
      await page.setViewportSize(viewport);
      await page.goto(`/${hashOf(card.id)}`);
      await expect(page.locator('#play')).toBeEnabled();
      const region = page.locator('.region-juggler');
      await expect(region).toHaveAttribute('data-view', '3d');
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      const three = page.locator('canvas.juggler-3d');
      await expect(three).toBeVisible();
      await expect(three).toHaveAttribute('data-balls', String(card.balls));
      await expect(three).toHaveAttribute('data-figures', '5');
      const captions = page.locator('.juggler-captions span:not([hidden])');
      await expect(captions).toHaveCount(5);
      await expect(captions).toHaveText(['Juggler 1', 'Juggler 2', 'Juggler 3', 'Juggler 4', 'Juggler 5']);
      // Inside the viewport.
      const box = (await three.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 0.5);
      // No two captions overlap.
      const rects = await captions.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number }));
      for (let i = 0; i < rects.length; i++) {
        for (let j = i + 1; j < rects.length; j++) {
          const a = rects[i]!;
          const b = rects[j]!;
          const apart = a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
          expect(apart, `captions ${i + 1} and ${j + 1}`).toBe(true);
        }
      }
      await page.waitForTimeout(1500);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/3d-${card.id}-${name}.png` });
      }
      expect(errors).toEqual([]);
    });
  }
}
