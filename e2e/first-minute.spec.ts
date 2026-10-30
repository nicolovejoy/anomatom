// First minute (docs/plans/phone-sheet.md, stream B): a bare address opens the preset cards;
// tapping one plays it; "Make your own" shows the play view and leaves the music running.
import { expect, openTab, test } from './fixtures';

const SHOTS = process.env.FIRST_MINUTE_SHOTS;
const scheduled = async (page: import('./fixtures').Page) =>
  Number(await page.locator('#app').getAttribute('data-events-scheduled'));

test.use({ viewport: { width: 390, height: 844 } });

test('opens on the cards, 441 plays, Make your own shows the play view and keeps playing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass(/is-first-minute/);
  await expect(page.locator('.fm-card:visible')).toHaveCount(9);
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
  // The sheet opens on the Pattern tab.
  await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#hand-0')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/make-your-own.png` });
  const before = await scheduled(page);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(before);
});

test('more reveals the rest of the sourcebook, fewer folds them away', async ({ page }) => {
  await page.goto('/');
  const more = page.locator('.fm-more');
  await expect(more).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.fm-card[data-id="rumba"]')).toBeHidden();
  await more.scrollIntoViewIfNeeded();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/more-closed.png` });
  await more.click();
  await expect(more).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('.fm-card[data-id="rumba"]')).toBeAttached();
  await page.locator('.fm-card[data-id="rumba"]').scrollIntoViewIfNeeded();
  await expect(page.locator('.fm-card[data-id="rumba"]')).toBeVisible();
  await expect(page.locator('.fm-card:visible')).toHaveCount(22);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/more-open.png` });
  await more.click();
  await expect(page.locator('.fm-card:visible')).toHaveCount(9);
});

test('a sourcebook card loads its tempo, ratio and own drums, and plays', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fm-card[data-id="son-clave"]').click();
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
  await expect(page.locator('.fm-card[data-id="son-clave"]')).toHaveClass(/fm-playing/);
  await page.locator('.fm-own').click();
  // Voice per part with the card's own drums: the Sound tab holds rimshot and kick, not height to drum.
  await openTab(page, 'sound');
  await expect(page.locator('#sp-part-sample-0')).toHaveValue('rimshot');
  await expect(page.locator('#sp-part-sample-1')).toHaveValue('kick');
  await openTab(page, 'rhythm');
  await expect(page.locator('#bpm')).toHaveValue('95');
});

test('a link with state, and About, skip first minute', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
  await page.goto('/#about');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
});

test('About has a section per layer and a source line per sourcebook card', async ({ page }) => {
  await page.goto('/#about');
  await expect(page.locator('.about section h3')).toContainText([
    'Time and the lattice',
    'Grids: ratio and displacement',
    'Lines, necklaces and Euclidean rhythms',
    'Flights, objects and k balls',
    'Parts, streams and inherent patterns',
    'Notation',
    'Where the cards come from',
    'A note on the gong cycle',
  ]);
  await expect(page.locator('.preset-sources li')).toHaveCount(17);
  await expect(page.locator('.preset-sources a[href="https://ancient-future.com/bellclap.html"]')).toBeVisible();
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/about.png`, fullPage: true });
});
