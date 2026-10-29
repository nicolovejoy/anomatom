import { expect, test } from 'vitest';
import { carryOver } from './carry';
import { parsePattern } from './parse';
import { buildSchedule } from './schedule';
import type { PatternInput, Schedule } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}
const vanilla = (text: string): Schedule => buildSchedule({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });
const twoHands = (h1: string, h2: string, a: number, b: number): Schedule =>
  buildSchedule({ ratio: { a, b }, hands: [pat(h1), pat(h2)] } satisfies PatternInput);

/** Each new ball's first throw, as (pulse, hand). */
function firstThrows(s: Schedule) {
  const out = new Map<number, { pulse: number; hand: number }>();
  for (const e of s.events) if (e.kind === 'throw' && !out.has(e.ball)) out.set(e.ball, { pulse: e.pulse, hand: e.hand });
  return out;
}

const isOneToOne = (m: Map<number, number>) => new Set(m.values()).size === m.size;

test('3 → 441 at a shared ground state: every ball carries, the one landing exactly at B too', () => {
  const three = vanilla('3');
  const next = vanilla('441');
  const B = 6;
  const carry = carryOver(three, next, B);
  expect(carry.size).toBe(3);
  expect(isOneToOne(carry)).toBe(true);
  // 3's flight launched at 3 lands exactly at B = 6, into hand 1 (pulse 6 is hand 1's): it is
  // the ball 441 throws first, at pulse 0.
  const atB = three.events.find((e) => e.kind === 'throw' && e.pulse === 3);
  const firstAt0 = [...firstThrows(next)].find(([, t]) => t.pulse === 0)?.[0];
  expect(carry.get(firstAt0 as number)).toBe(atB?.ball);
  // Same as the ladder's hand-built switch (src/view/ladder.test.ts).
  expect(carry).toEqual(
    new Map([
      [0, 0],
      [1, 2],
      [2, 1],
    ]),
  );
});

test('a tempo change between two 3s carries every ball to itself', () => {
  const three = vanilla('3');
  // The schedule is the same; only the pulse length changes, which carryOver never sees.
  for (const B of [4, 6, 8, 12]) {
    const carry = carryOver(three, three, B);
    expect(carry.size).toBe(3);
    expect(isOneToOne(carry)).toBe(true);
  }
  // At B = 2 only the throws at 0 and 1 have happened; the third ball waits in hand 1 for its
  // first throw at pulse 2 and continues the ball thrown at new pulse 0.
  expect(carryOver(three, three, 2).size).toBe(3);
  expect(carryOver(three, three, 6)).toEqual(
    new Map([
      [0, 0],
      [1, 1],
      [2, 2],
    ]),
  );
});

test('4 → 3 is one-to-one: three carried, one old ball unmatched', () => {
  const four = vanilla('4');
  const three = vanilla('3');
  const carry = carryOver(four, three, 4);
  // Crossing flights land at B + 0, 1, 2, 3; 3's first throws are at 0, 1, 2.
  expect(carry.size).toBe(3);
  expect(isOneToOne(carry)).toBe(true);
  expect([...carry.keys()].sort()).toEqual([0, 1, 2]);
  const oldBalls = new Set(four.events.map((e) => e.ball));
  expect(oldBalls.size).toBe(4);
  expect([...oldBalls].filter((b) => ![...carry.values()].includes(b))).toHaveLength(1);
});

test('3 → 4: one new ball has no old ball and is absent', () => {
  const carry = carryOver(vanilla('3'), vanilla('4'), 6);
  expect(carry.size).toBe(3);
  expect(isOneToOne(carry)).toBe(true);
});

test('3 → 51 leaves balls unmatched without error (51 is excited)', () => {
  const carry = carryOver(vanilla('3'), vanilla('51'), 6);
  expect(carry.size).toBeLessThan(3);
  expect(isOneToOne(carry)).toBe(true);
});

test('a ratio change, 3 at 1:1 → 2 / 2 at 3:2, does not throw and stays one-to-one', () => {
  const carry = carryOver(vanilla('3'), twoHands('2', '2', 3, 2), 6);
  expect(isOneToOne(carry)).toBe(true);
  for (const [ball, old] of carry) {
    expect(ball).toBeLessThan(4);
    expect(old).toBeLessThan(3);
  }
});

test('3 → 441 at B = 2: two balls in the air and one still in hand, all three carried', () => {
  const three = vanilla('3');
  const carry = carryOver(three, vanilla('441'), 2);
  expect(carry.size).toBe(3);
  expect(isOneToOne(carry)).toBe(true);
  // The waiting ball is 3's ball first thrown at old pulse 2 (hand 1); 441 throws first at
  // pulse 0 from hand 1.
  const waiting = three.events.find((e) => e.kind === 'throw' && e.pulse === 2)?.ball;
  const atZero = [...firstThrows(vanilla('441'))].find(([, t]) => t.pulse === 0)?.[0];
  expect(carry.get(atZero as number)).toBe(waiting);
});

test('crossing and waiting balls together stay one-to-one at every early boundary', () => {
  // A pulse that receives a landing is never a ball's first throw, so in a valid pattern a
  // waiting ball and a crossing flight never claim the same new ball; the guard is defensive.
  const names = ['3', '441', '531', '51', '97531', '4'];
  for (const a of names) {
    for (const b of names) {
      const old = vanilla(a);
      const next = vanilla(b);
      for (let B = 0; B <= 2 * old.cycle; B += old.cycle) {
        const carry = carryOver(old, next, B);
        expect(isOneToOne(carry)).toBe(true);
        expect(carry.size).toBeLessThanOrEqual(Math.min(old.balls, next.balls));
      }
    }
  }
  // Same pattern, same state: everything carries even before every ball has been thrown.
  expect(carryOver(vanilla('97531'), vanilla('97531'), 0).size).toBe(5);
});

test('at B = 0 nothing was thrown: every ball waits and carries to the ball thrown at its own first pulse', () => {
  const carry = carryOver(vanilla('3'), vanilla('441'), 0);
  expect(carry.size).toBe(3);
  expect(isOneToOne(carry)).toBe(true);
});

test('441 → 3 at a later cycle uses the balls of that cycle', () => {
  // 441's period is 18 (three cycles); at B = 12 the balls in the air are the third cycle's.
  const old = vanilla('441');
  const carry = carryOver(old, vanilla('3'), 12);
  expect(carry.size).toBe(3);
  const crossing = old.events
    .filter((e) => e.kind === 'throw' && e.pulse < 12 && e.pulse + e.flight >= 12)
    .map((e) => e.ball)
    .sort();
  expect([...carry.values()].sort()).toEqual(crossing);
});
