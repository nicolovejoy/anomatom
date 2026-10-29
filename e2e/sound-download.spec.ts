// The TR-808 is downloaded once for both hands: each sample URL is requested exactly once. The
// fixtures abort the CDN; this test replaces that stub with a two-sample kit of silent WAVs.
import { expect, test } from './fixtures';

function wav(): Buffer {
  const n = 100;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0);
  b.writeUInt32LE(36 + n * 2, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(44100, 24);
  b.writeUInt32LE(88200, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(n * 2, 40);
  return b;
}

test('both hands load the 808 from one download', async ({ page, context }) => {
  const urls: string[] = [];
  await context.route('**/smpldsnds.github.io/**', (route) => {
    const url = route.request().url();
    urls.push(url);
    const cors = { 'access-control-allow-origin': '*' };
    if (url.endsWith('dm.json')) {
      return route.fulfill({
        headers: cors,
        json: {
          baseUrl: 'https://smpldsnds.github.io/drum-machines/TR-808',
          name: 'TR-808',
          samples: ['kick/1', 'snare/1'],
          groupNames: ['kick', 'snare'],
          nameToSampleName: { 'kick/1': 'kick/1', 'snare/1': 'snare/1' },
          sampleGroupVariations: { kick: ['kick/1'], snare: ['snare/1'] },
        },
      });
    }
    return route.fulfill({ headers: { ...cors, 'content-type': 'audio/wav' }, body: wav() });
  });
  await page.goto('/');
  await expect(page.locator('.sound-status')).toHaveAttribute('data-state', 'ready');
  const samples = urls.filter((u) => u.endsWith('.ogg'));
  expect(samples.sort()).toEqual([
    'https://smpldsnds.github.io/drum-machines/TR-808/kick/1.ogg',
    'https://smpldsnds.github.io/drum-machines/TR-808/snare/1.ogg',
  ]);
});
