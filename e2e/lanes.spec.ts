// The Rhythm tab as lanes (docs/plans/lanes.md, stream B), headless on a phone viewport: add a
// hand, set rates 3:4:5, toggle step cells, remove a hand, and the link round trip. Screenshots
// go to test-results.
import { expect, openTab, test, type Page } from './fixtures';

test.use({ viewport: { width: 390, height: 844 } });

const lane = (page: Page, h: number) => page.locator(`.lane[data-hand="${h}"]`);
const rate = (page: Page, h: number) => lane(page, h).locator('.rstep[data-kind="rate"] output');

async function setRate(page: Page, h: number, target: number) {
  for (let n = 0; n < 12; n++) {
    const v = Number(await rate(page, h).textContent());
    if (v === target) return;
    await lane(page, h).locator(`.rstep[data-kind="rate"] [data-delta="${v < target ? 1 : -1}"]`).click();
  }
  await expect(rate(page, h)).toHaveText(String(target));
}

test('lanes: add a hand, rates 3:4:5, toggle cells, remove a hand, the link round trip', async ({ page }) => {
  await page.goto('/');
  await page.locator('.fm-own').click();
  await openTab(page, 'rhythm');
  const lanes = page.locator('.lane:visible');
  await expect(lanes).toHaveCount(2);
  // Two lanes: the ratio chips, no colour dots.
  await expect(page.locator('.chip').first()).toBeVisible();
  await expect(page.locator('.lane:visible .lane-dot:visible')).toHaveCount(0);

  await page.locator('.add-lane').click();
  await expect(lanes).toHaveCount(3);
  // Three lanes: the chips hide, each lane shows its colour, and the new hand has its own voice.
  await expect(page.locator('.chip').first()).toBeHidden();
  await expect(page.locator('.lane:visible .lane-dot:visible')).toHaveCount(3);
  await expect(lane(page, 2).locator('.lane-voice-name')).not.toHaveText('');

  await setRate(page, 0, 3);
  await setRate(page, 1, 4);
  await setRate(page, 2, 5);
  await expect(page.locator('.lane:visible .rstep[data-kind="rate"] output')).toHaveText(['3', '4', '5']);

  // The Pattern tab has one input per hand.
  await openTab(page, 'pattern');
  await expect(page.locator('.pattern-row:visible')).toHaveCount(3);
  await expect(page.locator('.one-hand-hint')).toContainText('more than two hands');
  await openTab(page, 'rhythm');

  // Steps, then a cell toggled on and off.
  await lane(page, 1).locator('.rstep[data-kind="steps"] [data-delta="1"]').click();
  await lane(page, 1).locator('.rstep[data-kind="steps"] [data-delta="1"]').click();
  const cells = lane(page, 1).locator('.cell:visible');
  await expect(cells).toHaveCount(3);
  const cell = cells.nth(2);
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'true');
  await expect(lane(page, 1).locator('.rstep[data-kind="hits"] output')).toHaveText('2');
  await cell.click();
  await expect(cell).toHaveAttribute('aria-pressed', 'false');
  await cell.click();
  await page.screenshot({ path: 'test-results/lanes-345.png' });

  // Playing: the cell under the playhead is outlined in every lane.
  await page.locator('#play').click();
  await expect(page.locator('.lane:visible .cell.now')).toHaveCount(3);
  await page.locator('#play').click();

  // The voice name opens the Sound tab.
  await lane(page, 0).locator('.lane-voice').click();
  await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
  await openTab(page, 'rhythm');

  // Add a fourth, then remove it: back to three, and Add a hand stops at four.
  await page.locator('.add-lane').click();
  await expect(lanes).toHaveCount(4);
  await expect(page.locator('.add-lane')).toBeDisabled();
  await lane(page, 3).locator('.lane-remove').click();
  await expect(lanes).toHaveCount(3);
  await expect(page.locator('.add-lane')).toBeEnabled();

  // The link round trip: a fresh load of the URL shows the same lanes.
  await expect.poll(() => page.url()).toContain('#v2.');
  const before = {
    rates: await page.locator('.lane:visible .rstep[data-kind="rate"] output').allTextContents(),
    steps: await page.locator('.lane:visible .rstep[data-kind="steps"] output').allTextContents(),
    pressed: await lane(page, 1).locator('.cell:visible').evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed'))),
  };
  // The hash follows the store after a short debounce.
  await page.waitForTimeout(500);
  const url = page.url();
  await page.goto('about:blank');
  await page.goto(url);
  await openTab(page, 'rhythm');
  await expect(lanes).toHaveCount(3);
  await expect(page.locator('.lane:visible .rstep[data-kind="rate"] output')).toHaveText(before.rates);
  await expect(page.locator('.lane:visible .rstep[data-kind="steps"] output')).toHaveText(before.steps);
  expect(await lane(page, 1).locator('.cell:visible').evaluateAll((els) => els.map((e) => e.getAttribute('aria-pressed')))).toEqual(
    before.pressed,
  );
  expect(before.rates).toEqual(['3', '4', '5']);

  // Removing down to one lane: no remove button on the last.
  await lane(page, 2).locator('.lane-remove').click();
  await lane(page, 1).locator('.lane-remove').click();
  await expect(lanes).toHaveCount(1);
  await expect(lane(page, 0).locator('.lane-remove')).toBeHidden();
});
