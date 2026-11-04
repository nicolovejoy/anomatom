// v6.3 ruling 1 (#81): a context that stops while playing shows as paused, and Play brings the
// clock back. iOS interrupts the context (a call, the lock button); headless cannot, so the test
// suspends it from the page. The app exposes no handle to its context, so the test keeps one: the
// constructor is wrapped before the app loads, in the test page only.
import { expect, stopPlaying, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;

const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const clock = (page: Page) =>
  page.evaluate(() => (window as unknown as { contexts: AudioContext[] }).contexts.at(-1)?.currentTime ?? 0);

test('a context that stops while playing shows paused; Play starts the clock again', async ({ page }) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const contexts: AudioContext[] = [];
    (window as unknown as { contexts: AudioContext[] }).contexts = contexts;
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        contexts.push(this);
      }
    };
  });
  await page.goto('/#v1.e30');
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  const first = await scheduled(page);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(first + 4);

  // The interruption: the context stops, and the transport shows paused.
  await page.evaluate(() => (window as unknown as { contexts: AudioContext[] }).contexts.at(-1)?.suspend());
  await expect(page.locator('#play')).toHaveText('Play');
  const stopped = await clock(page);
  await page.waitForTimeout(300);
  expect(await clock(page)).toBe(stopped);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sound-returns-paused.png` });

  // Play is the gesture: the clock moves again and events keep coming.
  const before = await scheduled(page);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect.poll(() => clock(page), { timeout: 5_000 }).toBeGreaterThan(stopped + 0.2);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(before + 4);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sound-returns-playing.png` });
  await stopPlaying(page);
});
