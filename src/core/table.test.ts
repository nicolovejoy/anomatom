// MATH.md §8, one test per row, on the part model. These rows are the contract; the 3:2 rows
// prove the project. A row that was "invalid" is now a faulted verdict naming the same throws and
// pulses; it still has a schedule (design §6). Below them, the worked cases of the design (§4, §5).
import { describe, expect, test } from 'vitest';
import { ballCount, judge } from './judge';
import { cycleOf, partsFromLines, partsFromOnsets, partsFromVanilla, textOf, vanillaIndex, withPhase } from './parts';
import { buildSchedule } from './schedule';
import type { Fault, Part, Parts, ThrowId } from './types';

function vanilla(text: string): Parts {
  const r = partsFromVanilla(text);
  if (!r.ok) throw new Error(`bad test pattern ${text}`);
  return r.parts;
}

function twoHands(h1: string, h2: string, a: number, b: number): Parts {
  const r = partsFromLines([h1, h2], { a, b });
  if (!r.ok) throw new Error(`bad test pattern ${h1} / ${h2}`);
  return r.parts;
}

const faultsOf = (parts: Parts): Fault[] => judge(parts).groups.flatMap((g) => g.faults);
/** A vanilla pair's throw ids as positions in the one siteswap. */
const sites = (ids: readonly ThrowId[], length: number) => ids.map((t) => vanillaIndex(t.part, t.index, length)).sort();
const line = (s: string) => [...s.replace(/ /g, '')].map((c) => c === 'x');
const throwPulses = (parts: Parts, part: number) =>
  buildSchedule(parts)
    .events.filter((e) => e.kind === 'throw' && e.part === part && e.pulse < cycleOf(parts))
    .map((e) => e.pulse);

describe('1:1 vanilla, juggleable', () => {
  test.each([
    ['3', 3, 2],
    ['441', 3, 6],
    ['531', 3, 6],
    ['51', 3, 2],
    ['5551', 4, 4],
    ['97531', 5, 10],
  ])('%s has %i balls and a %i-pulse cycle', (text, balls, cycle) => {
    const parts = vanilla(text);
    const v = judge(parts);
    expect(v.ok).toBe(true);
    // Odd digits cross, so a vanilla pair is one cross group.
    expect(v.groups).toEqual([{ parts: [0, 1], faults: [], balls }]);
    expect(cycleOf(parts)).toBe(cycle);
  });
});

describe('1:1 vanilla, fractional mean: not juggleable, and the mean is still there to show', () => {
  test.each([
    ['12', 1.5],
    ['21', 1.5],
    ['43', 3.5],
    ['4441', 3.25],
  ])('%s averages %f balls', (text, balls) => {
    const parts = vanilla(text);
    const v = judge(parts);
    expect(v.ok).toBe(false);
    expect(v.groups[0]?.balls).toBeNull();
    expect(ballCount(parts, [0, 1])).toBe(balls);
  });
});

test('432: all three throws land on the same beat', () => {
  // Landings 0+4, 1+3, 2+2 are all pulse 4, an onset of part 0 (hand 1).
  const collisions = faultsOf(vanilla('432')).filter((f) => f.kind === 'collision');
  expect(collisions[0]).toMatchObject({ kind: 'collision', part: 0, pulse: 4 });
  expect(sites((collisions[0] as Extract<Fault, { kind: 'collision' }>).throws, 3)).toEqual([0, 1, 2]);
});

test('510: the 5 and the 1 land together where the 0 is, which is no onset', () => {
  // Cycle 6: the 1 at pulse 1 and the 5 at pulse 3 both land on pulse 2, the 0 of hand 1. The 0
  // is not a throw in the part model and a collision is only ever on an onset, so each landing
  // is its own no-onset fault, naming the two throws that land there.
  type NoOnset = Extract<Fault, { kind: 'no-onset' }>;
  const off = faultsOf(vanilla('510')).filter((f): f is NoOnset => f.kind === 'no-onset' && f.part === 0);
  // Hand 1's onsets are pulses 0 and 4 (its 5 and its 1).
  expect(off.map((f) => [f.pulse % 6, f.nearestOnset])).toEqual([
    [2, 4],
    [2, 10],
  ]);
  expect(sites(off.map((f) => f.from), 3)).toEqual([0, 1]);
  expect(faultsOf(vanilla('510')).some((f) => f.kind === 'collision')).toBe(false);
});

describe('3:2, Nickmans', () => {
  test('2 / 2: two fountains on their own grids, no crossing', () => {
    const parts = twoHands('2', '2', 3, 2);
    expect(judge(parts)).toEqual({
      ok: true,
      groups: [
        { parts: [0], faults: [], balls: 2 },
        { parts: [1], faults: [], balls: 2 },
      ],
    });
    expect(buildSchedule(parts).balls).toBe(4);
    expect(cycleOf(parts)).toBe(6);
  });

  test('2x 2 2 / 2 2x: both crosses land where the other hand has no onset (pulses 4 and 9)', () => {
    const faults = faultsOf(twoHands('2x 2 2', '2 2x', 3, 2));
    expect(faults).toContainEqual({ kind: 'no-onset', from: { part: 0, index: 0 }, part: 1, pulse: 4, nearestOnset: 6 });
    expect(faults).toContainEqual({ kind: 'no-onset', from: { part: 1, index: 1 }, part: 0, pulse: 9, nearestOnset: 10 });
  });

  test('2 2x 2 / 2x 2: both crosses land on the downbeat, pulse 6', () => {
    const parts = twoHands('2 2x 2', '2x 2', 3, 2);
    expect(judge(parts)).toEqual({ ok: true, groups: [{ parts: [0, 1], faults: [], balls: 4 }] });
    expect(cycleOf(parts)).toBe(6);
    expect(buildSchedule(parts).period).toBe(18);
  });

  test('2x 2 / 2 2: period 2 on a 3-beat hand gives a 12-pulse cycle; the cross from beat 0 lands at 4', () => {
    const parts = twoHands('2x 2', '2 2', 3, 2);
    expect(cycleOf(parts)).toBe(12);
    const faults = faultsOf(parts);
    expect(faults[0]).toEqual({ kind: 'no-onset', from: { part: 0, index: 0 }, part: 1, pulse: 4, nearestOnset: 6 });
    // Fired at 0, 4, 8: the third lands at 12, an onset, and collides with hand 2's own ball there.
    expect(faults.filter((f) => f.kind === 'no-onset').map((f) => f.pulse)).toEqual([4, 8]);
    expect(faults).toContainEqual(expect.objectContaining({ kind: 'collision', part: 1, pulse: 0 }));
  });
});

