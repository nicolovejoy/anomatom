// Views for N parts (docs/plans/lanes.md, wave 1 C; ruling 4), headless: `#v2.` links with three
// and four parts, built with the app's own `encodeState`, play with the juggler drawing figures by
// pairing and the ladder one lane per part, and both pictures agree on the ball count. Canvas
// content is checked by screenshot: saved to test-results, and to $VIEWS_SHOTS when it is set
// (2, 3 and 4 parts at 390×844 and 1280×800).
import { encodeState } from '../src/app/hash';
import { defaultState } from '../src/app/state';
import { buildSchedule, partsFromOnsets, partsFromVanilla } from '../src/core';
import type { Parts } from '../src/core';
import { expect, isCdnError, stopPlaying, test, type Page } from './fixtures';

const SHOTS = process.env.VIEWS_SHOTS ?? 'test-results';

/** A manual part on a vanilla-style grid: spacing 2, unit 1, throws as [height in pulses, to]. */
const manual = (phase: number, throws: [number, number][]) => ({
  spacing: 2,
  phase,
  unit: 1,
  flights: { kind: 'manual' as const, throws: throws.map(([height, to]) => ({ height, to })) },
});

const cascade = partsFromVanilla('3');
if (!cascade.ok) throw new Error('3 is vanilla');

const CASES: { name: string; parts: Parts }[] = [
  { name: '2-parts-cascade', parts: cascade.parts },
  // Three layered hands at rates 3, 4 and 5, one ball each: two figures, the second one-handed.
  { name: '3-parts-layered', parts: partsFromOnsets([[true], [true], [true]], [20, 15, 12]) },
  // A three-hand ring: hand 2 passes across to the one-handed figure, which passes back to hand 1.
  { name: '3-parts-ring', parts: partsFromOnsets([[true], [true], [true]], [1, 1, 1]).map((p, i) => ({ ...p, flights: { kind: 'manual' as const, throws: [{ height: 1, to: (i + 1) % 3 }] } })) },
  // Four hands, two cascades, every other left-hand throw passed to the other figure.
  { name: '4-parts-passing', parts: [manual(0, [[3, 1], [3, 3]]), manual(1, [[3, 0], [3, 0]]), manual(0, [[3, 3], [3, 1]]), manual(1, [[3, 2], [3, 2]])] },
];

const LABELS: Record<number, string> = {
  2: 'My two hands juggling the pattern: hand 1 on the left, hand 2 on the right.',
  3: 'My 3 hands juggling the pattern as 2 jugglers side by side, left to right: hands 1 and 2, hand 3.',
  4: 'My 4 hands juggling the pattern as 2 jugglers side by side, left to right: hands 1 and 2, hands 3 and 4.',
};

/** `encodeState` writes the `#v2.` prefix itself. */
const link = (parts: Parts) => '/' + encodeState({ ...defaultState(), parts });

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (!isCdnError(e.message)) errors.push(e.message);
  });
  page.on('console', (m) => {
    if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
  });
  return errors;
}

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  test.describe(`${viewport.width}×${viewport.height}`, () => {
    test.use({ viewport });
    for (const { name, parts } of CASES) {
      test(`${name}: plays, the juggler and the ladder draw the same balls`, async ({ page }) => {
        const balls = buildSchedule(parts).balls;
        const errors = watchErrors(page);
        await page.goto(link(parts));
        // The link was read, not replaced by the default pattern.
        await expect(page.locator('.summary-meta')).toHaveText(new RegExp(`^${balls} balls\\b`));
        // The juggler says how its hands pair into jugglers.
        await expect(page.locator('canvas.juggler')).toHaveAttribute('aria-label', LABELS[parts.length] as string);
        await page.locator('#play').click();
        await expect(page.locator('#play')).toHaveText('Pause');
        await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', String(balls));
        await expect(page.locator('canvas.ladder')).toHaveAttribute('data-balls', String(balls));
        // Let the balls get into the air before the picture.
        await page.waitForTimeout(1200);
        await page.screenshot({ path: `${SHOTS}/${name}-${viewport.width}x${viewport.height}.png` });
        await stopPlaying(page);
        expect(errors).toEqual([]);
      });
    }
  });
}
