// Space (docs/plans/v2-share-kits-passing.md, ruling 3), Home/End on the sheet's tabs, and the
// phone in landscape (667×375: juggler, ladder and the closed sheet on screen, no page scroll).
import { expect, openTab, test } from './fixtures';

test.describe('phone portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('Space plays and pauses right after a Sound tab select changes', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'sound');
    for (const [id, index] of [['#sp-kit', 0], ['#sp-preset', 1]] as const) {
      await page.locator(id).focus();
      await expect(page.locator(id)).toBeFocused();
      await page.locator(id).selectOption({ index });
      await expect(page.locator(id)).not.toBeFocused();
    }
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toHaveText('Pause');
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toHaveText('Play');
  });

  test('Space plays from a focused checkbox instead of toggling it', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'sound');
    await page.locator('#sp-filter-on').focus();
    await page.keyboard.press('Space');
    await expect(page.locator('#play')).toHaveText('Pause');
    await expect(page.locator('#sp-filter-on')).not.toBeChecked();
  });

  test('Home and End on the tabs go to the first and last', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await page.locator('#tab-rhythm').focus();
    await page.keyboard.press('End');
    await expect(page.locator('#tab-sound')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-sound')).toBeFocused();
    await page.keyboard.press('Home');
    await expect(page.locator('#tab-pattern')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#tab-pattern')).toBeFocused();
  });
});

test.describe('phone landscape', () => {
  test.use({ viewport: { width: 667, height: 375 } });

  test('juggler, ladder and the closed sheet fit with no page scroll', async ({ page }) => {
    await page.goto('/#v1.e30');
    await expect(page.locator('.sheet-head')).toBeVisible();
    const fit = await page.evaluate(() => {
      const bottom = (s: string) => document.querySelector(s)?.getBoundingClientRect().bottom ?? NaN;
      return {
        scrollH: document.documentElement.scrollHeight,
        innerH: window.innerHeight,
        jugglerH: document.querySelector('.region-juggler')?.getBoundingClientRect().height ?? 0,
        ladderBottom: bottom('.region-ladder'),
        sheetBottom: bottom('.region-sheet'),
        stageRight: document.querySelector('.stage')?.getBoundingClientRect().right ?? NaN,
        sheetLeft: document.querySelector('.region-sheet')?.getBoundingClientRect().left ?? NaN,
        jugglerBottom: bottom('.region-juggler'),
        jugglerTop: document.querySelector('.region-juggler')?.getBoundingClientRect().top ?? NaN,
        ladderTop: document.querySelector('.region-ladder')?.getBoundingClientRect().top ?? NaN,
        sheetTop: document.querySelector('.region-sheet')?.getBoundingClientRect().top ?? NaN,
      };
    });
    await page.screenshot({ path: 'test-results/landscape-667x375.png' });
    expect(fit.scrollH).toBeLessThanOrEqual(fit.innerH);
    expect(fit.sheetBottom).toBeLessThanOrEqual(fit.innerH);
    expect(fit.sheetLeft).toBeGreaterThanOrEqual(fit.stageRight);
    expect(fit.jugglerH).toBeGreaterThanOrEqual(60);
    expect(fit.ladderBottom).toBeLessThanOrEqual(fit.innerH);
    expect(fit.jugglerBottom).toBeLessThanOrEqual(fit.ladderTop + 1);
  });

  test('an open sheet keeps the page unscrolled too', async ({ page }) => {
    await page.goto('/#v1.e30');
    await openTab(page, 'rhythm');
    await expect(page.locator('#panel-rhythm')).toBeVisible();
    await page.screenshot({ path: 'test-results/landscape-open-667x375.png' });
    const over = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(over).toBeLessThanOrEqual(0);
  });
});
