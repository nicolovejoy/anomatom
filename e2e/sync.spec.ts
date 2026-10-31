// Sync notation (form 5, v3 ruling 5; MATH.md §11): `(4,2x)(2x,4)` typed into the pattern box is
// the box, three balls, one input; typing 531 over it gives 531 back. A screenshot of the box
// playing goes to e2e/shots/ (gitignored).
import { mkdirSync } from 'node:fs';
import { expect, isCdnError, test } from './fixtures';

const SHOTS = 'e2e/shots';

test('typing (4,2x)(2x,4) plays the box: three balls, one input, and 531 typed over it comes back', async ({ page }) => {
  mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error' && !isCdnError(m.text(), m)) errors.push(m.text());
  });
  await page.goto('/#531');
  await page.locator('#tab-pattern').click();
  await page.locator('#hand-0').fill('(4,2x)(2x,4)');
  await expect(page.locator('#status')).toContainText('3');
  await expect(page.locator('#hand-1')).toBeHidden();
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#v2\./);
  await expect(page.locator('#play')).toBeEnabled();
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect(page.locator('canvas.juggler')).toHaveAttribute('data-balls', '3');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOTS}/sync-box.png` });

  // The link reopens the box in the one input.
  const link = new URL(page.url()).hash;
  await page.goto(`/${link}`);
  await page.locator('#tab-pattern').click();
  await expect(page.locator('#hand-0')).toHaveValue('(4,2x)(2x,4)');

  await page.locator('#hand-0').fill('531');
  await expect(page.locator('#status')).toContainText('3');
  await expect.poll(() => new URL(page.url()).hash).toMatch(/^#531/);
  expect(errors).toEqual([]);
});

test('an odd height in sync says so', async ({ page }) => {
  await page.goto('/#531');
  await page.locator('#tab-pattern').click();
  await page.locator('#hand-0').fill('(3,4)');
  await expect(page.locator('#status')).toContainText('even');
});
