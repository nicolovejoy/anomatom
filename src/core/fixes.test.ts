import { describe, expect, test } from 'vitest';
import { FIXES } from '../tunables';
import { fixesFor, searchFixes } from './fixes';
import { parsePattern } from './parse';
import { validate } from './validate';
import type { HandPattern, PatternInput, ValidationError } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}
const vanilla = (text: string): PatternInput => ({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });
const twoHands = (h1: string, h2: string, a: number, b: number): PatternInput => ({
  ratio: { a, b },
  hands: [pat(h1), pat(h2)],
});
const text = (h: HandPattern) => h.map((t) => `${t.height}${t.cross ? 'x' : ''}`).join('');
const errorsOf = (input: PatternInput): readonly ValidationError[] => {
  const v = validate(input);
  return v.ok ? [] : v.errors;
};
const fixes = (input: PatternInput) => fixesFor(input, errorsOf(input));

describe('a fractional ball count gets the one-digit change that makes it whole (SPEC §7.2)', () => {
  test.each([
    ['12', '22'],
    ['21', '31'],
    ['43', '53'],
    ['4441', '3441'],
  ])('%s → %s first', (input, first) => {
    const offered = fixes(vanilla(input));
    expect(offered.length).toBeGreaterThan(0);
    const [fix] = offered;
    expect(text(fix!.hands[0]!)).toBe(first);
    // One digit, in place.
    expect(fix!.hands[0]).toHaveLength(input.length);
    expect([...input].filter((c, i) => c !== first[i])).toHaveLength(1);
    expect(validate(fix!).ok).toBe(true);
  });

  test('12: raising beats lowering at the same position (22 before 02)', () => {
    const offered = fixes(vanilla('12')).map((f) => text(f.hands[0]!));
    expect(offered[0]).toBe('22');
    expect(offered).toContain('02');
    expect(offered.indexOf('22')).toBeLessThan(offered.indexOf('02'));
  });
});

describe('collisions get nearby valid patterns, never a swap (SPEC §7.2)', () => {
  test('432: up to three fixes, each valid, the nearest first (a deletion, then two-digit changes)', () => {
    const offered = fixes(vanilla('432')).map((f) => text(f.hands[0]!));
    expect(offered).toHaveLength(3);
    // No one-digit substitution of 432 is valid; deleting the 3 gives the four-ball 42.
    expect(offered[0]).toBe('42');
  });

  test('510: the shower 51 is one deletion away', () => {
    const offered = fixes(vanilla('510')).map((f) => text(f.hands[0]!));
    expect(offered).toHaveLength(3);
    expect(offered).toContain('51');
  });

  test('2x 2 2 / 2 2x at 3:2: two off-grid crosses need two edits; toggling both x gives 2 2 2 / 2 2', () => {
    const offered = fixes(twoHands('2x 2 2', '2 2x', 3, 2));
    expect(offered.length).toBeGreaterThan(0);
    for (const f of offered) expect(f.ratio).toEqual({ a: 3, b: 2 });
    expect(offered.map((f) => `${text(f.hands[0]!)}/${text(f.hands[1]!)}`)).toContain('222/22');
  });
});

describe('every offered fix validates (MATH.md §8 cases and more)', () => {
  const cases: PatternInput[] = [
    ...['12', '21', '43', '4441', '432', '510', '3333332', '97530', '6240', '54'].map(vanilla),
    twoHands('2x 2 2', '2 2x', 3, 2),
    twoHands('2x 2', '2 2', 3, 2),
    twoHands('2 2x 2', '2 2', 3, 2),
    twoHands('2x 2 2', '2', 3, 2),
    twoHands('3x 3', '2', 3, 2),
    twoHands('3x', '3', 4, 3),
  ];
  test.each(cases.map((c) => [`${c.hands.map(text).join(' / ')} at ${c.ratio.a}:${c.ratio.b}`, c] as const))(
    '%s',
    (_, input) => {
      expect(validate(input).ok).toBe(false);
      const offered = fixes(input);
      expect(offered.length).toBeGreaterThan(0);
      expect(offered.length).toBeLessThanOrEqual(3);
      for (const f of offered) {
        expect(validate(f).ok).toBe(true);
        expect(f.ratio).toBe(input.ratio);
      }
      // No fix is offered twice.
      const keys = offered.map((f) => f.hands.map(text).join('/'));
      expect(new Set(keys).size).toBe(keys.length);
    },
  );
});

