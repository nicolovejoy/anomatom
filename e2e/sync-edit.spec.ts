// Sync on the digit pad and swap on a sync set (v4.3 rulings 1 and 2; MATH.md §11): from Make
// your own on a cleared input the pad types the box, `(4,2x)(2x,4)`, which plays as three balls;
// choosing the left hand's two throws and Swap gives `(4x,2x)(2,4)`. Screenshots of the pad with
// the sync keys go to e2e/shots/ (gitignored).
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, openTab, test } from './fixtures';

const SHOTS = 'e2e/shots';
const SIZES = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

for (const size of SIZES) {
  test(`${size.name}: the pad types (4,2x)(2x,4), it plays as 3 balls, and Swap on the left hand gives (4x,2x)(2,4)`, async ({ page }) => {
    mkdirSync(SHOTS, { recursive: true });
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => {
      if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
    });
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto('/');
    // The bare address opens the wheel on a phone; its last row is Make your own.
    await page.locator('.deck-own').click();
    await openTab(page, 'pattern');
    const input = page.locator('#hand-0');
    await input.fill('');
    const key = (k: string) => page.locator(`.digit-pad [data-key="${k}"]`);

    // A vanilla input: `(` shows, `,` and `)` wait for it.
    await expect(key('(')).toBeVisible();
    await expect(key(',')).toBeHidden();
    await expect(key(')')).toBeHidden();
    await expect(key('p')).toBeHidden();
    await key('(').click();
    await expect(key(',')).toBeVisible();
    await expect(key(')')).toBeVisible();
    for (const k of ['4', ',', '2', 'x', ')', '(', '2', 'x', ',', '4', ')']) await key(k).click();
    await expect(input).toHaveValue('(4,2x)(2x,4)');
    await expect(page.locator('#status')).toContainText('I have 3 balls');
    // The input at the top of its scroller, the pad under it.
    await page.locator('.pattern-row[data-hand="0"]').evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.screenshot({ path: `${SHOTS}/sync-pad-${size.width}x${size.height}.png` });

    await page.locator('#play').click();
    await expect(page.locator('#play')).toHaveText('Pause');
    await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');

    // The one input's sites, left then right: 4 (0), 2x (1), 2x (2), 4 (3). The left hand's are 0 and 2.
    await expect(page.locator('#swap')).toBeDisabled();
    const site = (i: number) => page.locator(`.pattern-row[data-hand="0"] .mirror [data-site="${i}"]`).first();
    for (const i of [0, 2]) {
      await site(i).scrollIntoViewIfNeeded();
      const box = (await site(i).boundingBox()) as { x: number; y: number; width: number; height: number };
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
    // 2x is two characters of one throw: three chosen characters, two sites.
    await expect(page.locator('.pattern-row[data-hand="0"] .mirror .chosen')).toHaveCount(3);
    expect(await page.locator('.pattern-row[data-hand="0"] .mirror .chosen').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('data-site')))])).toEqual(['0', '2']);
    await expect(page.locator('#swap')).toBeEnabled();
    await page.locator('#swap').click();
    await expect(input).toHaveValue('(4x,2x)(2,4)');
    await expect(page.locator('#status')).toContainText('I have 3 balls');
    await expect(key(',')).toBeVisible();
    expect(errors).toEqual([]);
  });
}

test('throws of different hands in a sync set do not swap, and say why', async ({ page }) => {
  await page.goto('/');
  await page.locator('.deck-own').click();
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('(4,2x)(2x,4)');
  await expect(page.locator('#status')).toContainText('I have 3 balls');
  const site = (i: number) => page.locator(`.pattern-row[data-hand="0"] .mirror [data-site="${i}"]`).first();
  for (const i of [0, 1]) {
    await site(i).scrollIntoViewIfNeeded();
    const box = (await site(i).boundingBox()) as { x: number; y: number; width: number; height: number };
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await page.locator('#swap').click();
  await expect(page.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');
  await expect(page.locator('.swap-note')).toContainText('same hand');
});
