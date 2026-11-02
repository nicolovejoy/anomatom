// Passing sound (docs/plans/v5-sound-model.md, rulings 3 and 4), headless, on a stubbed CDN.
// `<3p 3|3p 3>`: juggler 1 on the TR-808 and juggler 2 on the LM-2, as `mappingOf` gives them. Audio
// output is not observable, so kits are told apart as kits.spec.ts does, by buffer length (the stub
// serves the TR-808 and the MFB-512 a very short silent WAV and the LM-2 a tenth of a second). Screenshots are taken only when
// PASSING_SOUND_SHOTS names a directory (as first-minute.spec.ts does with FIRST_MINUTE_SHOTS).
import { mkdirSync } from 'node:fs';
import { encodeState } from '../src/app/hash';
import { defaultState } from '../src/app/state';
import { partsFromPassing } from '../src/core';
import { expect, isCdnError, openTab, test, type Page } from './fixtures';

const SHOTS = process.env.PASSING_SOUND_SHOTS;

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

const SHORT = 100; // frames: the TR-808's and the MFB-512's samples
const LONG = 4410; // frames: the LM-2's
const LONGER_THAN = 0.05; // seconds between the two, whatever rate the context resamples to

const kits: Record<string, string[]> = {
  'TR-808': ['kick/1', 'snare/1', 'hihat-close/1', 'tom-low/1', 'clap/1'],
  'LM-2': ['kick', 'snare-m', 'hhclosed', 'tom-l', 'clap'],
  'MFB-512': ['kick', 'snare', 'hihat-closed', 'tom-low', 'clap'],
};

const passing = partsFromPassing('<3p 3|3p 3>');
if (!passing.ok) throw new Error('<3p 3|3p 3> does not parse');
// By height: the passing pattern's 3s are snares, as the passing card always sounded.
const link = encodeState({ ...defaultState(), parts: passing.parts, listen: 'height' });

const starts = (page: Page) => page.evaluate(() => (window as unknown as { __starts: number[] }).__starts.slice());

test('two jugglers on two kits: both are heard; Change drum machines while playing moves both, no error', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await context.route('**/smpldsnds.github.io/**', (route) => {
    const url = route.request().url();
    const cors = { 'access-control-allow-origin': '*' };
    const kit = Object.keys(kits).find((k) => url.includes(`/drum-machines/${k}/`));
    if (!kit) return route.abort();
    if (url.endsWith('dm.json')) {
      return route.fulfill({ headers: cors, json: { name: kit, samples: kits[kit], formats: ['ogg', 'm4a'] } });
    }
    return route.fulfill({ headers: { ...cors, 'content-type': 'audio/wav' }, body: wav(kit === 'LM-2' ? LONG : SHORT) });
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

  await page.goto(`/${link}`);
  await expect(page.locator('.sound-status')).toHaveAttribute('data-state', 'ready');
  await page.locator('#play').click();
  await expect
    .poll(async () => {
      const d = await starts(page);
      return d.some((x) => x > LONGER_THAN) && d.some((x) => x > 0 && x < LONGER_THAN);
    }, { timeout: 8_000 })
    .toBe(true);

  await openTab(page, 'sound');
  const names = page.locator('.sp-drummer .sp-kit');
  await expect(names).toHaveText(['Roland TR-808', 'LinnDrum LM-2']);

  // Change drum machines: both jugglers move on at once, juggler 1 to the LM-2 (long) and juggler 2
  // to the MFB-512 (short), so the tail is still heard long and short, the other way round.
  await page.locator('#sp-change-kits').click();
  await expect(names).toHaveText(['LinnDrum LM-2', 'MFB-512']);
  const mark = (await starts(page)).length;
  await expect.poll(async () => (await starts(page)).length, { timeout: 10_000 }).toBeGreaterThan(mark + 12);
  const tail = (await starts(page)).slice(-6);
  expect(tail.some((d) => d > LONGER_THAN)).toBe(true);
  expect(tail.some((d) => d > 0 && d < LONGER_THAN)).toBe(true);
  await expect(page.locator('#play')).toContainText('Pause');
  expect(errors).toEqual([]);
});

test('the Sound tab at 390 wide: a drum machine per juggler, in its stage colour', async ({ page }) => {
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && !isCdnError(m.text(), m) && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/${link}`);
  await openTab(page, 'sound');
  const rows = page.locator('.sp-drummer');
  await expect(rows.locator('.sp-drummer-name')).toHaveText(['Juggler 1', 'Juggler 2']);
  await expect(rows.first()).toHaveAttribute('style', /--juggler/);
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(wide).toBe(true);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/sound-tab.png` });
  // One juggler: one row, no stage colour (the stage draws two hands grey).
  await page.goto('/#531');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).not.toHaveAttribute('style', /--juggler/);
  expect(errors).toEqual([]);
});
