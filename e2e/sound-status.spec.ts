// The sound status under Play (the samples loading, ready or failed), shown with the phone sheet
// closed. The fixtures abort the sample CDN, so the failed state is the one these runs see.
// The reload's screenshot goes to the scratchpad when E2E_SHOTS names a directory, else nowhere.
import { expect, isCdnError, test } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;

test('the aborted sample CDN shows the failed state and a retry control that tries again', async ({ page }) => {
  await page.goto('/#v1.e30');
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

test('Retry pressed from the keyboard has focus again when the failure comes back', async ({ page }) => {
  await page.goto('/#v1.e30');
  const status = page.locator('.sound-status');
  const retry = page.locator('#sound-retry');
  await expect(status).toHaveAttribute('data-state', 'failed');
  await retry.focus();
  const reloads: string[] = [];
  page.on('requestfailed', (r) => {
    if (isCdnError(r.url())) reloads.push(r.url());
  });
  await page.keyboard.press('Enter');
  await expect.poll(() => reloads.length, { timeout: 5_000 }).toBeGreaterThan(0);
  await expect(status).toHaveAttribute('data-state', 'failed');
  await expect(retry).toBeFocused();
});

test('at 390px wide Play and the failed sound status show with the sheet closed', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#v1.e30');
  await expect(page.locator('#hand-0')).toBeHidden();
  await expect(page.locator('#play')).toBeVisible();
  await expect(page.locator('.sound-status')).toBeVisible();
  await expect(page.locator('#sound-retry')).toBeVisible();
  await page.screenshot({ path: 'test-results/sound-status-phone.png', fullPage: true });
});

/** A frame's stamp: the status, and the row's and the deck's top (in the page, scroll added) and height. */
type Box = { state: string; row: number[]; deck: number[] };

// Nico, 2026-11-04 (#108): with the drums failed, a card that needs new kits loads them, so the
// status goes loading, then failed again. The row keeps its place through that reload (Retry's
// room held, the text saying it is fetching), so the deck under it never moves.
test.describe('390px, a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('a reload after a failure keeps the sound row in place, so the deck does not move', async ({ page }) => {
    // Once the row has shown, hold each aborted fetch a while, so the reload lasts long enough to see.
    let slow = false;
    await page.route('**/smpldsnds.github.io/**', async (route) => {
      if (slow) await new Promise((r) => setTimeout(r, 600));
      await route.abort();
    });
    await page.goto('/');
    const status = page.locator('.sound-status');
    const retry = page.locator('#sound-retry');
    await expect(status).toHaveAttribute('data-state', 'failed');
    await expect(retry).toBeVisible();
    slow = true;
    // Every frame and every status change, in the page: the state, the row's box and the deck's.
    await page.evaluate(() => {
      const w = window as unknown as { boxes: Box[]; watching: boolean };
      w.boxes = [];
      w.watching = true;
      const box = (s: string) => {
        const r = document.querySelector(s)!.getBoundingClientRect();
        return [Math.round(r.top + window.scrollY), Math.round(r.height)];
      };
      const row = document.querySelector('.sound-status')!;
      const stamp = () => w.boxes.push({ state: row.getAttribute('data-state')!, row: box('.sound-status'), deck: box('.deck-bar') });
      new MutationObserver(stamp).observe(row, { attributes: true });
      const frame = () => {
        stamp();
        if (w.watching) requestAnimationFrame(frame);
      };
      frame();
    });
    // Jugglers 3 loads a three-juggler card, whose kits are new.
    await page.locator('.deck-filter[data-by="jugglers"][data-n="3"]').tap();
    await expect(status).toHaveAttribute('data-state', 'loading');
    // While it loads, the row says so where it stood, in the flow (not clipped to a pixel for a
    // screen reader), and Retry's room stays, empty.
    await expect(status).toHaveAttribute('data-held', '');
    expect((await status.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await expect(status).toContainText('I am fetching my drum sounds');
    await expect(retry).toBeHidden();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/sound-status-reload-phone.png` });
    await expect(status).toHaveAttribute('data-state', 'failed', { timeout: 10_000 });
    await expect(retry).toBeVisible();
    const boxes = await page.evaluate(() => {
      const w = window as unknown as { boxes: Box[]; watching: boolean };
      w.watching = false;
      return w.boxes;
    });
    const loading = boxes.filter((b) => b.state === 'loading');
    expect(loading.length).toBeGreaterThan(0);
    for (const b of loading) expect(b.row[1]).toBeGreaterThanOrEqual(44);
    const first = boxes[0]!;
    for (const b of boxes) expect({ row: b.row, deck: b.deck }).toEqual({ row: first.row, deck: first.deck });
  });
});