test('a valid pattern gets no fixes', () => {
  expect(fixesFor(vanilla('441'), [])).toEqual([]);
});

test('at 1:1 the second box is passed through untouched', () => {
  const input: PatternInput = { ratio: { a: 1, b: 1 }, hands: [pat('12'), pat('2')] };
  const [fix] = fixesFor(input, errorsOf(input));
  expect(fix?.hands[1]).toBe(input.hands[1]);
});

test('the budget stops the search with what it has', () => {
  // 432 has no valid one-digit substitution; one candidate's work is not enough to find anything.
  expect(fixesFor(vanilla('432'), errorsOf(vanilla('432')), { count: 3, budget: 3 })).toEqual([]);
  // A budget that runs out during the two-digit search keeps the deletion found before it.
  // 432's search finds 42 after 106 pulses of work and the next fix after 273, so 200 ends
  // between them.
  const few = fixesFor(vanilla('432'), errorsOf(vanilla('432')), { count: 3, budget: 200 });
  expect(few.map((f) => text(f.hands[0]!))).toEqual(['42']);
});

test('with room for more, the search runs to its end and every pattern it finds is valid', () => {
  const all = fixesFor(vanilla('12'), errorsOf(vanilla('12')), { count: 1000, budget: 1e6 });
  expect(all.length).toBeGreaterThan(3);
  expect(all.every((f) => validate(f).ok)).toBe(true);
  expect(text(all[0]!.hands[0]!)).toBe('22');
});

test('a single digit is never deleted, and a full-length pattern is never lengthened', () => {
  // 7 alone at 1:1 is fine; 5 / 2 at 3:2 with a one-digit hand exercises "never delete the last".
  const offered = fixes(twoHands('5', '2', 3, 2));
  for (const f of offered) {
    expect(f.hands[0]!.length).toBeGreaterThan(0);
    expect(f.hands[1]!.length).toBeGreaterThan(0);
  }
  const long = vanilla('4444444444444443'); // 16 digits, the most a hand takes
  for (const f of fixes(long)) expect(f.hands[0]!.length).toBeLessThanOrEqual(16);
});

describe('the budget is work, not candidates (PR 16 review)', () => {
  // 9:8, two 16-digit hands with crosses: the typeable worst case. Its cycle is 1152 pulses, a
  // deletion's up to 17,280, and no fix is near, so a budget of candidates ran for most of a second.
  const worst = twoHands('7x 5 6 5 9 3 3 2 9 5x 0 8 5 2 5 4x', '9 5 1 7 7 5 3 2 0 1 3 2 6 7 0 8x', 9, 8);

  test('the worst case stops within the budget, and whatever it offers validates', () => {
    const { fixes: offered, work } = searchFixes(worst, errorsOf(worst));
    expect(work).toBeGreaterThan(0);
    expect(work).toBeLessThanOrEqual(FIXES.budget);
    for (const f of offered) expect(validate(f).ok).toBe(true);
  });

  test('a whole-count candidate costs its cycle; a fractional one its digits', () => {
    // 12: the first candidate, 22, has a whole count; at 1:1 its cycle is 2 pulses.
    expect(searchFixes(vanilla('12'), errorsOf(vanilla('12')), { count: 1, budget: 1e6 }).work).toBe(2);
    // 432: its first candidate, 433, is fractional: three digits.
    expect(searchFixes(vanilla('432'), errorsOf(vanilla('432')), { count: 3, budget: 3 }).work).toBe(3);
  });

  test('a candidate that would overrun the budget is not validated', () => {
    expect(searchFixes(vanilla('12'), errorsOf(vanilla('12')), { count: 1, budget: 1 })).toEqual({
      fixes: [],
      work: 0,
    });
  });
});
