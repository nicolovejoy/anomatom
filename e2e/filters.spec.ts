// v6.1 stream W5 (docs/plans/v6-1-wheel-feel.md, ruling 4; first built in v6 W2): the filter chips
// above the wheel in two labelled groups, BALLS 3 4 5 and JUGGLERS 2 3, headless at 1280×800
// (docked) and 390×844 (a phone). Each chip leaves its cards and Make your own (Jugglers 3 exactly
// the three three-juggler cards, Balls 5 the three five-ball cards), one chip lit across both
// groups, the lit chip tapped again shows every card, ↓ (› on a phone) stays in the filter, a chip
// that does not hold the card on stage loads its first card, the wheel still loops over a short
// filter, and the link never carries the filter. Screenshots go to FILTER_SHOTS, or e2e/shots/.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test, type Page } from './fixtures';

const SHOTS = process.env.FILTER_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

/** Every chip, in the row's order: its key (`by-n`), accessible name, the tag its rows show and its cards. */
const CHIPS = [
  { key: 'balls-3', name: '3 balls', tag: '3', ids: ['cascade', 'shower', 'pause', 'classic', 'boston', 'box'] },
  { key: 'balls-4', name: '4 balls', tag: '4', ids: ['fountain', 'half-shower', 'tower-4', 'polyrhythm'] },
  { key: 'balls-5', name: '5 balls', tag: '5', ids: ['five-cascade', 'five-744', 'ramp'] },
  { key: 'jugglers-2', name: '2 jugglers', tag: 'Pass', ids: ['passing', 'ultimates', 'three-count', 'seven-fours', 'rising-passes'] },
  { key: 'jugglers-3', name: '3 jugglers', tag: 'Pass', ids: ['three-feed', 'three-triangle', 'three-ultimates'] },
] as const;
const DECK_SIZE = 21;

const notation = (page: Page) => page.locator('.deck-notation');
/** A chip by its key, `balls-5` or `jugglers-3`. */
const chip = (page: Page, key: string) => {
  const [by, n] = key.split('-');
  return page.locator(`.deck-filter[data-by="${by}"][data-n="${n}"]`);
};
/** The wheel's rows, one each (the first copies): its cards, then Make your own. */
const cards = (page: Page) => page.locator('.deck-row[data-id]');
const lit = (page: Page) => page.locator('.deck-filter[aria-pressed="true"]');
/** The rows the wheel shows that hold no row: none, whatever the filter's size. */
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
/**
 * Each chip's contrast (WCAG ratios): `shape`, the better of its edge and its fill against the
 * picker behind it; `digit`, its text against its fill.
 */
const chipContrast = (page: Page) =>
  page.evaluate(() => {
    const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
    const lum = (c: string) => {
      const [r, g, b] = rgb(c).map((v) => {
        const x = v / 255;
        return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const ratio = (a: string, b: string) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi! + 0.05) / (lo! + 0.05);
    };
    const behind = getComputedStyle(document.querySelector('.deck-picker')!).backgroundColor;
    return [...document.querySelectorAll<HTMLElement>('.deck-filter')].map((b) => {
      const s = getComputedStyle(b);
      const edge = s.boxShadow.match(/rgba?\([^)]*\)/)?.[0] ?? s.backgroundColor;
      return {
        lit: b.getAttribute('aria-pressed') === 'true',
        shape: Math.max(ratio(edge, behind), ratio(s.backgroundColor, behind)),
        digit: ratio(s.color, s.backgroundColor),
      };
    });
  });

