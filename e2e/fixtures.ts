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

/** Shows one tab of the sheet (docs/plans/phone-sheet.md); on a wide screen the column is always open on one. */
export const openTab = (page: import('@playwright/test').Page, tab: 'pattern' | 'rhythm' | 'sound') =>
  page.locator(`#tab-${tab}`).click();

/** Stop lives beside the time slider, shown while paused: pause first if playing, then stop. */
export async function stopPlaying(page: import('@playwright/test').Page) {
  if ((await page.locator('#play').textContent())?.includes('Pause')) await page.locator('#play').click();
  await page.locator('#stop').click();
}
