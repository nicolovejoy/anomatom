// Stage captions (docs/plans/v2-share-kits-passing.md, stream P2): a six-part link plays on a
// phone in portrait and landscape, three jugglers side by side with a caption under each. The
// link is built here with the app's own `encodeState`. Screenshots are taken only when
// PASSING_STAGE_SHOTS names a directory (as first-minute.spec.ts does with FIRST_MINUTE_SHOTS).
import { mkdirSync } from 'node:fs';
import { encodeState } from '../src/app/hash';
import { defaultState } from '../src/app/state';
import { lineParts } from '../src/test/schedules';
import { expect, isCdnError, test } from './fixtures';

const SHOTS = process.env.PASSING_STAGE_SHOTS;

const six = lineParts(['3', '3', '3', '3', '3', '3'], { a: 1, b: 1 });
// A mapping with one voice per part, as a link of six parts carries.
const base = defaultState();
const voices = six.map((_, i) => ({ kit: 'TR-808', sample: i % 2 ? 'snare' : 'kick', pan: 0, gain: 1 }));
const link = encodeState({ ...base, parts: six, mapping: { ...base.mapping, parts: voices } }); // already starts with #v2.

for (const [name, viewport] of [
  ['portrait', { width: 390, height: 844 }],
  ['landscape', { width: 844, height: 390 }],
] as const) {
  test(`six parts play as three captioned jugglers, ${name}`, async ({ page }) => {
    if (SHOTS) mkdirSync(SHOTS, { recursive: true });
    await page.setViewportSize(viewport);
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
    });
    await page.goto(`/${link}`);
    await expect(page.locator('#play')).toBeEnabled();
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    const juggler = page.locator('canvas.juggler');
    await expect(juggler).toHaveAttribute('data-balls', /^[1-9]\d*$/);
    await expect(juggler).toHaveAttribute('data-figures', '3');
    const box = await juggler.boundingBox();
    expect(box?.width ?? Infinity).toBeLessThanOrEqual(viewport.width);
    await page.waitForTimeout(1500);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/six-parts-${name}.png` });
    expect(errors).toEqual([]);
  });
}
