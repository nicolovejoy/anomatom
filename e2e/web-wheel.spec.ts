// v6 stream W1 (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3): the web wheel, headless at
// 1280×800 and 1920×1080. With a card on stage the editor is hidden and the wheel's 44 px rows fill
// the right-hand column; Make your own, or a pattern that is no card, shows the editor under five
// rows; one mouse-wheel notch turns one row. Screenshots go to e2e/shots/, or to WEB_WHEEL_SHOTS.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test, type Page } from './fixtures';

const SHOTS = process.env.WEB_WHEEL_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const ROW_PX = 44;
const notation = (page: Page) => page.locator('.deck-notation');
/** The rows the wheel shows: its height in rows. */
const shownRows = (page: Page) => page.locator('.deck-wheel').evaluate((w) => w.getBoundingClientRect().height / 44);
/** The row a point at the middle of the band hits. */
const bandHit = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return hit?.closest('.deck-row')?.getAttribute('data-row') ?? null;
  });
/** The rows the column holds between the wheel's top and the sheet's head: odd, at least 7. */
const fullRows = (page: Page) =>
  page.evaluate(() => {
    const top = document.querySelector('.deck-wheel')!.getBoundingClientRect().top;
    const head = (document.querySelector('.region-sheet') as HTMLElement).offsetHeight;
    const fit = Math.floor((document.documentElement.clientHeight - top - head) / 44);
    return Math.max(7, fit % 2 === 0 ? fit - 1 : fit);
  });
/** Waits past the wheel's settle with nothing more happening. */
const settled = (page: Page) => page.waitForTimeout(700);

for (const size of [
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1920x1080', width: 1920, height: 1080 },
]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test('a card on stage: the editor hides and the wheel fills the column', async ({ page }) => {
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
      // row pair short of it, and never under it.
      const head = (await page.locator('.region-sheet').boundingBox())!;
      expect(head.y + head.height).toBeLessThanOrEqual(size.height + 1);
      expect(wheel.y + wheel.height).toBeLessThanOrEqual(head.y + 1);
      expect(wheel.y + wheel.height).toBeGreaterThan(head.y - 2 * ROW_PX);
      // Every row the wheel shows holds a pattern, Cascade in the band.
      expect(await bandHit(page)).toBe('0');
      const blank = await page.locator('.deck-wheel').evaluate((w) => {
        const box = w.getBoundingClientRect();
        let n = 0;
        for (let y = box.top + 22; y < box.bottom; y += 44) if (!document.elementFromPoint(box.left + box.width / 2, y)?.closest('.deck-row')) n++;
        return n;
      });
      expect(blank).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/web-wheel-hidden-${size.name}.png` });
      expect(errors).toEqual([]);
    });

    test('Make your own shows the editor under five rows; picking a card hides it again', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-own').click();
      await expect(page.locator('#tab-pattern')).toBeVisible();
      await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect.poll(() => shownRows(page)).toBe(5);
      // The band rests on Make your own, and the pattern stays.
      await expect.poll(() => bandHit(page)).toBe(String(await page.locator('.deck-own').getAttribute('data-row')));
      await expect(notation(page)).toHaveText('3');
      // The editor sits under the wheel.
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      const tabs = (await page.locator('#tab-pattern').boundingBox())!;
      expect(tabs.y).toBeGreaterThanOrEqual(wheel.y + wheel.height - 1);
      expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
      await page.screenshot({ path: `${SHOTS}/web-wheel-editor-${size.name}.png` });
      // A card: the editor hides and the wheel fills the column again.
      await page.keyboard.press('ArrowRight');
      await expect(notation(page)).toHaveText('51');
      await expect(page.locator('#tab-pattern')).toBeHidden();
      await expect.poll(() => shownRows(page)).toBe(await fullRows(page));
      await expect.poll(() => bandHit(page)).toBe('1');
    });

    test('one wheel notch of 100 turns exactly one row, either way', async ({ page }) => {
      await page.goto('/#3');
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
      await page.mouse.wheel(0, 100);
      await expect(notation(page)).toHaveText('51');
      await settled(page);
      await expect(notation(page)).toHaveText('51');
      expect(await bandHit(page)).toBe('1');
      await page.mouse.wheel(0, -100);
      await expect(notation(page)).toHaveText('3');
      await settled(page);
      await expect(notation(page)).toHaveText('3');
      expect(await bandHit(page)).toBe('0');
      // Up from Cascade, round the loop: Make your own, which shows the editor and keeps the pattern.
      await page.mouse.wheel(0, -100);
      await expect(page.locator('#tab-pattern')).toBeVisible();
      await expect(notation(page)).toHaveText('3');
      await expect.poll(() => shownRows(page)).toBe(5);
    });

    test('three notches a while apart turn three rows; the page itself never scrolls', async ({ page }) => {
      await page.goto('/#3');
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      await page.mouse.move(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2);
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 100);
        await page.waitForTimeout(200);
      }
      await expect(notation(page)).toHaveText('531');
      await settled(page);
      await expect(notation(page)).toHaveText('531');
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
    });

    test('a typed pattern that is no card keeps the editor; a link to one opens with it', async ({ page }) => {
      await page.goto('/#3');
      await page.locator('.deck-own').click();
      await page.locator('#hand-0').fill('423');
      await expect.poll(() => page.evaluate(() => location.hash)).toBe('#423');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect(page.locator('#hand-0')).toBeFocused();
      // Typed back into a card, the editor stays: the reader is editing.
      await page.locator('#hand-0').fill('531');
      await expect(notation(page)).toHaveText('531');
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect.poll(() => shownRows(page)).toBe(5);

      await page.goto('/#423');
      await page.reload();
      await expect(page.locator('#hand-0')).toBeVisible();
      await expect(page.locator('#hand-0')).toHaveValue('423');
      await expect.poll(() => shownRows(page)).toBe(5);
      // A row picked hides it.
      await page.locator('.deck-row[data-id="cascade"]').click();
      await expect(page.locator('#hand-0')).toBeHidden();
      await expect.poll(() => shownRows(page)).toBe(await fullRows(page));
    });
  });
}
