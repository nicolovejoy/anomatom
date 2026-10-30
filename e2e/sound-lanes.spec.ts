// Lanes ruling 5: a link with three parts gets three voices, listed one row per part in the Sound tab.
// The link is built with encodeState so it follows whatever the hash writes.
import { encodeState } from '../src/app/hash';
import { partsFromLines } from '../src/core';
import { DEFAULT_MAPPING } from '../src/tunables';
import { expect, openTab, test } from './fixtures';

const SHOTS = '/private/tmp/claude-501/-Users-nico-src-anomatom/21d1d264-2e1b-4a8d-a669-c0b72ce81f8d/scratchpad/lanes-sound';

function threePartLink(): string {
  const r = partsFromLines(['3', '2', '4'], { a: 1, b: 1 });
  if (!r.ok) throw new Error('fixture');
  return '/' + encodeState({ parts: r.parts, ratio: { a: 1, b: 1 }, bpm: 100, mapping: DEFAULT_MAPPING });
}

test('a three-part link lists three voices in the Sound tab', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(threePartLink());
  await openTab(page, 'sound');
  await expect(page.locator('.sound-panel')).toBeVisible();
  for (const i of [0, 1, 2]) await expect(page.locator(`#sp-part-sample-${i}`)).toBeVisible();
  await expect(page.locator('#sp-part-sample-3')).toHaveCount(0);
  await expect(page.locator('#sp-part-sample-0')).toHaveValue('kick');
  await expect(page.locator('#sp-part-sample-1')).toHaveValue('snare');
  await expect(page.locator('#sp-part-sample-2')).toHaveValue('hihat-close');
  await expect(page.locator('#sp-preset')).toHaveValue('voice-per-part');
  await page.locator('#sp-parts').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${SHOTS}/sound-tab-3-parts-390x844.png` });
});
