import { expect, test } from 'vitest';
import { buildSchedule, parsePattern } from '../core/legacy';
import { ballColours } from './colours';
import type { Segment } from './types';

function sched(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return buildSchedule({ ratio: { a: 1, b: 1 }, hands: [r.pattern] });
}
const seg = (text: string, carry: [number, number][] = []): Segment => ({
  schedule: sched(text),
  startTime: 0,
  pulseLen: 1,
  endTime: null,
  carry: new Map(carry),
});
const list = (m: ReadonlyMap<number, number> | undefined) =>
  [...(m?.entries() ?? [])].sort((a, b) => a[0] - b[0]).map((e) => e[1]);

test('the first segment: a ball’s colour is its own id', () => {
  expect(list(ballColours([seg('441')])[0])).toEqual([0, 1, 2]);
});

test('no segments, no colours', () => {
  expect(ballColours([])).toEqual([]);
});

test('3 to 4: one carry-free new ball takes colour 3, not 0', () => {
  const out = ballColours([seg('3'), seg('4', [[1, 0], [2, 1], [3, 2]])]);
  expect(list(out[1])).toEqual([3, 0, 1, 2]);
});

test('3 to 51 with one ball carried: the new balls avoid every colour of the previous segment', () => {
  // 51 has 3 balls; ball 1 continues old ball 2 (colour 2). Balls 0 and 2 are new.
  const out = ballColours([seg('3'), seg('51', [[1, 2]])]);
  expect(list(out[1])).toEqual([3, 2, 4]);
});

test('colours carry through several switches; an id the previous segment never had is uncarried', () => {
  const out = ballColours([seg('3'), seg('4', [[1, 0], [2, 2]]), seg('3', [[0, 1], [1, 9]])]);
  expect(list(out[1])).toEqual([3, 0, 2, 4]);
  // Ball 0 continues the 4's ball 1 (colour 0); the others avoid {3, 0, 2, 4}.
  expect(list(out[2])).toEqual([0, 1, 5]);
});

test('with nothing carried, a new ball still avoids the previous segment’s colours', () => {
  expect(list(ballColours([seg('1'), seg('1')])[1])).toEqual([1]);
  expect(list(ballColours([seg('1'), seg('1'), seg('1')])[2])).toEqual([0]);
});
