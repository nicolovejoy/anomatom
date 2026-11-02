// A link with three hands: two jugglers on stage (the third hand one-handed), so the Sound tab lists
// two drum machines (docs/plans/v5-sound-model.md, ruling 3). The link is built with encodeState so it
// follows whatever the hash writes.
import { encodeState } from '../src/app/hash';
import { defaultState } from '../src/app/state';
import { partsFromLines } from '../src/core';
import { expect, openTab, test } from './fixtures';

const SHOTS = 'test-results';

function threePartLink(): string {
  const r = partsFromLines(['3', '2', '4'], { a: 1, b: 1 });
  if (!r.ok) throw new Error('fixture');
  return '/' + encodeState({ ...defaultState(), parts: r.parts, bpm: 100 });
}

test('a three-part link lists two jugglers’ drum machines in the Sound tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(threePartLink());
  await openTab(page, 'sound');
  await expect(page.locator('.sound-panel')).toBeVisible();
  await expect(page.locator('.sp-drummer .sp-drummer-name')).toHaveText(['Juggler 1', 'Juggler 2']);
  await expect(page.locator('.sp-drummer .sp-kit')).toHaveText(['Roland TR-808', 'LinnDrum LM-2']);
  await page.locator('.sp-drummers').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/sound-tab-3-parts-390x844.png` });
});
