import { describe, expect, test } from 'vitest';
import { buildSchedule, partsFromVanilla } from '../core';
import type { Event, Parts } from '../core';
import {
  FILTER_FULL_CROSSINGS,
  FILTER_HZ_RANGE,
  FILTER_OPEN_HZ,
  KIT_SAMPLES,
  PAD_CHORDS,
  PAD_HOLD_PULSES,
  PAD_VELOCITY,
} from '../tunables';
import { BALL_PITCH, HEIGHT_PITCH, VOICE_PER_PART as DEFAULT_MAPPING } from '../test/mappings';
import { LISTENS, mappingOf } from './drummers';
import { filterCutoff, hitFor, padHitsAt, type Mapping, type PadChord } from './mapping';

const vanilla = buildSchedule((partsFromVanilla('3') as { parts: Parts }).parts);

function throwEvent(height: number, ball = 0): Event {
  return { kind: 'throw', pulse: 0, part: 0, to: 0, ball, height, flight: height * 2, cross: false };
}

const withFilter = (on: boolean, low: number, high: number): Mapping => ({
  ...DEFAULT_MAPPING,
  filter: { on, low, high },
});

describe('the listen rules', () => {
  test('height to pitch gives nine distinct sounds, the highest throw the lowest', () => {
    const m = HEIGHT_PITCH;
    const names = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((h) => hitFor(throwEvent(h), m, vanilla)?.sample);
    expect(new Set(names).size).toBe(9);
    expect(names[8]).toBe('kick');
  });

  test('ball to pitch: the ball picks the sound, whatever the height, wrapping around', () => {
    const m = BALL_PITCH;
    const byBall = m.byBall ?? [];
    expect(hitFor(throwEvent(3, 0), m, vanilla)?.sample).toBe(byBall[0]);
    expect(hitFor(throwEvent(7, 0), m, vanilla)?.sample).toBe(byBall[0]);
    expect(hitFor(throwEvent(3, 2), m, vanilla)?.sample).toBe(byBall[2]);
    expect(hitFor(throwEvent(3, byBall.length + 1), m, vanilla)?.sample).toBe(byBall[1]);
    expect(hitFor(throwEvent(0, 1), m, vanilla)).toBeNull();
    // An empty list falls back to the height rule.
    expect(hitFor(throwEvent(4, 1), { ...m, byBall: [] }, vanilla)?.sample).toBe(m.perHeight[4]);
  });

  test('every sample a rule or a switch plays exists in the kit', () => {
    for (const listen of LISTENS) {
      const m = mappingOf(listen, { catches: true, downbeat: true, pad: true }, 0, 2);
      for (const s of [...Object.values(m.perHeight), ...(m.byBall ?? []), ...m.parts.map((v) => v.sample), m.catches.sample, m.crossAccent.downbeat]) {
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
    for (const chord of Object.keys(PAD_CHORDS) as PadChord[]) expect(padHitsAt(0, on(chord)).length).toBeGreaterThanOrEqual(3);
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
