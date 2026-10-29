import { describe, expect, test } from 'vitest';
import { flightsOf } from './flights';
import { crossGroups, judge } from './judge';
import { partsFromLines, partsFromOnsets, partsFromVanilla } from './parts';
import { buildSchedule } from './schedule';
import type { Event, Parts, Schedule } from './types';

function vanilla(text: string): Parts {
  const r = partsFromVanilla(text);
  if (!r.ok) throw new Error(text);
  return r.parts;
}
function lines(texts: string[], a: number, b: number): Parts {
  const r = partsFromLines(texts, { a, b });
  if (!r.ok) throw new Error(texts.join('/'));
  return r.parts;
}
const throwsOf = (s: Schedule): Event[] => s.events.filter((e) => e.kind === 'throw');

describe('fault-free schedules, as today', () => {
  test('441: one orbit carries all three balls, so the period is three cycles', () => {
    const s = buildSchedule(vanilla('441'));
    expect([s.cycle, s.period, s.balls]).toEqual([6, 18, 3]);
    expect(new Set(s.events.map((e) => e.ball)).size).toBe(3);
    expect(throwsOf(s)).toHaveLength(18);
    // A ball caught on a pulse is the ball thrown from that part on that pulse.
    for (const c of s.events.filter((e) => e.kind === 'catch')) {
      const next = throwsOf(s).find((t) => t.part === c.part && t.pulse === c.pulse % s.period);
      expect(next?.ball).toBe(c.ball);
    }
  });

  test('events are sorted by pulse, catches before throws, then by part', () => {
    const s = buildSchedule(lines(['2 2x 2', '2x 2'], 3, 2));
    const keys = s.events.map((e) => e.pulse * 4 + (e.kind === 'catch' ? 0 : 2) + e.part);
    expect(keys).toEqual([...keys].sort((a, b) => a - b));
    expect(s.grids).toEqual([
      { spacing: 2, phase: 0 },
      { spacing: 3, phase: 0 },
    ]);
    const crosses = throwsOf(s).filter((t) => t.cross && t.pulse < s.cycle);
    expect(crosses.map((t) => [t.part, t.pulse, t.pulse + t.flight, t.height])).toEqual([
      [1, 0, 6, 2],
      [0, 2, 6, 2],
    ]);
  });

  test('zeros are not onsets and have no events: 501 has two balls', () => {
    const s = buildSchedule(vanilla('501'));
    expect([s.balls, s.period]).toEqual([2, 6]);
    expect(throwsOf(s)).toHaveLength(4);
  });

  test('a part with no onsets has no events and no balls', () => {
    const s = buildSchedule(partsFromOnsets([[false, false]], [1]));
    expect([s.events, s.balls, s.period, s.verdict.ok]).toEqual([[], 0, 2, true]);
  });
});

describe('faulted groups still sound (design §6)', () => {
  test('432: every onset has a throw, no ball ids, flights are the gap to the next onset', () => {
    const s = buildSchedule(vanilla('432'));
    expect(s.verdict.ok).toBe(false);
    expect(s.balls).toBe(0);
    expect(s.period).toBe(s.cycle);
    const throws = throwsOf(s);
    expect(throws.map((t) => t.pulse)).toEqual([0, 1, 2, 3, 4, 5]);
    for (const t of throws) {
      expect(t).toMatchObject({ ball: null, flight: 2, height: 2, cross: false });
      expect(s.events).toContainEqual({ ...t, kind: 'catch', pulse: t.pulse + 2 });
    }
  });

  test('a broken group keeps no ball ids; another group keeps its balls', () => {
    // Hand 1 alone collides (132 on its grid); hand 2 is a lone 3-cascade on its own grid, k = 3.
    const broken = lines(['1 3 2'], 1, 1).concat(partsFromOnsets([[true]], [1], [3]));
    expect(crossGroups(broken)).toEqual([[0], [1]]);
    const s = buildSchedule(broken);
    expect(s.verdict.groups.map((g) => g.balls)).toEqual([null, 3]);
    expect(s.balls).toBe(3);
    // Three one-ball orbits: the period is one cycle.
    expect(s.period).toBe(s.cycle);
    expect(throwsOf(s).filter((t) => t.part === 0).every((t) => t.ball === null)).toBe(true);
    expect(throwsOf(s).filter((t) => t.part === 1).every((t) => t.ball !== null)).toBe(true);
  });

  test('a faulted part with one onset per cycle flies a whole cycle', () => {
    // A cross into a part that has no onsets: no-onset in part 2, unfed in part 1.
    const parts: Parts = [
      { spacing: 1, phase: 0, unit: 1, flights: { kind: 'manual', throws: [{ height: 2, to: 1 }, { height: 0, to: null }] } },
      { spacing: 1, phase: 0, unit: 1, flights: { kind: 'default', onsets: [false, false], k: 1 } },
    ];
    const v = judge(parts);
    expect(v.groups[0]?.faults).toEqual([
      { kind: 'no-onset', from: { part: 0, index: 0 }, part: 1, pulse: 2, nearestOnset: 2 },
      { kind: 'unfed', part: 0, pulse: 0 },
    ]);
    const s = buildSchedule(parts);
    expect(throwsOf(s)).toEqual([{ kind: 'throw', pulse: 0, part: 0, ball: null, height: 2, flight: 2, cross: false }]);
  });
});

test('flightsOf: phase moves launches, which stay within the cycle, sorted by launch then part', () => {
  const parts: Parts = [
    { spacing: 2, phase: 3, unit: 2, flights: { kind: 'default', onsets: [true, false], k: 1 } },
    { spacing: 1, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } },
  ];
  const f = flightsOf(parts);
  // Part 1's beats fall at pulses 1 and 3; pulse 3 is beat 0 of its pattern, its one onset.
  expect(f.filter((x) => x.from === 0)).toEqual([
    { id: { part: 0, index: 0 }, from: 0, to: 0, beat: 1, cross: false, launch: 3, land: 7 },
  ]);
  expect(f.map((x) => x.launch)).toEqual([0, 1, 2, 3, 3]);
});
