// The three-juggler cards (docs/plans/v6-wheel-filters-three.md, ruling 5): each loads at desktop and
// phone sizes with three figures on the stage and three jugglers, each on a drum machine of its own,
// in the Sound panel. Screenshots are taken only when THREE_SHOTS names a directory.
import { mkdirSync } from 'node:fs';
import { encodeState } from '../src/app/hash';
import { PRESETS } from '../src/app/presets';
import { defaultState } from '../src/app/state';
import { expect, isCdnError, openTab, test } from './fixtures';

const SHOTS = process.env.THREE_SHOTS;
const cards = PRESETS.filter((p) => p.parts.length === 6);

test('there are three three-juggler cards', () => {
  expect(cards.map((c) => c.id)).toEqual(['three-feed', 'three-triangle', 'three-ultimates']);
});

for (const card of cards) {
  for (const [name, viewport] of [
    ['1280x800', { width: 1280, height: 800 }],
    ['390x844', { width: 390, height: 844 }],
  ] as const) {
    test(`${card.id} at ${name}: three figures, three drum machines`, async ({ page }) => {
      if (SHOTS) mkdirSync(SHOTS, { recursive: true });
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
      await page.setViewportSize(viewport);
      await page.goto(`/${encodeState({ ...defaultState(), parts: card.parts })}`);
      await expect(page.locator('#play')).toBeEnabled();
      await page.locator('#play').click();
      await expect(page.locator('#play')).toHaveText('Pause');
      const juggler = page.locator('canvas.juggler');
      await expect(juggler).toHaveAttribute('data-figures', '3');
      await expect(juggler).toHaveAttribute('data-balls', '9');
      const box = await juggler.boundingBox();
      expect(box?.width ?? Infinity).toBeLessThanOrEqual(viewport.width);
      await page.waitForTimeout(1500);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-stage.png` });
      await openTab(page, 'sound');
      const rows = page.locator('.sp-drummer');
      await rows.first().scrollIntoViewIfNeeded();
      await expect(rows.locator('.sp-drummer-name')).toHaveText(['Juggler 1', 'Juggler 2', 'Juggler 3']);
      const kits = await rows.locator('.sp-kit').allTextContents();
      expect(new Set(kits).size).toBe(3);
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${card.id}-${name}-sound.png` });
      expect(errors).toEqual([]);
    });
  }
}
