// Kits (v2 wave 1, rulings 1 and 2), headless, on a stubbed CDN. Audio output is not observable,
// so the test tells kits apart by their samples: the stub serves the TR-808 a very short silent WAV
// and the LM-2 a tenth of a second, and every AudioBufferSourceNode.start records its buffer's length.
import { expect, openTab, test, type Page } from './fixtures';

function wav(frames: number): Buffer {
  const b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + frames * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(frames * 2, 40);
  return b;
}

const SHORT = 100; // frames: the TR-808's samples
const LONG = 4410; // frames: the LM-2's
/** Seconds between the two, whatever rate the context resamples to. */
const LONGER_THAN = 0.05;

const kits: Record<string, string[]> = {
  'TR-808': ['kick/1', 'snare/1'],
  // The roles the default mapping plays (kick, snare), on the LM-2's own samples (KIT_ROLES).
  'LM-2': ['kick', 'snare-m'],
};

/** Durations of every buffer started so far, in order. */
const starts = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number[] }).__starts.slice());

test('switching the kit while playing: the next hits are the new kit\'s, with no error', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  const urls: string[] = [];
  await context.route('**/smpldsnds.github.io/**', (route) => {
    const url = route.request().url();
    urls.push(url);
    const cors = { 'access-control-allow-origin': '*' };
    const kit = Object.keys(kits).find((k) => url.includes(`/drum-machines/${k}/`));
    if (!kit) return route.abort();
    if (url.endsWith('dm.json')) {
      return route.fulfill({ headers: cors, json: { name: kit, samples: kits[kit], formats: ['ogg', 'm4a'] } });
    }
    return route.fulfill({
      headers: { ...cors, 'content-type': 'audio/wav' },
      body: wav(kit === 'LM-2' ? LONG : SHORT),
    });
  });
  await page.addInitScript(() => {
    const w = window as unknown as { __starts: number[] };
    w.__starts = [];
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (this: AudioBufferSourceNode, ...args: Parameters<typeof start>) {
      w.__starts.push(this.buffer?.duration ?? -1);
      return start.apply(this, args);
    };
  });

  await page.goto('/#v1.e30');
  await expect(page.locator('.sound-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('#play').click();
  await expect.poll(async () => (await starts(page)).length, { timeout: 5_000 }).toBeGreaterThan(2);
  expect((await starts(page)).every((d) => d > 0 && d < LONGER_THAN)).toBe(true);

  await openTab(page, 'sound');
  await expect(page.locator('#sp-kit option')).toHaveText([
    'Roland TR-808',
    'Casio RZ-1',
    'LinnDrum LM-2',
    'MFB-512',
    'Roland CR-8000',
  ]);
  await page.locator('#sp-kit').selectOption('LM-2');
  await expect(page.locator('#sp-preset')).toHaveValue('voice-per-part');
  // The LM-2 comes in and plays from its first hit after that; the TR-808's hits stop.
  await expect.poll(async () => (await starts(page)).some((d) => d > LONGER_THAN), { timeout: 5_000 }).toBe(true);
  const firstNew = (await starts(page)).findIndex((d) => d > LONGER_THAN);
  await expect.poll(async () => (await starts(page)).length, { timeout: 5_000 }).toBeGreaterThan(firstNew + 4);
  // Hits already handed to the sampler keep their sound (about one look-ahead); after that, only the LM-2.
  const after = (await starts(page)).slice(firstNew + 2);
  expect(after.every((d) => d > LONGER_THAN)).toBe(true);
  expect(urls.some((u) => u.includes('/LM-2/kick.'))).toBe(true);
  expect(urls.some((u) => u.includes('/LM-2/snare-m.'))).toBe(true);
  // The link carries the kit compactly: the preset's name and the kit, not every field.
  const mapping = async () => {
    const hash = await page.evaluate(() => location.hash);
    if (!hash.startsWith('#v2.')) return null;
    return JSON.parse(Buffer.from(hash.slice(4), 'base64url').toString('utf8')).m;
  };
  await expect.poll(mapping, { timeout: 5_000 }).toEqual({ n: 'voice-per-part', k: 'LM-2' });
  await page.screenshot({ path: 'test-results/kits-lm2.png', fullPage: true });
  expect(errors).toEqual([]);

  // Opening the link in a new tab restores the kit. (A new tab, not a reload: WebKit logs a fetch that
  // a reload cancels as an access-control error.)
  const link = await page.evaluate(() => location.hash);
  const fresh = await context.newPage();
  fresh.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  fresh.on('pageerror', (e) => errors.push(e.message));
  await fresh.goto(`/${link}`);
  await openTab(fresh, 'sound');
  await expect(fresh.locator('#sp-kit')).toHaveValue('LM-2');
  await expect(fresh.locator('#sp-preset')).toHaveValue('voice-per-part');
  await expect(fresh.locator('.sound-status')).toHaveAttribute('data-state', 'ready');
  expect(errors).toEqual([]);
});
