// The deck (docs/plans/v4-deck.md, stream D1), headless at 390×844, 844×390 and 1280×800: the
// transport bar, the arrows and keys, the wheel, mute, Kit, Details, Make your own, square
// corners, no page scroll, no console errors. Screenshots go to e2e/shots/.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const SHOTS = 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const notation = (page: Page) => page.locator('.deck-notation');

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
  { name: '390x844', width: 390, height: 844, docked: false },
  { name: '844x390', width: 844, height: 390, docked: false },
  { name: '1280x800', width: 1280, height: 800, docked: true },
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
      await expect(notation(page)).toHaveText('3');
      await expect(page.locator('.deck-meta')).toHaveText('3 balls');
      await expect(page.locator('.deck-details')).toBeVisible({ visible: !size.docked && size.width < 760 });
      expect(await scheduled(page)).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
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

    test('clicking a wheel row plays it', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('#play').click();
      if (!size.docked) {
        await expect(page.locator('.deck-wheel')).toBeHidden();
        await page.locator('.deck-pattern').click();
      }
      await expect(page.locator('.deck-wheel')).toBeVisible();
      await page.locator('.deck-row[data-id="classic"]').click();
      await expect(notation(page)).toHaveText('531');
      await expect(page.locator('#play')).toHaveText('Pause');
      await expect(page.locator('.deck-row[data-id="classic"]')).toHaveClass(/\bon\b/);
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
        // Over the stage, not over the deck.
        const w = (await wheel.boundingBox())!;
        const bar = (await page.locator('.deck-bar').boundingBox())!;
        const stage = (await page.locator('.stage').boundingBox())!;
        expect(w.y + w.height).toBeLessThanOrEqual(Math.max(bar.y, stage.y + stage.height) + 1);
        expect(w.x).toBeGreaterThanOrEqual(stage.x - 1);
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
    await expect(page.locator('#deck-kit')).toHaveValue('mixed');
    await page.locator('#play').click();
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

  test('scrolling the wheel picks the row it settles on', async ({ page }) => {
    await page.goto('/');
    const list = page.locator('.deck-wheel-list');
    await expect(page.locator('.deck-wheel')).toBeVisible();
    // Down by the mouse wheel: once the wheel settles, the pattern is the row in the band.
    await list.hover();
    await page.mouse.wheel(0, 64);
    await expect(notation(page)).not.toHaveText('3');
    const banded = await list.evaluate((el) => {
      const row = Math.round(el.scrollTop / 32);
      return el.querySelectorAll('.deck-row code')[row]?.textContent;
    });
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
});
