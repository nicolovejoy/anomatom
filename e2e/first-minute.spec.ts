// First minute (docs/plans/phone-sheet.md, stream B): a bare address opens the preset cards;
// tapping one plays it; "Make your own" shows the play view and leaves the music running.
import { expect, test } from './fixtures';

const SHOTS = process.env.FIRST_MINUTE_SHOTS;
const scheduled = async (page: import('./fixtures').Page) =>
  Number(await page.locator('#app').getAttribute('data-events-scheduled'));

test.use({ viewport: { width: 390, height: 844 } });

test('opens on the cards, 441 plays, Make your own shows the play view and keeps playing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass(/is-first-minute/);
  await expect(page.locator('.fm-card')).toHaveCount(5);
  await expect(page.locator('#play')).toBeHidden();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/idle.png` });

  await page.locator('.fm-card[data-id="pause"]').click();
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
  await expect(page.locator('.fm-card[data-id="pause"]')).toHaveClass(/fm-playing/);
  await expect(page.locator('.fm-card[data-id="pause"] .fm-name')).toContainText('playing');
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/playing-441.png` });

  await page.locator('.fm-own').click();
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#hand-0')).toHaveValue('441');
  const before = await scheduled(page);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(before);
});

test('a link with state, and About, skip first minute', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
  await page.goto('/#about');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
});
