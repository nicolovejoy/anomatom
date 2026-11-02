// The Sound panel and the share link (SPEC §4.3, §7.5; docs/plans/v5-sound-model.md, ruling 7),
// headless. Audio output is not observable, so "nothing auto-plays" is read from
// `data-events-scheduled` staying at 0 and the transport staying stopped.
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/sound-${name}.png`, fullPage: true });
const listen = (page: Page, value: string) => page.locator(`.sp-choice[data-listen="${value}"]`);
const also = (page: Page, key: string) => page.locator(`.sp-switch[data-also="${key}"]`);

/** The hash settles a moment after the last change (the debounce). */
async function settledHref(page: Page, contains = '#v3.') {
  await expect.poll(() => page.evaluate(() => location.href), { timeout: 5_000 }).toContain(contains);
  await page.waitForTimeout(600);
  return page.evaluate(() => location.href);
}

async function openPanel(page: Page) {
  await openTab(page, 'sound');
  await expect(page.locator('.sound-panel')).toBeVisible();
}

test('the Sound tab shows the panel, top to bottom; another tab hides it', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('.sound-panel')).toBeHidden();
  await openPanel(page);
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.sound-panel > .group .section-label')).toHaveText(['Volume', 'Listen for', 'Tempo', 'Drum machines', 'Also play']);
  await expect(listen(page, 'ball')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.sp-choice')).toHaveText(['the height of each throw', 'each ball', 'the height, as a pitch']);
  await expect(page.locator('.sp-switch-name')).toHaveText(['Catches', 'Downbeat', 'Pad']);
  await expect(page.locator('.sp-switch[aria-checked="true"]')).toHaveCount(1);
  await expect(also(page, 'downbeat')).toHaveAttribute('aria-checked', 'true');
  // No per-height, pan, gain, accent, pass, filter, pad or kit controls are left.
  await expect(page.locator('.sound-panel select')).toHaveCount(0);
  await expect(page.locator('.sound-panel input[type="range"]')).toHaveCount(2);
  await shot(page, 'tab');
  await openTab(page, 'pattern');
  await expect(page.locator('.sound-panel')).toBeHidden();
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'false');
});

test('the ⓘ shows one plain line per choice, and hides them again', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openPanel(page);
  const info = page.locator('#sp-listen-info');
  const lines = page.locator('#sp-listen-lines li');
  await expect(lines.first()).toBeHidden();
  await info.click();
  await expect(info).toHaveAttribute('aria-expanded', 'true');
  await expect(lines).toHaveCount(3);
  await expect(lines.first()).toBeVisible();
  await info.click();
  await expect(lines.first()).toBeHidden();
});

test('Listen for, the switches and the volume follow the store; the deck’s select agrees', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openPanel(page);
  await listen(page, 'pitch').click();
  await expect(listen(page, 'pitch')).toHaveAttribute('aria-pressed', 'true');
  await expect(listen(page, 'ball')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#deck-listen')).toHaveValue('pitch');
  await also(page, 'catches').click();
  await expect(also(page, 'catches')).toHaveAttribute('aria-checked', 'true');
  await also(page, 'catches').click();
  await expect(also(page, 'catches')).toHaveAttribute('aria-checked', 'false');
  await page.locator('#sp-volume').fill('0.2');
  await expect(page.locator('#volume')).toHaveValue('0.2');
});

test('Space on the deck’s focused select is the select’s, not play and pause', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#deck-listen').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveText('Play');
  await expect(page.locator('#app')).toHaveAttribute('data-events-scheduled', '0');
});

test('SPEC §7.5: the sound, the link, a new tab: everything matches and nothing plays', async ({
  page,
  context,
}) => {
  await page.goto('/#v1.e30');
  await page.locator('#hand-0').fill('441');
  await openTab(page, 'sound');
  await page.locator('#bpm').fill('96');
  await page.locator('#bpm').press('Enter');
  await openPanel(page);
  await listen(page, 'pitch').click();
  await also(page, 'pad').click();
  await also(page, 'downbeat').click();
  await page.locator('#sp-change-kits').click();

  const href = await settledHref(page);
  expect(href).toMatch(/#v3\./);

  const other = await context.newPage();
  await other.goto(href);
  await expect(other.locator('#hand-0')).toHaveValue('441');
  await expect(other.locator('#bpm')).toHaveValue('96');
  await expect(listen(other, 'pitch')).toHaveAttribute('aria-pressed', 'true');
  await expect(also(other, 'pad')).toHaveAttribute('aria-checked', 'true');
  await expect(also(other, 'downbeat')).toHaveAttribute('aria-checked', 'false');
  await expect(also(other, 'catches')).toHaveAttribute('aria-checked', 'false');
  await expect(other.locator('.sp-drummer .sp-kit')).toHaveText(['LinnDrum LM-2']);
  // Volume and the open tab are not in the link.
  await expect(other.locator('.sound-panel')).toBeHidden();
  // Nothing auto-plays: stopped, and nothing handed to the sampler.
  await expect(other.locator('#play')).toHaveText('Play');
  await expect(other.locator('#stop')).toBeDisabled();
  await other.waitForTimeout(800);
  expect(await scheduled(other)).toBe(0);
  await shot(other, 'restored');
  // The page that made the link is untouched.
  await expect(page.locator('#hand-0')).toHaveValue('441');
});

test('a link pasted while playing lands at the next cycle: no restart, no stop', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);

  // A link from elsewhere: another pattern and another sound.
  const other = await page.context().newPage();
  await other.goto('/#v1.e30');
  await other.locator('#hand-0').fill('531');
  await openPanel(other);
  await listen(other, 'height').click();
  const link = await settledHref(other, '#531~height');
  await other.close();

  await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
  await expect(page.locator('#hand-0')).toHaveValue('531');
  await expect(page.locator('#deck-listen')).toHaveValue('height');
  // Still playing, and still scheduling: it was not stopped or restarted.
  await expect(page.locator('#play')).toHaveText('Pause');
  const n = await scheduled(page);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(n + 2);
  await expect(page.locator('#status')).toContainText('I have 3 balls');
});

test('a link that differs only in tempo, pasted while playing, reaches the player at the next cycle', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.locator('#hand-0').fill('441');
  await settledHref(page, '#441');
  await expect(page.locator('#pending')).toBeHidden({ timeout: 5_000 });
  // 441 at the default tempo is the short link `#441`; the same link at 150 bpm differs only in tempo.
  await page.evaluate((hash) => (location.hash = hash), '#441@150');
  await expect(page.locator('#bpm')).toHaveValue('150');
  // Queued for the next cycle boundary, as any edit while playing.
  await expect(page.locator('#pending')).toBeVisible();
  await expect(page.locator('#play')).toHaveText('Pause');
});

