// hitFor on the part model: voice per part, the fallback for a faulted group, coincidence.
import { describe, expect, test } from 'vitest';
import { buildSchedule, partsFromLines, partsFromVanilla } from '../core';
import type { Event, Parts, Schedule } from '../core';
import { applyPreset, hitFor, voiceForNewPart, withPartCount, type Mapping, type PartVoice } from './mapping';
import { MAX_MAPPING_PARTS } from '../tunables';

function lines(texts: string[], a: number, b: number): Parts {
  const r = partsFromLines(texts, { a, b });
  if (!r.ok) throw new Error(texts.join('/'));
  return r.parts;
}
function vanillaParts(text: string): Parts {
  const r = partsFromVanilla(text);
  if (!r.ok) throw new Error(text);
  return r.parts;
}

const vanilla = buildSchedule(vanillaParts('3'));
const threeTwo = buildSchedule(lines(['2 2x 2', '2x 2'], 3, 2));
const HD = applyPreset('height-drum');
const VPP = applyPreset('voice-per-part');
const voice = (m: Mapping, i: number) => m.parts[i] as PartVoice;

function throwEvent(height: number, part = 0): Event {
  return { kind: 'throw', pulse: 0, part, ball: 0, height, flight: height * 2, cross: false };
}

describe('voice per part', () => {
  test('the part picks the sound, whatever the height or the ball', () => {
    expect(hitFor(throwEvent(1, 0), VPP, vanilla)).toMatchObject({ sample: 'kick', part: 0, pan: -0.6 });
    expect(hitFor(throwEvent(9, 1), VPP, vanilla)).toMatchObject({ sample: 'snare', part: 1, pan: 0.6 });
    expect(hitFor(throwEvent(5, 1), { ...VPP, byBall: ['clave'] }, vanilla)?.sample).toBe('snare');
  });

  test('a part whose sample is none is silent, and a 0 is silent', () => {
    const quiet = { ...VPP, parts: [{ ...voice(VPP, 0), sample: null }, voice(VPP, 1)] };
    expect(hitFor(throwEvent(3, 0), quiet, vanilla)).toBeNull();
    expect(hitFor(throwEvent(0, 1), VPP, vanilla)).toBeNull();
  });

  test('a schedule with more parts than voices repeats the voices', () => {
    expect(hitFor(throwEvent(3, 2), VPP, vanilla)?.sample).toBe('kick');
    expect(hitFor(throwEvent(3, 3), VPP, vanilla)?.sample).toBe('snare');
    const one = { ...VPP, parts: [voice(VPP, 1)] };
    expect(hitFor(throwEvent(3, 0), one, vanilla)?.sample).toBe('snare');
  });

  test('catches follow the catch rule as in any preset', () => {
    const c: Event = { kind: 'catch', pulse: 4, part: 0, ball: 0, height: 2, flight: 4, cross: false };
    expect(hitFor(c, VPP, threeTwo)).toBeNull();
    expect(hitFor(c, { ...VPP, catches: { on: true, sample: 'rimshot' } }, threeTwo)).toMatchObject({ sample: 'rimshot', part: 0 });
  });
});

test('byHeight presets clamp the height to MAX_HEIGHT', () => {
  expect(hitFor(throwEvent(12), HD, vanilla)?.sample).toBe(HD.perHeight[9]);
});

