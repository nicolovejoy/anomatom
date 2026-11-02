import { expect, test } from 'vitest';
import { copy } from '../ui/copy';
import { DRUMMER_KITS, PAD_CHORDS, PAD_INSTRUMENTS, SOUND_FIXED } from '../tunables';
import { ALSO_KEYS, LISTENS } from './drummers';

test('every drum machine, Listen for choice and Also play switch has words to show', () => {
  expect(Object.keys(copy.kitNames).sort()).toEqual([...DRUMMER_KITS].sort());
  expect(Object.keys(copy.listenNames).sort()).toEqual([...LISTENS].sort());
  expect(Object.keys(copy.listenInfo).sort()).toEqual([...LISTENS].sort());
  expect(Object.keys(copy.alsoNames).sort()).toEqual([...ALSO_KEYS].sort());
  expect(Object.keys(copy.alsoHints).sort()).toEqual([...ALSO_KEYS].sort());
});

test('the fixed pad is one the sampler knows', () => {
  expect(PAD_CHORDS[SOUND_FIXED.pad.chord].length).toBeGreaterThan(0);
  expect(PAD_INSTRUMENTS[SOUND_FIXED.pad.instrument]).toBeTruthy();
});
