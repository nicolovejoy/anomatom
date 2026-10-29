// The sound status beside Play (the samples loading, ready or failed) and Play outside the phone
// fold. The fixtures abort the sample CDN, so the failed state is the one these runs see.
import { expect, isCdnError, test } from './fixtures';

test('the aborted sample CDN shows the failed state and a retry control that tries again', async ({ page }) => {
  await page.goto('/');
  const status = page.locator('.sound-status');
  await expect(status).toHaveAttribute('data-state', 'failed');
  await expect(status).toContainText('I could not fetch my drum sounds');
  const retry = page.locator('#sound-retry');
  await expect(retry).toBeVisible();
  const requests: string[] = [];
  page.on('requestfailed', (r) => {
    if (isCdnError(r.url())) requests.push(r.url());
  });
  await retry.click();
  // Retrying starts a load, which the stub fails again.
  await expect.poll(() => requests.length, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect(status).toHaveAttribute('data-state', 'failed');
});

test('at 390px wide Play and the sound status are visible without opening Knobs', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.knobs-toggle')).toBeVisible();
  await expect(page.locator('#knobs-body')).toBeHidden();
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('.sound-status')).toBeVisible();
  await expect(page.locator('#sound-retry')).toBeVisible();
  await page.screenshot({ path: 'test-results/sound-status-phone.png', fullPage: true });
});
