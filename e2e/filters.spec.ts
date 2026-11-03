// v6 stream W2 (docs/plans/v6-wheel-filters-three.md, ruling 4): the filter chips above the wheel,
// headless at 1280×800 (docked) and 390×844 (a phone). Each chip leaves its group's cards and Make
// your own, the lit chip tapped again shows every card, ← → stay in the group, a chip whose group
// does not hold the card on stage loads its first card, the wheel still loops over a short group,
// and the link never carries the filter. Screenshots go to FILTER_SHOTS, or e2e/shots/.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test, type Page } from './fixtures';

const SHOTS = process.env.FILTER_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

const GROUPS = [
  { group: '3', name: '3 balls', tag: '3', count: 6 },
  { group: '4', name: '4 balls', tag: '4', count: 4 },
  { group: '5', name: '5 balls', tag: '5', count: 3 },
  { group: 'passing', name: 'Passing', tag: 'Pass', count: 8 },
] as const;
const DECK_SIZE = 21;

const notation = (page: Page) => page.locator('.deck-notation');
const chip = (page: Page, group: string) => page.locator(`.deck-filter[data-group="${group}"]`);
/** The wheel's rows, one each (the first copies): its cards, then Make your own. */
const cards = (page: Page) => page.locator('.deck-row[data-id]');
const lit = (page: Page) => page.locator('.deck-filter[aria-pressed="true"]');
/** The rows the wheel shows that hold no row: none, whatever the group's size. */
const blankRows = (page: Page) =>
  page.locator('.deck-wheel').evaluate((w) => {
    const box = w.getBoundingClientRect();
    const px = parseFloat(getComputedStyle(w).getPropertyValue('--deck-row'));
    let n = 0;
    for (let y = box.top + px / 2; y < box.bottom - 1; y += px) if (!document.elementFromPoint(box.left + box.width / 2, y)?.closest('.deck-row')) n++;
    return n;
  });
/** The row a point at the middle of the band hits: its data-row, or data-echo for a copy. */
const bandRow = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)?.closest('.deck-row');
    return hit?.getAttribute('data-row') ?? hit?.getAttribute('data-echo') ?? null;
  });

