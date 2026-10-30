import { describe, expect, test } from 'vitest';
import type { Schedule } from '../core';
import { DEFAULT_MAPPING, LANES_UI } from '../tunables';
import { copy } from '../ui/copy';
import { partColour } from '../view/colours';
import type { PlayerView, Segment } from '../view/types';
import { cellColumns, focusAfterAdd, focusAfterRemove, laneDot, playheadSteps, ratioChipsShown, voiceName } from './lanes-view';

describe('laneDot', () => {
  test('no dot at one or two lanes; the part colour from three', () => {
    expect(laneDot(0, 1)).toBeNull();
    expect(laneDot(1, 2)).toBeNull();
    expect(LANES_UI.dotsFromLanes).toBe(3);
    expect(laneDot(0, 3)).toBe(partColour(0));
    expect(laneDot(3, 4)).toBe(partColour(3));
  });
});

test('the ratio chips show at exactly two lanes', () => {
  expect([1, 2, 3, 4].map(ratioChipsShown)).toEqual([false, true, false, false]);
});

describe('voiceName', () => {
  test('a voice per part: the part’s own sound, by the Sound tab’s name', () => {
    const m = { ...DEFAULT_MAPPING, byHeight: false, byBall: null };
    const sample = m.parts[0]?.sample as string;
    expect(voiceName(m, 0)).toBe(copy.sampleNames[sample]);
  });
  test('a sound the names do not know shows as itself; none, and a missing part, as None', () => {
    const base = { ...DEFAULT_MAPPING, byHeight: false, byBall: null };
    const voice = base.parts[0] as (typeof base.parts)[number];
    expect(voiceName({ ...base, parts: [{ ...voice, sample: 'gong' }] }, 0)).toBe('gong');
    expect(voiceName({ ...base, parts: [{ ...voice, sample: null }] }, 0)).toBe(copy.noSample);
    expect(voiceName({ ...base, parts: [] }, 2)).toBe(copy.noSample);
  });
  test('a mapping that reads height or ball says so', () => {
    expect(voiceName({ ...DEFAULT_MAPPING, byHeight: true, byBall: null }, 0)).toBe(copy.voiceByHeight);
    expect(voiceName({ ...DEFAULT_MAPPING, byHeight: true, byBall: ['C4'] }, 0)).toBe(copy.voiceByBall);
  });
});

test('cell columns: clamp(4, steps, 8) on a phone; the whole period, at least 4, on a wide column', () => {
  expect([LANES_UI.minColumns, LANES_UI.phoneColumns]).toEqual([4, 8]);
  expect([1, 3, 4, 5, 8, 12, 16].map((n) => cellColumns(n, false))).toEqual([4, 4, 4, 5, 8, 8, 8]);
  expect([1, 3, 5, 8, 12, 16].map((n) => cellColumns(n, true))).toEqual([4, 4, 5, 8, 12, 16]);
});

test('focus after remove: the lane above, or Add when the first lane went', () => {
  expect(focusAfterRemove(2)).toBe(1);
  expect(focusAfterRemove(0)).toBe('add');
});

test('focus after add: stays on Add while it applies; the newest lane once Add disables', () => {
  expect(focusAfterAdd(3, true)).toBeNull();
  expect(focusAfterAdd(4, false)).toBe(3);
});

describe('playheadSteps', () => {
  /** Two grids on a 12-pulse cycle: spacing 4 (3 steps) at phase 0, spacing 3 (4 steps) at phase 1. */
  const schedule = { cycle: 12, grids: [{ spacing: 4, phase: 0 }, { spacing: 3, phase: 1 }] } as unknown as Schedule;
  const seg = (startTime: number, endTime: number | null): Segment => ({ schedule, startTime, pulseLen: 0.1, endTime, carry: new Map() });
  const view = (now: number, state: PlayerView['state'] = 'playing', segments = [seg(0, null)]): PlayerView => ({
    now,
    state,
    segments,
    pending: false,
  });

  test('null in every lane unless playing', () => {
    expect(playheadSteps(view(0.5, 'paused'), [3, 4])).toEqual([null, null]);
    expect(playheadSteps(view(0.5, 'stopped'), [3, 4])).toEqual([null, null]);
    expect(playheadSteps(view(0.5, 'playing', []), [3, 4])).toEqual([null, null]);
  });
  test('the beat each pulse falls in, from the lane’s phase, wrapping over the cycle', () => {
    // Pulse 0: lane 1 on step 0; lane 2 (phase 1) still in its last step.
    expect(playheadSteps(view(0), [3, 4])).toEqual([0, 3]);
    // Pulse 5: lane 1's step 1 (pulses 4-7); lane 2's step 1 (pulses 4-6).
    expect(playheadSteps(view(0.55), [3, 4])).toEqual([1, 1]);
    // Pulse 13 is pulse 1 of the next cycle.
    expect(playheadSteps(view(1.35), [3, 4])).toEqual([0, 0]);
  });
  test('read from the sounding segment; a lane it has no grid for is null', () => {
    const later = { ...seg(1.2, null), schedule: { ...schedule, grids: [{ spacing: 4, phase: 2 }] } as unknown as Schedule };
    expect(playheadSteps(view(0.55, 'playing', [seg(0, 1.2), later]), [3, 4])).toEqual([1, 1]);
    expect(playheadSteps(view(1.2, 'playing', [seg(0, 1.2), later]), [3, 4])).toEqual([2, null]);
    // Before a segment's start, its pulse 0.
    expect(playheadSteps(view(1, 'playing', [later]), [3])).toEqual([2]);
  });
});
