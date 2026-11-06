// The test every spec imports. It stubs the sample CDN (smpldsnds.github.io) for the whole
// browser context, so no e2e run reaches the real host: one Play fetches ~234 requests there, and
// it rate-limits (429 with no CORS headers). Aborting is the app's documented silent path; the
// hooks the tests read (`data-events-scheduled`, `data-balls`) do not depend on a loaded kit.
import { expect, test as base, type ConsoleMessage } from '@playwright/test';

export { expect };
export type { Page } from '@playwright/test';

export const CDN_HOST = 'smpldsnds.github.io';

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route(`**/${CDN_HOST}/**`, (route) => route.abort());
    await use(context);
  },
});

/** An error from the aborted CDN requests, by source URL or text: nothing else is excused. */
export const isCdnError = (text: string, m?: ConsoleMessage): boolean =>
  text.includes(CDN_HOST) || (m?.location().url ?? '').includes(CDN_HOST);

/**
 * Shows one tab of the sheet (docs/plans/phone-sheet.md); on the wide layout the top bar's panel
 * choice first (Patterns for Pattern and Rhythm, Sound for Sound). A closed phone sheet shows no tabs (v4 ruling C): the deck's Details opens it on
 * Sound, and the tabs show from then on.
 */
export async function openTab(page: import('@playwright/test').Page, tab: 'pattern' | 'rhythm' | 'sound') {
  // The wide layout (v5 ruling 8): the top bar picks the panel; Sound has no tabs.
  const panel = page.locator(`.panel-option[data-panel="${tab === 'sound' ? 'sound' : 'patterns'}"]`);
  if (await panel.isVisible()) {
    if ((await panel.getAttribute('aria-pressed')) !== 'true') await panel.click();
    if (tab === 'sound') return;
    // v6 ruling 2: a card on stage hides the editor until Make your own.
    if (!(await page.locator(`#tab-${tab}`).isVisible())) await page.locator('.deck-own').click();
  }
  const button = page.locator(`#tab-${tab}`);
  if (!(await button.isVisible())) {
    await page.locator('.deck-details').click();
    if (tab === 'sound') return;
  }
  if ((await button.getAttribute('aria-selected')) !== 'true') await button.click();
}

/**
 * On the wide layout a card on stage hides the editor (docs/plans/v6-wheel-filters-three.md,
 * ruling 2) until Make your own: shows it, as a reader would, so a test can type a pattern. Does
 * nothing where the editor already shows or on a phone.
 */
export async function showEditor(page: import('@playwright/test').Page) {
  if (!(await page.locator('.panel-choice').isVisible()) || !(await page.locator('.deck-wheel').isVisible())) return;
  if (await page.locator('#app.deck-editor-hidden.panel-patterns').count()) await page.locator('.deck-own').click();
}

/**
 * Stop lives beside the time slider, shown while paused: pause first if playing, then stop.
 *
 * Waits on the transport's state, never a snapshot (issue #135). The player starts at once and
 * `data-events-scheduled` moves with it, but Play's label and Stop's `disabled` follow on the next
 * animation frame (both are written by the mounts' `draw`, deck before knobs, in the same frame; on the Play-click path, since knobs' start() also syncs Stop directly).
 * A read of Play's text before that frame says Play while the page is playing, so Pause was never
 * pressed and Stop stayed hidden. Stop enabled means the frame has drawn, so Play's label is then
 * current.
 */
export async function stopPlaying(page: import('@playwright/test').Page) {
  await expect(page.locator('#stop')).toBeEnabled();
  if ((await page.locator('#play').textContent())?.includes('Pause')) await page.locator('#play').click();
  await page.locator('#stop').click();
}

/**
 * Shows the 2D juggler (v6.8 T1), for a test about the 2D picture: waits for the 3D view to load
 * or fail, then, if it showed, presses the stage's 2D/3D switch.
 */
export async function show2d(page: import('@playwright/test').Page) {
  const region = page.locator('.region-juggler');
  await expect(region).not.toHaveAttribute('data-three', 'loading');
  if ((await region.getAttribute('data-view')) === '3d') await page.locator('.juggler-switch').click();
  await expect(region).toHaveAttribute('data-view', '2d');
}