describe('worked cases of the design (model-rethink.md §4, §5)', () => {
  test.each([0, 3, 9])('Clapping Music with part 2 at phase %i: cycle 12, part 2 shifted', (p) => {
    const pattern = line('xxx.xx.x.xx.');
    const parts = withPhase(partsFromOnsets([pattern, pattern], [1, 1]), 1, p, 1);
    expect(cycleOf(parts)).toBe(12);
    const s = buildSchedule(parts);
    expect(s.cycle).toBe(12);
    expect(s.verdict.ok).toBe(true);
    const base = throwPulses(parts, 0);
    expect(base).toEqual([0, 1, 2, 4, 5, 7, 9, 10]);
    expect(throwPulses(parts, 1)).toEqual(base.map((t) => (t + p) % 12).sort((a, b) => a - b));
  });

  test.each([
    [1, '3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0', 1],
    [2, '6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0', 2],
  ])('son clave at k = %i is %s, %i balls on the same five hits', (k, text, balls) => {
    const parts = partsFromOnsets([line('x..x..x...x.x...')], [1], [k]);
    expect(textOf(parts[0] as Part, parts)).toBe(text);
    const s = buildSchedule(parts);
    expect(s.balls).toBe(balls);
    expect(throwPulses(parts, 0)).toEqual([0, 3, 6, 10, 12]);
  });

  test('a hocket two ways: two one-ball parts, or one ball crossing; same sound, a different picture', () => {
    // Governor ruling 2026-10-29: kotekan telu's parts share pulses, so the interlock case is the
    // hocket `2 0` / `0 2` against `1x 0` / `0 1x`, spacing 1, both at phase 0.
    const two = twoHands('2 0', '0 2', 1, 1);
    const crossing = twoHands('1x 0', '0 1x', 1, 1);
    const a = buildSchedule(two);
    const b = buildSchedule(crossing);
    expect([a.verdict.ok, b.verdict.ok]).toEqual([true, true]);
    expect(a.verdict.groups.map((g) => g.parts)).toEqual([[0], [1]]);
    expect(b.verdict.groups.map((g) => g.parts)).toEqual([[0, 1]]);
    expect(a.balls).toBe(2);
    expect(b.balls).toBe(1);
    expect(textOf(crossing[0] as Part, crossing)).toBe('1x 0');
    const sound = (s: typeof a) => s.events.filter((e) => e.kind === 'throw' && e.pulse < s.cycle).map((e) => [e.pulse, e.part]);
    expect(sound(a)).toEqual(sound(b));
    expect(sound(a)).toEqual([
      [0, 0],
      [1, 1],
    ]);
  });

  test('3:2 with part 2 at phase 1: beats 0, 2, 4 and 1, 4 on a 6-lattice, coinciding at 4', () => {
    const parts = withPhase(partsFromOnsets([line('xxx'), line('xx')], [2, 3]), 1, 1, 1);
    expect(parts.map((p) => [p.spacing, p.phase])).toEqual([
      [2, 0],
      [3, 1],
    ]);
    expect(cycleOf(parts)).toBe(6);
    expect(throwPulses(parts, 0)).toEqual([0, 2, 4]);
    expect(throwPulses(parts, 1)).toEqual([1, 4]);
    expect(judge(parts).ok).toBe(true);
  });

  test('vanilla 531 is spacing 2, unit 1, and plays as today: 3 balls over a 6-pulse cycle', () => {
    const parts = vanilla('531');
    expect(parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 0, 1],
      [2, 1, 1],
    ]);
    const s = buildSchedule(parts);
    expect([s.cycle, s.balls]).toEqual([6, 3]);
    const heights = s.events.filter((e) => e.kind === 'throw' && e.pulse < 3).map((e) => [e.height, e.flight]);
    expect(heights).toEqual([
      [5, 5],
      [3, 3],
      [1, 1],
    ]);
  });

  test('a 16-step line with one hit at k = 1 is juggleable, one ball, one 16-beat flight (no ceiling)', () => {
    const parts = partsFromOnsets([line('x...............')], [1]);
    const s = buildSchedule(parts);
    expect(s.verdict.ok).toBe(true);
    expect(s.balls).toBe(1);
    expect(s.events.filter((e) => e.kind === 'throw')).toEqual([
      { kind: 'throw', pulse: 0, part: 0, ball: 0, height: 16, flight: 16, cross: false },
    ]);
  });
});
