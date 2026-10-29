import { describe, expect, test } from 'vitest';
import { makeGrids } from '../core';
import type { Event } from '../core';
import {
  DEFAULT_MAPPING,
  FILTER_FULL_CROSSINGS,
  FILTER_HZ_RANGE,
  FILTER_OPEN_HZ,
  KIT_SAMPLES,
  PAD_HOLD_PULSES,
  PAD_VELOCITY,
} from '../tunables';
import {
  applyPreset,
  filterCutoff,
  hitFor,
  PAD_CHORD_IDS,
  PAD_INSTRUMENT_IDS,
  padHitsAt,
  presetOf,
  PRESET_NAMES,
  type Mapping,
  type PadChord,
} from './mapping';

const vanilla = makeGrids({ a: 1, b: 1 });

function throwEvent(height: number, ball = 0): Event {
  return { kind: 'throw', pulse: 0, hand: 0, ball, height, flight: height * 2, cross: false };
}

const withFilter = (on: boolean, low: number, high: number): Mapping => ({
  ...DEFAULT_MAPPING,
  filter: { on, low, high },
});

describe('presets', () => {
  test('the default is the height-to-drum preset, and each preset is itself', () => {
    expect(presetOf(DEFAULT_MAPPING)).toBe('height-drum');
    for (const name of PRESET_NAMES) expect(presetOf(applyPreset(name))).toBe(name);
    expect(PRESET_NAMES).toEqual(['height-drum', 'height-pitch', 'ball-pitch']);
  });

  test('the three presets differ', () => {
    expect(new Set(PRESET_NAMES.map((n) => JSON.stringify(applyPreset(n)))).size).toBe(3);
  });

  test('any edit, however small or nested, is custom; editing back is the preset again', () => {
    const edits: Mapping[] = [
      { ...DEFAULT_MAPPING, perHeight: { ...DEFAULT_MAPPING.perHeight, 3: 'clap' } },
      { ...DEFAULT_MAPPING, hands: [{ pan: -0.5, gain: 1 }, DEFAULT_MAPPING.hands[1]] },
      { ...DEFAULT_MAPPING, catches: { on: true, sample: 'rimshot' } },
      { ...DEFAULT_MAPPING, crossAccent: { velocity: 21, downbeat: 'clap' } },
      { ...DEFAULT_MAPPING, filter: { ...DEFAULT_MAPPING.filter, on: true } },
      { ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, chord: 'Am7' } },
      { ...DEFAULT_MAPPING, byBall: ['kick'] },
      { ...applyPreset('ball-pitch'), byBall: ['kick', 'snare'] },
      { ...applyPreset('ball-pitch'), byBall: null },
    ];
    for (const m of edits) expect(presetOf(m)).toBe('custom');
    const back = { ...DEFAULT_MAPPING, perHeight: { ...DEFAULT_MAPPING.perHeight, 3: 'snare' } };
    expect(presetOf(back)).toBe('height-drum');
    // Arrays against objects are never equal.
    expect(presetOf({ ...DEFAULT_MAPPING, hands: { 0: DEFAULT_MAPPING.hands[0], 1: DEFAULT_MAPPING.hands[1], length: 2 } as unknown as Mapping['hands'] })).toBe('custom');
  });

  test('height to pitch gives nine distinct sounds, the highest throw the lowest', () => {
    const m = applyPreset('height-pitch');
    const names = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => hitFor(throwEvent(h), m, vanilla)?.sample);
    expect(new Set(names).size).toBe(9);
    expect(names[8]).toBe('kick');
  });

  test('ball to pitch: the ball picks the sound, whatever the height, wrapping around', () => {
    const m = applyPreset('ball-pitch');
    const byBall = m.byBall ?? [];
    expect(hitFor(throwEvent(3, 0), m, vanilla)?.sample).toBe(byBall[0]);
    expect(hitFor(throwEvent(7, 0), m, vanilla)?.sample).toBe(byBall[0]);
    expect(hitFor(throwEvent(3, 2), m, vanilla)?.sample).toBe(byBall[2]);
    expect(hitFor(throwEvent(3, byBall.length + 1), m, vanilla)?.sample).toBe(byBall[1]);
    expect(hitFor(throwEvent(0, 1), m, vanilla)).toBeNull();
    // An empty list falls back to the height rule.
    expect(hitFor(throwEvent(4, 1), { ...m, byBall: [] }, vanilla)?.sample).toBe(m.perHeight[4]);
  });

  test('every preset sample exists in the kit', () => {
    for (const name of PRESET_NAMES) {
      const m = applyPreset(name);
      for (const s of [...Object.values(m.perHeight), ...(m.byBall ?? []), m.catches.sample, m.crossAccent.downbeat]) {
        if (s !== null) expect(KIT_SAMPLES).toContain(s);
      }
    }
  });
});

