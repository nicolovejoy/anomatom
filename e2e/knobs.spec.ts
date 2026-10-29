// The knob panel and the fix state (SPEC §4.1, §4.2), headless. Canvas content (the warning
// flights, the greyed strip, the accent marks) is checked by screenshot, saved to test-results.
import { expect, test, type Page } from '@playwright/test';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/knobs-${name}.png`, fullPage: true });
const hand1 = (page: Page) => page.locator('#hand-0');
const status = (page: Page) => page.locator('#status');

test('432: the collision named, digits in the warning colour, three fixes that validate', async ({ page }) => {
  await page.goto('/');
  await hand1(page).fill('432');
  await expect(status(page)).toContainText('throws 1, 2 and 3 all land in hand 1 on beat 5');
  await expect(page.locator('.pattern-row[data-hand="0"] .mirror .warn')).toHaveCount(3);
  await expect(page.locator('.pattern-row[data-hand="0"] .indicator')).toHaveAttribute('data-state', 'bad');
  await expect(page.locator('#play')).toBeDisabled();
  const fixes = page.locator('.fix');
  await expect(fixes).toHaveCount(3);
  await shot(page, '432');
  const first = (await fixes.first().textContent()) as string;
  await fixes.first().click();
  await expect(hand1(page)).toHaveValue(first);
  await expect(status(page)).toContainText(/I have \d balls?\./);
  await expect(page.locator('#play')).toBeEnabled();
});

test('12 offers 22 first; the digit pad types at the caret', async ({ page }) => {
  await page.goto('/');
  await hand1(page).fill('');
  for (const k of ['1', '2']) await page.locator(`.digit-pad [data-key="${k}"]`).click();
  await expect(hand1(page)).toHaveValue('12');
  await expect(status(page)).toContainText('1.5 balls');
  await expect(page.locator('.fix').first()).toHaveText('22');
  await page.locator('.digit-pad [data-key="backspace"]').click();
  await page.locator('.digit-pad [data-key="x"]').click();
  await expect(hand1(page)).toHaveValue('1x');
});

test('ratio chips, steppers, tempo for both hands, and the accent at 3:2', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await expect(page.locator('.pattern-row[data-hand="1"]')).toBeVisible();
  await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 120 bpm, hand 2 at 80.');
  // Arrow keys walk the chips.
  await page.locator('.chip', { hasText: '3:2' }).press('ArrowRight');
  await expect(page.locator('.chip', { hasText: '4:3' })).toHaveAttribute('aria-pressed', 'true');
  // Steppers: 4:3 → 5:3.
  await page.locator('.stepper[data-hand="0"] [data-delta="1"]').click();
  await expect(page.locator('.stepper[data-hand="0"] output')).toHaveText('5');
  await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('#bpm').fill('90');
  await page.locator('#bpm').press('Tab');
  await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 90 bpm, hand 2 at 54.');

  await page.locator('.chip', { hasText: '3:2' }).click();
  await hand1(page).fill('2 2x 2');
  await page.locator('#hand-1').fill('2x 2');
  await expect(status(page)).toHaveText('I have 4 balls.');
  await shot(page, 'accent-3-2');
  await page.locator('#hand-1').fill('2 2x');
  await hand1(page).fill('2x 2 2');
  await expect(status(page)).toContainText('lands between');
});

test('swap two sites: 531 → 441 by choosing throws 1 and 2', async ({ page }) => {
  await page.goto('/');
  await hand1(page).fill('531');
  await expect(page.locator('#swap')).toBeDisabled();
  const site = (i: number) => page.locator(`.pattern-row[data-hand="0"] .mirror [data-site="${i}"]`);
  for (const i of [0, 1]) {
    const box = (await site(i).boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(page.locator('.mirror .chosen')).toHaveCount(2);
  await page.locator('#swap').click();
  await expect(hand1(page)).toHaveValue('441');
});

test('play, pause, scrub, resume, stop; Space toggles; volume and sound panel', async ({ page }) => {
  await page.goto('/');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('#scrub')).toBeDisabled();
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveText('Play');
  await expect(page.locator('#scrub')).toBeEnabled();
  await page.locator('#scrub').fill('500');
  // A pattern change while paused waits for the next cycle.
  await hand1(page).fill('441');
  await expect(page.locator('#pending')).toBeVisible();
  // Invalid while paused: play disabled, the broken strip shown above.
  await hand1(page).fill('432');
  await expect(page.locator('#play')).toBeDisabled();
  await expect(page.locator('.ladder-broken')).toBeVisible();
  await shot(page, 'broken-above');
  await hand1(page).fill('441');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.locator('#stop').click();
  await expect(page.locator('#stop')).toBeDisabled();

  await page.locator('#volume').fill('0.3');
  await expect(page.locator('#volume')).toHaveValue('0.3');
  await page.locator('#sound-button').click();
  await expect(page.locator('#sound-button')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('.about-link').click();
  await expect(page).toHaveURL(/#about$/);
});

test('an invalid edit while playing: the old pattern plays on, the broken one greyed above', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await page.locator('#play').click();
  await hand1(page).fill('2x 2 2');
  await page.locator('#hand-1').fill('2 2x');
  await expect(page.locator('.ladder-broken')).toBeVisible();
  // While playing the button pauses; it stays usable.
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('#play')).toBeEnabled();
  await shot(page, 'greyed-3-2');
  await page.locator('#stop').click();
  await expect(page.locator('.ladder-broken')).toBeHidden();
});

test('Space types a space in a pattern input; Enter there plays; Space elsewhere pauses', async ({ page }) => {
  await page.goto('/');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await hand1(page).fill('');
  await hand1(page).click();
  await page.keyboard.type('2');
  await page.keyboard.press('Space');
  await page.keyboard.type('2x');
  await page.keyboard.press('Space');
  await page.keyboard.type('2');
  await expect(hand1(page)).toHaveValue('2 2x 2');
  await expect(page.locator('#play')).toHaveText('Play');
  await page.locator('#hand-1').fill('2x 2');
  await page.locator('#hand-1').press('Enter');
  await expect(page.locator('#play')).toHaveText('Pause');
  // Enter never pauses.
  await page.locator('#hand-1').press('Enter');
  await expect(page.locator('#play')).toHaveText('Pause');
  await page.locator('#volume').focus();
  await page.keyboard.press('Space');
  await expect(page.locator('#play')).toHaveText('Play');
  await expect(page.locator('#scrub')).toBeEnabled();
});

test('swap by keyboard: Shift+Arrow over one throw chooses it', async ({ page }) => {
  await page.goto('/');
  await hand1(page).fill('531');
  // Home is not "start of line" on macOS WebKit and Firefox, so put the caret there directly.
  await hand1(page).evaluate((el: HTMLInputElement) => el.setSelectionRange(0, 0));
  await hand1(page).press('Shift+ArrowRight');
  await hand1(page).press('ArrowRight');
  await hand1(page).press('Shift+ArrowRight');
  await expect(page.locator('.mirror .chosen')).toHaveCount(2);
  await expect(page.locator('#swap')).toBeEnabled();
  await page.locator('#swap').press('Enter');
  await expect(hand1(page)).toHaveValue('441');
});

test('a fix click returns focus to the input; a chip always applies its exact ratio', async ({ page }) => {
  await page.goto('/');
  await hand1(page).fill('432');
  await page.locator('.fix').first().click();
  await expect(hand1(page)).toBeFocused();
  // Steppers to 2:2, then the 1:1 chip normalises it.
  await page.locator('.stepper[data-hand="0"] [data-delta="1"]').click();
  await page.locator('.stepper[data-hand="1"] [data-delta="1"]').click();
  await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.chip', { hasText: '1:1' }).click();
  await expect(page.locator('.stepper[data-hand="0"] output')).toHaveText('1');
  await expect(page.locator('.chip', { hasText: '1:1' })).toHaveAttribute('aria-pressed', 'true');
});

test('phone width folds the panel under a button; the juggler and ladder stay', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.knobs-toggle')).toBeVisible();
  await expect(page.locator('#knobs-body')).toBeHidden();
  await expect(page.locator('canvas.ladder').last()).toBeVisible();
  await shot(page, 'phone-folded');
  await page.locator('.knobs-toggle').click();
  await expect(page.locator('#knobs-body')).toBeVisible();
  await shot(page, 'phone-open');
});
