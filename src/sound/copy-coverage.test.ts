import { expect, test } from 'vitest';
import { copy } from '../ui/copy';
import { KIT_IDS, KIT_SAMPLES, PAD_CHORDS } from '../tunables';
import { PAD_CHORD_IDS, PAD_INSTRUMENT_IDS, PRESET_NAMES } from './mapping';

test('every kit, sound, preset, chord and pad instrument has a display name', () => {
  expect(Object.keys(copy.kitNames).sort()).toEqual([...KIT_IDS].sort());
  expect(Object.keys(copy.kitShortNames).sort()).toEqual([...KIT_IDS].sort());
  expect(Object.keys(copy.sampleNames).sort()).toEqual([...KIT_SAMPLES].sort());
  expect(Object.keys(copy.presetNames).sort()).toEqual([...PRESET_NAMES, 'custom'].sort());
  expect(Object.keys(copy.padChordNames).sort()).toEqual([...PAD_CHORD_IDS].sort());
  expect(Object.keys(PAD_CHORDS).sort()).toEqual([...PAD_CHORD_IDS].sort());
  expect(Object.keys(copy.padInstrumentNames).sort()).toEqual([...PAD_INSTRUMENT_IDS].sort());
});
