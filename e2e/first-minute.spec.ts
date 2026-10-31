// First minute (docs/plans/phone-sheet.md, stream B): a bare address opens the preset cards;
// tapping one plays it; "Make your own" shows the play view and leaves the music running.
import { expect, openTab, test } from './fixtures';

const SHOTS = process.env.FIRST_MINUTE_SHOTS;
const PASSING_SHOTS = process.env.PASSING_EDITOR_SHOTS;
const scheduled = async (page: import('./fixtures').Page) =>
  Number(await page.locator('#app').getAttribute('data-events-scheduled'));

test.use({ viewport: { width: 390, height: 844 } });

test('opens on the cards, 441 plays, Make your own shows the play view and keeps playing', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#app')).toHaveClass(/is-first-minute/);
  await expect(page.locator('.fm-card')).toHaveCount(20);
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

const SIZES = [
  { name: '390x844', width: 390, height: 844 },
  { name: '844x390', width: 844, height: 390 },
  { name: '1280x800', width: 1280, height: 800 },
];

for (const size of SIZES) {
  test(`the cards are grouped by ball count and the column scrolls in place at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await expect(page.locator('.fm-group')).toHaveText(['3 balls', '4 balls', '5 balls', 'Passing']);
    await expect(page.getByText('More rhythms')).toHaveCount(0);
    await expect(page.locator('.fm-more')).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    // The 3:2 card sits under 4 balls, so the 4 balls group holds it.
    await expect(page.locator('.fm-cards[data-group="4"] .fm-card[data-id="polyrhythm"]')).toHaveCount(1);
    const last = page.locator('.fm-card[data-id="four-count"]');
    await last.scrollIntoViewIfNeeded();
    await expect(last).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    expect(await page.locator('.fm-scroll').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    await page.screenshot({ path: `e2e/shots/cards-${size.name}.png` });
  });

  test(`a tap on 51 plays at ${size.name}`, async ({ page }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    await page.locator('.fm-card[data-id="shower"]').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(page.locator('.fm-card[data-id="shower"]')).toHaveClass(/fm-playing/);
    await page.screenshot({ path: `e2e/shots/playing-51-${size.name}.png` });
  });
}

test('the passing card plays six balls on both canvases, and Make your own shows <3p 3|3p 3> in the one input', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fm-card[data-id="passing"]').click();
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
  await expect(page.locator('.fm-card[data-id="passing"]')).toHaveClass(/fm-playing/);
  await expect(page.locator('.juggler')).toHaveAttribute('data-balls', '6');
  await expect(page.locator('.ladder')).toHaveAttribute('data-balls', '6');
  await page.locator('.fm-own').click();
  await expect(page.locator('#hand-0')).toHaveValue('<3p 3|3p 3>');
  await expect(page.locator('#hand-1')).toBeHidden();
});

test('a link with state, and About, skip first minute', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
  await page.goto('/#about');
  await expect(page.locator('#app')).not.toHaveClass(/is-first-minute/);
});

test('About has a section per layer', async ({ page }) => {
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
  await expect(page.locator('.preset-sources')).toHaveCount(0);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/about.png`, fullPage: true });
});

test('the Pattern tab over a passing set shows the text and the p key', async ({ page }) => {
  await page.goto('/#3p-3|3p-3');
  await openTab(page, 'pattern');
  await expect(page.locator('#hand-0')).toHaveValue('<3p 3|3p 3>');
  await expect(page.locator('.key-pass')).toBeVisible();
  await expect(page.locator('.key-pass')).toHaveText('p');
  await expect(page.locator('.key-pass')).toBeInViewport();
  if (PASSING_SHOTS) await page.screenshot({ path: `${PASSING_SHOTS}/pattern-tab.png` });
});
