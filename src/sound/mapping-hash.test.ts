// Old links' sound (docs/plans/v5-sound-model.md, ruling 6): every `m` a v1 or v2 link carried, and
// every old `~name`, reads as what the sound follows, three switches and a drum machine shift.
import { describe, expect, test } from 'vitest';
import { LISTEN_RULES } from '../tunables';
import { LEGACY_PRESETS, legacySound } from './mapping-hash';

const HEIGHTS = (rule: 'height' | 'pitch' | 'ball') => Array.from({ length: 9 }, (_, i) => LISTEN_RULES[rule].perHeight[i + 1] ?? null);
const PRESET_ALSO = { catches: false, downbeat: true, pad: false };

/** An old custom mapping in the short keys v2 links wrote (`encodeMapping`, retired in v5). */
const custom = (over: Record<string, unknown> = {}) => ({
  h: HEIGHTS('height'),
  b: null,
  p: [
    ['TR-808', 'kick', -0.6, 1],
    ['TR-808', 'snare', 0.6, 1],
  ],
  y: 1,
  c: [0, 'rimshot'],
  d: [20, 'clap'],
  f: [0, 400, 12000],
  a: [0, 'mellotron', 'Dm9'],
  q: [20, null],
  ...over,
});

describe('legacySound', () => {
  test('a preset name: its rule, the downbeat clap, the first drum machines; Voice per part reads as height, flagged', () => {
    expect(legacySound('height-drum')).toEqual({ listen: 'height', also: PRESET_ALSO, kitShift: 0, voicePerPart: false });
    expect(legacySound('height-pitch')).toMatchObject({ listen: 'pitch', voicePerPart: false });
    expect(legacySound('ball-pitch')).toMatchObject({ listen: 'ball', voicePerPart: false });
    expect(legacySound('voice-per-part')).toMatchObject({ listen: 'height', voicePerPart: true });
    expect(Object.keys(LEGACY_PRESETS)).toEqual(['voice-per-part', 'height-drum', 'height-pitch', 'ball-pitch']);
  });

  test('junk, an unknown name, or a prototype key: what an old link meant by default, Voice per part', () => {
    for (const junk of [undefined, null, 7, [1], 'nope', 'toString', '__proto__']) {
      expect(legacySound(junk)).toEqual({ listen: 'height', also: PRESET_ALSO, kitShift: 0, voicePerPart: true });
    }
  });

  test('a preset on kits: kitShift is part 0’s kit’s place in DRUMMER_KITS, else 0', () => {
    expect(legacySound({ n: 'ball-pitch', k: 'LM-2' })).toMatchObject({ listen: 'ball', kitShift: 1 });
    expect(legacySound({ n: 'height-drum', k: ['Casio-RZ1', 'TR-808'] })).toMatchObject({ listen: 'height', kitShift: 4 });
    expect(legacySound({ n: 'height-pitch', k: 'Nope' })).toMatchObject({ listen: 'pitch', kitShift: 0 });
    expect(legacySound({ n: 'height-pitch' })).toMatchObject({ kitShift: 0 });
    // Only a string names a preset: a nested `n` does not recurse.
    expect(legacySound({ n: { n: { n: 'ball-pitch' } } })).toMatchObject({ listen: 'height', voicePerPart: true });
  });

  test('a custom mapping: ball when it had a ball list, pitch when its heights were Height to pitch’s, else height', () => {
    expect(legacySound(custom())).toEqual({ listen: 'height', also: PRESET_ALSO, kitShift: 0, voicePerPart: false });
    expect(legacySound(custom({ b: ['kick', 'snare'] }))).toMatchObject({ listen: 'ball' });
    expect(legacySound(custom({ h: HEIGHTS('pitch') }))).toMatchObject({ listen: 'pitch' });
    // One height edited off the pitch scale is height again.
    expect(legacySound(custom({ h: ['kick', ...HEIGHTS('pitch').slice(1)] }))).toMatchObject({ listen: 'height' });
    // A ball list that does not read (empty, a stray sound) was ignored, as the old decoder ignored it.
    expect(legacySound(custom({ b: [] }))).toMatchObject({ listen: 'height' });
    expect(legacySound(custom({ b: ['kick', 'nope'], h: HEIGHTS('pitch') }))).toMatchObject({ listen: 'pitch' });
    // Junk heights repair to Height to drum's; a null height is a silent one, not pitch's.
    expect(legacySound(custom({ h: 'junk' }))).toMatchObject({ listen: 'height' });
    expect(legacySound(custom({ h: [null, ...HEIGHTS('pitch').slice(1)] }))).toMatchObject({ listen: 'height' });
  });

  test('a custom mapping that did not read height was Voice per part: height, flagged', () => {
    expect(legacySound(custom({ y: 0 }))).toMatchObject({ listen: 'height', voicePerPart: true });
    expect(legacySound(custom({ y: 0, b: ['kick'] }))).toMatchObject({ listen: 'height', voicePerPart: true });
    // A link with parts and no y was the default's, Voice per part.
    expect(legacySound(custom({ y: undefined }))).toMatchObject({ voicePerPart: true });
  });

  test('a v1 link (`v`, no `p` or `y`) read height', () => {
    const v1 = { v: [[-0.6, 1], [0.6, 1]], h: HEIGHTS('height') };
    expect(legacySound(v1)).toEqual({ listen: 'height', also: { catches: false, downbeat: true, pad: false }, kitShift: 0, voicePerPart: false });
    expect(legacySound({ v: [] })).toMatchObject({ voicePerPart: true });
  });

  test('also: catches.on, a downbeat sound (null: none), pad.on; junk takes the old default', () => {
    expect(legacySound(custom({ c: [1, 'rimshot'], d: [20, null], a: [1, 'soundfont', 'Am7'] })).also).toEqual({ catches: true, downbeat: false, pad: true });
    expect(legacySound(custom({ d: [20, 'cowbell'] })).also.downbeat).toBe(true);
    expect(legacySound(custom({ c: 'x', d: 'x', a: 'x' })).also).toEqual(PRESET_ALSO);
    expect(legacySound(custom({ c: [2], a: ['on'] })).also).toEqual(PRESET_ALSO);
  });

  test('kitShift: part 0’s kit, else 0', () => {
    const on = (kit: unknown) => custom({ p: [[kit, 'kick', 0, 1]] });
    expect(legacySound(on('MFB-512')).kitShift).toBe(2);
    expect(legacySound(on('Roland CR-8000')).kitShift).toBe(3);
    expect(legacySound(on('Nope')).kitShift).toBe(0);
    expect(legacySound(custom({ p: ['junk'] })).kitShift).toBe(0);
  });
});
