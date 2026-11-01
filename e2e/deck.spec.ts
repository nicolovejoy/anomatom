// The deck (docs/plans/v4-deck.md, stream D1; v4.1 polish, docs/plans/v4-1-polish.md), headless
// at 390×844, 844×390, 667×375 and 1280×800: the transport bar, the arrows and keys, the looping
// wheel, mute, Kit, Details, Make your own, square corners, no page scroll, no console errors.
// Screenshots go to e2e/shots/.
import { mkdirSync } from 'node:fs';
import { PRESETS } from '../src/app/presets';
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const SHOTS = 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const notation = (page: Page) => page.locator('.deck-notation');

/** What sits at the middle of each row the open wheel shows: a row's data-row, or null for none (a blank row). */
const wheelRowsShown = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const rowPx = (wheel.querySelector('.deck-row') as HTMLElement).getBoundingClientRect().height;
    const n = Math.round(box.height / rowPx);
    return Array.from({ length: n }, (_, i) => {
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + (i + 0.5) * rowPx);
      return hit?.closest('.deck-row')?.getAttribute('data-row') ?? null;
    });
  });

/** Overlap in px² of two boxes. */
const overlap = (a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

/** Console errors and page errors, the aborted sample CDN excused. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
  });
  page.on('pageerror', (e) => {
    if (!isCdnError(e.message)) errors.push(e.message);
  });
  return errors;
}

const SIZES = [
  { name: '390x844', width: 390, height: 844, docked: false, column: false },
  { name: '844x390', width: 844, height: 390, docked: false, column: true },
  { name: '667x375', width: 667, height: 375, docked: false, column: true },
  { name: '1280x800', width: 1280, height: 800, docked: true, column: false },
];

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('a bare address shows the deck and the wheel; nothing plays until Play', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await expect(page.locator('.deck-bar')).toBeVisible();
      await expect(page.locator('#play')).toBeVisible();
      await expect(page.locator('.deck-sound')).toBeVisible();
      await expect(page.locator('.deck-wheel')).toBeVisible();
      // Every preset (27 with v4's passing cards) and Make your own.
      expect(PRESETS.length).toBeGreaterThanOrEqual(27);
      await expect(page.locator('.deck-row')).toHaveCount(PRESETS.length + 1);
      await expect(page.locator('.deck-row').last()).toHaveText('Make your own');
      await expect(notation(page)).toHaveText('3');
      await expect(page.locator('.deck-meta')).toHaveText('3 balls');
      await expect(page.locator('.deck-details')).toBeVisible({ visible: !size.docked && size.width < 760 });
      expect(await scheduled(page)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      // The wheel loops: no blank row above or below the band; Cascade in the band, Make your own just above it.
      await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
      await expect.poll(async () => (await wheelRowsShown(page)).every((r) => r !== null)).toBe(true);
      const shown = await wheelRowsShown(page);
      expect(shown.length % 2).toBe(1);
      expect(shown[(shown.length - 1) / 2]).toBe('0');
      expect(shown[(shown.length - 1) / 2 - 1]).toBe(String(PRESETS.length));
      // Square: nothing in the deck is rounded.
      const rounded = await page.locator('.region-deck').evaluate((root) =>
        [root, ...root.querySelectorAll('*')].filter((el) => {
          const s = getComputedStyle(el);
          return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].some((r) => parseFloat(r) > 0);
        }).map((el) => `${el.tagName}.${el.className}`),
      );
      expect(rounded).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/deck-bare-${size.name}.png` });

      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('→ twice goes 3 → 51 → 441 and the hash follows; ‹ goes back', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#3');
      await page.locator('body').click({ position: { x: 5, y: 60 } });
      await page.keyboard.press('ArrowRight');
      await expect(notation(page)).toHaveText('51');
      await page.keyboard.press('ArrowRight');
      await expect(notation(page)).toHaveText('441');
      await expect(page.locator('.deck-name')).toHaveText('Half box');
      // The hash follows (debounced): a reload opens on 441.
      await expect.poll(() => page.evaluate(() => location.hash)).not.toBe('#3');
      await page.waitForTimeout(800);
      const hash = await page.evaluate(() => location.hash);
      await page.locator('.deck-prev').click();
      await expect(notation(page)).toHaveText('51');
      const fresh = await page.context().newPage();
      await fresh.goto('/' + hash);
      await expect(notation(fresh)).toHaveText('441');
      await fresh.close();
      // ← wraps from the first preset to the last.
      await page.goto('/#3');
      await page.locator('.deck-prev').click();
      await expect(page.locator('.deck-meta')).toHaveText(/jugglers$/);
      // Not in a text field: there the arrows move the caret.
      await openTab(page, 'pattern');
      await page.locator('#hand-0').focus();
      const before = await notation(page).textContent();
      await page.keyboard.press('ArrowLeft');
      await expect(notation(page)).toHaveText(before ?? '');
      await page.screenshot({ path: `${SHOTS}/deck-stepped-${size.name}.png` });
      expect(errors).toEqual([]);
    });

    test('a step while playing keeps playing; Space still plays and pauses after a step and a select', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      await page.locator('.deck-next').click();
      await expect(notation(page)).toHaveText('51');
      await expect(page.locator('#play')).toHaveText('Pause');
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Play');
      // Kit to LM-2 writes the hash; focus goes to Play, so Space plays.
      await page.locator('#deck-kit').selectOption('LM-2');
      await expect(page.locator('#play')).toBeFocused();
      await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/^#v2\./);
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Pause');
      // A step while paused stays paused.
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Play');
      await page.keyboard.press('ArrowRight');
      await expect(notation(page)).toHaveText('441');
      await expect(page.locator('#play')).toHaveText('Play');
    });

    test('clicking a wheel row plays it, from stopped too', async ({ page }) => {
      await page.goto('/#3');
      if (!size.docked) {
        await expect(page.locator('.deck-wheel')).toBeHidden();
        await page.locator('.deck-pattern').click();
      }
      await expect(page.locator('.deck-wheel')).toBeVisible();
      await page.locator('.deck-row[data-id="classic"]').click();
      await expect(notation(page)).toHaveText('531');
      await expect(page.locator('#play')).toHaveText('Pause');
      await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
      await expect(page.locator('.deck-row[data-id="classic"]')).toHaveClass(/\bon\b/);
      await expect(page.locator('.deck-row[data-id="classic"]')).toHaveAttribute('aria-current', 'true');
      await expect(page.locator('.deck-row[aria-current]')).toHaveCount(1);
      // On a phone the pick closes the wheel; docked, it stays.
      await expect(page.locator('.deck-wheel')).toBeVisible({ visible: size.docked });
      await page.screenshot({ path: `${SHOTS}/deck-wheel-pick-${size.name}.png` });
    });

    test('mute sets the master to 0 and back; the slider unmutes', async ({ page }) => {
      await page.goto('/#3');
      const master = () => page.locator('.region-deck').getAttribute('data-master');
      await expect.poll(master).toBe('1');
      await page.locator('#mute').click();
      await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(master).toBe('0');
      await page.locator('#mute').click();
      await expect.poll(master).toBe('1');
      await page.locator('#mute').click();
      await page.locator('#volume').fill('0.4');
      await expect.poll(master).toBe('0.4');
      await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    });

    test('Details (or the Sound tab, wide) shows tempo first; Make your own opens the Pattern tab', async ({ page }) => {
      await page.goto('/#3');
      if (size.width < 760) await page.locator('.deck-details').click();
      else await openTab(page, 'sound');
      await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#bpm')).toBeVisible();
      const first = await page.locator('.sound-panel').evaluate((el) => el.firstElementChild?.classList.contains('tempo'));
      expect(first).toBe(true);
      await expect(page.locator('#panel-rhythm #tempo')).toHaveCount(0);
      await expect(page.locator('#panel-rhythm #volume')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/deck-details-${size.name}.png` });

      if (!size.docked) {
        await page.keyboard.press('Escape');
        await page.locator('.deck-pattern').click();
      }
      await page.locator('.deck-own').click();
      await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#hand-0')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    });

    if (!size.docked) {
      test('the pattern name opens and closes the wheel; outside and Escape close it', async ({ page }) => {
        await page.goto('/#3');
        const wheel = page.locator('.deck-wheel');
        await expect(wheel).toBeHidden();
        await page.locator('.deck-pattern').click();
        await expect(wheel).toBeVisible();
        const w = (await wheel.boundingBox())!;
        const bar = (await page.locator('.deck-bar').boundingBox())!;
        const stage = (await page.locator('.stage').boundingBox())!;
        if (size.column) {
          // A phone on its side: in the right-hand column, over neither the beat ladder nor Kit and Sound (v4.1 ruling 5).
          const ladder = (await page.locator('.region-ladder').boundingBox())!;
          const sound = (await page.locator('.deck-sound').boundingBox())!;
          expect(overlap(w, ladder)).toBe(0);
          expect(overlap(w, sound)).toBe(0);
          expect(overlap(w, bar)).toBe(0);
          expect(w.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
          expect(w.y + w.height).toBeLessThanOrEqual(size.height + 1);
          await expect.poll(async () => (await wheelRowsShown(page)).every((r) => r !== null)).toBe(true);
        } else {
          // Over the stage, not over the deck, and clear of the juggler, which stays in view (ruling B).
          expect(w.y + w.height).toBeLessThanOrEqual(Math.max(bar.y, stage.y + stage.height) + 1);
          expect(w.x).toBeGreaterThanOrEqual(stage.x - 1);
        }
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
        await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-expanded', 'true');
        await expect.poll(async () => {
          const j = (await page.locator('.region-juggler').boundingBox())!;
          const clear = j.y + j.height <= w.y + 1 || j.x + j.width <= w.x + 1;
          return clear && j.height >= 80 && j.width >= 120;
        }).toBe(true);
        await page.screenshot({ path: `${SHOTS}/deck-wheel-open-${size.name}.png` });
        await page.locator('.deck-pattern').click();
        await expect(wheel).toBeHidden();
        await page.locator('.deck-pattern').click();
        await page.keyboard.press('Escape');
        await expect(wheel).toBeHidden();
        await page.locator('.deck-pattern').click();
        await page.locator('.deck-volume').click();
        await expect(wheel).toBeHidden();
      });
    }
  });
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a passing preset plays six balls on both canvases; Make your own shows its text in the one input', async ({ page }) => {
    await page.goto('/');
    await page.locator('.deck-row[data-id="passing"]').click();
    await expect(page.locator('.deck-meta')).toHaveText('2 jugglers');
    // v4.1 ruling 3: the jugglers' kits by short name, and the rule the mapping follows.
    await expect(page.locator('#deck-kit')).toHaveValue('mixed');
    await expect(page.locator('#deck-kit option:checked')).toHaveText('TR-808 / LM-2');
    await expect(page.locator('#deck-sound')).toHaveValue('height-drum');
    await expect(page.locator('#deck-sound option:checked')).toHaveText('Height to drum');
    // Choosing a kit still sets every part.
    await page.locator('#deck-kit').selectOption('LM-2');
    await expect(page.locator('#deck-kit option:checked')).toHaveText('LinnDrum LM-2');
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(page.locator('.juggler')).toHaveAttribute('data-balls', '6');
    await expect(page.locator('.ladder')).toHaveAttribute('data-balls', '6');
    await openTab(page, 'pattern');
    await expect(page.locator('#hand-0')).toHaveValue('<3p 3|3p 3>');
    await expect(page.locator('#hand-1')).toBeHidden();
  });

  test('a hand-made pattern: "Your pattern"; › goes to the first preset, ‹ to the last', async ({ page }) => {
    await page.goto('/#753');
    await expect(notation(page)).toHaveText('753');
    await expect(page.locator('.deck-name')).toHaveText('Your pattern');
    await page.locator('.deck-next').click();
    await expect(notation(page)).toHaveText('3');
    await page.goto('/#753');
    await page.locator('.deck-prev').click();
    await expect(page.locator('.deck-meta')).toHaveText('2 jugglers');
  });

  test('scrolling up from Cascade reaches the last passing pattern', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('.deck-wheel-list');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
    await list.hover();
    await page.mouse.wheel(0, -64);
    // Two rows up (Make your own, then the last passing pattern); a browser's wheel may carry a
    // row or two further, which is still round the seam and among the passing patterns.
    await expect(notation(page)).not.toHaveText('3');
    await expect(page.locator('.deck-meta')).toHaveText('2 jugglers');
    const banded = page.locator('.deck-row.in-band');
    await expect.poll(async () => (await banded.locator('code').textContent()) === (await notation(page).textContent())).toBe(true);
    const passing = PRESETS.filter((p) => p.group === 'passing').map((p) => p.id);
    expect(passing).toContain(await banded.getAttribute('data-id'));
    // The last passing pattern is on screen in the wheel, next to Make your own.
    const shown = await wheelRowsShown(page);
    expect(shown).toContain(String(PRESETS.length - 1));
    expect(await scheduled(page)).toBe(0);
    // And on round: still no blank rows.
    await expect.poll(async () => (await wheelRowsShown(page)).every((r) => r !== null)).toBe(true);
  });

  test('the seven-object pass shows whole in the bar', async ({ page }) => {
    await page.goto('/');
    await page.locator('.deck-row[data-id="seven-pass"]').click();
    await expect(notation(page)).toHaveText('<7p 1 3 1|3p 3 3 3>');
    await expect.poll(() => notation(page).evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    const px = await notation(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(11);
    const slider = (await page.locator('#volume').boundingBox())!;
    expect(slider.width).toBeGreaterThanOrEqual(70);
    await page.screenshot({ path: `${SHOTS}/deck-seven-pass-390x844.png` });
  });

  test('scrolling the wheel picks the row it settles on', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('.deck-wheel-list');
    await expect(page.locator('.deck-wheel')).toBeVisible();
    // Down by the mouse wheel: once the wheel settles, the pattern is the row in the band.
    await list.hover();
    await page.mouse.wheel(0, 64);
    await expect(notation(page)).not.toHaveText('3');
    const banded = await page.locator('.deck-row.in-band code').textContent();
    await expect(notation(page)).toHaveText(banded ?? '');
    expect(await scheduled(page)).toBe(0);
  });

  test('a mouse wheel over the pattern name steps one pattern a notch', async ({ page }) => {
    await page.goto('/#3');
    await page.locator('.deck-pattern').hover();
    await page.mouse.wheel(0, 100);
    await expect(notation(page)).toHaveText('51');
    await page.mouse.wheel(0, -100);
    await expect(notation(page)).toHaveText('3');
  });
});

test.describe('phone, more', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a first visit keeps the juggler in view above the open wheel; the closed sheet shows no tabs', async ({ page }) => {
    await page.goto('/');
    const w = (await page.locator('.deck-wheel').boundingBox())!;
    await expect.poll(async () => {
      const j = (await page.locator('.region-juggler').boundingBox())!;
      return j.y + j.height <= w.y + 1 && j.height >= 150;
    }).toBe(true);
    await expect(page.locator('.sheet-tabs')).toBeHidden();
    await expect(page.locator('.sheet-grab')).toBeHidden();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/deck-phone-bare-wheel.png` });
  });

  test('a long pattern is drawn smaller, and next cycle stays on screen', async ({ page }) => {
    // Deterministic (it once flaked on WebKit): "next cycle" shows until the old pattern's cycle
    // ends, so the old one is long (97531, ten beats) and slow (40 bpm, about 7 s), and the switch
    // comes right after Play.
    await page.goto('/#97531@40');
    await page.locator('#play').click();
    await page.locator('.deck-pattern').click();
    const last = page.locator('.deck-row:not(.deck-own)').last();
    await last.click();
    await expect(page.locator('#play')).toHaveText('Pause');
    const size = await notation(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeLessThan(16);
    await expect(page.locator('#pending')).toBeVisible({ timeout: 3000 });
    const box = (await page.locator('#pending').boundingBox())!;
    const pattern = (await page.locator('.deck-pattern').boundingBox())!;
    expect(box.x + box.width).toBeLessThanOrEqual(pattern.x + pattern.width + 1);
    expect(box.width).toBeGreaterThan(20);
  });

  test('Details is named Details', async ({ page }) => {
    await page.goto('/#3');
    await expect(page.getByRole('button', { name: /^Details/ })).toBeVisible();
  });
});

test.describe('wide, the wheel by keyboard', () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test('one tab stop; Tab passes through without picking; ↓ turns it and picks without sound', async ({ page }) => {
    await page.goto('/#3');
    await expect(page.locator('.deck-row[tabindex="0"]')).toHaveCount(1);
    await expect(page.locator('.deck-pattern')).not.toHaveAttribute('aria-expanded', /.*/);
    await page.locator('.deck-pattern').click();
    await expect(page.locator('.deck-row[data-id="cascade"]')).toBeFocused();
    for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
    await page.waitForTimeout(500);
    await expect(notation(page)).toHaveText('3');
    await page.locator('.deck-row[data-id="cascade"]').focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await expect(page.locator('.deck-row[data-id="pause"]')).toBeFocused();
    await expect(notation(page)).toHaveText('441');
    expect(await scheduled(page)).toBe(0);
    // Enter picks and plays the focused row.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(notation(page)).toHaveText('531');
    await expect(page.locator('#play')).toHaveText('Pause');
  });

  test('← → do nothing while About shows', async ({ page }) => {
    await page.goto('/#51');
    await page.locator('.about-link').click();
    await expect(page).toHaveURL(/#about$/);
    await expect(page.locator('.region-about')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.locator('.region-about a', { hasText: 'Back to the pattern' }).click();
    await expect(notation(page)).toHaveText('51');
  });
});

test.describe('About', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('three layers: what it is and how to use it, the words, then the sources below the glossary', async ({ page }) => {
    await page.goto('/#about');
    await expect(page.locator('.about > section')).toHaveCount(3);
    await expect(page.locator('.about-intro > p')).toHaveCount(2);
    await expect(page.locator('.about-intro li')).toHaveCount(3);
    await expect(page.locator('.about-glossary dt')).toHaveText(['Siteswap', 'Cascade', 'Pass', 'Sync', 'Ratio']);
    await expect(page.locator('.about-sources h3')).toHaveText('Sources and details');
    await expect(page.locator('.about-sources a', { hasText: 'math notes' })).toHaveAttribute('href', /docs\/MATH\.md$/);
    const glossary = (await page.locator('.about-glossary').boundingBox())!;
    const bib = (await page.locator('ol.bibliography').first().boundingBox())!;
    expect(bib.y).toBeGreaterThanOrEqual(glossary.y + glossary.height);
    // Below the fold on a phone.
    const sources = (await page.locator('.about-sources').boundingBox())!;
    expect(sources.y).toBeGreaterThanOrEqual(844);
    await page.screenshot({ path: `${SHOTS}/about-390x844.png` });
  });
});
