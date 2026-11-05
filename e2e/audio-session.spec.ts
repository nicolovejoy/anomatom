// v6.5 rulings 1 and 2 (#123): paused or stopped, anomatom lets go of the audio session (the
// context suspended), AUDIO_RELEASE_MS after Pause with the page in view and at once with it
// hidden; playing, it keeps sounding hidden (AUDIO_PLAYS_HIDDEN); only a gesture brings it back.
// Whether iOS drops its media card is a device check; headless sees the context's state. The app
// exposes no handle to its context, so the test keeps one, as e2e/sound-returns.spec.ts does: the
// constructor is wrapped before the app loads, in the test page only. The page is "hidden" by a
// `visibilityState` getter on `document` and a dispatched `visibilitychange`.
import { AUDIO_RELEASE_MS } from '../src/tunables';
import { expect, stopPlaying, test, type Page } from './fixtures';

const SHOTS = process.env.E2E_SHOTS;

type Watched = { contexts: AudioContext[]; visibility: DocumentVisibilityState };
const scheduled = async (page: Page) => Number(await page.locator('#app').getAttribute('data-events-scheduled'));
const clock = (page: Page) =>
  page.evaluate(() => (window as unknown as Watched).contexts.at(-1)?.currentTime ?? 0);
const contextState = (page: Page) =>
  page.evaluate(() => (window as unknown as Watched).contexts.at(-1)?.state ?? 'none');
/** How many contexts the page has made: a park keeps its one, and nothing rebuilds it after a resume. */
const contextCount = (page: Page) => page.evaluate(() => (window as unknown as Watched).contexts.length);
const setVisibility = (page: Page, visibility: DocumentVisibilityState) =>
  page.evaluate((v) => {
    (window as unknown as Watched).visibility = v;
    document.dispatchEvent(new Event('visibilitychange'));
  }, visibility);

/** Play, then the clock moving within a second and events scheduling. */
async function playAndHear(page: Page) {
  const before = await scheduled(page);
  const at = await clock(page);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect.poll(() => clock(page), { timeout: 1_000 }).toBeGreaterThan(at);
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(before + 4);
  expect(await contextState(page)).toBe('running');
  // Past the stall check (AUDIO_STALL_CHECK_MS), so a stray renew rebuild would show here.
  await page.waitForTimeout(500);
  expect(await contextCount(page)).toBe(1);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const Base = window.AudioContext;
    const watched = window as unknown as Watched;
    watched.contexts = [];
    watched.visibility = 'visible';
    window.AudioContext = class extends Base {
      constructor(options?: AudioContextOptions) {
        super(options);
        watched.contexts.push(this);
      }
    };
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => watched.visibility });
  });
  await page.goto('/#v1.e30');
});

test('Pause lets go of the audio session about AUDIO_RELEASE_MS later; Play takes it up again', async ({ page }) => {
  await playAndHear(page);
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Play');
  const paused = Date.now();
  // Not before about half the release: the glide and the drums' tails finish first.
  await page.waitForTimeout(AUDIO_RELEASE_MS / 2);
  expect(await contextState(page)).toBe('running');
  await expect.poll(() => contextState(page), { timeout: AUDIO_RELEASE_MS }).toBe('suspended');
  expect(await contextCount(page)).toBe(1);
  expect(Date.now() - paused).toBeLessThan(AUDIO_RELEASE_MS + 1_000);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/audio-session-parked.png` });
  // A park is not an interruption: nothing else changed on screen.
  await expect(page.locator('#play')).toHaveText('Play');
  await playAndHear(page);
  await stopPlaying(page);
});

test('hidden while playing keeps playing; paused while hidden lets go at once; shown again stays let go until Play', async ({ page }) => {
  await playAndHear(page);
  await setVisibility(page, 'hidden');
  const before = await scheduled(page);
  await page.waitForTimeout(500);
  expect(await contextState(page)).toBe('running');
  await expect(page.locator('#play')).toHaveText('Pause');
  await expect.poll(() => scheduled(page), { timeout: 5_000 }).toBeGreaterThan(before + 2);

  // Pause while hidden (an iOS interruption in the background does the same): at once.
  await page.locator('#play').click();
  await expect(page.locator('#play')).toHaveText('Play');
  await expect.poll(() => contextState(page), { timeout: AUDIO_RELEASE_MS / 4 }).toBe('suspended');
  expect(await contextCount(page)).toBe(1);

  // Shown again: no sound without a gesture.
  await setVisibility(page, 'visible');
  await page.waitForTimeout(300);
  expect(await contextState(page)).toBe('suspended');
  await expect(page.locator('#play')).toHaveText('Play');
  await playAndHear(page);
  await stopPlaying(page);
});
