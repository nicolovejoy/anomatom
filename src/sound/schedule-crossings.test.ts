import { expect, test } from 'vitest';
import { buildSchedule, countCrossings, flightsOf, partsFromLines, partsFromVanilla } from '../core';
import type { Parts } from '../core';
import { crossingsOfSchedule } from './schedule-crossings';

function input(text: string[], a = 1, b = 1): Parts {
  const r = a === 1 && b === 1 ? partsFromVanilla(text[0] as string) : partsFromLines(text, { a, b });
  if (!r.ok) throw new Error(text.join('/'));
  return r.parts;
}

test.each([
  [['3'], 1, 1],
  [['441'], 1, 1],
  [['531'], 1, 1],
  [['97531'], 1, 1],
  [['2 2x 2', '2x 2'], 3, 2],
  [['50505'], 1, 1],
])('matches countCrossings over the pattern’s own flights: %j at %i:%i', (text, a, b) => {
  const pattern = input(text, a, b);
  const schedule = buildSchedule(pattern);
  expect(crossingsOfSchedule(schedule)).toBe(countCrossings(flightsOf(pattern), schedule.cycle));
});

test('a pattern of no arcs has none, 441 has some, and the answer is remembered', () => {
  expect(crossingsOfSchedule(buildSchedule(input(['0'])))).toBe(0);
  const s = buildSchedule(input(['441']));
  expect(crossingsOfSchedule(s)).toBeGreaterThan(0);
  expect(crossingsOfSchedule(s)).toBe(crossingsOfSchedule(s));
});
