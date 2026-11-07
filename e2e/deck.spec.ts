// The deck (docs/plans/v4-deck.md, stream D1; v4.1 polish, docs/plans/v4-1-polish.md), headless
// at 390×844, 844×390, 667×375 and 1280×800: the transport bar, the arrows and keys, the wheel
// with its ends (docs/plans/v6-2-wheel-ends.md), mute, Kit, Details, Make your own, square
// corners, no page scroll, no console errors.
// Screenshots go to e2e/shots/.
import { mkdirSync } from 'node:fs';
import { deckPresets, presetMeta } from '../src/app/deck-model';
import { PRESETS } from '../src/app/presets';
import { DECK } from '../src/tunables';
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const SHOTS = 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const notation = (page: Page) => page.locator('.deck-notation');

/**
 * What sits at the middle of each row the open wheel shows: a row's data-row, or null for none (a
 * blank row). Docked a menu, its rows from the top; elsewhere a drum, its rows about the band in
 * its middle (the compact drum cuts its outer two: v6.4 ruling 1).
 */
const wheelRowsShown = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const rowPx = (wheel.querySelector('.deck-row') as HTMLElement).getBoundingClientRect().height;
    const docked = document.querySelector('#app.deck-docked') !== null;
    const half = Math.floor((box.height / 2 - 1) / rowPx + 0.5);
    const n = docked ? Math.round(box.height / rowPx) : 2 * half + 1;
    const y = (i: number) => (docked ? box.top + (i + 0.5) * rowPx : box.top + box.height / 2 + (i - half) * rowPx);
    return Array.from({ length: n }, (_, i) => {
      const hit = document.elementFromPoint(box.left + box.width / 2, y(i));
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
/** A phone held upright: the deck on top, no ‹ › and no pattern button (docs/plans/v6-6-deck-on-top-four-jugglers.md). */
const isUpright = (size: (typeof SIZES)[number]) => !size.docked && !size.column;

for (const size of SIZES) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });
    /** The key that steps the pattern on: ↓ on the wide layout (v6.1 ruling 3), → elsewhere. */
    const nextKey = size.docked ? 'ArrowDown' : 'ArrowRight';

    test('a bare address shows the deck and the wheel; nothing plays until Play', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/');
      await expect(page.locator('.deck-bar')).toBeVisible();
      await expect(page.locator('#play')).toBeVisible();
      // v5 ruling 8: the wide layout has no sound row (Listen for is in the Sound panel and on ↑ ↓).
      await expect(page.locator('.deck-sound')).toBeVisible({ visible: !size.docked });
      await expect(page.locator('.deck-wheel')).toBeVisible();
      // Every preset (the 18 of v5 §4, the three-juggler cards of v6, the four-juggler cards of v6.6, the five-juggler cards of v6.8) and Make your own.
      expect(PRESETS.length).toBe(25);
      await expect(page.locator('.deck-row')).toHaveCount(PRESETS.length + 1);
      await expect(page.locator('.deck-row').last()).toHaveText('Make your own');
      await expect(notation(page)).toHaveText('3');
      await expect(page.locator('.deck-meta')).toHaveText('3 balls');
      await expect(page.locator('.deck-details')).toBeVisible({ visible: !size.docked && size.width < 760 });
      expect(await scheduled(page)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      // The wheel has ends (v6.2 rulings 3 and 4), Cascade in the band. Docked, a menu: Cascade at
      // the top, every row shown a row. Elsewhere a drum: blank rows above Cascade in the middle.
      await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
      if (size.docked) {
        await expect.poll(async () => (await wheelRowsShown(page)).every((r) => r !== null)).toBe(true);
        expect((await wheelRowsShown(page))[0]).toBe('0');
      } else {
        await expect.poll(async () => (await wheelRowsShown(page)).indexOf('0')).toBe(((await wheelRowsShown(page)).length - 1) / 2);
        const shown = await wheelRowsShown(page);
        const mid = (shown.length - 1) / 2;
        expect(shown.length % 2).toBe(1);
        expect(shown.slice(0, mid).every((r) => r === null)).toBe(true);
        expect(shown.slice(mid).every((r) => r !== null)).toBe(true);
      }
      // Square: nothing in the deck is rounded, but the upright card (v6.6 ruling 2, DECK.cardRadiusPx).
      const rounded = await page.locator('.region-deck').evaluate((root) =>
        [root, ...root.querySelectorAll('*')].filter((el) => {
          if (el.classList.contains('deck-picker') && !document.querySelector('#app.is-wide, #app.is-landscape')) return false;
          const s = getComputedStyle(el);
          return [s.borderTopLeftRadius, s.borderTopRightRadius, s.borderBottomLeftRadius, s.borderBottomRightRadius].some((r) => parseFloat(r) > 0);
        }).map((el) => `${el.tagName}.${el.className}`),
      );
      expect(rounded).toEqual([]);
      await page.screenshot({ path: `${SHOTS}/deck-bare-${size.name}.png` });

      // At rest the controls show: Play is not under the open wheel (v5 ruling 9).
      expect(await page.locator('#play').evaluate((el) => {
        const r = el.getBoundingClientRect();
        return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
      })).toBe(true);
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
      expect(errors).toEqual([]);
    });

    test('→ (↓ on the wide layout) twice goes 3 → 51 → 441 and the hash follows; ‹ goes back', async ({ page }) => {
      const errors = watchErrors(page);
      await page.goto('/#3');
      await page.locator('body').click({ position: { x: 5, y: 60 } });
      await page.keyboard.press(nextKey);
      await expect(notation(page)).toHaveText('51');
      await page.keyboard.press(nextKey);
      await expect(notation(page)).toHaveText('441');
      await expect(page.locator('.deck-name')).toHaveText('Half box');
      // The hash follows (debounced): a reload opens on 441.
      await expect.poll(() => page.evaluate(() => location.hash)).not.toBe('#3');
      await page.waitForTimeout(800);
      const hash = await page.evaluate(() => location.hash);
      // No ‹ on the wide layout (v5 ruling 8): ↑ does it (v6.1 ruling 3); nor upright (v6.6 ruling 1): ←.
      if (size.docked) await page.keyboard.press('ArrowUp');
      else if (isUpright(size)) await page.keyboard.press('ArrowLeft');
      else await page.locator('.deck-prev').click();
      await expect(notation(page)).toHaveText('51');
      const fresh = await page.context().newPage();
      await fresh.goto('/' + hash);
      await expect(notation(fresh)).toHaveText('441');
      await fresh.close();
      // ← (↑) on the first preset goes nowhere (v6.2 ruling 2); ‹ is disabled there.
      await page.goto('/#3');
      if (size.docked) {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('ArrowUp');
      } else if (isUpright(size)) {
        await page.keyboard.press('ArrowLeft');
      } else {
        await expect(page.locator('.deck-prev')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.deck-next')).toHaveAttribute('aria-disabled', 'false');
        // aria-disabled, so a reader can still press it (force: Playwright waits on it otherwise).
        await page.locator('.deck-prev').click({ force: true });
        await page.keyboard.press('ArrowLeft');
      }
      await page.waitForTimeout(300);
      await expect(notation(page)).toHaveText('3');
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
      if (size.docked) await page.keyboard.press('ArrowDown');
      else if (isUpright(size)) await page.keyboard.press('ArrowRight');
      else await page.locator('.deck-next').click();
      await expect(notation(page)).toHaveText('51');
      await expect(page.locator('#play')).toHaveText('Pause');
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Play');
      // Listen for pitch writes the hash; focus goes to Play, so Space plays. Wide, → is the
      // deck's Listen for (ball → pitch), and focus stays where it was.
      if (size.docked) await page.keyboard.press('ArrowRight');
      else {
        await page.locator('#deck-listen').selectOption('pitch');
        await expect(page.locator('#play')).toBeFocused();
      }
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#51~pitch');
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Pause');
      // A step while paused stays paused.
      await page.keyboard.press('Space');
      await expect(page.locator('#play')).toHaveText('Play');
      await page.keyboard.press(nextKey);
      await expect(notation(page)).toHaveText('441');
      await expect(page.locator('#play')).toHaveText('Play');
    });

    test('clicking a wheel row plays it, from stopped too', async ({ page }) => {
      await page.goto('/#3');
      // On its side the pattern name opens the wheel; upright it is always shown (v6.6 ruling 4).
      if (size.column) {
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
      // Docked, the band moves to the clicked row (v6.2 ruling 3).
      if (size.docked) await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'classic');
      // On a phone upright the pick leaves the card compact (v6.6 ruling 4); on its side it
      // closes; docked, it stays.
      await expect(page.locator('.deck-wheel')).toBeVisible({ visible: !size.column });
      if (!size.docked && !size.column) await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
      await page.screenshot({ path: `${SHOTS}/deck-wheel-pick-${size.name}.png` });
    });

    test('the master opens at half; mute sets it to 0 and back; the slider unmutes', async ({ page }) => {
      await page.goto('/#3');
      const master = () => page.locator('.region-deck').getAttribute('data-master');
      await expect.poll(master).toBe('0.5');
      if (size.docked) {
        // The wide layout has one volume, the Sound panel's, and no mute (v5 ruling 8).
        await expect(page.locator('#mute')).toBeHidden();
        await page.locator('.panel-option[data-panel="sound"]').click();
        await page.locator('#sp-volume').fill('0.4');
        await expect.poll(master).toBe('0.4');
        return;
      }
      await page.locator('#mute').click();
      await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'true');
      await expect.poll(master).toBe('0');
      await page.locator('#mute').click();
      await expect.poll(master).toBe('0.5');
      await page.locator('#mute').click();
      await page.locator('#volume').fill('0.4');
      await expect.poll(master).toBe('0.4');
      await expect(page.locator('#mute')).toHaveAttribute('aria-pressed', 'false');
    });

    test('Details (or the Sound tab, wide) shows volume first, then Listen for and tempo; Make your own opens the Pattern tab', async ({ page }) => {
      await page.goto('/#3');
      if (size.width < 760) await page.locator('.deck-details').click();
      else await openTab(page, 'sound');
      await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#bpm')).toBeVisible();
      // v5 ruling 7: Volume, Listen for, then Tempo (as the mocks place it), Drum machines, Also play.
      const order = await page.locator('.sound-panel').evaluate((el) => [...el.children].map((c) => c.classList[1]));
      expect(order).toEqual(['sp-volume', 'sp-listen', 'tempo', 'sp-drummers', 'sp-also']);
      await expect(page.locator('#panel-rhythm #tempo')).toHaveCount(0);
      await expect(page.locator('#panel-rhythm #volume')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/deck-details-${size.name}.png` });

      if (size.column) {
        await page.keyboard.press('Escape');
        await page.locator('.deck-pattern').click();
      } else if (size.docked) await page.locator('.panel-option[data-panel="patterns"]').click();
      await page.locator('.deck-own').click();
      await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#hand-0')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
    });

    // On a phone on its side; upright nothing opens or closes the card (phone-wheel.spec.ts).
    if (size.column) {
      test('the pattern name opens and closes the wheel; outside and Escape close it', async ({ page }) => {
        await page.goto('/#3');
        const wheel = page.locator('.deck-wheel');
        await expect(wheel).toBeHidden();
        await page.locator('.deck-pattern').click();
        await expect(wheel).toBeVisible();
        const w = (await wheel.boundingBox())!;
        const bar = (await page.locator('.deck-bar').boundingBox())!;
        const stage = (await page.locator('.stage').boundingBox())!;
        // A phone on its side: in the right-hand column, over neither the beat ladder nor Kit and Sound (v4.1 ruling 5).
        const ladder = (await page.locator('.region-ladder').boundingBox())!;
        const sound = (await page.locator('.deck-sound').boundingBox())!;
        expect(overlap(w, ladder)).toBe(0);
        expect(overlap(w, sound)).toBe(0);
        expect(overlap(w, bar)).toBe(0);
        expect(w.x).toBeGreaterThanOrEqual(stage.x + stage.width - 1);
        expect(w.y + w.height).toBeLessThanOrEqual(size.height + 1);
        // Cascade in the band, the rows below it filled; above it blank (v6.2 ruling 4).
        await expect.poll(async () => {
          const shown = await wheelRowsShown(page);
          const mid = (shown.length - 1) / 2;
          return shown[mid] === '0' && shown.slice(mid).every((r) => r !== null) && shown.slice(0, mid).every((r) => r === null);
        }).toBe(true);
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
    // v5 ruling 7: the deck's one sound control is Listen for; a card leaves it as it was.
    await expect(page.locator('#deck-kit')).toHaveCount(0);
    await expect(page.locator('#deck-listen')).toHaveValue('ball');
    await expect(page.locator('#deck-listen option:checked')).toHaveText('each ball');
    await page.locator('#deck-listen').selectOption('height');
    await page.locator('#play').click();
    await expect.poll(() => scheduled(page)).toBeGreaterThan(0);
    await expect(page.locator('.juggler')).toHaveAttribute('data-balls', '6');
    await expect(page.locator('.ladder')).toHaveAttribute('data-balls', '6');
    await openTab(page, 'pattern');
    await expect(page.locator('#hand-0')).toHaveValue('<3p 3|3p 3>');
    await expect(page.locator('#hand-1')).toBeHidden();
  });

  test('a hand-made pattern: "Your pattern" on Make your own in the band; → goes to the first preset, ← to the last', async ({ page }) => {
    await page.goto('/#753');
    await expect(notation(page)).toHaveText('753');
    await expect(page.locator('.deck-name')).toHaveText('Your pattern');
    // Upright the band row names it (v6.6 ruling 9).
    const own = page.locator('.deck-own');
    await expect(own).toHaveClass(/in-band/);
    await expect(own.locator('.deck-own-code')).toHaveText('753');
    await expect(own.locator('.deck-own-yours')).toHaveText('Your pattern');
    await page.keyboard.press('ArrowRight');
    await expect(notation(page)).toHaveText('3');
    // The link follows (debounced) first: before then the address still reads #753, and going
    // there again is no navigation at all (Firefox), so Cascade would stay, ‹ disabled on it.
    await expect(page).toHaveURL(/#3(~|$)/);
    await page.goto('/#753');
    await expect(notation(page)).toHaveText('753');
    await page.keyboard.press('ArrowLeft');
    // The deck's last card, whatever it is (derived, not pinned: the deck grows).
    const last = presetMeta(deckPresets().at(-1)!);
    await expect(page.locator('.deck-meta')).toHaveText(last);
    await expect(page.locator('.deck-row.in-band .deck-band-meta')).toHaveText(last);
  });

  test('scrolling up from Cascade goes nowhere: Cascade stays in the band, blank rows above it', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('.deck-wheel-list');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
    await list.hover();
    await page.mouse.wheel(0, -64);
    await page.waitForTimeout(800);
    await expect(notation(page)).toHaveText('3');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
    // The snap rests Cascade at scrollTop 0, or 1 (the wheel's rules count in its height).
    expect(await list.evaluate((l) => l.scrollTop)).toBeLessThanOrEqual(1);
    // Nothing above Cascade: no Make your own, no passing patterns.
    const shown = await wheelRowsShown(page);
    const mid = (shown.length - 1) / 2;
    expect(shown[mid]).toBe('0');
    expect(shown.slice(0, mid).every((r) => r === null)).toBe(true);
    expect(await scheduled(page)).toBe(0);
  });

  test('a long continuous spin loads exactly one pattern when it settles, and stops at Make your own', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
    // Count every pattern the bar shows from here on.
    await page.locator('.deck-notation').evaluate((el) => {
      const w = window as unknown as { loads: string[] };
      w.loads = [];
      // A new text is a load; render may write the same text again (a mapping or volume change).
      new MutationObserver(() => {
        const t = el.textContent ?? '';
        if (w.loads[w.loads.length - 1] !== t) w.loads.push(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
    // `n` rows down, one row every 30 ms: a reader's turn (a wheel event, then the scroll) driven
    // inside the page, so no pause from the test runner (a CI hiccup between two driven notches
    // once outlasted the settle) can split the spin in two.
    const spin = (n: number) =>
      page.locator('.deck-wheel-list').evaluate(
        (list, n) =>
          new Promise<void>((done) => {
            let i = 0;
            const tick = () => {
              list.dispatchEvent(new WheelEvent('wheel', { deltaY: 32, bubbles: true }));
              list.scrollBy({ top: 32, behavior: 'instant' });
              i += 1;
              if (i < n) setTimeout(tick, 30);
              else done();
            };
            tick();
          }),
        n,
      );
    await spin(15);
    const landed = (await page.locator('.deck-row[data-row="15"] code').textContent())!;
    await expect(notation(page)).toHaveText(landed);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as unknown as { loads: string[] }).loads)).toEqual([landed]);
    await expect.poll(async () => (await page.locator('.deck-row.in-band code').textContent()) === (await notation(page).textContent())).toBe(true);
    // Forty more, past the end: the drum stops on Make your own, which loads nothing.
    // (The settled wheel has gone compact, as on a phone (v6.4); the turn takes it from there.)
    await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact', { timeout: DECK.returnMs + 2000 });
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', '15');
    await spin(40);
    await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
    await page.waitForTimeout(1000);
    expect(await page.evaluate(() => (window as unknown as { loads: string[] }).loads)).toEqual([landed]);
    expect(await scheduled(page)).toBe(0);
  });

  test('every wheel row shows its name whole', async ({ page }) => {
    await page.goto('/');
    // The names are measured with the real glyphs: the two faces a wheel row draws (400 Mono for
    // the notation, which sets the name's room; 400 Sans for the name) loaded first.
    await page.evaluate(() => Promise.all([document.fonts.load('400 14px "IBM Plex Mono"'), document.fonts.load('400 13px "IBM Plex Sans"')]));
    const loaded = (family: string) =>
      page.evaluate((family) => [...document.fonts].some((f) => f.family.includes(family) && (f.weight === '400' || f.weight === 'normal') && f.status === 'loaded'), family);
    await expect.poll(() => loaded('IBM Plex Mono')).toBe(true);
    await expect.poll(() => loaded('IBM Plex Sans')).toBe(true);
    await expect(page.locator('.deck-wheel')).toBeVisible();
    await expect(page.locator('.deck-row .deck-row-name')).toHaveCount(PRESETS.length + 1);
    expect(await page.locator('.deck-row-name').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent))).toEqual([]);
    await page.locator('.deck-row[data-id="rising-passes"]').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${SHOTS}/deck-wheel-names-390x844.png` });
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

});

