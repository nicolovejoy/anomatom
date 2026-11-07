// v6.1 stream W5 (docs/plans/v6-1-wheel-feel.md, ruling 4; first built in v6 W2): the filter chips
// above the wheel in two labelled groups, BALLS 3 4 5 and JUGGLERS 2 3 4 (4 since v6.6), headless at 1280×800
// (docked) and 390×844 (a phone). Each chip leaves its cards and Make your own (Jugglers 3 exactly
// the three three-juggler cards, Balls 5 the three five-ball cards), one chip lit across both
// groups, the lit chip tapped again shows every card, ↓ (→ on a phone) stays in the filter, a chip
// that does not hold the card on stage loads its first card, and the link never carries the
// filter. Since v6.2 W6 (docs/plans/v6-2-wheel-ends.md) the wheel has ends: Jugglers 3 shows its
// four rows once each, the docked menu with the band on the chosen card, the phone's drum turning
// to each of the four and no further. Screenshots go to FILTER_SHOTS, or e2e/shots/.
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test, type Page } from './fixtures';
import { DECK } from '../src/tunables';

const SHOTS = process.env.FILTER_SHOTS ?? 'e2e/shots';
mkdirSync(SHOTS, { recursive: true });

/** Every chip, in the row's order: its key (`by-n`), accessible name, the tag its rows show and its cards. */
const CHIPS = [
  { key: 'balls-3', name: '3 balls', tag: '3', ids: ['cascade', 'shower', 'pause', 'classic', 'boston', 'box'] },
  { key: 'balls-4', name: '4 balls', tag: '4', ids: ['fountain', 'half-shower', 'tower-4', 'polyrhythm'] },
  { key: 'balls-5', name: '5 balls', tag: '5', ids: ['five-cascade', 'five-744', 'ramp'] },
  { key: 'jugglers-2', name: '2 jugglers', tag: 'Pass', ids: ['passing', 'ultimates', 'three-count', 'seven-fours', 'rising-passes'] },
  { key: 'jugglers-3', name: '3 jugglers', tag: 'Pass', ids: ['three-feed', 'three-triangle', 'three-ultimates'] },
  { key: 'jugglers-4', name: '4 jugglers', tag: 'Pass', ids: ['four-typewriter', 'four-square'] },
  { key: 'jugglers-5', name: '5 jugglers', tag: 'Pass', ids: ['five-star', 'five-typewriter'] },
] as const;
const DECK_SIZE = 25;

const notation = (page: Page) => page.locator('.deck-notation');
/** A chip by its key, `balls-5` or `jugglers-3`. */
const chip = (page: Page, key: string) => {
  const [by, n] = key.split('-');
  return page.locator(`.deck-filter[data-by="${by}"][data-n="${n}"]`);
};
/** The wheel's cards, one each; Make your own follows them. */
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
/**
 * The phone's band: the row a point at the middle of the wheel hits, and how far its middle is from
 * the band's, past a pixel (the snap may rest a pixel off: the wheel's rules count in its height).
 */
const drumBand = (page: Page) =>
  page.locator('.deck-wheel').evaluate((wheel) => {
    const box = wheel.getBoundingClientRect();
    const mid = box.top + box.height / 2;
    const hit = document.elementFromPoint(box.left + box.width / 2, mid)?.closest('.deck-row');
    const r = hit?.getBoundingClientRect();
    return { row: hit?.getAttribute('data-row') ?? null, off: r ? Math.max(0, Math.round(Math.abs(r.top + r.height / 2 - mid)) - 1) : null };
  });
/**
 * The data-row of every row the wheel shows, top to bottom, or null for a blank one. Docked a menu,
 * its rows from the top; on a phone a drum, its rows about the band in its middle (the compact
 * drum cuts its outer two: v6.4 ruling 1).
 */
