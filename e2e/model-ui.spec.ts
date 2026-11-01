// The model UI rewire (docs/plans/model-waves.md, E; design §14 option b), headless on a phone
// viewport: the Rhythm tab's phase, balls and hits per hand, Reset on a manual group, form 2 at
// 1:1, the fixes heading, and the juggler's fault and "not a human throw". Canvas content is
// checked by screenshot, saved to test-results.
import { expect, openTab, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/model-ui-${name}.png` });

/** A `#v2.` link to parts in short keys (src/app/hash.ts) at 1:1 and 120 bpm, default mapping. */
const link = (parts: readonly Record<string, unknown>[]) =>
  '/#v2.' + Buffer.from(JSON.stringify({ p: parts, r: [1, 1], t: 120 })).toString('base64url');
const line = (onsets: string, phase = 0) => ({ s: 1, f: phase, u: 1, o: onsets, k: 1 });
/** Clapping Music: two parts on a 12-pulse lattice, both on `x x x . x x . x . x x .`. */
const CLAPPING = link([line('111011010110'), line('111011010110')]);

const cell = (page: Page, kind: 'phase' | 'balls' | 'hits', hand: 0 | 1) => page.locator(`.rstep[data-kind="${kind}"][data-hand="${hand}"]`);
const step = (page: Page, kind: 'phase' | 'balls' | 'hits', hand: 0 | 1, delta: 1 | -1) =>
  cell(page, kind, hand).locator(`[data-delta="${delta}"]`).click();
/** The Rhythm tab with every lane's hits, balls and phase unfolded (a phone folds them under More). */
async function openRhythm(page: Page) {
  await openTab(page, 'rhythm');
  const closed = page.locator('.lane-more-toggle[aria-expanded="false"]:visible');
  while ((await closed.count()) > 0) await closed.first().click();
}
const samples = (page: Page) => page.locator('[data-cycle-samples]').getAttribute('data-cycle-samples');

test('Clapping Music: the phase stepper keeps the cycle at 12 at every step', async ({ page }) => {
  await page.goto(CLAPPING);
  await openRhythm(page);
  const phase = cell(page, 'phase', 1).locator('output');
  await expect(phase).toHaveAttribute('data-phase', '0');
  await expect(phase).toHaveAttribute('data-cycle', '12');
  await expect(phase).toContainText('/ 12');
  await shot(page, 'rhythm');
  for (const expected of ['1', '2', '3']) {
    await step(page, 'phase', 1, 1);
    await expect(phase).toHaveAttribute('data-phase', expected);
    await expect(phase).toHaveAttribute('data-cycle', '12');
  }
  for (let i = 0; i < 4; i++) await step(page, 'phase', 1, -1);
  await expect(phase).toHaveAttribute('data-phase', '11');
  await expect(phase).toHaveAttribute('data-cycle', '12');
  await expect(page.locator('.deck-meta')).toHaveText(/^2 balls\b/);
});

test('the ball stepper changes the summary’s ball count and not the sound', async ({ page }) => {
  await page.goto(CLAPPING);
  await openRhythm(page);
  await expect(page.locator('.deck-meta')).toHaveText(/^2 balls\b/);
  const before = await samples(page);
  expect(before?.split(' ')).toHaveLength(16);
  await expect(cell(page, 'balls', 0).locator('[data-delta="-1"]')).toBeDisabled();
  await step(page, 'balls', 0, 1);
  await expect(cell(page, 'balls', 0).locator('output')).toHaveText('2');
  await expect(page.locator('.deck-meta')).toHaveText(/^3 balls\b/);
  expect(await samples(page)).toBe(before);
  // The hook does see a change in the sound: a Hits step moves it.
  await step(page, 'hits', 0, -1);
  await expect(cell(page, 'hits', 0).locator('output')).toHaveText('7');
  await expect(page.locator('[data-cycle-samples]')).not.toHaveAttribute('data-cycle-samples', before as string);
});

test('a manual group shows its count and Reset; Reset brings the steppers back', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('531');
  await openRhythm(page);
  // One vanilla siteswap is one group over both hands: one count, no knob.
  await expect(page.locator('.group-balls[data-hand="0"]')).toContainText('3 balls between both hands');
  await expect(page.locator('.group-balls[data-hand="1"]')).toBeHidden();
  await expect(cell(page, 'balls', 0)).toBeHidden();
  await expect(cell(page, 'balls', 1)).toBeHidden();
  await page.locator('.group-balls[data-hand="0"] .reset-group').click();
  await expect(page.locator('.group-balls[data-hand="0"]')).toBeHidden();
  for (const h of [0, 1] as const) {
    await expect(cell(page, 'balls', h)).toBeVisible();
    await expect(cell(page, 'balls', h).locator('output')).toHaveText('1');
  }
  await expect(page.locator('.deck-meta')).toHaveText(/^2 balls\b/);
});

