// The sound panel and the share link (SPEC §4.3, §7.5), headless. Audio output is not
// observable, so "nothing auto-plays" is read from `data-events-scheduled` staying at 0 and the
// transport staying stopped.
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/sound-${name}.png`, fullPage: true });

/** The hash settles a moment after the last change (the debounce). */
async function settledHref(page: Page, contains = '#v2.') {
  await expect.poll(() => page.evaluate(() => location.href), { timeout: 5_000 }).toContain(contains);
  await page.waitForTimeout(600);
  return page.evaluate(() => location.href);
}

async function openPanel(page: Page) {
  await openTab(page, 'sound');
  await expect(page.locator('.sound-panel')).toBeVisible();
}

test('the Sound tab shows the panel; another tab hides it', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('.sound-panel')).toBeHidden();
  await openPanel(page);
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#sp-preset')).toHaveValue('voice-per-part');
  await shot(page, 'tab');
  await openTab(page, 'pattern');
  await expect(page.locator('.sound-panel')).toBeHidden();
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'false');
});

test('an edit reads as custom, and Reset to preset undoes it', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openPanel(page);
  await page.locator('#sp-height-3').selectOption('cowbell');
  await expect(page.locator('#sp-preset')).toHaveValue('custom');
  await page.locator('#sp-reset').click();
  await expect(page.locator('#sp-preset')).toHaveValue('voice-per-part');
  await expect(page.locator('#sp-height-3')).toHaveValue('snare');
  await page.locator('#sp-preset').selectOption('ball-pitch');
  await page.locator('#sp-height-1').selectOption('kick');
  await expect(page.locator('#sp-preset')).toHaveValue('custom');
  await page.locator('#sp-reset').click();
  await expect(page.locator('#sp-preset')).toHaveValue('ball-pitch');
});

test('Space in the drawer is the control’s, not play and pause', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openPanel(page);
  await page.locator('#sp-pad-on').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#sp-pad-on')).toBeChecked();
  await expect(page.locator('#play')).toHaveText('Play');
  await expect(page.locator('#app')).toHaveAttribute('data-events-scheduled', '0');
});

test('SPEC §7.5: three sound fields, the link, a new tab: everything matches and nothing plays', async ({
  page,
  context,
}) => {
  await page.goto('/#v1.e30');
  await page.locator('#hand-0').fill('441');
  await openTab(page, 'rhythm');
  await page.locator('#bpm').fill('96');
  await page.locator('#bpm').press('Enter');
  await openPanel(page);
  await page.locator('#sp-height-4').selectOption('cowbell');
  await page.locator('#sp-accent').fill('33');
  await page.locator('#sp-pad-on').check();
  await page.locator('#sp-pad-chord').selectOption('open5');
  await expect(page.locator('#sp-preset')).toHaveValue('custom');

  const href = await settledHref(page);
  expect(href).toMatch(/#v2\./);

  const other = await context.newPage();
  await other.goto(href);
  await expect(other.locator('#hand-0')).toHaveValue('441');
  await expect(other.locator('#bpm')).toHaveValue('96');
  await expect(other.locator('#sp-preset')).toHaveValue('custom');
  await expect(other.locator('#sp-height-4')).toHaveValue('cowbell');
  await expect(other.locator('#sp-accent')).toHaveValue('33');
  await expect(other.locator('#sp-pad-on')).toBeChecked();
  await expect(other.locator('#sp-pad-chord')).toHaveValue('open5');
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

test('Copy share link puts the current link on the clipboard and confirms in the robot’s voice', async ({
  page,
  context,
}) => {
  // Playwright grants clipboard permissions on Chromium only, so every browser gets the same stub:
  // writeText records what the page asked to copy.
  await page.addInitScript(() => {
    const w = window as unknown as { __copied?: string };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (t: string) => void (w.__copied = t) },
    });
  });
  await page.goto('/#v1.e30');
  await openPanel(page);
  await page.locator('#sp-filter-on').check();
  // Straight after the edit: the clipboard holds the live state, not a stale address.
  await page.locator('#sp-copy').click();
  await expect(page.locator('#sp-confirm')).toContainText('I copied the link');
  const copied = await page.evaluate(() => (window as unknown as { __copied?: string }).__copied);
  expect(copied).toMatch(/#v2\./);
  const other = await context.newPage();
  await other.goto(copied as string);
  await expect(other.locator('#sp-filter-on')).toBeChecked();
});

test('a link pasted while playing lands at the next cycle: no restart, no stop', async ({ page }) => {
  await page.goto('/#v1.e30');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);

  // A link from elsewhere: another pattern and a custom Mapping.
  const other = await page.context().newPage();
  await other.goto('/#v1.e30');
  await other.locator('#hand-0').fill('531');
  await openPanel(other);
  await other.locator('#sp-height-5').selectOption('clap');
  const link = await settledHref(other);
  await other.close();

  await page.evaluate((hash) => (location.hash = hash), new URL(link).hash);
  await expect(page.locator('#hand-0')).toHaveValue('531');
  await expect(page.locator('#sp-height-5')).toHaveValue('clap');
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
  const link = await settledHref(page);
  await expect(page.locator('#pending')).toBeHidden({ timeout: 5_000 });
  const payload = new URL(link).hash.slice('#v2.'.length);
  const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
  const faster = '#v2.' + btoa(JSON.stringify({ ...json, t: json.t + 30 })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  await page.evaluate((hash) => (location.hash = hash), faster);
  await expect(page.locator('#bpm')).toHaveValue(String(json.t + 30));
  // Queued for the next cycle boundary, as any edit while playing.
  await expect(page.locator('#pending')).toBeVisible();
  await expect(page.locator('#play')).toHaveText('Pause');
});

test('a pasted link while stopped does not start anything', async ({ page }) => {
  await page.goto('/#v1.e30');
  const other = await page.context().newPage();
  await other.goto('/#v1.e30');
  await other.locator('#hand-0').fill('51');
  const link = await settledHref(other);
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
    await expect(page.locator('#bpm')).toHaveValue('120');
    await openPanel(page);
    await expect(page.locator('#sp-preset')).toHaveValue('voice-per-part');
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
  await expect(page).toHaveURL(/#v2\./);
});
