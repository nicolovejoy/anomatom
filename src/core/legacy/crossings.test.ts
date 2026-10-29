import { expect, test } from 'vitest';
import { countCrossings } from './crossings';
import { flightsOf } from './flights';
import { cycleLength } from './grid';
import { parsePattern } from './parse';
import type { PatternInput } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

function crossings(input: PatternInput) {
  return countCrossings(flightsOf(input), cycleLength(input));
}

test('cascade 3: every throw is crossed by the two launched before it lands', () => {
  // Period 1, cycle 2 pulses: two flights per cycle, each crossing two later arcs.
  expect(crossings({ ratio: { a: 1, b: 1 }, hands: [pat('3')] })).toBe(4);
});

test('shower 51', () => {
  // 0->5 is crossed by 2->7 and 4->9; 1->2 by nothing.
  expect(crossings({ ratio: { a: 1, b: 1 }, hands: [pat('51')] })).toBe(2);
});

test('2 / 2 at 3:2', () => {
  // Hand 1 arcs 0->4, 2->6, 4->8; hand 2 arcs 0->6, 3->9. Pairs with s1<s2<e1<e2, counting
  // the next cycle's arcs as needed: 0->4: {2->6, 3->9}; 2->6: {3->9, 4->8}; 4->8: {6->10, 6->12};
  // 0->6: {3->9, 4->8}; 3->9: {6->10, 6->12, 8->12}. Total 11.
  expect(crossings({ ratio: { a: 3, b: 2 }, hands: [pat('2'), pat('2')] })).toBe(11);
});

test('holds and empties never cross: 20 has none', () => {
  expect(crossings({ ratio: { a: 1, b: 1 }, hands: [pat('20')] })).toBe(0);
});