for (const size of [
  { name: '1280x800', width: 1280, height: 800, phone: false },
  { name: '390x844', width: 390, height: 844, phone: true },
]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.phone });

    const tap = (page: Page, group: string) => (size.phone ? chip(page, group).tap() : chip(page, group).click());
    /** One step forward, as the reader would: → on the web, › on a phone. */
    const next = async (page: Page) => {
      if (size.phone) await page.locator('.deck-next').click();
      else {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('ArrowRight');
      }
    };

    test('each chip leaves its group; the lit chip tapped again shows every card', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => !isCdnError(e.message) && errors.push(e.message));
      await page.goto('/');
      await expect(page.locator('.deck-filters')).toBeVisible();
      await expect(lit(page)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(DECK_SIZE);
      // The chips sit above the wheel, whole.
      const chips = (await page.locator('.deck-filters').boundingBox())!;
      const wheel = (await page.locator('.deck-wheel').boundingBox())!;
      expect(chips.y + chips.height).toBeLessThanOrEqual(wheel.y + 1);
      for (const g of GROUPS) {
        await tap(page, g.group);
        await expect(chip(page, g.group)).toHaveAttribute('aria-pressed', 'true');
        await expect(lit(page)).toHaveCount(1);
        await expect(cards(page)).toHaveCount(g.count);
        expect(new Set(await page.locator('.deck-row[data-id] em').allTextContents())).toEqual(new Set([g.tag]));
        await expect(page.locator('.deck-own')).toHaveCount(1);
        await expect.poll(() => blankRows(page)).toBe(0);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/filter-${g.group}-${size.name}.png` });
      }
      await tap(page, 'passing');
      await expect(lit(page)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(DECK_SIZE);
      expect(errors).toEqual([]);
    });

    test('a chip loads its first card when the card on stage is outside it; inside, the pattern stays', async ({ page }) => {
      await page.goto('/');
      await expect(notation(page)).toHaveText('3');
      await tap(page, '3');
      await expect(notation(page)).toHaveText('3');
      await tap(page, '5');
      const first5 = await page.locator('.deck-row[data-row="0"] code').textContent();
      await expect(notation(page)).toHaveText(first5 ?? '');
      await expect(page.locator('.deck-meta')).toHaveText('5 balls');
      await tap(page, 'passing');
      await expect(page.locator('.deck-meta')).toHaveText(/jugglers$/);
      // Cleared, the pattern stays.
      const held = await notation(page).textContent();
      await tap(page, 'passing');
      await expect(notation(page)).toHaveText(held ?? '');
      // A chip loads without starting the sound.
      await expect(page.locator('#play')).toHaveAttribute('data-state', 'stopped');
    });

    test('← → (‹ › on a phone) stay in the group, round its loop', async ({ page }) => {
      await page.goto('/');
      await tap(page, '5');
      const names = await page.locator('.deck-row[data-id] code').allTextContents();
      expect(names).toHaveLength(3);
      await expect(notation(page)).toHaveText(names[0]!);
      for (const n of [names[1], names[2], names[0], names[1]]) {
        await next(page);
        await expect(notation(page)).toHaveText(n!);
        await expect(page.locator('.deck-meta')).toHaveText('5 balls');
      }
      await expect(chip(page, '5')).toHaveAttribute('aria-pressed', 'true');
    });

    test('the wheel loops over a short group: every row it shows holds a pattern, the band turns round', async ({ page }) => {
      await page.goto('/');
      await tap(page, '5');
      await expect.poll(() => blankRows(page)).toBe(0);
      await expect.poll(() => bandRow(page)).toBe('0');
      if (size.phone) {
        // ↑ from the first card turns to Make your own, then to the last 5-ball card, which loads.
        await page.locator('.deck-row[data-row="0"]').focus();
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(500);
        await page.keyboard.press('ArrowUp');
        const last = await page.locator('.deck-row[data-row="2"] code').textContent();
        await expect(notation(page)).toHaveText(last ?? '');
      } else {
        // One notch a row: three notches pass the three cards and Make your own, the fourth is back.
        // The wheel drops to five rows over the editor on Make your own: the pointer follows it.
        for (const want of ['1', '2', '3', '0']) {
          const box = (await page.locator('.deck-wheel').boundingBox())!;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await page.mouse.wheel(0, 100);
          await expect.poll(() => bandRow(page)).toBe(want);
          await page.waitForTimeout(700);
          await expect.poll(() => blankRows(page)).toBe(0);
        }
        const first = await page.locator('.deck-row[data-row="0"] code').textContent();
        await expect(notation(page)).toHaveText(first ?? '');
      }
    });

    test('the link never carries the filter', async ({ page }) => {
      await page.goto('/');
      await page.waitForTimeout(800);
      const plain = await page.evaluate(() => location.hash);
      await tap(page, '3');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => location.hash)).toBe(plain);
      await tap(page, 'passing');
      await expect(page.locator('.deck-meta')).toHaveText(/jugglers$/);
      await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(plain);
      await page.waitForTimeout(800);
      const hash = await page.evaluate(() => location.hash);
      const fresh = await page.context().newPage();
      await fresh.goto('/' + hash);
      await expect(fresh.locator('.deck-meta')).toHaveText(/jugglers$/);
      await expect(fresh.locator('.deck-filter[aria-pressed="true"]')).toHaveCount(0);
      await expect(fresh.locator('.deck-row[data-id]')).toHaveCount(DECK_SIZE);
      await fresh.close();
    });

    if (size.phone) {
      /** Turns the wheel one row with ↓ and waits until it has settled (on the sheet, the return timer running). */
      const turnAndSettle = async (page: Page) => {
        await page.locator('.deck-row[data-row="0"]').focus();
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'settling');
      };

      test('a chip tapped while the wheel settles keeps it open; the wheel goes back to rest', async ({ page }) => {
        await page.goto('/');
        await turnAndSettle(page);
        await tap(page, '4');
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
        // Past the return delay (1.5 s after the settle): still open, the chip lit.
        await page.waitForTimeout(2500);
        await expect(page.locator('.deck-wheel')).toBeVisible();
        await expect(chip(page, '4')).toHaveAttribute('aria-pressed', 'true');
      });

      test('focus on a chip when the settled wheel closes goes to the pattern button', async ({ page }) => {
        await page.goto('/');
        await turnAndSettle(page);
        await chip(page, '5').focus();
        await expect(page.locator('.deck-wheel')).toBeHidden({ timeout: 4000 });
        await expect(page.locator('.deck-pattern')).toBeFocused();
      });

      test('the pattern button controls the picker, chips and wheel', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.deck-pattern')).toHaveAttribute('aria-controls', 'deck-picker');
        await expect(page.locator('#deck-picker .deck-filters')).toBeVisible();
        await expect(page.locator('#deck-picker .deck-wheel')).toBeVisible();
      });
    }

    if (!size.phone) {
      test('kept across panel changes; a typed card outside the group clears it', async ({ page }) => {
        await page.goto('/');
        await tap(page, '5');
        await page.locator('.panel-option[data-panel="sound"]').click();
        await page.locator('.panel-option[data-panel="patterns"]').click();
        await expect(chip(page, '5')).toHaveAttribute('aria-pressed', 'true');
        await expect(cards(page)).toHaveCount(3);
        // Make your own, then 441 (a 4-ball card): the filter clears, the band finds it.
        await page.locator('.deck-own').click();
        const input = page.locator('#hand-0');
        await input.fill('');
        await input.pressSequentially('441');
        await expect(notation(page)).toHaveText('441');
        await expect(lit(page)).toHaveCount(0);
        await expect(cards(page)).toHaveCount(DECK_SIZE);
        await expect.poll(() => bandRow(page)).toBe(await page.locator('.deck-row[data-id="pause"]').getAttribute('data-row'));
      });
    }
  });
}