test('the hits stepper runs the Euclidean generator over the hand’s period', async ({ page }) => {
  await page.goto(CLAPPING);
  await openRhythm(page);
  const hits = cell(page, 'hits', 0).locator('output');
  await expect(hits).toHaveText('8');
  for (let i = 0; i < 3; i++) await step(page, 'hits', 0, -1);
  await expect(hits).toHaveText('5');
  await expect(cell(page, 'hits', 1).locator('output')).toHaveText('8');
  // Five hits spread over twelve beats, at one ball: five throws in hand 1's input.
  await openTab(page, 'pattern');
  const digits = ((await page.locator('#hand-0').inputValue()).match(/[1-9a-z]/g) ?? []).length;
  expect(digits).toBe(5);
  await expect(page.locator('.deck-meta')).toHaveText(/^2 balls\b/);
});

test('form 2 at 1:1: a slash splits the pattern in two inputs; backspace in an empty hand 2 joins it', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openTab(page, 'pattern');
  await expect(page.locator('#hand-1')).toBeHidden();
  await page.locator('#hand-0').fill('3/');
  await expect(page.locator('#hand-1')).toBeVisible();
  await expect(page.locator('#hand-1')).toBeFocused();
  await expect(page.locator('#hand-0')).toHaveValue('3');
  await page.keyboard.type('3');
  await expect(page.locator('#hand-1')).toHaveValue('3');
  await expect(page.locator('#status')).toHaveText('I have 6 balls.');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(page.locator('#hand-1')).toBeHidden();
  await expect(page.locator('#hand-0')).toBeFocused();
  await expect(page.locator('#status')).toHaveText('I have 3 balls.');
});

test('split at 1:1: a `/` in hand 1 leaves hand 2 alone; Backspace never joins parts of their own', async ({ page }) => {
  await page.goto(link([line('111011010110'), line('111011010110', 3)]));
  await openTab(page, 'pattern');
  const hand2 = await page.locator('#hand-1').inputValue();
  await page.locator('#hand-0').press('End');
  await page.locator('#hand-0').press('/');
  await expect(page.locator('#hand-1')).toHaveValue(hand2);
  await expect(page.locator('#hand-0')).not.toHaveValue(/\//);
  // Hand 2 at phase 3, its input cleared, then Backspace: still two inputs, the phase kept.
  await page.locator('#hand-1').fill('');
  await page.locator('#hand-1').press('Backspace');
  await expect(page.locator('#hand-1')).toBeVisible();
  await openRhythm(page);
  await expect(cell(page, 'phase', 1).locator('output')).toHaveAttribute('data-phase', '3');
  await expect(cell(page, 'phase', 1).locator('output')).toHaveAttribute('data-cycle', '12');
});

test('a pattern I can’t juggle: the fault drawn, the fixes under their heading, the notice muted', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('432');
  await expect(page.locator('.fixes-heading')).toHaveText('Make it juggleable');
  await expect(page.locator('.fix')).toHaveCount(3);
  await page.locator('#play').click();
  // No balls for the faulted group; its colliding flights are drawn instead (screenshot).
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '0');
  await page.waitForTimeout(400);
  await shot(page, 'pattern-fault');
  // A phase step on a manual group of two resets it: the notice is the last line, muted.
  await openRhythm(page);
  await step(page, 'phase', 0, 1);
  await openTab(page, 'pattern');
  const notice = page.locator('#status p.notice');
  await expect(notice).toHaveText('I reset hands 1 and 2 to 1 ball each.');
  await expect(page.locator('#status p').last()).toHaveClass('notice');
});

test('a 16-step line with one hit at 120 bpm: not a human throw', async ({ page }) => {
  // The cascade at 120 bpm is a human throw: no label.
  await page.goto('/#v1.e30');
  await page.locator('#play').click();
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
  await expect(page.locator('.juggler-note')).toBeHidden();
  // A fresh page: a link pasted while playing would land at the next cycle.
  await page.goto('about:blank');
  await page.goto(link([line('1000000000000000')]));
  await expect(page.locator('.deck-meta')).toHaveText(/^1 ball\b/);
  await page.locator('#play').click();
  await expect(page.locator('.juggler-note')).toBeVisible();
  await expect(page.locator('.juggler-note')).toContainText('Not a human throw');
  await page.waitForTimeout(1500);
  await shot(page, 'not-human');
});
