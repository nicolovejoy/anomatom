import { describe, expect, test } from 'vitest';
import { DEFAULT_MAPPING, MAX_MAPPING_PARTS } from '../tunables';
import { applyPreset, PRESET_NAMES, type Mapping } from './mapping';
import { decodeMapping, encodeMapping } from './mapping-hash';

const custom: Mapping = {
  ...DEFAULT_MAPPING,
  byHeight: true,
  parts: [
    { kit: 'TR-808', sample: 'conga-hi', pan: -0.25, gain: 0.5 },
    { kit: 'TR-808', sample: null, pan: 1, gain: 0 },
    { kit: 'TR-808', sample: 'clave', pan: 0, gain: 1 },
  ],
  perHeight: { 1: 'clap', 2: null, 3: 'snare', 4: 'cowbell', 5: 'kick', 6: 'kick', 7: 'maraca', 8: 'cymbal', 9: 'tom-hi' },
  byBall: ['kick', 'clave'],
};

describe('encodeMapping', () => {
  test('a preset is its name; anything else is an object of short keys', () => {
    for (const name of PRESET_NAMES) expect(encodeMapping(applyPreset(name))).toBe(name);
    const e = encodeMapping(custom) as Record<string, unknown>;
    expect(e.p).toEqual([
      ['TR-808', 'conga-hi', -0.25, 0.5],
      ['TR-808', null, 1, 0],
      ['TR-808', 'clave', 0, 1],
    ]);
    expect(e.y).toBe(1);
    expect(Object.keys(e).sort()).toEqual(['a', 'b', 'c', 'd', 'f', 'h', 'p', 'y']);
  });

  test('byHeight false encodes as 0 and survives', () => {
    const m = { ...custom, byHeight: false };
    expect((encodeMapping(m) as { y: number }).y).toBe(0);
    expect(decodeMapping(encodeMapping(m))).toEqual(m);
  });

  test('round trips through JSON', () => {
    expect(decodeMapping(JSON.parse(JSON.stringify(encodeMapping(custom))))).toEqual(custom);
  });
});

describe('decodeMapping', () => {
  test('preset names, and junk taken for the default', () => {
    expect(decodeMapping('ball-pitch')).toEqual(applyPreset('ball-pitch'));
    expect(decodeMapping('voice-per-part')).toEqual(applyPreset('voice-per-part'));
    for (const junk of ['nope', 12, null, undefined, [1], true]) expect(decodeMapping(junk)).toEqual(DEFAULT_MAPPING);
    expect(decodeMapping({})).toEqual(DEFAULT_MAPPING);
  });

  test('an old link’s hands become TR-808 parts that read height, with the default’s sample per part', () => {
    const m = decodeMapping({ v: [[-0.25, 0.5], [1, 0]] });
    expect(m.parts).toEqual([
      { kit: 'TR-808', sample: DEFAULT_MAPPING.parts[0]?.sample, pan: -0.25, gain: 0.5 },
      { kit: 'TR-808', sample: DEFAULT_MAPPING.parts[1]?.sample, pan: 1, gain: 0 },
    ]);
    expect(m.byHeight).toBe(true);
  });

  test('an old link with a short or junk hand list is repaired field by field', () => {
    expect(decodeMapping({ v: [[0.5]] }).parts).toEqual([
      { ...DEFAULT_MAPPING.parts[0], pan: 0.5 },
    ]);
    expect(decodeMapping({ v: [7, 'x'] }).parts).toEqual(DEFAULT_MAPPING.parts);
  });

  test('p wins over v, and y over the age of the link', () => {
    const m = decodeMapping({ v: [[0.1, 0.1]], p: [['TR-808', 'clave', 0.2, 0.3]], y: 0 });
    expect(m.parts).toEqual([{ kit: 'TR-808', sample: 'clave', pan: 0.2, gain: 0.3 }]);
    expect(m.byHeight).toBe(false);
    expect(decodeMapping({ p: [['TR-808', 'clave', 0, 1]] }).byHeight).toBe(DEFAULT_MAPPING.byHeight);
    expect(decodeMapping({ p: [['TR-808', 'clave', 0, 1]], y: 1 }).byHeight).toBe(true);
    expect(decodeMapping({ y: 7, v: [[0, 1]] }).byHeight).toBe(true);
  });

  test('parts are repaired per field: unknown kit and sample, junk numbers, extra parts take the last default', () => {
    const m = decodeMapping({
      p: [
        ['Moog', 'tuba', 'left', null],
        ['TR-808', 'kick', -9, 9],
        ['TR-808', 'snare', 0.5, 0.5],
        'junk',
      ],
    });
    expect(m.parts).toEqual([
      DEFAULT_MAPPING.parts[0],
      { kit: 'TR-808', sample: 'kick', pan: -1, gain: 1 },
      { kit: 'TR-808', sample: 'snare', pan: 0.5, gain: 0.5 },
      DEFAULT_MAPPING.parts[1],
    ]);
    expect(decodeMapping({ p: [] }).parts).toEqual(DEFAULT_MAPPING.parts);
    expect(decodeMapping({ p: 'x' }).parts).toEqual(DEFAULT_MAPPING.parts);
  });

  test('a link cannot carry more than MAX_MAPPING_PARTS voices', () => {
    const many = Array.from({ length: MAX_MAPPING_PARTS + 5 }, () => ['TR-808', 'kick', 0, 1]);
    expect(decodeMapping({ p: many }).parts).toHaveLength(MAX_MAPPING_PARTS);
    expect(decodeMapping({ v: many.map(() => [0, 1]) }).parts).toHaveLength(MAX_MAPPING_PARTS);
  });
});
