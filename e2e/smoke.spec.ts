// SPEC §7.8: load the page, press play, see the first Event fire. Audio output is not
// observable (samples load from a CDN and stay silent until they arrive), so the page publishes
// how many events the player has handed to the sampler in `data-events-scheduled` on #app.
import { expect, stopPlaying, test } from './fixtures';

const scheduled = async (page: import('./fixtures').Page) =>
  Number(await page.locator('#app').getAttribute('data-events-scheduled'));

test('pressing play schedules events, and they keep coming as the audio clock runs', async ({ page }) => {
  await page.goto('/#v1.e30');
  await expect(page.locator('#app')).toHaveAttribute('data-events-scheduled', '0');
  await expect(page.locator('#status')).toHaveText(/3/);

  await page.locator('#play').click();
  await expect.poll(() => scheduled(page)).toBeGreaterThan(0);

  // The first look-ahead window is scheduled at once, even on a suspended context. Events past
  // it only come if the audio clock is running, i.e. the click started the AudioContext.
  const first = await scheduled(page);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(first + 4);

  await stopPlaying(page);
  await expect(page.locator('#stop')).toBeDisabled();
});
