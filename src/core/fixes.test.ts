import { describe, expect, test } from 'vitest';
import { FIXES } from '../tunables';
import { fixesFor, searchFixes } from './fixes';
import { judge } from './judge';
import { partsFromLines, partsFromOnsets, partsFromVanilla, periodOf, textOf } from './parts';
import type { Part, Parts } from './types';

function ok(r: { ok: true; parts: Parts } | { ok: false }): Parts {
  if (!r.ok) throw new Error('bad test pattern');
  return r.parts;
}
const vanilla = (text: string) => ok(partsFromVanilla(text));
const twoHands = (h1: string, h2: string, a: number, b: number) => ok(partsFromLines([h1, h2], { a, b }));
const text = (parts: Parts) => parts.map((p: Part) => textOf(p, parts)).join(' / ');
const v = (parts: Parts) => textOf(parts[0] as Part, parts);
const both = [0, 1];

describe('a fractional ball count gets the one-digit change that makes it whole', () => {
  test.each([
    ['12', '22'],
    ['21', '31'],
    ['43', '53'],
    ['4441', '3441'],
  ])('%s → %s first', (input, first) => {
    const { fixes, digits } = searchFixes(vanilla(input), both);
    // One digit, in place: the search's own sequence keeps the written length.
    expect(digits[0]?.[0]?.map((d) => d.digit).join('')).toBe(first);
    expect(v(fixes[0] as Parts)).toBe(v(vanilla(first)));
    expect(judge(fixes[0] as Parts).ok).toBe(true);
  });

  test('12: raising beats lowering at the same position (22 before 02)', () => {
    // 22 is the cascade 2 written twice; 02 stays 02.
    const offered = fixesFor(vanilla('12'), both).map(v);
    expect(offered[0]).toBe('2');
    expect(offered.indexOf('2')).toBeLessThan(offered.indexOf('02'));
  });
});

describe('collisions get nearby juggleable patterns', () => {
  test('432: the nearest is a deletion, 42', () => {
    const offered = fixesFor(vanilla('432'), both).map(v);
    expect(offered).toHaveLength(3);
    expect(offered[0]).toBe('42');
  });

  test('2x 2 2 / 2 2x at 3:2: toggling both crosses gives 2 2 2 / 2 2', () => {
    const offered = fixesFor(twoHands('2x 2 2', '2 2x', 3, 2), both).map(text);
    expect(offered).toContain('2 2 2 / 2 2');
  });

  test('three parts: a destination may move to any other part', () => {
    // Part 1 throws a 1-beat cross into part 3, which part 3's own throw already fills.
    const parts = ok(partsFromLines(['1x3', '1', '1'], { a: 1, b: 1 }));
    expect(judge(parts).ok).toBe(false);
    const offered = fixesFor(parts, [0, 2]);
    expect(offered.length).toBeGreaterThan(0);
    for (const f of offered) expect(judge(f).ok).toBe(true);
    expect(offered.map(text)[0]).toBe('1 / 1 / 1');
  });
});

describe('every offered fix is juggleable', () => {
  const cases: Parts[] = [
    ...['12', '43', '432', '510', '3333332', '97530', '6240', '54'].map(vanilla),
    twoHands('2x 2', '2 2', 3, 2),
    twoHands('2 2x 2', '2 2', 3, 2),
    twoHands('3x', '3', 4, 3),
  ];
  test.each(cases.map((c) => [text(c), c] as const))('%s', (_, parts) => {
    const offered = fixesFor(parts, both);
    expect(offered.length).toBeGreaterThan(0);
    expect(offered.length).toBeLessThanOrEqual(FIXES.count);
    for (const f of offered) expect(judge(f).ok).toBe(true);
    expect(new Set(offered.map(text)).size).toBe(offered.length);
  });
});

test('a fault-free group gets no fixes, even when another group has faults', () => {
  expect(fixesFor(vanilla('441'), both)).toEqual([]);
  const mixed = twoHands('1 3 2', '2', 3, 2);
  expect(fixesFor(mixed, [1])).toEqual([]);
  expect(fixesFor(mixed, [0]).length).toBeGreaterThan(0);
});

test('default parts in the group are left alone', () => {
  // Part 2 is a default part; only part 1's manual throws are edited.
  const parts: Parts = [...twoHands('2x 2', '2', 1, 1).slice(0, 1), ...partsFromOnsets([[true, true]], [1])];
  const offered = fixesFor(parts, both);
  expect(offered.length).toBeGreaterThan(0);
  for (const f of offered) expect(f[1]).toBe(parts[1]);
});

test('the budget is work: a candidate costs its cycle, or its digits when the count is fractional', () => {
  expect(searchFixes(vanilla('12'), both, { count: 1, budget: 1e6 }).work).toBe(2);
  expect(searchFixes(vanilla('432'), both, { count: 3, budget: 3 })).toMatchObject({ fixes: [], work: 3 });
  expect(fixesFor(vanilla('432'), both, { count: 3, budget: 200 }).map(v)).toEqual(['42']);
  expect(searchFixes(vanilla('441'), both).work).toBe(0);
  expect(searchFixes(vanilla('12'), both, { count: 1, budget: 1 })).toMatchObject({ fixes: [], work: 0 });
});

test('with room for more, the search runs to its end', () => {
  const all = fixesFor(vanilla('12'), both, { count: 1000, budget: 1e6 });
  expect(all.length).toBeGreaterThan(3);
  expect(all.every((f) => judge(f).ok)).toBe(true);
  // A single digit is never deleted; a full-length sequence is never lengthened.
  for (const f of fixesFor(twoHands('5', '2', 3, 2), both)) expect(f.every((p) => periodOf(p) > 0)).toBe(true);
  for (const f of fixesFor(vanilla('4444444444444443'), both)) expect(v(f).length).toBeLessThanOrEqual(16);
});