test.describe('phone, more', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('a first visit keeps the juggler in view under the compact card; the closed sheet shows no tabs', async ({ page }) => {
    await page.goto('/');
    const w = (await page.locator('.deck-picker').boundingBox())!;
    await expect.poll(async () => {
      const j = (await page.locator('.region-juggler').boundingBox())!;
      return j.y >= w.y + w.height - 1 && j.height >= DECK.minFigurePx;
    }).toBe(true);
    await expect(page.locator('.sheet-tabs')).toBeHidden();
    await expect(page.locator('.sheet-grab')).toBeHidden();
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${SHOTS}/deck-phone-bare-wheel.png` });
  });

  test('a change waiting for the next cycle: the band row says so in place of its meta (v6.6 ruling 9)', async ({ page }) => {
    // As below: the old pattern long (97531, ten beats) and slow (40 bpm, about 7 s).
    await page.goto('/#97531@40');
    await page.locator('#play').click();
    await page.locator('.deck-row:not(.deck-own)').last().click();
    await expect(page.locator('#play')).toHaveText('Pause');
    const band = page.locator('.deck-row.in-band');
    await expect(band.locator('#pending')).toBeVisible({ timeout: 3000 });
    await expect(band.locator('.deck-band-meta')).toBeHidden();
    await expect(page.locator('#pending')).toBeInViewport({ ratio: 1 });
    const row = (await band.boundingBox())!;
    const pending = (await page.locator('#pending').boundingBox())!;
    expect(pending.x + pending.width).toBeLessThanOrEqual(row.x + row.width + 1);
    // Once it plays, the meta is back.
    await expect(band.locator('.deck-band-meta')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#pending')).toBeHidden();
  });

  test('Details is named Details', async ({ page }) => {
    await page.goto('/#3');
    await expect(page.getByRole('button', { name: /^Details/ })).toBeVisible();
  });
});

// A phone on its side keeps the transport bar (v6.6 ruling 11): the pattern button, ‹ ›, mute and
// the volume, and "next cycle" in the bar.
test.describe('phone on its side, the bar', () => {
  test.use({ viewport: { width: 844, height: 390 } });

  test('the seven-object pass shows whole in the bar', async ({ page }) => {
    // Cut from the deck in v5 (§4): it still opens as a typed pattern, by its short link.
    await page.goto('/#7p-1-3-1|3p-3-3-3');
    // The fit is for the real glyphs: wait until IBM Plex Mono has loaded (the app fits again on each font load).
    await page.evaluate(() => document.fonts.load('500 16px "IBM Plex Mono"'));
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('IBM Plex Mono') && f.status === 'loaded'))).toBe(true);
    await expect(notation(page)).toHaveText('<7p 1 3 1|3p 3 3 3>');
    const fit = () => notation(page).evaluate((el) => `${getComputedStyle(el).fontSize} ${el.scrollWidth}/${el.clientWidth}`);
    await expect.poll(async () => notation(page).evaluate((el) => el.scrollWidth <= el.clientWidth), { message: `not ellipsized (size scrollWidth/clientWidth: ${await fit()})` }).toBe(true);
    const px = await notation(page).evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(px).toBeGreaterThanOrEqual(11);
    const slider = (await page.locator('#volume').boundingBox())!;
    expect(slider.width).toBeGreaterThanOrEqual(70);
    await page.screenshot({ path: `${SHOTS}/deck-seven-pass-844x390.png` });
  });

  test('a mouse wheel over the pattern name steps one pattern a notch', async ({ page }) => {
    // Deterministic (it once flaked on WebKit under load). A notch is only taken when it lands on
    // the pattern button, so each one waits on state the app shows, not on time: the fonts have
    // loaded and the bar has fitted again (the button may move as they arrive), the button is what
    // sits under the pointer's point, and the last step has finished (its link is in the address,
    // which the app writes once the change has settled).
    await page.goto('/#3');
    await page.evaluate(() => document.fonts.load('500 16px "IBM Plex Mono"'));
    await expect.poll(() => page.evaluate(() => [...document.fonts].some((f) => f.family.includes('IBM Plex Mono') && f.status === 'loaded'))).toBe(true);
    const button = page.locator('.deck-pattern');
    const notch = async (deltaY: number) => {
      let at = { x: 0, y: 0 };
      await expect
        .poll(async () => {
          const box = (await button.boundingBox())!;
          at = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
          return page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.deck-pattern') !== null, at);
        })
        .toBe(true);
      await page.mouse.move(at.x, at.y);
      await page.mouse.wheel(0, deltaY);
    };
    await notch(100);
    await expect(notation(page)).toHaveText('51');
    await expect(page).toHaveURL(/#51(~|$)/);
    await notch(-100);
    await expect(notation(page)).toHaveText('3');
    await expect(page).toHaveURL(/#3(~|$)/);
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

});

// v6 W1: the docked rows are taller with a larger notation; a long notation is drawn smaller so
// every name stays whole.
for (const size of [
  { width: 1280, height: 800 },
  { width: 1920, height: 1080 },
]) {
  test.describe(`docked, ${size.width}x${size.height}`, () => {
    test.use({ viewport: size });

    test('every wheel row shows its name whole', async ({ page }) => {
      await page.goto('/');
      await page.evaluate(() => Promise.all([document.fonts.load('400 16px "IBM Plex Mono"'), document.fonts.load('400 14px "IBM Plex Sans"')]));
      await expect(page.locator('.deck-wheel')).toBeVisible();
      await expect(page.locator('.deck-row .deck-row-name')).toHaveCount(PRESETS.length + 1);
      await expect
        .poll(() => page.locator('.deck-row-name').evaluateAll((els) => els.filter((el) => el.scrollWidth > el.clientWidth || el.clientWidth === 0).map((el) => el.textContent)))
        .toEqual([]);
      await page.locator('.deck-row[data-id="rising-passes"]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/deck-wheel-names-${size.width}x${size.height}.png` });
    });
  });
}

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
    // The wheel keeps its own ↑ ↓ (the deck's step them too, v6.1 ruling 3): Listen for stays on ball.
    await expect.poll(() => page.evaluate(() => location.hash)).toBe('#441');
    await expect(page.locator('#deck-listen')).toHaveValue('ball');
    // Enter picks and plays the focused row.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(notation(page)).toHaveText('531');
    await expect(page.locator('#play')).toHaveText('Pause');
  });

  test('while playing, keys past Make your own queue nothing: "next cycle" never shows', async ({ page }) => {
    await page.goto('/#97531@40');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    // Every moment "next cycle" shows, from here on, is counted.
    await page.evaluate(() => {
      const w = window as unknown as { pending: number };
      w.pending = 0;
      const el = document.querySelector('#pending')!;
      new MutationObserver(() => {
        if (!(el as HTMLElement).hidden) w.pending += 1;
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
    // 97531 is the last 5-ball card; under Balls 5 it is the filter's last, and Make your own is next.
    await page.locator('.deck-filter[data-by="balls"][data-n="5"]').click();
    await expect(page.locator('.deck-row.on')).toHaveAttribute('data-row', '2');
    // End: Make your own takes the band and loads nothing; then ↓, End and PageDown there are no picks.
    await page.locator('.deck-row.on').focus();
    await page.keyboard.press('End');
    await expect(page.locator('.deck-own')).toBeFocused();
    for (const key of ['ArrowDown', 'End', 'PageDown']) await page.keyboard.press(key);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { pending: number }).pending)).toBe(0);
    await expect(page.locator('#pending')).toBeHidden();
    await expect(notation(page)).toHaveText('97531');
  });

  test('while playing, ↑ on the card on stage at the top queues nothing', async ({ page }) => {
    await page.goto('/#3@40');
    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.evaluate(() => {
      const w = window as unknown as { pending: number };
      w.pending = 0;
      const el = document.querySelector('#pending')!;
      new MutationObserver(() => {
        if (!(el as HTMLElement).hidden) w.pending += 1;
      }).observe(el, { attributes: true, attributeFilter: ['hidden'] });
    });
    await page.locator('.deck-row[data-id="cascade"]').focus();
    for (const key of ['ArrowUp', 'Home', 'PageUp']) await page.keyboard.press(key);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => (window as unknown as { pending: number }).pending)).toBe(0);
    await expect(page.locator('#pending')).toBeHidden();
    await expect(page.locator('.deck-row[data-id="cascade"]')).toBeFocused();
  });

  test('the wheel’s keys stop at its ends: ↑ on Cascade nothing; End takes the band to Make your own, which opens on Enter', async ({ page }) => {
    await page.goto('/#3');
    await page.locator('.deck-row[data-id="cascade"]').focus();
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(300);
    await expect(page.locator('.deck-row[data-id="cascade"]')).toBeFocused();
    await expect(notation(page)).toHaveText('3');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'cascade');
    // End: Make your own takes the band and the focus; it opens nothing and loads nothing.
    await page.keyboard.press('End');
    await expect(page.locator('.deck-own')).toBeFocused();
    await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
    await expect(page.locator('.deck-own')).toBeInViewport({ ratio: 1 });
    await expect(page.locator('#tab-pattern')).toBeHidden();
    await expect(notation(page)).toHaveText('3');
    // ↓ and PageDown there: nothing.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('PageDown');
    await page.waitForTimeout(300);
    await expect(page.locator('.deck-own')).toBeFocused();
    await expect(notation(page)).toHaveText('3');
    // ↑: the last card loads, the band on it.
    await page.keyboard.press('ArrowUp');
    await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-row', String(PRESETS.length - 1));
    await expect(page.locator('.deck-row[aria-current]')).toHaveAttribute('data-row', String(PRESETS.length - 1));
    expect(await scheduled(page)).toBe(0);
    // Enter on Make your own opens the editor.
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#tab-pattern')).toBeVisible();
  });

  test('the arrows do nothing while About shows', async ({ page }) => {
    await page.goto('/#51');
    await page.locator('.about-link').click();
    await expect(page).toHaveURL(/#about$/);
    await expect(page.locator('.region-about')).toBeVisible();
    for (const key of ['ArrowRight', 'ArrowDown', 'ArrowDown']) await page.keyboard.press(key);
    await page.locator('.region-about a', { hasText: 'Back to the pattern' }).click();
    await expect(notation(page)).toHaveText('51');
  });
});

test.describe('About', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('three layers: what it is and how to use it, the words, then the sources below the glossary', async ({ page }) => {
    await page.goto('/#about');
    await expect(page.locator('.about > section')).toHaveCount(3);
    await expect(page.locator('.about-intro > p')).toHaveCount(4);
    await expect(page.locator('.about-intro li')).toHaveCount(4);
    await expect(page.locator('.about-glossary dt')).toHaveText(['Siteswap', 'Cascade', 'Pass', 'Sync', 'Ratio', 'Cycle']);
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
