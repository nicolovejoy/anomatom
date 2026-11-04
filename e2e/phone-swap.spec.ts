// v6.3 stream B (docs/plans/v6-3-iphone.md, rulings 3 to 5; issue 82). On a phone the digit pad is
// the keyboard: the pattern inputs carry inputmode="none", and ⌨ hands one to the phone's own until
// it loses focus. A tap on a throw chooses it on pointerup, once. iPhone 13 emulation with touch
// taps, headless; Firefox has no mobile emulation and is skipped. Chromium and WebKit both fire
// touch pointerdown and pointerup for an emulated tap, then mousedown, mouseup and click (WebKit's
// click says pointerType mouse), so the main test runs the pointerup path in both. The once-per-tap
// test dispatches a tap's events by hand to add a selection between them, which a tap cannot.
// Screenshots go to the scratchpad when E2E_SHOTS names a directory, else nowhere.
import { devices } from '@playwright/test';
import { expect, openTab, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` });
};

const hand1 = (page: Page) => page.locator('#hand-0');
/** Throw `i`'s first character behind the input (its digit; a 2x draws its x as a second span). */
const site = (page: Page, i: number) => page.locator(`.pattern-row[data-hand="0"] .mirror [data-site="${i}"]`).first();
const key = (page: Page, k: string) => page.locator(`.digit-pad [data-key="${k}"]`);

/** The middle of throw `i` as drawn behind the input: where a finger lands on it. */
async function siteCentre(page: Page, i: number) {
  await site(page, i).scrollIntoViewIfNeeded();
  const box = (await site(page, i).boundingBox()) as { x: number; y: number; width: number; height: number };
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** Empties the pattern input and types `text` on the digit pad, one tap a key. */
async function padType(page: Page, text: string) {
  while ((await hand1(page).inputValue()) !== '') await key(page, 'backspace').tap();
  for (const ch of text) await key(page, ch).tap();
  await expect(hand1(page)).toHaveValue(text);
}

// The device less its browser: a describe group cannot change it, and the project picks the engine.
const { defaultBrowserType: _engine, ...iPhone13 } = devices['iPhone 13'];

test.describe('phone (iPhone 13), touch', () => {
  test.skip(({ browserName }) => browserName === 'firefox', 'Firefox has no mobile emulation');
  test.use(iPhone13);

  test('the pad types; two taps choose the left hand’s throws; Swap lights and swaps', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'pattern');
    await expect(hand1(page)).toBeVisible();
    for (const input of await page.locator('.pattern-field input').all()) await expect(input).toHaveAttribute('inputmode', 'none');
    await expect(key(page, 'keyboard')).toBeVisible();

    await padType(page, '(4,2x)(2x,4)');
    await key(page, 'keyboard').scrollIntoViewIfNeeded();
    await shot(page, 'phone-pad-keyboard-key');

    // Sites 0 and 2: the left hand's 4 and 2x.
    for (const i of [0, 2]) {
      const { x, y } = await siteCentre(page, i);
      await page.touchscreen.tap(x, y);
    }
    // Three characters: the 4, and the 2 and x of 2x.
    await expect(page.locator('.mirror .chosen')).toHaveCount(3);
    await expect(page.locator('.swap-note')).toHaveText('Two throws chosen.');
    await expect(site(page, 0)).toHaveClass(/chosen/);
    await expect(site(page, 2)).toHaveClass(/chosen/);
    await expect(page.locator('#swap')).toBeEnabled();
    // The tap leaves the inputs to the pad: still no iOS keyboard.
    await expect(hand1(page)).toHaveAttribute('inputmode', 'none');
    await shot(page, 'phone-two-chosen-swap');

    await page.locator('#swap').tap();
    await expect(hand1(page)).not.toHaveValue('(4,2x)(2x,4)');
    await expect(page.locator('.mirror .chosen')).toHaveCount(0);
  });

  test('a tap toggles once: pointerup chooses, its click and its selection do not', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'pattern');
    await padType(page, '531');
    const { x, y } = await siteCentre(page, 1);
    // What a phone sends for one tap: pointerdown and pointerup by touch, a selection, then a click.
    await hand1(page).evaluate(
      (input: HTMLInputElement, { x, y }) => {
        const at = { clientX: x, clientY: y, bubbles: true, pointerType: 'touch', isPrimary: true };
        input.dispatchEvent(new PointerEvent('pointerdown', at));
        input.dispatchEvent(new PointerEvent('pointerup', at));
        // A selection over throw 0 (the keyboard's way to choose) is ignored after a tap.
        input.setSelectionRange(0, 1);
        input.dispatchEvent(new Event('select', { bubbles: true }));
        input.setSelectionRange(1, 1);
        input.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true }));
      },
      { x, y },
    );
    await expect(page.locator('.mirror .chosen')).toHaveCount(1);
    await expect(site(page, 1)).toHaveClass(/chosen/);
    await expect(page.locator('.swap-note')).toHaveText('One throw chosen; tap one more.');
  });

  test('a tap puts the caret where the pad types: 531, tap between 5 and 3, 4 → 5431', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'pattern');
    await padType(page, '531');
    await site(page, 1).scrollIntoViewIfNeeded();
    const box = (await site(page, 1).boundingBox()) as { x: number; y: number; width: number; height: number };
    // The left edge of the 3: the caret lands before it.
    await page.touchscreen.tap(box.x + 1, box.y + box.height / 2);
    await key(page, '4').tap();
    await expect(hand1(page)).toHaveValue('5431');
  });

  test('the keyboard ⌨ opened goes on across a / b: the / split and the Backspace join', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'pattern');
    await padType(page, '3');
    await key(page, 'keyboard').tap();
    await expect(hand1(page)).toBeFocused();
    // A / at 1:1 splits the pattern: hand 2's input takes focus, with the keyboard still open.
    await page.keyboard.type('/');
    const hand2 = page.locator('#hand-1');
    await expect(hand2).toBeFocused();
    await expect(hand2).toHaveAttribute('inputmode', 'text');
    await expect(hand1(page)).toHaveAttribute('inputmode', 'none');
    // Backspace in the empty hand 2 joins it back: hand 1 takes focus, still on the keyboard.
    await page.keyboard.press('Backspace');
    await expect(hand1(page)).toBeFocused();
    await expect(hand1(page)).toHaveAttribute('inputmode', 'text');
    await expect(hand2).toHaveAttribute('inputmode', 'none');
  });

  test('⌨ hands the input to the phone’s keyboard until it loses focus', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'pattern');
    await key(page, 'keyboard').tap();
    await expect(hand1(page)).toHaveAttribute('inputmode', 'text');
    await expect(hand1(page)).toBeFocused();
    await hand1(page).blur();
    await expect(hand1(page)).toHaveAttribute('inputmode', 'none');
  });
});
