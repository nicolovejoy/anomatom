// Sync notation (form 5, v3 ruling 5; MATH.md §11): `(4,2x)(2x,4)` typed into the pattern box is
// the box, three balls, one input; typing 531 over it gives 531 back. A screenshot of the box
// playing goes to e2e/shots/ (gitignored).
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, openTab, test } from './fixtures';

const SHOTS = 'e2e/shots';

test('typing (4,2x)(2x,4) plays the box: three balls, one input, and 531 typed over it comes back', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
  });
  await page.goto('/#531');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('(4,2x)(2x,4)');
  await expect(page.locator('#status')).toContainText('3');
  await expect(page.locator('#hand-1')).toBeHidden();
  // Its link is the short form (v4.3 S2).
  await expect.poll(() => new URL(page.url()).hash).toBe('#(4,2x)(2x,4)');
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/sync-box.png` });

  // The link reopens the box in the one input.
  const link = new URL(page.url()).hash;
  await page.goto(`/${link}`);
  await openTab(page, 'pattern');
  await expect(page.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');

  await page.locator('#hand-0').fill('531');
  await expect(page.locator('#status')).toContainText('3');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#531/);
  expect(errors).toEqual([]);
});

test('an odd height in sync says so', async ({ page }) => {
  await page.goto('/#531');
  await openTab(page, 'pattern');
  await page.locator('#hand-0').fill('(3,4)');
  await expect(page.locator('#status')).toContainText('even');
});

test('Box sits in the wheel under 3 balls, plays the box, and Make your own shows (4,2x)(2x,4)', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const row = page.locator('.deck-row[data-id="box"]');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Box');
  await expect(row.locator('em')).toHaveText('3');
  await expect(page.locator('.deck-row[data-id="sync-fountain"]')).toContainText('Synchronous fountain');
  await row.click();
  // A tap on a row plays it.
  await expect(page.locator('.deck-notation')).toHaveText('(4,2x)(2x,4)');
  await expect.poll(async () => Number(await page.locator('#app').getAttribute('data-events-scheduled'))).toBeGreaterThan(0);
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/sync-box-card.png` });
  await page.locator('.deck-pattern').click();
  await page.locator('.deck-own').click();
  await expect(page.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');
});