for (const size of [
  { name: '1280x800', width: 1280, height: 800, phone: false },
  { name: '390x844', width: 390, height: 844, phone: true },
]) {
  test.describe(size.name, () => {
    test.use({ viewport: { width: size.width, height: size.height }, hasTouch: size.phone });

    const tap = (page: Page, key: string) => (size.phone ? chip(page, key).tap() : chip(page, key).click());
    /** One step forward, as the reader would: ↓ on the web (v6.1 ruling 3), › on a phone. */
    const next = async (page: Page) => {
      if (size.phone) await page.locator('.deck-next').click();
      else {
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        await page.keyboard.press('ArrowDown');
      }
    };

    test('two labelled groups, BALLS 3 4 5 and JUGGLERS 2 3, each chip named by its whole phrase', async ({ page }) => {
      await page.goto('/');
      const row = page.locator('.deck-filters');
      await expect(row).toBeVisible();
      await expect(page.getByRole('group', { name: 'Balls', exact: true }).getByRole('button')).toHaveText(['3', '4', '5']);
      await expect(page.getByRole('group', { name: 'Jugglers', exact: true }).getByRole('button')).toHaveText(['2', '3']);
      for (const c of CHIPS) await expect(page.getByRole('button', { name: c.name, exact: true })).toHaveCount(1);
      // Each label reads before its chips, in capitals; Balls before Jugglers, all on the one row.
      await expect(page.locator('.deck-filter-label').first()).toHaveCSS('text-transform', 'uppercase');
      const r = (await row.boundingBox())!;
      const boxes = await page
        .locator('.deck-filter-label, .deck-filter')
        .evaluateAll((els) => els.map((e) => ({ chip: e.classList.contains('deck-filter'), ...(e.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; width: number; height: number }) })));
      expect(boxes.map((b) => b.chip)).toEqual([false, true, true, true, false, true, true]);
      for (let i = 1; i < boxes.length; i++) expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 0.5);
      for (const b of boxes) {
        expect(b.left).toBeGreaterThanOrEqual(r.x - 0.5);
        expect(b.right).toBeLessThanOrEqual(r.x + r.width + 0.5);
        expect(b.top).toBeGreaterThanOrEqual(r.y - 0.5);
        expect(b.bottom).toBeLessThanOrEqual(r.y + r.height + 0.5);
        // Square chips.
        if (b.chip) expect(Math.abs(b.width - b.height)).toBeLessThan(1);
      }
      // Unlit, the chip's shape holds 3:1 against the picker and its digit 4.5:1; lit too.
      await tap(page, 'jugglers-3');
      await expect(lit(page)).toHaveCount(1);
      const contrast = await chipContrast(page);
      expect(contrast.filter((c) => c.lit)).toHaveLength(1);
      for (const c of contrast) {
        expect(c.shape).toBeGreaterThanOrEqual(3);
        expect(c.digit).toBeGreaterThanOrEqual(4.5);
      }
    });

    test('each chip leaves its cards; one lit across both groups; the lit chip tapped again shows every card', async ({ page }) => {
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
      for (const c of CHIPS) {
        await tap(page, c.key);
        await expect(chip(page, c.key)).toHaveAttribute('aria-pressed', 'true');
        await expect(lit(page)).toHaveCount(1);
        await expect(cards(page)).toHaveCount(c.ids.length);
        expect(await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual([...c.ids]);
        expect(new Set(await page.locator('.deck-row[data-id] em').allTextContents())).toEqual(new Set([c.tag]));
        await expect(page.locator('.deck-own')).toHaveCount(1);
        await expect.poll(() => blankRows(page)).toBe(0);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/filter-${c.key}-${size.name}.png` });
      }
      // Across the groups: from Jugglers 3 to Balls 5, still one lit.
      await tap(page, 'balls-5');
      await expect(lit(page)).toHaveCount(1);
      await expect(chip(page, 'jugglers-3')).toHaveAttribute('aria-pressed', 'false');
      await expect(cards(page)).toHaveCount(3);
      await tap(page, 'balls-5');
      await expect(lit(page)).toHaveCount(0);
      await expect(cards(page)).toHaveCount(DECK_SIZE);
      expect(errors).toEqual([]);
    });

    test('a chip loads its first card when the card on stage is outside it; inside, the pattern stays', async ({ page }) => {
      await page.goto('/');
      await expect(notation(page)).toHaveText('3');
      await tap(page, 'balls-3');
      await expect(notation(page)).toHaveText('3');
      await tap(page, 'balls-5');
      const first5 = await page.locator('.deck-row[data-row="0"] code').textContent();
      await expect(notation(page)).toHaveText(first5 ?? '');
      await expect(page.locator('.deck-meta')).toHaveText('5 balls');
      await tap(page, 'jugglers-3');
      await expect(page.locator('.deck-meta')).toHaveText(/3 jugglers$/);
      await expect(page.locator('.deck-row[data-row="0"]')).toHaveAttribute('data-id', 'three-feed');
      await expect(page.locator('.deck-row[data-row="0"]')).toHaveAttribute('aria-current', /.+/);
      // From Jugglers 3 to Jugglers 2: a three-juggler card is on stage, so the first of two loads.
      await tap(page, 'jugglers-2');
      await expect(page.locator('.deck-meta')).toHaveText(/2 jugglers$/);
      // Cleared, the pattern stays.
      const held = await notation(page).textContent();
      await tap(page, 'jugglers-2');
      await expect(notation(page)).toHaveText(held ?? '');
      // A chip loads without starting the sound.
      await expect(page.locator('#play')).toHaveAttribute('data-state', 'stopped');
    });

    test('↓ (› on a phone) stays in the filter, round its loop', async ({ page }) => {
      await page.goto('/');
      await tap(page, 'balls-5');
      const names = await page.locator('.deck-row[data-id] code').allTextContents();
      expect(names).toHaveLength(3);
      await expect(notation(page)).toHaveText(names[0]!);
      for (const n of [names[1], names[2], names[0], names[1]]) {
        await next(page);
        await expect(notation(page)).toHaveText(n!);
        await expect(page.locator('.deck-meta')).toHaveText('5 balls');
      }
      await expect(chip(page, 'balls-5')).toHaveAttribute('aria-pressed', 'true');
      // Jugglers 3: the three three-juggler cards, round. (› shut the phone's wheel: the pattern opens it.)
      if (!(await chip(page, 'jugglers-3').isVisible())) await page.locator('.deck-pattern').click();
      await tap(page, 'jugglers-3');
      const three = await page.locator('.deck-row[data-id] code').allTextContents();
      expect(three).toHaveLength(3);
      await expect(notation(page)).toHaveText(three[0]!);
      for (const n of [three[1], three[2], three[0]]) {
        await next(page);
        await expect(notation(page)).toHaveText(n!);
        await expect(page.locator('.deck-meta')).toHaveText(/3 jugglers$/);
      }
      await expect(chip(page, 'jugglers-3')).toHaveAttribute('aria-pressed', 'true');
    });

    test('the wheel loops over a short filter: every row it shows holds a pattern, the band turns round', async ({ page }) => {
      await page.goto('/');
      await tap(page, 'balls-5');
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
        // Resting on Make your own opens no editor (v6.1 ruling 2): the wheel keeps its rows.
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
      await tap(page, 'balls-3');
      await page.waitForTimeout(800);
      expect(await page.evaluate(() => location.hash)).toBe(plain);
      await tap(page, 'jugglers-3');
      await expect(page.locator('.deck-meta')).toHaveText(/3 jugglers$/);
      await expect.poll(() => page.evaluate(() => location.hash)).not.toBe(plain);
      await page.waitForTimeout(800);
      const hash = await page.evaluate(() => location.hash);
      const fresh = await page.context().newPage();
      await fresh.goto('/' + hash);
      await expect(fresh.locator('.deck-meta')).toHaveText(/3 jugglers$/);
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
        await tap(page, 'balls-4');
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'rest');
        // Past the return delay (1.5 s after the settle): still open, the chip lit.
        await page.waitForTimeout(2500);
        await expect(page.locator('.deck-wheel')).toBeVisible();
        await expect(chip(page, 'balls-4')).toHaveAttribute('aria-pressed', 'true');
      });

      test('focus on a chip when the settled wheel closes goes to the pattern button', async ({ page }) => {
        await page.goto('/');
        await turnAndSettle(page);
        await chip(page, 'jugglers-3').focus();
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
      test('kept across panel changes; a typed card outside the filter clears it', async ({ page }) => {
        await page.goto('/');
        await tap(page, 'balls-5');
        await page.locator('.panel-option[data-panel="sound"]').click();
        await page.locator('.panel-option[data-panel="patterns"]').click();
        await expect(chip(page, 'balls-5')).toHaveAttribute('aria-pressed', 'true');
        await expect(cards(page)).toHaveCount(3);
        // Make your own, then 441 (a 3-ball card): the filter clears, the band finds it.
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