const rowsShown = (page: Page) =>
  page.locator('.deck-wheel').evaluate((w) => {
    const box = w.getBoundingClientRect();
    const px = parseFloat(getComputedStyle(w).getPropertyValue('--deck-row'));
    const at = (y: number) => document.elementFromPoint(box.left + box.width / 2, y)?.closest('.deck-row')?.getAttribute('data-row') ?? null;
    const out: (string | null)[] = [];
    if (document.querySelector('#app.deck-docked')) {
      for (let y = box.top + px / 2; y < box.bottom - 1; y += px) out.push(at(y));
      return out;
    }
    const half = Math.floor((box.height / 2 - 1) / px + 0.5);
    for (let i = -half; i <= half; i++) out.push(at(box.top + box.height / 2 + i * px));
    return out;
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
    /** One step forward, as the reader would: ↓ on the web (v6.1 ruling 3), → on a phone held upright (no ›: v6.6 ruling 1). */
    const next = async (page: Page) => {
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press(size.phone ? 'ArrowRight' : 'ArrowDown');
    };

    test('two labelled groups, BALLS 3 4 5 and JUGGLERS 2 3 4 5, each chip named by its whole phrase', async ({ page }) => {
      await page.goto('/');
      const row = page.locator('.deck-filters');
      await expect(row).toBeVisible();
      await expect(page.getByRole('group', { name: 'Balls', exact: true }).getByRole('button')).toHaveText(['3', '4', '5']);
      await expect(page.getByRole('group', { name: 'Jugglers', exact: true }).getByRole('button')).toHaveText(['2', '3', '4', '5']);
      for (const c of CHIPS) await expect(page.getByRole('button', { name: c.name, exact: true })).toHaveCount(1);
      // Each label reads before its chips, in capitals; Balls before Jugglers, all on the one row.
      await expect(page.locator('.deck-filter-label').first()).toHaveCSS('text-transform', 'uppercase');
      const r = (await row.boundingBox())!;
      const boxes = await page
        .locator('.deck-filter-label, .deck-filter')
        .evaluateAll((els) => els.map((e) => ({ chip: e.classList.contains('deck-filter'), ...(e.getBoundingClientRect().toJSON() as { left: number; right: number; top: number; bottom: number; width: number; height: number }) })));
      expect(boxes.map((b) => b.chip)).toEqual([false, true, true, true, false, true, true, true, true]);
      // Docked each label sits before its chips; on a phone upright, over them (v6.6 ruling 3).
      for (let i = 1; i < boxes.length; i++) {
        const label = !boxes[i - 1]!.chip && boxes[i]!.chip;
        if (size.phone && label) expect(boxes[i]!.top).toBeGreaterThanOrEqual(boxes[i - 1]!.bottom - 0.5);
        else expect(boxes[i]!.left).toBeGreaterThanOrEqual(boxes[i - 1]!.right - 0.5);
      }
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
        // Each row once: the cards, then Make your own, last.
        await expect(page.locator('.deck-row')).toHaveCount(c.ids.length + 1);
        await expect(page.locator('.deck-row').last()).toHaveClass(/deck-own/);
        // Docked, a short filter's menu holds nothing blank: it is as tall as its rows, or the column.
        if (!size.phone) await expect.poll(() => blankRows(page)).toBe(0);
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

    test('↓ (→ on a phone) stays in the filter and stops at its last card', async ({ page }) => {
      await page.goto('/');
      await tap(page, 'balls-5');
      const names = await page.locator('.deck-row[data-id] code').allTextContents();
      expect(names).toHaveLength(3);
      await expect(notation(page)).toHaveText(names[0]!);
      for (const n of [names[1], names[2], names[2], names[2]]) {
        await next(page);
        await expect(notation(page)).toHaveText(n!);
        await expect(page.locator('.deck-meta')).toHaveText('5 balls');
      }
      await expect(chip(page, 'balls-5')).toHaveAttribute('aria-pressed', 'true');
      // On a phone › is disabled on the last card, ‹ not (hidden upright, but kept for the phone on its side).
      if (size.phone) {
        await expect(page.locator('.deck-next')).toHaveAttribute('aria-disabled', 'true');
        await expect(page.locator('.deck-prev')).toHaveAttribute('aria-disabled', 'false');
      }
      // Jugglers 3: the three three-juggler cards, to the last.
      await tap(page, 'jugglers-3');
      const three = await page.locator('.deck-row[data-id] code').allTextContents();
      expect(three).toHaveLength(3);
      await expect(notation(page)).toHaveText(three[0]!);
      if (size.phone) await expect(page.locator('.deck-prev')).toHaveAttribute('aria-disabled', 'true');
      for (const n of [three[1], three[2], three[2]]) {
        await next(page);
        await expect(notation(page)).toHaveText(n!);
        await expect(page.locator('.deck-meta')).toHaveText(/3 jugglers$/);
      }
      await expect(chip(page, 'jugglers-3')).toHaveAttribute('aria-pressed', 'true');
    });

    if (!size.phone) {
      test('Jugglers 3, docked: four rows once each, no scroll; the band on the chosen card; the ends go nowhere', async ({ page }) => {
        await page.goto('/');
        await tap(page, 'jugglers-3');
        const ids = ['three-feed', 'three-triangle', 'three-ultimates'];
        await expect(page.locator('.deck-row')).toHaveCount(4);
        expect(await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')))).toEqual(ids);
        // As tall as its four rows: every row in view, none blank, none twice, nothing to scroll.
        await expect.poll(() => rowsShown(page)).toEqual(['0', '1', '2', '3']);
        expect(await page.locator('.deck-wheel-list').evaluate((l) => l.scrollHeight <= l.clientHeight)).toBe(true);
        const band = page.locator('.deck-row.in-band');
        await expect(band).toHaveCount(1);
        await expect(band).toHaveAttribute('data-id', 'three-feed');
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/w6-jugglers-3-1280x800.png` });
        // ↑ on the first card: nothing.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const first = (await notation(page).textContent())!;
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(300);
        await expect(notation(page)).toHaveText(first);
        await expect(band).toHaveAttribute('data-id', 'three-feed');
        // ↓: the band moves with the choice.
        await page.keyboard.press('ArrowDown');
        await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'three-triangle');
        await expect(page.locator('.deck-row.on')).toHaveAttribute('data-id', 'three-triangle');
        // Make your own, clicked: the band on it. ↓ there changes nothing.
        await page.locator('.deck-own').click();
        await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
        const held = (await notation(page).textContent())!;
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(300);
        await expect(notation(page)).toHaveText(held);
        await expect(page.locator('.deck-row.in-band')).toHaveClass(/deck-own/);
        await expect.poll(() => rowsShown(page)).toEqual(['0', '1', '2', '3']);
      });
    }

    if (size.phone) {
      test('Jugglers 3 on a phone: the drum turns to each of its four rows and no further; both ends reach the band', async ({ page }) => {
        await page.goto('/');
        await tap(page, 'jugglers-3');
        await expect(page.locator('.deck-row')).toHaveCount(4);
        // The compact card (v6.6 ruling 4): the first card in the band, a blank row above it.
        const wheel = page.locator('.deck-wheel');
        await expect(wheel).toHaveAttribute('data-phase', 'compact');
        await expect.poll(() => drumBand(page)).toEqual({ row: '0', off: 0 });
        expect(await rowsShown(page)).toEqual([null, '0', '1']);
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${SHOTS}/w6-jugglers-3-first-390x844.png` });
        // ↑ on the first row: it stays, and turns nothing.
        await page.locator('.deck-row[data-row="0"]').focus();
        await page.keyboard.press('ArrowUp');
        await page.waitForTimeout(500);
        expect(await drumBand(page)).toEqual({ row: '0', off: 0 });
        await expect(wheel).toHaveAttribute('data-phase', 'compact');
        // ↓ turns to each row in turn, the card grown: the cards load as it settles, Make your own loads nothing.
        const three = await page.locator('.deck-row[data-id] code').allTextContents();
        for (const row of [1, 2, 3]) {
          await page.keyboard.press('ArrowDown');
          await expect.poll(() => drumBand(page)).toEqual({ row: String(row), off: 0 });
          if (row < 3) await expect(notation(page)).toHaveText(three[row]!);
        }
        await page.waitForTimeout(400);
        await expect(notation(page)).toHaveText(three[2]!);
        // Grown, Make your own in the band and blank rows past it.
        const grown = await rowsShown(page);
        const m = (grown.length - 1) / 2;
        expect(grown.length).toBe(DECK.wheelRows);
        expect(grown.slice(0, m + 1)).toEqual([null, '0', '1', '2', '3'].slice(-(m + 1)));
        expect(grown.slice(m + 1).every((r) => r === null)).toBe(true);
        await page.screenshot({ path: `${SHOTS}/w6-jugglers-3-last-390x844.png` });
        // And no further. Compact again the return delay after (issue 106: checks timed after the
        // settle raced the return on a slow runner, so wait for it), Make your own still in the band.
        await expect(wheel).toHaveAttribute('data-phase', 'compact', { timeout: DECK.returnMs + 2000 });
        expect(await drumBand(page)).toEqual({ row: '3', off: 0 });
        expect(await rowsShown(page)).toEqual(['2', '3', null]);
        // ↓ on Make your own turns nothing: the band stays, the card stays compact, nothing loads.
        await page.locator('.deck-row[data-row="3"]').focus();
        await page.keyboard.press('ArrowDown');
        await page.waitForTimeout(400);
        expect(await drumBand(page)).toEqual({ row: '3', off: 0 });
        await expect(wheel).toHaveAttribute('data-phase', 'compact');
        await expect(notation(page)).toHaveText(three[2]!);
      });

      test('the full deck on a phone: each row once, no copies', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.deck-row')).toHaveCount(DECK_SIZE + 1);
        const ids = await cards(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-id')));
        expect(new Set(ids).size).toBe(DECK_SIZE);
        await expect(page.locator('.deck-own')).toHaveCount(1);
      });
    }

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

      // v6.6 ruling 4: a chip neither grows nor shrinks the card; a grown one goes compact the
      // return delay after the tap.
      test('a chip tapped while the card settles: still grown, the chip lit; compact the return delay after', async ({ page }) => {
        await page.goto('/');
        await turnAndSettle(page);
        const rows = Math.round((await page.locator('.deck-wheel').boundingBox())!.height / DECK.rowPx);
        await tap(page, 'balls-4');
        await expect(chip(page, 'balls-4')).toHaveAttribute('aria-pressed', 'true');
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'settling');
        expect(Math.round((await page.locator('.deck-wheel').boundingBox())!.height / DECK.rowPx)).toBe(rows);
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact', { timeout: DECK.returnMs + 2000 });
        await expect(chip(page, 'balls-4')).toHaveAttribute('aria-pressed', 'true');
        // On the compact card a chip changes nothing of its size.
        await tap(page, 'balls-5');
        await page.waitForTimeout(400);
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact');
      });

      // The chips stay on the compact card (v6.6 ruling 3, reversing v6.4 ruling 2): focus on one stays there.
      test('focus on a chip when the settled card goes compact stays on the chip', async ({ page }) => {
        await page.goto('/');
        await turnAndSettle(page);
        await chip(page, 'jugglers-3').focus();
        await expect(page.locator('.deck-wheel')).toHaveAttribute('data-phase', 'compact', { timeout: DECK.returnMs + 2000 });
        await expect(page.locator('.deck-filters')).toBeVisible();
        await expect(chip(page, 'jugglers-3')).toBeFocused();
      });

      // v6.6 ruling 10: upright nothing opens the wheel, so the hidden pattern button controls nothing.
      test('the picker holds the chips and the wheel; the hidden pattern button controls nothing', async ({ page }) => {
        await page.goto('/');
        await expect(page.locator('.deck-pattern')).toBeHidden();
        await expect(page.locator('.deck-pattern')).not.toHaveAttribute('aria-controls');
        await expect(page.locator('.deck-pattern')).not.toHaveAttribute('aria-expanded');
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
        await expect(page.locator('.deck-row.in-band')).toHaveAttribute('data-id', 'pause');
      });
    }
  });
}
