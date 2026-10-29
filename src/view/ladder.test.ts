import { expect, test } from 'vitest';
import { buildSchedule, parsePattern } from '../core';
import type { PatternInput } from '../core';
import { ladderFrame } from './ladder';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}
const vanilla = (text: string): PatternInput => ({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });
const view = { windowPulses: 12, playheadFraction: 0.25 };

test('the window is placed around the playhead', () => {
  const f = ladderFrame(buildSchedule(vanilla('3')), 10, view);
  expect(f.start).toBe(7);
  expect(f.playhead).toBe(3);
  expect(f.windowPulses).toBe(12);
});

test('bars: one per flight crossing the window, in window coordinates, with hand and ball', () => {
  // 3 is period 1, cycle 2, period 6: a 3-pulse flight from every pulse, alternating hands.
  const f = ladderFrame(buildSchedule(vanilla('3')), 0, view);
  // Window is [-3, 9). Flights launched at -5 .. 8 overlap it; those before 0 never happened.
  const launches = f.bars.map((b) => b.x0 + f.start).sort((a, b) => a - b);
  expect(launches).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const first = f.bars.find((b) => b.x0 + f.start === 0);
  expect(first).toMatchObject({ x0: 3, x1: 6, from: 0, to: 1, cross: true, height: 3 });
  const ids = new Set(f.bars.map((b) => b.ball));
  expect(ids.size).toBe(3);
});

test('ball ids follow the period: the same throw two periods on has the same ball', () => {
  const s = buildSchedule(vanilla('441'));
  const a = ladderFrame(s, 0, { windowPulses: 6, playheadFraction: 0 });
  const b = ladderFrame(s, 36, { windowPulses: 6, playheadFraction: 0 });
  // Only flights launched inside the window: at position 0 nothing overhangs from before.
  const key = (f: typeof a) => f.bars.filter((x) => x.x0 >= 0).map((x) => [x.x0, x.ball]).sort();
  expect(key(b)).toEqual(key(a));
});

test('ticks mark both grids and the coincident pulses weigh more', () => {
  const s = buildSchedule({ ratio: { a: 3, b: 2 }, hands: [pat('2'), pat('2')] });
  const f = ladderFrame(s, 0, { windowPulses: 7, playheadFraction: 0 });
  const at = (hand: 0 | 1) => f.ticks.filter((t) => t.hand === hand).map((t) => [t.x, t.coincident]);
  expect(at(0)).toEqual([
    [0, true],
    [2, false],
    [4, false],
    [6, true],
  ]);
  expect(at(1)).toEqual([
    [0, true],
    [3, false],
    [6, true],
  ]);
});

test('vanilla ticks alternate hands and nothing is coincident', () => {
  const f = ladderFrame(buildSchedule(vanilla('3')), 0, { windowPulses: 4, playheadFraction: 0 });
  expect(f.ticks.map((t) => [t.hand, t.x, t.coincident])).toEqual([
    [0, 0, false],
    [1, 1, false],
    [0, 2, false],
    [1, 3, false],
  ]);
});

test('a line at each cycle start inside the window, none before playback started', () => {
  const s = buildSchedule(vanilla('441')); // cycle 6
  expect(ladderFrame(s, 0, view).cycleLines).toEqual([3, 9]); // pulses 0 and 6 at x = 3 and 9
  expect(ladderFrame(s, 13, { windowPulses: 12, playheadFraction: 0.5 }).cycleLines).toEqual([5, 11]);
});

test('a window entirely before the start is empty of bars', () => {
  const f = ladderFrame(buildSchedule(vanilla('3')), -20, view);
  expect(f.bars).toEqual([]);
  expect(f.cycleLines).toEqual([]);
});

test('a flight that lands exactly at the window start is not drawn; one landing inside is', () => {
  // 3 at 1:1, window starting at pulse 7: the throw at 4 lands at 7 (out), the one at 5 lands at 8 (in).
  const f = ladderFrame(buildSchedule(vanilla('3')), 10, view);
  const overhang = f.bars.filter((b) => b.x0 < 0).map((b) => b.x0 + f.start).sort((a, b) => a - b);
  expect(overhang).toEqual([5, 6]);
});
