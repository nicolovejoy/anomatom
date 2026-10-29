// SPEC §7 "Done means", items 1-4 and 7, across Chromium, WebKit and Firefox (item 5 lives in
// sound.spec.ts, item 6 in src/app/player-timing.test.ts, item 8 in smoke.spec.ts). Audio output is not
// observable headless, so everything is read from the page: the status line, the fix buttons,
// `data-events-scheduled` on #app, and `data-balls` on the two canvases.
import { expect, isCdnError, openTab, stopPlaying, test, type Page } from './fixtures';

const hand = (page: Page, i: 0 | 1 = 0) => page.locator(`#hand-${i}`);
const status = (page: Page) => page.locator('#status');
const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const ladder = (page: Page) => page.locator('canvas.ladder');

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

/** The text differs from `from` in exactly one position, same length. */
const oneDigitApart = (from: string, to: string) =>
  from.length === to.length && [...from].filter((c, i) => c !== to[i]).length === 1;

/** Every fix button, read as text, in order. */
const fixTexts = async (page: Page) => {
  await expect(page.locator('.fix').first()).toBeVisible();
  return (await page.locator('.fix').allTextContents()).map((t) => t.trim());
};

test.describe('SPEC 7.1: the classic patterns validate and play at 1:1', () => {
  const cases: [string, number][] = [
    ['3', 3],
    ['441', 3],
    ['531', 3],
    ['51', 3],
    ['5551', 4],
    ['97531', 5],
  ];
  for (const [pattern, balls] of cases) {
    test(`${pattern}: ${balls} balls, ladder and juggler agree, events schedule`, async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#v1.e30');
      await hand(page).fill(pattern);
      await expect(status(page)).toHaveText(`I have ${balls} balls.`);
      await expect(page.locator('.chip[aria-pressed="true"]')).toHaveText('1:1');
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
      // Both pictures draw the same number of balls (the hand-drawn diagrams are in the unit tests:
      // src/view/ladder.test.ts, src/view/juggler.test.ts, src/core/schedule.test.ts).
      await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', String(balls));
      await expect(ladder(page)).toHaveAttribute('data-balls', String(balls));
      const n = await scheduled(page);
      await expect.poll(() => scheduled(page), { timeout: 8_000 }).toBeGreaterThan(n + 4);
      await stopPlaying(page);
      expect(errors).toEqual([]);
    });
  }
});

test.describe('SPEC 7.2: fractional counts and collisions come with valid fixes', () => {
  for (const [pattern, balls] of [
    ['12', '1.5'],
    ['21', '1.5'],
    ['43', '3.5'],
    ['4441', '3.25'],
  ]) {
    test(`${pattern}: ${balls} balls, and every fix is valid`, async ({ page }) => {
      await page.goto('/#v1.e30');
      await hand(page).fill(pattern);
      await expect(status(page)).toContainText(`${balls} balls`);
      // The sound is never gated (design §6): Play stays on for a pattern I can't juggle.
      await expect(page.locator('#play')).toBeEnabled();
      const fixes = await fixTexts(page);
      expect(fixes.length).toBeGreaterThan(0);
      expect(fixes.some((f) => oneDigitApart(pattern, f))).toBe(true);
      for (const fix of fixes) {
        await hand(page).fill(fix);
        await expect(status(page)).toContainText(/I have \d+ balls?\./);
        await expect(page.locator('#play')).toBeEnabled();
        await hand(page).fill(pattern);
        await expect(status(page)).toContainText(`${balls} balls`);
      }
    });
  }

  for (const [pattern, named] of [
    ['432', 'throws 1, 2 and 3 all land in hand 1 on beat 5'],
    // A 0 is a beat with no throw (MATH.md §9.2): flights onto it land where nothing is thrown.
    ['510', 'throw 1 lands in hand 2 on beat 6, where I have nothing to throw'],
  ] as const) {
    test(`${pattern}: the collision names the throws, and every fix is valid`, async ({ page }) => {
      await page.goto('/#v1.e30');
      await hand(page).fill(pattern);
      await expect(status(page)).toContainText(named);
      // The sound is never gated (design §6): Play stays on for a pattern I can't juggle.
      await expect(page.locator('#play')).toBeEnabled();
      const fixes = await fixTexts(page);
      expect(fixes.length).toBeGreaterThan(0);
      for (const fix of fixes) {
        await hand(page).fill(fix);
        await expect(status(page)).toContainText(/I have \d+ balls?\./);
        await hand(page).fill(pattern);
        await expect(status(page)).toContainText(/lands? in hand/);
      }
    });
  }
});

