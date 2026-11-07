// The sound model (docs/plans/v5-sound-model.md, rulings 1 to 4): `mappingOf` and its parts.
import { describe, expect, test } from 'vitest';
import { DEFAULT_ALSO, DEFAULT_FILTER_HZ, DRUMMER_KITS, LISTEN_RULES } from '../tunables';
import { ALSO_KEYS, handPan, isListen, jugglerCount, kitOf, LISTENS, mappingOf, wrapKitShift, type Also } from './drummers';

const OFF: Also = { catches: false, downbeat: false, pad: false };
const pans = (parts: number) => mappingOf('height', DEFAULT_ALSO, 0, parts).parts.map((v) => v.pan);
const kits = (parts: number, shift: number) => mappingOf('height', DEFAULT_ALSO, shift, parts).parts.map((v) => v.kit);

describe('drum machines (ruling 3)', () => {
  test('in the ruled order: TR-808 and LM-2 first, the RZ-1 last', () => {
    expect(DRUMMER_KITS).toEqual(['TR-808', 'LM-2', 'MFB-512', 'Roland CR-8000', 'Casio-RZ1']);
  });

  test('wrapKitShift wraps both ways; anything not whole is 0', () => {
    expect(wrapKitShift(5)).toBe(0);
    expect(wrapKitShift(6)).toBe(1);
    expect(wrapKitShift(-1)).toBe(4);
    for (const junk of [1.5, Number.NaN, Infinity]) expect(wrapKitShift(junk)).toBe(0);
  });

  test('one juggler steps through all five kits; two stay apart', () => {
    expect([0, 1, 2, 3, 4, 5].map((s) => kits(2, s))).toEqual([
      ['TR-808', 'TR-808'],
      ['LM-2', 'LM-2'],
      ['MFB-512', 'MFB-512'],
      ['Roland CR-8000', 'Roland CR-8000'],
      ['Casio-RZ1', 'Casio-RZ1'],
      ['TR-808', 'TR-808'],
    ]);
    // A passing pattern: juggler 1 on the 808 and juggler 2 on the LM-2, as the passing cards always sounded.
    expect(kits(4, 0)).toEqual(['TR-808', 'TR-808', 'LM-2', 'LM-2']);
    expect(kits(4, 4)).toEqual(['Casio-RZ1', 'Casio-RZ1', 'TR-808', 'TR-808']);
    expect(kitOf(1, 4)).toBe('TR-808');
  });

  test('four jugglers (v6.6 ruling 19): four different kits at every shift, each juggler\'s hands on one', () => {
    for (let shift = 0; shift < DRUMMER_KITS.length; shift++) {
      const k = kits(8, shift);
      expect(new Set(k.filter((_, h) => h % 2 === 0)).size, String(shift)).toBe(4);
      for (let j = 0; j < 4; j++) expect(k[2 * j + 1], `${shift}:${j}`).toBe(k[2 * j]);
    }
    expect(kits(8, 0).filter((_, h) => h % 2 === 0)).toEqual(['TR-808', 'LM-2', 'MFB-512', 'Roland CR-8000']);
  });

  test('five jugglers (v6.8): five different kits at every shift, every one of the five; there is no sixth', () => {
    expect(DRUMMER_KITS).toHaveLength(5);
    for (let shift = 0; shift < DRUMMER_KITS.length; shift++) {
      const k = kits(10, shift);
      expect(new Set(k.filter((_, h) => h % 2 === 0)), String(shift)).toEqual(new Set(DRUMMER_KITS));
      for (let j = 0; j < 5; j++) expect(k[2 * j + 1], `${shift}:${j}`).toBe(k[2 * j]);
    }
    expect(new Set(kits(10, 0).filter((_, h) => h % 2 === 0)).size).toBe(5);
    expect(kits(10, 2).filter((_, h) => h % 2 === 0)).toEqual(['MFB-512', 'Roland CR-8000', 'Casio-RZ1', 'TR-808', 'LM-2']);
  });
});