describe('a faulted group (ball null)', () => {
  // 2x 2 2 against 2 2x at 3:2 has faults: its events carry no ball, and each one's height is the
  // gap to the part's next onset over its unit (model-waves.md ruling), so the height rules apply
  // with no path of their own.
  const faulted: Schedule = buildSchedule(lines(['2x 2 2', '2 2x'], 3, 2));
  const throws = faulted.events.filter((e) => e.kind === 'throw');

  test('the schedule is faulted and its throws carry no ball', () => {
    expect(faulted.verdict.ok).toBe(false);
    expect(throws.length).toBeGreaterThan(0);
    expect(throws.every((e) => e.ball === null)).toBe(true);
  });

  test('voice per part sounds every throw with its part’s voice', () => {
    for (const e of throws) expect(hitFor(e, VPP, faulted)?.sample).toBe(voice(VPP, e.part).sample);
  });

  test('a height preset still reads event.height', () => {
    for (const e of throws) {
      expect(e.height).toBeGreaterThan(0);
      expect(hitFor(e, HD, faulted)?.sample).toBe(HD.perHeight[Math.min(e.height, 9)]);
    }
  });

  test('ball to pitch has no ball to read, so it takes the height’s sound', () => {
    const bp = applyPreset('ball-pitch');
    for (const e of throws) expect(hitFor(e, bp, faulted)?.sample).toBe(bp.perHeight[Math.min(e.height, 9)]);
  });
});

test('coincidence is every part having a beat on that pulse, negative pulses included', () => {
  const c = (pulse: number): Event => ({ kind: 'catch', pulse, part: 1, ball: 0, height: 2, flight: 4, cross: true });
  for (const pulse of [6, 0, -6]) expect(hitFor(c(pulse), HD, threeTwo)?.sample).toBe('clap');
  for (const pulse of [2, -2]) expect(hitFor(c(pulse), HD, threeTwo)).toBeNull();
});

test('coincidence follows the grids’ phases', () => {
  // Vanilla: part 1 is a pulse behind, so no pulse is shared.
  const c = (pulse: number): Event => ({ kind: 'catch', pulse, part: 1, ball: 0, height: 3, flight: 3, cross: true });
  expect(vanilla.grids.map((g) => g.phase)).toEqual([0, 1]);
  for (const pulse of [0, 1, 2, 3]) expect(hitFor(c(pulse), HD, vanilla)).toBeNull();
});

describe('voices for N parts (lanes ruling 5)', () => {
  test('the rotation is kick, snare, closed hat, clap, then again with the pan mirrored', () => {
    const samples = Array.from({ length: 6 }, (_, i) => voiceForNewPart(VPP, i).sample);
    expect(samples).toEqual(['kick', 'snare', 'hihat-close', 'clap', 'kick', 'snare']);
    expect(voiceForNewPart(VPP, 0)).toEqual(voice(VPP, 0));
    expect(voiceForNewPart(VPP, 1)).toEqual(voice(VPP, 1));
    expect(voiceForNewPart(VPP, 4).pan).toBe(-voiceForNewPart(VPP, 0).pan);
    expect(voiceForNewPart({ ...VPP, parts: [] }, 2).kit).toBe('TR-808');
  });

  test('withPartCount grows with the rotation and shrinks by dropping trailing voices', () => {
    const three = withPartCount(VPP, 3);
    expect(three.parts).toHaveLength(3);
    expect(three.parts.slice(0, 2)).toEqual(VPP.parts);
    expect(voice(three, 2).sample).toBe('hihat-close');
    expect(withPartCount(three, 2)).toEqual(VPP);
    expect(withPartCount(VPP, 2)).toBe(VPP);
    expect(withPartCount(VPP, 0).parts).toHaveLength(1);
    expect(withPartCount(VPP, 99).parts).toHaveLength(MAX_MAPPING_PARTS);
    expect(withPartCount(VPP, Number.NaN)).toBe(VPP);
  });

  test('a three-part schedule plays three voices; a part past the voices still borrows safely', () => {
    const schedule = buildSchedule(lines(['3', '2', '4'], 1, 1));
    const m = withPartCount(VPP, 3);
    const hit = (part: number) => hitFor(throwEvent(1, part), m, schedule);
    expect([0, 1, 2].map((p) => hit(p)?.sample)).toEqual(['kick', 'snare', 'hihat-close']);
    expect(hitFor(throwEvent(1, 5), VPP, schedule)?.sample).toBe('snare');
  });
});