test.describe('SPEC 7.3: the 3:2 demo', () => {
  test('2 against 2 at 3:2 validates and plays; the strip draws 4 balls', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await page.locator('.chip', { hasText: '3:2' }).click();
    await openTab(page, 'pattern');
    await hand(page, 0).fill('2');
    await hand(page, 1).fill('2');
    await expect(status(page)).toHaveText('I have 4 balls.');
    await page.locator('#play').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(ladder(page)).toHaveAttribute('data-balls', '4');
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '4');
    await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 120 bpm, hand 2 at 80.');
    await stopPlaying(page);
  });

  test('2 2x 2 / 2x 2 validates and plays with the accent', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await page.locator('.chip', { hasText: '3:2' }).click();
    await openTab(page, 'pattern');
    await hand(page, 0).fill('2 2x 2');
    await hand(page, 1).fill('2x 2');
    await expect(status(page)).toHaveText('I have 4 balls.');
    await page.locator('#play').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(ladder(page)).toHaveAttribute('data-balls', '4');
    // The accent marks themselves are canvas pixels: src/view/accents.test.ts covers which
    // crossings get one, and knobs.spec.ts saves a screenshot of the strip.
    await stopPlaying(page);
  });

  test('2x 2 2 / 2 2x is rejected, naming the landing pulse', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await page.locator('.chip', { hasText: '3:2' }).click();
    await openTab(page, 'pattern');
    await hand(page, 0).fill('2x 2 2');
    await hand(page, 1).fill('2 2x');
    await expect(status(page)).toContainText('lands between');
    await expect(status(page)).toContainText(/is 6\b[\s\S]*is 12\b|is 12\b[\s\S]*is 6\b/);
    // The sound is never gated (design §6): Play stays on for a pattern I can't juggle.
      await expect(page.locator('#play')).toBeEnabled();
  });
});

test.describe('SPEC 7.4: changes while playing land at the next cycle', () => {
  test('a pattern change: pending, then the switch, nothing restarts, nothing throws', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#v1.e30');
    // Slow, so the wait for the next cycle outlasts the poll interval.
    await openTab(page, 'rhythm');
    await page.locator('#bpm').fill('40');
    await page.locator('#bpm').press('Enter');
    await openTab(page, 'pattern');
    await hand(page).fill('97531');
    await expect(status(page)).toHaveText('I have 5 balls.');
    await page.locator('#play').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '5');

    await hand(page).fill('441');
    await expect(page.locator('#pending')).toBeVisible();
    await expect(page.locator('#play')).toHaveText('Pause');
    // The switch: the indicator clears and the picture follows, still playing.
    await expect(page.locator('#pending')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
    await expect(page.locator('#play')).toHaveText('Pause');
    const n = await scheduled(page);
    await expect.poll(() => scheduled(page), { timeout: 10_000 }).toBeGreaterThan(n + 2);
    await stopPlaying(page);
    expect(errors).toEqual([]);
  });

  test('a tempo change: pending, then the switch, still playing', async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await page.locator('#bpm').fill('40');
    await page.locator('#bpm').press('Enter');
    await openTab(page, 'pattern');
    await hand(page).fill('97531');
    await page.locator('#play').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);

    await openTab(page, 'rhythm');
    await page.locator('#bpm').fill('90');
    await page.locator('#bpm').press('Enter');
    await expect(page.locator('#pending')).toBeVisible();
    await expect(page.locator('#pending')).toBeHidden({ timeout: 15_000 });
    await expect(page.locator('#play')).toHaveText('Pause');
    const n = await scheduled(page);
    await expect.poll(() => scheduled(page), { timeout: 10_000 }).toBeGreaterThan(n + 4);
    await stopPlaying(page);
    expect(errors).toEqual([]);
  });
});

test.describe('SPEC 7.7: the About page', () => {
  test('the bibliography and credits render with well-formed links', async ({ page }) => {
    await page.goto('/#about');
    await expect(page.locator('.about')).toBeVisible();
    await expect(page.locator('ol.bibliography li').first()).toBeVisible();
    expect(await page.locator('ol.bibliography li').count()).toBeGreaterThanOrEqual(15);
    const hrefs = await page.locator('.about a[target="_blank"]').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(15);
    for (const href of hrefs) {
      expect(href, 'every external link has an href').toBeTruthy();
      const url = new URL(href as string); // throws on a malformed one
      expect(['http:', 'https:']).toContain(url.protocol);
      expect(url.hostname).toMatch(/\./);
    }
    // No empty or javascript: link anywhere on the page.
    const all = await page.locator('.about a').evaluateAll((as) => as.map((a) => a.getAttribute('href') ?? ''));
    for (const href of all) expect(href.trim()).not.toBe('');
    expect(all.some((h) => /^\s*javascript:/i.test(h))).toBe(false);
    // External links open away safely.
    const rels = await page.locator('.about a[target="_blank"]').evaluateAll((as) => as.map((a) => a.getAttribute('rel')));
    for (const rel of rels) expect(rel).toContain('noopener');
  });
});