describe('pan from the stage (ruling 4)', () => {
  test('jugglers: a pair of hands each, an odd last hand a juggler of its own, at least one', () => {
    expect([0, 1, 2, 3, 4, 5, 10].map(jugglerCount)).toEqual([1, 1, 1, 2, 2, 3, 5]);
  });

  test('one juggler: -0.6, 0.6, as today', () => {
    expect(pans(2)).toEqual([-0.6, 0.6]);
    expect(pans(1)).toEqual([-0.6]);
  });

  test('two jugglers: -0.8, -0.4, 0.4, 0.8, as the passing card today', () => {
    expect(pans(4)).toEqual([-0.8, -0.4, 0.4, 0.8]);
  });

  test('four jugglers (v6.6 ruling 19): centres -0.6, -0.2, 0.2, 0.6; neighbours\' inner hands meet; three do not move', () => {
    const four = pans(8);
    const want = [-0.8, -0.4, -0.4, 0, 0, 0.4, 0.4, 0.8];
    four.forEach((p, h) => expect(p, String(h)).toBeCloseTo(want[h] as number, 12));
    expect(pans(6)).toEqual([-0.8, -0.4, -0.2, 0.2, 0.4, 0.8]);
  });

  test('three and five jugglers: centres spread from -0.6 to 0.6, hands closer as they crowd', () => {
    expect(pans(6)).toEqual([-0.8, -0.4, -0.2, 0.2, 0.4, 0.8]);
    expect(pans(10)).toEqual([-0.75, -0.45, -0.45, -0.15, -0.15, 0.15, 0.15, 0.45, 0.45, 0.75]);
    expect(handPan(4, 5)).toBe(0.4);
    // Juggler 1 is the one drawn on the left (src/view/juggler.ts handPlaces): its pans are the lowest.
    expect(pans(10).slice(0, 2).every((p) => p < 0)).toBe(true);
  });
});

describe('mappingOf (ruling 2)', () => {
  test('each listen takes its rule; every throw reads height', () => {
    for (const listen of LISTENS) {
      const m = mappingOf(listen, DEFAULT_ALSO, 0, 2);
      expect(m.byHeight).toBe(true);
      expect(m.perHeight).toBe(LISTEN_RULES[listen].perHeight);
      expect(m.byBall).toBe(LISTEN_RULES[listen].byBall);
    }
    expect(mappingOf('ball', DEFAULT_ALSO, 0, 2).byBall).not.toBeNull();
    expect(mappingOf('height', DEFAULT_ALSO, 0, 2).byBall).toBeNull();
    expect(mappingOf('pitch', DEFAULT_ALSO, 0, 2).perHeight[9]).toBe('kick');
  });

  test('each switch: catches, the downbeat clap, the pad', () => {
    const off = mappingOf('height', OFF, 0, 2);
    expect([off.catches.on, off.crossAccent.downbeat, off.pad.on]).toEqual([false, null, false]);
    expect(mappingOf('height', { ...OFF, catches: true }, 0, 2).catches).toEqual({ on: true, sample: 'rimshot' });
    expect(mappingOf('height', { ...OFF, downbeat: true }, 0, 2).crossAccent).toEqual({ velocity: 20, downbeat: 'clap' });
    expect(mappingOf('height', { ...OFF, pad: true }, 0, 2).pad).toEqual({ on: true, instrument: 'mellotron', chord: 'Dm9' });
    expect(ALSO_KEYS).toEqual(['catches', 'downbeat', 'pad']);
  });

  test('fixed: the filter off, the pass as today, gain 1, no sound of a hand’s own', () => {
    const m = mappingOf('ball', DEFAULT_ALSO, 3, 4);
    expect(m.filter).toEqual({ on: false, ...DEFAULT_FILTER_HZ });
    expect(m.pass).toEqual({ velocity: 20, sample: null });
    expect(m.parts.every((v) => v.gain === 1 && v.sample === null)).toBe(true);
  });

  test('one voice per part, however many; junk counts are one', () => {
    expect(mappingOf('height', DEFAULT_ALSO, 0, 10).parts).toHaveLength(10);
    for (const junk of [0, -3, Number.NaN]) expect(mappingOf('height', DEFAULT_ALSO, 0, junk).parts).toHaveLength(1);
  });

  test('a fresh page: the ball, the downbeat clap only', () => {
    expect(DEFAULT_ALSO).toEqual({ catches: false, downbeat: true, pad: false });
    expect(isListen('ball') && isListen('pitch') && isListen('height')).toBe(true);
    expect(isListen('height-drum')).toBe(false);
  });
});
