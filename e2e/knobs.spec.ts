// The knob panel and the fix state (SPEC §4.1, §4.2), headless. Canvas content (the warning
// flights, the greyed strip, the accent marks) is checked by screenshot, saved to test-results.
import { expect, openTab, stopPlaying, test, type Page } from './fixtures';

const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/knobs-${name}.png`, fullPage: true });
const hand1 = (page: Page) => page.locator('#hand-0');
const status = (page: Page) => page.locator('#status');

test('432: the collision named, digits in the warning colour, three fixes that validate', async ({ page }) => {
  await page.goto('/#v1.e30');
  await hand1(page).fill('432');
  await expect(status(page)).toContainText('throws 1, 2 and 3 all land in hand 1 on beat 5');
  await expect(page.locator('.pattern-row[data-hand="0"] .mirror .warn')).toHaveCount(3);
  await expect(page.locator('.pattern-row[data-hand="0"] .indicator')).toHaveAttribute('data-state', 'bad');
  // The sound is never gated (design §6): Play stays on.
  await expect(page.locator('#play')).toBeEnabled();
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
  await page.goto('/#v1.e30');
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
  await page.goto('/#v1.e30');
  await openTab(page, 'rhythm');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 104 bpm, hand 2 at 69.3.');
  await expect(page.locator('.tempo-hands')).toHaveText(/Hand 1 · 104 bpm\s*Hand 2 · 69.3 bpm/);
  // Arrow keys walk the chips.
  await page.locator('.chip', { hasText: '3:2' }).press('ArrowRight');
  await expect(page.locator('.chip', { hasText: '4:3' })).toHaveAttribute('aria-pressed', 'true');
  // Steppers, behind More: 4:3 → 5:3. A ratio with no chip keeps them showing.
  await expect(page.locator('#ratio-steppers')).toBeHidden();
  await page.locator('.chip-more').click();
  await page.locator('.stepper[data-hand="0"] [data-delta="1"]').click();
  await expect(page.locator('.stepper[data-hand="0"] output')).toHaveText('5');
  await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.chip-more').click();
  await expect(page.locator('#ratio-steppers')).toBeVisible();
  // Tempo is the Sound tab's first group (v4).
  await openTab(page, 'sound');
  await page.locator('#bpm').fill('90');
  await page.locator('#bpm').press('Tab');
  await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 90 bpm, hand 2 at 54.');
  // Enter in the tempo box commits too.
  await page.locator('#bpm').fill('100');
  await page.locator('#bpm').press('Enter');
  await expect(page.locator('.tempo-both')).toHaveText('Hand 1 beats at 100 bpm, hand 2 at 60.');
  await expect(page.locator('#tempo')).toHaveValue('100');

  await openTab(page, 'rhythm');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await openTab(page, 'pattern');
  await expect(page.locator('.pattern-row[data-hand="1"]')).toBeVisible();
  await hand1(page).fill('2 2x 2');
  await page.locator('#hand-1').fill('2x 2');
  await expect(status(page)).toHaveText('I have 4 balls.');
  await shot(page, 'accent-3-2');
  await page.locator('#hand-1').fill('2 2x');
  await hand1(page).fill('2x 2 2');
  await expect(status(page)).toContainText('lands between');
});

test('swap two sites: 531 → 441 by choosing throws 1 and 2', async ({ page }) => {
  await page.goto('/#v1.e30');
  await hand1(page).fill('531');
  await expect(page.locator('#swap')).toBeDisabled();
  const site = (i: number) => page.locator(`.pattern-row[data-hand="0"] .mirror [data-site="${i}"]`);
  for (const i of [0, 1]) {
    await site(i).scrollIntoViewIfNeeded();
    const box = (await site(i).boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(page.locator('.mirror .chosen')).toHaveCount(2);
  await page.locator('#swap').click();
  await expect(hand1(page)).toHaveValue('441');
});

test('play, pause, scrub, resume, stop; Space toggles; volume and sound panel', async ({ page }) => {
  await page.goto('/#v1.e30');
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
  // Not juggleable while paused: it still plays (design §6), so Play stays on.
  await hand1(page).fill('432');
  await expect(page.locator('#play')).toBeEnabled();
  await shot(page, 'broken-paused');
  await hand1(page).fill('441');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  // Stop and the time slider show only while paused.
  await expect(page.locator('#stop')).toBeHidden();
  await stopPlaying(page);
  await expect(page.locator('#stop')).toBeDisabled();

  // Volume is the deck's (v4).
  await page.locator('#volume').fill('0.3');
  await expect(page.locator('#volume')).toHaveValue('0.3');
  await openTab(page, 'sound');
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await page.locator('.about-link').click();
  await expect(page).toHaveURL(/#about$/);
});

test('an edit I can’t juggle while playing: it is queued and plays, its bars grey', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openTab(page, 'rhythm');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await page.locator('#play').click();
  await openTab(page, 'pattern');
  await hand1(page).fill('2x 2 2');
  await page.locator('#hand-1').fill('2 2x');
  await expect(page.locator('#status')).toContainText('lands between');
  // While playing the button pauses; it stays usable.
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('#play')).toBeEnabled();
  await shot(page, 'greyed-3-2');
  await stopPlaying(page);
  await expect(page.locator('#play')).toBeEnabled();
});

test('Space types a space in a pattern input; Enter there plays; Space elsewhere pauses', async ({ page }) => {
  await page.goto('/#v1.e30');
  await openTab(page, 'rhythm');
  await page.locator('.chip', { hasText: '3:2' }).click();
  await openTab(page, 'pattern');
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
  await page.goto('/#v1.e30');
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
  await page.goto('/#v1.e30');
  await hand1(page).fill('432');
  await page.locator('.fix').first().click();
  await expect(hand1(page)).toBeFocused();
  // Steppers to 2:2, then the 1:1 chip normalises it.
  await openTab(page, 'rhythm');
  await page.locator('.chip-more').click();
  await page.locator('.stepper[data-hand="0"] [data-delta="1"]').click();
  await page.locator('.stepper[data-hand="1"] [data-delta="1"]').click();
  await expect(page.locator('.chip[aria-pressed="true"]')).toHaveCount(0);
  await page.locator('.chip', { hasText: '1:1' }).click();
  await expect(page.locator('.stepper[data-hand="0"] output')).toHaveText('1');
  await expect(page.locator('.chip', { hasText: '1:1' })).toHaveAttribute('aria-pressed', 'true');
});

test('phone: the closed sheet shows no tabs; Details opens it, tabs switch and close, Escape and the handle close', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#v1.e30');
  // Closed: the deck, no handle, no tabs, no panel (v4 ruling C). The juggler and the ladder stay.
  await expect(page.locator('.deck-bar')).toBeVisible();
  await expect(page.locator('.deck-meta')).toHaveText('3 balls');
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('#tab-rhythm')).toBeHidden();
  await expect(page.locator('.sheet-grab')).toBeHidden();
  await expect(hand1(page)).toBeHidden();
  await expect(page.locator('canvas.ladder').last()).toBeVisible();
  await shot(page, 'phone-closed');
  // Details opens the sheet on Sound, with its tabs; the top bar stays (v4).
  await page.locator('.deck-details').click();
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('#tab-pattern')).toBeVisible();
  await expect(page.locator('.about-link')).toBeVisible();
  await page.locator('#tab-pattern').click();
  await expect(hand1(page)).toBeVisible();
  await hand1(page).fill('531');
  await expect(page.locator('.deck-notation')).toHaveText('531');
  // Another tab switches; the open tab again closes, tabs and all.
  await page.locator('#tab-rhythm').click();
  await expect(page.locator('.chip').first()).toBeVisible();
  await expect(hand1(page)).toBeHidden();
  await shot(page, 'phone-rhythm');
  await page.locator('#tab-rhythm').click();
  await expect(page.locator('.chip').first()).toBeHidden();
  await expect(page.locator('#tab-rhythm')).toBeHidden();
  await expect(page.locator('.about-link')).toBeVisible();
  // Escape closes, focus back on the deck's Details.
  await page.locator('.deck-details').click();
  await expect(page.locator('.sound-panel')).toBeVisible();
  await page.locator('#sp-preset').focus();
  await page.keyboard.press('Escape');
  await expect(page.locator('.sound-panel')).toBeHidden();
  await expect(page.locator('.deck-details')).toBeFocused();
  // The handle, shown while open: a drag down closes.
  await page.locator('.deck-details').click();
  await expect(page.locator('.sound-panel')).toBeVisible();
  const grab = (await page.locator('.sheet-grab').boundingBox()) as { x: number; y: number; width: number; height: number };
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 10);
  await page.mouse.down();
  await page.mouse.move(grab.x + grab.width / 2, grab.y + 120, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('.sound-panel')).toBeHidden();
});

test('wide: the sheet is a column, always open on a tab; the open tab again keeps it', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#v1.e30');
  await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
  await expect(hand1(page)).toBeVisible();
  await expect(page.locator('.sheet-grab')).toBeHidden();
  await page.locator('#tab-pattern').click();
  await expect(hand1(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(hand1(page)).toBeVisible();
  // Arrow keys walk the tabs.
  await page.locator('#tab-pattern').press('ArrowRight');
  await expect(page.locator('#tab-rhythm')).toBeFocused();
  await expect(page.locator('#tab-rhythm')).toHaveAttribute('aria-selected', 'true');
  await shot(page, 'wide');
});