describe('padHitsAt', () => {
  test('a cycle shorter than one pulse (or not a number) still rings for at least one pulse', () => {
    const on = { ...DEFAULT_MAPPING, pad: { ...DEFAULT_MAPPING.pad, on: true } };
    for (const bad of [0, -3, 0.2]) expect(padHitsAt(0, on, bad)[0]?.durationPulses).toBe(1);
    expect(padHitsAt(0, on, Number.NaN)[0]?.durationPulses).toBe(PAD_HOLD_PULSES);
    expect(padHitsAt(0, on, 12)[0]?.durationPulses).toBe(12);
  });

  const on = (chord: PadChord): Mapping => ({ ...DEFAULT_MAPPING, pad: { on: true, instrument: 'mellotron', chord } });

  test('off by default: nothing at any pulse', () => {
    expect(padHitsAt(0, DEFAULT_MAPPING)).toEqual([]);
  });

  test('on: the chord at the cycle start only', () => {
    const hits = padHitsAt(0, on('Dm9'), 12);
    expect(hits.map((h) => h.note)).toEqual(['D3', 'F3', 'A3', 'C4', 'E4']);
    expect(hits.every((h) => h.durationPulses === 12 && h.velocity === PAD_VELOCITY)).toBe(true);
    expect(padHitsAt(1, on('Dm9'))).toEqual([]);
    expect(padHitsAt(6, on('Dm9'))).toEqual([]);
  });

  test('without a cycle length the hit rings for the default hold', () => {
    expect(padHitsAt(0, on('open5'))[0]?.durationPulses).toBe(PAD_HOLD_PULSES);
  });

  test('every chord has notes', () => {
    for (const chord of PAD_CHORD_IDS) expect(padHitsAt(0, on(chord)).length).toBeGreaterThanOrEqual(3);
    expect(PAD_INSTRUMENT_IDS).toEqual(['mellotron', 'soundfont']);
  });
});

describe('filterCutoff', () => {
  test('off: wide open whatever the crossings', () => {
    expect(filterCutoff(0, DEFAULT_MAPPING)).toBe(FILTER_OPEN_HZ);
    expect(filterCutoff(9, withFilter(false, 400, 4000))).toBe(FILTER_OPEN_HZ);
  });

  test('on: low at no crossings, high at the full count and beyond', () => {
    const m = withFilter(true, 400, 6400);
    expect(filterCutoff(0, m)).toBeCloseTo(400);
    expect(filterCutoff(FILTER_FULL_CROSSINGS, m)).toBeCloseTo(6400);
    expect(filterCutoff(FILTER_FULL_CROSSINGS * 5, m)).toBeCloseTo(6400);
  });

  test('on: monotone, and log-spaced (the midpoint is the geometric mean)', () => {
    const m = withFilter(true, 400, 6400);
    let last = 0;
    for (let c = 0; c <= FILTER_FULL_CROSSINGS; c++) {
      const hz = filterCutoff(c, m);
      expect(hz).toBeGreaterThan(last);
      last = hz;
    }
    expect(filterCutoff(FILTER_FULL_CROSSINGS / 2, m)).toBeCloseTo(1600);
  });

  test('a reversed or out-of-range span is put right; junk crossings count as none', () => {
    expect(filterCutoff(0, withFilter(true, 4000, 400))).toBeCloseTo(400);
    expect(filterCutoff(0, withFilter(true, 1, 99999))).toBeCloseTo(FILTER_HZ_RANGE.min);
    expect(filterCutoff(99, withFilter(true, 1, 99999))).toBeCloseTo(FILTER_HZ_RANGE.max);
    expect(filterCutoff(-3, withFilter(true, 400, 4000))).toBeCloseTo(400);
    expect(filterCutoff(Number.NaN, withFilter(true, 400, 4000))).toBeCloseTo(400);
  });
});
