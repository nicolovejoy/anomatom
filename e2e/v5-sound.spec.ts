// v5 stream A (docs/plans/v5-sound-model.md, §3): the sound is global. Change it, turn the wheel, and
// the sound stays. Headless, on a phone and on a laptop. Screenshots of the Sound panel are saved
// only when V5_SOUND_SHOTS names a directory.
import { mkdirSync } from 'node:fs';
import { expect, openTab, test, type Page } from './fixtures';

const SHOTS = process.env.V5_SOUND_SHOTS;
const pressed = (page: Page) => page.locator('.sp-choice[aria-pressed="true"]');
const kitNames = (page: Page) => page.locator('.sp-drummer .sp-kit');

for (const size of [
  { name: '390x844', width: 390, height: 844 },
  { name: '1280x800', width: 1280, height: 800 },
] as const) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('a fresh page opens on ball at half volume', async ({ page }) => {
      await page.goto('/');
      await openTab(page, 'sound');
      await expect(pressed(page)).toHaveAttribute('data-listen', 'ball');
      await expect(page.locator('#sp-volume')).toHaveValue('0.5');
      await expect(page.locator('#volume')).toHaveValue('0.5');
      await expect(page.locator('#deck-listen')).toHaveValue('ball');
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/sound-one-juggler-${size.name}.png` });
        await page.locator('.sp-also').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/sound-one-juggler-${size.name}-lower.png` });
        await page.locator('.sound-panel').screenshot({ path: `${SHOTS}/sound-one-juggler-${size.name}-panel.png` });
      }
    });

    test('pick Listen for pitch, turn the wheel twice: the panel still says pitch, the link carries ~pitch', async ({ page }) => {
      await page.goto('/');
      await openTab(page, 'sound');
      await page.locator('.sp-choice[data-listen="pitch"]').click();
      await expect(pressed(page)).toHaveAttribute('data-listen', 'pitch');
      // The wide layout has no › (v5 ruling 8): ↓ steps there (v6.1 ruling 3); nor the upright
      // phone (v6.6 ruling 1): → steps there.
      const next = () => page.keyboard.press(size.width < 760 ? 'ArrowRight' : 'ArrowDown');
      await next();
      await expect(page.locator('.deck-notation')).toHaveText('51');
      await next();
      await expect(page.locator('.deck-notation')).toHaveText('441');
      await openTab(page, 'sound');
      await expect(pressed(page)).toHaveAttribute('data-listen', 'pitch');
      await expect(page.locator('#deck-listen')).toHaveValue('pitch');
      await expect.poll(() => page.evaluate(() => location.hash), { timeout: 5_000 }).toBe('#441~pitch');
    });

    test('Change drum machines on a passing card changes both jugglers’ kit names', async ({ page }) => {
      await page.goto('/');
      await page.locator('.deck-row[data-id="passing"]').click();
      await expect(page.locator('.deck-meta')).toHaveText('2 jugglers');
      await openTab(page, 'sound');
      await expect(kitNames(page)).toHaveText(['Roland TR-808', 'LinnDrum LM-2']);
      if (SHOTS) {
        mkdirSync(SHOTS, { recursive: true });
        await page.screenshot({ path: `${SHOTS}/sound-passing-${size.name}.png` });
        await page.locator('.sp-also').scrollIntoViewIfNeeded();
        await page.screenshot({ path: `${SHOTS}/sound-passing-${size.name}-lower.png` });
        await page.locator('.sound-panel').screenshot({ path: `${SHOTS}/sound-passing-${size.name}-panel.png` });
      }
      await page.locator('#sp-change-kits').click();
      await expect(kitNames(page)).toHaveText(['LinnDrum LM-2', 'MFB-512']);
      // Five presses go all the way round.
      for (let i = 0; i < 4; i++) await page.locator('#sp-change-kits').click();
      await expect(kitNames(page)).toHaveText(['Roland TR-808', 'LinnDrum LM-2']);
      // The pattern did not change.
      await expect(page.locator('.deck-meta')).toHaveText('2 jugglers');
    });
  });
}
