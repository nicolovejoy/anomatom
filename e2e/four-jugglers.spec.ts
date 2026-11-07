// Four jugglers (docs/plans/v6-6-deck-on-top-four-jugglers.md, rulings 15 to 21): each four-juggler
// card at desktop and phone sizes plays with four figures, twelve balls and eight lanes in the
// strip, and the Sound panel lists four jugglers on four drum machines, which Change drum machines
// moves together and keeps apart. The Jugglers 4 chip holds the two cards and a short link
// round-trips (since v6.8 five jugglers read: e2e/five-jugglers.spec.ts). These tests assert
// figures, widths and counts, never heights, so they hold under either phone deck layout (stream
// A moves it). Screenshots go to FOUR_SHOTS when it names a directory.
import { mkdirSync } from 'node:fs';
import { encodeHash } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { JUGGLER } from '../src/tunables';
import { copy } from '../src/ui/copy';
import { expect, isCdnError, openTab, show2d, test, type Page } from './fixtures';

const SHOTS = process.env.FOUR_SHOTS;
const cards = PRESETS.filter((p) => p.parts.length === 8);
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

test('there are two four-juggler cards, just before the five-juggler cards', () => {
  expect(cards.map((c) => c.id)).toEqual(['four-typewriter', 'four-square']);
  expect(PRESETS.slice(-4, -2)).toEqual(cards);
});

for (const card of cards) {
  for (const [name, viewport] of SIZES) {
    test(`${card.id} at ${name}: four figures, twelve balls, eight lanes, four drum machines`, async ({ page }) => {
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const errors = watchErrors(page);
      await page.setViewportSize(viewport);
      await page.goto(`/${hashOf(card.id)}`);
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      const juggler = page.locator('canvas.juggler');
      await expect(juggler).toHaveAttribute('data-figures', '4');
      await expect(juggler).toHaveAttribute('data-balls', '12');
      const strip = page.locator('canvas.ladder');
      await expect(strip).toHaveAttribute('data-lanes', '8');
      await expect(strip).toHaveAttribute('data-balls', '12');
      // The canvas inside the viewport, across.
      const box = (await page.locator('.region-juggler canvas:visible').boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      await page.waitForTimeout(1500);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-stage.png` });

      await openTab(page, 'sound');
      const rows = page.locator('.sp-drummer');
      await rows.first().scrollIntoViewIfNeeded();
      await expect(rows.locator('.sp-drummer-name')).toHaveText(['Juggler 1', 'Juggler 2', 'Juggler 3', 'Juggler 4']);
      const kits = rows.locator('.sp-kit');
      const before = await kits.allTextContents();
      expect(new Set(before).size).toBe(4);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-sound.png` });
      // Change drum machines moves all four at once, one step each, and keeps them apart.
      await page.locator('#sp-change-kits').click();
      await expect(kits).not.toHaveText(before);
      const after = await kits.allTextContents();
      expect(new Set(after).size).toBe(4);
      expect(after.slice(0, 3)).toEqual(before.slice(1));
      expect(after.every((k, j) => k !== before[j])).toBe(true);
      await expect(page.locator('#play')).toHaveText('Pause');
      expect(errors).toEqual([]);
    });
  }
}

for (const [name, viewport] of SIZES) {
  test(`at ${name} the Jugglers 4 chip holds the two four-juggler cards`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.setViewportSize(viewport);
    await page.goto('/');
    const four = page.locator('.deck-filter[data-by="jugglers"][data-n="4"]');
    // Before v6.6 stream A the phone shows the chips with the wheel open; after it, always.
    if (!(await four.isVisible())) await page.locator('.deck-pattern').click();
    await expect(page.getByRole('group', { name: 'Jugglers', exact: true }).getByRole('button')).toHaveText(['2', '3', '4', '5']);
    await four.click();
    await expect(four).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.deck-row[data-id]')).toHaveCount(2);
    expect(await page.locator('.deck-row[data-id]').evaluateAll((rs) => rs.map((r) => r.getAttribute('data-id')))).toEqual(cards.map((c) => c.id));
    // A chip that does not hold the card on stage loads its first card.
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-figures', '4');
    expect(errors).toEqual([]);
  });
}

for (const width of [1280, 1024]) {
  test(`at ${width}x800 the top bar keeps the Typewriter feed's name whole; its long notation gives way`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/${hashOf('four-typewriter')}`);
    const name = page.locator('.topbar-pattern .deck-name');
    await expect(name).toHaveText('Typewriter feed');
    await page.evaluate(() => document.fonts.ready);
    const fit = await name.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth }));
    expect(fit.client).toBeGreaterThan(0);
    expect(fit.scroll).toBeLessThanOrEqual(fit.client);
    await expect(page.locator('.topbar-pattern .deck-meta')).toHaveText('4 jugglers');
    // The whole label inside the top bar.
    const label = (await page.locator('.topbar-pattern .deck-pattern').boundingBox())!;
    expect(label.x + label.width).toBeLessThanOrEqual(width);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/four-typewriter-topbar-${width}x800.png` });
  });
}

test('the short links round-trip: the stage and the address the card wrote', async ({ page }) => {
  for (const card of cards) {
    const hash = hashOf(card.id);
    expect(hash.startsWith('#v')).toBe(false);
    await page.goto(`/${hash}`);
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-figures', '4');
    await expect(page.locator('#play')).toBeEnabled();
    await page.locator('#play').click();
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '12');
    await expect.poll(() => page.evaluate(() => location.hash)).toBe(hash);
  }
});

test('at 390 wide the caption "Juggler 4", in the canvas font, fits between four figures (ruling 18)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${hashOf('four-square')}`);
  // About the 2D picture (v6.8 T1): the 2D view shown.
  await show2d(page);
  const juggler = page.locator('canvas.juggler');
  await expect(juggler).toHaveAttribute('data-figures', '4');
  const { width, caption } = await juggler.evaluate(
    async (c, { font, text }) => {
      await document.fonts.ready;
      const ctx = document.createElement('canvas').getContext('2d')!;
      ctx.font = font;
      return { width: c.getBoundingClientRect().width, caption: ctx.measureText(text).width };
    },
    { font: `${JUGGLER.captionFontPx}px ${JUGGLER.captionFont}`, text: copy.jugglerCaption(3) },
  );
  // The unit test's caption estimate (0.6 em a character) holds the real one.
  expect(caption).toBeLessThanOrEqual(copy.jugglerCaption(3).length * 0.6 * JUGGLER.captionFontPx);
  // A glyph-width check only: the scene is recomputed from the tunables here, not read from
  // jugglerFrame / sceneScale, whose layout src/view/juggler.test.ts owns.
  // Width-bound, figures stand figureStride apart in a scene 3 strides and one figure (plus a
  // ball either side) across the canvas less its margins.
  const scene = 3 * JUGGLER.figureStride + JUGGLER.catchX[1] + 2 * JUGGLER.radius;
  const stride = (JUGGLER.figureStride * (width - 2 * JUGGLER.minRadiusPx)) / scene;
  expect(stride).toBeGreaterThanOrEqual(caption + 8);
  // The outer captions stay on the canvas.
  const firstCentre = JUGGLER.minRadiusPx + ((JUGGLER.catchX[1] / 2 + JUGGLER.radius) * (width - 2 * JUGGLER.minRadiusPx)) / scene;
  expect(firstCentre - caption / 2).toBeGreaterThanOrEqual(0);
});