test('a pasted link while stopped does not start anything', async ({ page }) => {
  await page.goto('/#v1.e30');
  const other = await page.context().newPage();
  await other.goto('/#v1.e30');
  await other.locator('#hand-0').fill('51');
  const link = await settledHref(other, '#51');
  await other.close();
  await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
  await expect(page.locator('#hand-0')).toHaveValue('51');
  await page.waitForTimeout(600);
  await expect(page.locator('#play')).toHaveText('Play');
  expect(await scheduled(page)).toBe(0);
});

test('a junk hash loads the defaults and the page works', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => {
    if (!isCdnError(e.message)) errors.push(e.message);
  });
  for (const junk of ['#garbage', '#v1.', '#v1.!!!not-base64', '#v1.eyJwIjpbIjw8PCJdfQ']) {
    await page.goto('/' + junk);
    await page.reload();
    await expect(page.locator('#hand-0')).toHaveValue('3');
    await expect(page.locator('#bpm')).toHaveValue('104');
    await openPanel(page);
    await expect(page.locator('.sp-choice[aria-pressed="true"]')).toHaveCount(1);
    await expect(page.locator('#play')).toBeEnabled();
  }
  expect(errors).toEqual([]);
});

test('a junk hash pasted onto an open page resets to the defaults', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#hand-0').fill('441');
  await page.evaluate(() => (location.hash = '#v1.%%%junk'));
  await expect(page.locator('#hand-0')).toHaveValue('3');
});

test('About keeps the state: its back link returns to the pattern as it was', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#hand-0').fill('441');
  // Straight away: inside the debounce.
  await page.locator('.about-link').click();
  await expect(page).toHaveURL(/#about$/);
  await page.waitForTimeout(600);
  await expect(page).toHaveURL(/#about$/); // the hash write leaves About alone
  await page.locator('.region-about a', { hasText: 'Back to the pattern' }).click();
  await expect(page.locator('#hand-0')).toHaveValue('441');
  await expect(page).toHaveURL(/#441$/);
});
