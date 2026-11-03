// v6 stream W1 (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3), a menu since v6.2 W6
// (docs/plans/v6-2-wheel-ends.md, ruling 3): the web wheel, headless at 1280×800 and 1920×1080.
// With a card on stage the editor is hidden and the wheel's 44 px rows fill the right-hand column,
// top aligned, each once, the band on the card on stage; Make your own, or a pattern that is no
// card, shows the editor under five rows. Screenshots go to e2e/shots/, or to WEB_WHEEL_SHOTS.
import { mkdirSync } from 'node:fs';
import { PRESETS } from '../src/app/presets';
import { expect, isCdnError, test, type Page } from './fixtures';

const SHOTS = process.env.WEB_WHEEL_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const ROW_PX = 44;
const ROWS = PRESETS.length + 1;
const notation = (page: Page) => page.locator('.deck-notation');
/** The rows the wheel shows: its height in rows, the rule at its foot aside. */
const shownRows = (page: Page) => page.locator('.deck-wheel').evaluate((w) => w.clientHeight / 44);
/** The rows the column holds between the wheel's top and the sheet's head (or Play's bar): at least 7, at most every row. */
const fullRows = (page: Page) =>
  page.evaluate((rows) => {
    const top = document.querySelector('.deck-wheel')!.getBoundingClientRect().top;
    // The sheet's head, or Play's bar under the stage where it is taller: both sit in the last row.
    const head = Math.max((document.querySelector('.region-sheet') as HTMLElement).offsetHeight, (document.querySelector('.deck-bar') as HTMLElement).offsetHeight);
    // Less the wheel's rule at its foot.
    return Math.min(rows, Math.max(7, Math.floor((document.documentElement.clientHeight - top - head - 1) / 44)));
  }, ROWS);
/** The banded row's data-row, and whether it is whole in the wheel's view. */
const banded = (page: Page) =>
  page.evaluate(() => {
    const row = document.querySelector('.deck-row.in-band');
    if (!row) return null;
    const w = document.querySelector('.deck-wheel')!.getBoundingClientRect();
    const b = row.getBoundingClientRect();
    return { row: row.getAttribute('data-row'), inView: b.top >= w.top - 1 && b.bottom <= w.bottom + 1 };
  });

for (const size of [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1920x1080', width: 1920, height: 1080 },
]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('a card on stage: the editor hides and the wheel fills the column, top aligned, each row once', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => !isCdnError(e.message) && errors.push(e.message));
      await page.goto('/');
      await expect(page.locator('.deck-wheel')).toBeVisible();
      await expect(page.locator('#tab-pattern')).toBeHidden();
      await expect(page.locator('#hand-0')).toBeHidden();
      await expect.poll(() => shownRows(page)).toBe(await fullRows(page));
      expect(await shownRows(page)).toBeGreaterThanOrEqual(11);
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      const row = (await page.locator('.deck-row[data-id="cascade"]').boundingBox())!;
      expect(row.height).toBe(ROW_PX);
      // The wheel reaches down the column to the sheet's head (the sound's status), less than a
      // row short of it, and never under it.
      const head = (await page.locator('.region-sheet').boundingBox())!;
      expect(head.y + head.height).toBeLessThanOrEqual(size.height + 1);
      expect(wheel.y + wheel.height).toBeLessThanOrEqual(head.y + 1);
      expect(wheel.y + wheel.height).toBeGreaterThan(head.y - ROW_PX);
      // Every row once, no copies; Cascade first, at the top, the band on it.
      await expect(page.locator('.deck-row')).toHaveCount(ROWS);
      const ids = await page.locator('.deck-row[data-id]').evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
      expect(new Set(ids).size).toBe(PRESETS.length);
      expect(Math.abs(row.y - wheel.y)).toBeLessThan(1);
      expect(await banded(page)).toEqual({ row: '0', inView: true });
      await expect(page.locator('.deck-row.in-band')).toHaveCount(1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/web-wheel-hidden-${size.name}.png` });
      expect(errors).toEqual([]);
    });

    test('Make your own shows the editor under five rows; ↓ there changes nothing, ↑ goes to the last card', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-own').click();
      await expect(page.locator('#tab-pattern')).toBeVisible();
      await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect.poll(() => shownRows(page)).toBe(5);
      // The band is on Make your own, brought into view, and the pattern stays.
      await expect.poll(() => banded(page)).toEqual({ row: String(ROWS - 1), inView: true });
      await expect(notation(page)).toHaveText('3');
      // The editor sits under the wheel.
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      const tabs = (await page.locator('#tab-pattern').boundingBox())!;
      expect(tabs.y).toBeGreaterThanOrEqual(wheel.y + wheel.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/web-wheel-editor-${size.name}.png` });
      // ↓ on Make your own, the last row: nothing (v6.2 ruling 2).
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(400);
      await expect(notation(page)).toHaveText('3');
      await expect(page.locator('#tab-pattern')).toBeVisible();
      expect(await banded(page)).toEqual({ row: String(ROWS - 1), inView: true });
      // ↑: the last card, above it. The editor hides and the wheel fills the column again.
      const last = (await page.locator('.deck-row[data-id]').last().locator('code').textContent())!;
      await page.keyboard.press('ArrowUp');
      await expect(notation(page)).toHaveText(last);
      await expect(page.locator('#tab-pattern')).toBeHidden();
      await expect.poll(() => shownRows(page)).toBe(await fullRows(page));
      await expect.poll(() => banded(page)).toEqual({ row: String(ROWS - 2), inView: true });
    });

    test('a typed pattern that is no card keeps the editor, the band on Make your own; a link to one opens with it', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-own').click();
      await page.locator('#hand-0').fill('423');
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#423');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect(page.locator('#hand-0')).toBeFocused();
      // Typed back into a card, the editor stays: the reader is editing. The band finds the card.
      await page.locator('#hand-0').fill('531');
      await expect(notation(page)).toHaveText('531');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect.poll(() => shownRows(page)).toBe(5);
      await expect.poll(async () => (await banded(page))?.inView).toBe(true);
      await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'classic');

      await page.goto('/#423');
      await page.reload();
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect(page.locator('#hand-0')).toHaveValue('423');
      await expect.poll(() => shownRows(page)).toBe(5);
      await expect.poll(() => banded(page)).toEqual({ row: String(ROWS - 1), inView: true });
      // A row picked hides it.
      await page.locator('.deck-row[data-id="cascade"]').click();
      await expect(page.locator('#hand-0')).toBeHidden();
      await expect.poll(() => shownRows(page)).toBe(await fullRows(page));
      await expect.poll(() => banded(page)).toEqual({ row: '0', inView: true });
    });
  });
}
