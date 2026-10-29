import { describe, expect, test } from 'vitest';
import { parsePattern } from './parse';
import { validate, validateAll } from './validate';
import type { PatternInput } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

test('an unanswered cross: hand 2 gets two balls at once, hand 1 has none to throw', () => {
  const input: PatternInput = { ratio: { a: 3, b: 2 }, hands: [pat('2 2x 2'), pat('2 2')] };
  const v = validate(input);
  expect(v.ok).toBe(false);
  if (v.ok) return;
  expect(v.errors).toEqual([
    {
      kind: 'collision',
      hand: 1,
      pulse: 0,
      throws: [
        { hand: 0, index: 1 },
        { hand: 1, index: 0 },
      ],
    },
    { kind: 'no-ball', hand: 0, beat: 0 },
  ]);
});

test('0 is an empty hand: 501 has two balls', () => {
  expect(validate({ ratio: { a: 1, b: 1 }, hands: [pat('501')] })).toEqual({ ok: true, balls: 2 });
});

test('0 alone is valid with no balls', () => {
  expect(validate({ ratio: { a: 1, b: 1 }, hands: [pat('0')] })).toEqual({ ok: true, balls: 0 });
});

test('510 is a collision: all three land on the same beat', () => {
  // Cycle 6: landings 5, 2, 2, 8≡2, 5, 5. Hand 1 collects three at pulse 2, hand 2 three at 5;
  // same group of throws, reported once.
  const v = validate({ ratio: { a: 1, b: 1 }, hands: [pat('510')] });
  expect(v.ok).toBe(false);
  if (v.ok) return;
  expect(v.errors.filter((e) => e.kind === 'collision')).toEqual([
    {
      kind: 'collision',
      hand: 0,
      pulse: 2,
      throws: [
        { hand: 0, index: 0 },
        { hand: 0, index: 1 },
        { hand: 0, index: 2 },
      ],
    },
  ]);
});

test('a 3:2 collision from two same-hand throws names both', () => {
  // Hand 1 throws 3 then 1 on 2-pulse beats: 0->6 and 2->4; 4->6 (index 0 again)... period 2
  // on a 3-beat hand gives a 12-pulse cycle, so unroll: beats 0..5 throw 3,1,3,1,3,1 and land
  // 6,4,10,8,14≡2,12≡0 which are distinct. Use `4 0` instead: 0->8, 2->2, 4->12≡0, 6->6, 8->16≡4,
  // 10->10: distinct again. Take `3 3`: 0->6, 2->8, 4->10, 6->12≡0, 8->14≡2, 10->16≡4: distinct.
  // Same-hand collisions on one grid are vanilla collisions on that grid. `1 3 2` on 2-pulse
  // beats, cycle 6: 0->2, 2->8≡2, 4->8≡2 all collide.
  const v = validate({ ratio: { a: 3, b: 2 }, hands: [pat('132'), pat('2')] });
  expect(v.ok).toBe(false);
  if (v.ok) return;
  expect(v.errors[0]).toEqual({
    kind: 'collision',
    hand: 0,
    pulse: 2,
    throws: [
      { hand: 0, index: 0 },
      { hand: 0, index: 1 },
      { hand: 0, index: 2 },
    ],
  });
});

describe('validateAll: every error, with the digits it involves', () => {
  const vanilla = (text: string): PatternInput => ({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });

  test('a valid pattern has no details', () => {
    expect(validateAll(vanilla('441'))).toEqual([]);
  });

  test('432 names all three colliding throws, every digit, in hand 1’s list', () => {
    const details = validateAll(vanilla('432'));
    const collisions = details.filter((d) => d.error.kind === 'collision');
    expect(collisions).toHaveLength(1);
    expect(collisions[0]?.error).toMatchObject({ hand: 0, pulse: 4 });
    expect(collisions[0]?.digits).toEqual([[0, 1, 2], []]);
    // For a whole ball count the errors are validate's, in its order.
    const v = validate(vanilla('432'));
    expect(v.ok).toBe(false);
    if (!v.ok) expect(details.map((d) => d.error)).toEqual(v.errors);
  });

  test('510 names its three-way collision including the 0', () => {
    const collisions = validateAll(vanilla('510')).filter((d) => d.error.kind === 'collision');
    expect(collisions.map((d) => d.digits)).toEqual([[[0, 1, 2], []]]);
  });

  test('2x 2 2 / 2 2x names both off-grid landing pulses and the digit of each', () => {
    const input: PatternInput = { ratio: { a: 3, b: 2 }, hands: [pat('2x 2 2'), pat('2 2x')] };
    const offGrid = validateAll(input).filter((d) => d.error.kind === 'cross-off-grid');
    // Ordered by catching hand: hand 2's cross lands in hand 1, so it comes first.
    expect(offGrid).toEqual([
      {
        error: { kind: 'cross-off-grid', fromHand: 1, beat: 1, landingPulse: 9, nearestLegal: 12 },
        digits: [[], [1]],
      },
      {
        error: { kind: 'cross-off-grid', fromHand: 0, beat: 0, landingPulse: 4, nearestLegal: 6 },
        digits: [[0], []],
      },
    ]);
  });

  test('a missing ball names the throw that has nothing to throw, per hand', () => {
    const input: PatternInput = { ratio: { a: 3, b: 2 }, hands: [pat('2 2x 2'), pat('2 2')] };
    expect(validateAll(input).find((d) => d.error.kind === 'no-ball')).toEqual({
      error: { kind: 'no-ball', hand: 0, beat: 0 },
      digits: [[0], []],
    });
    // At 1:1 a beat of either hand is a beat of the one sequence: in 432, hand 2's beat 5 is digit 3.
    const details = validateAll(vanilla('432'));
    expect(details).toContainEqual({ error: { kind: 'no-ball', hand: 1, beat: 5 }, digits: [[2], []] });
  });

  test('a fractional count comes first, involves no single digit, and the landing errors follow', () => {
    // 43: mean 3.5, and both throws land on the same pulse of the cycle.
    const details = validateAll(vanilla('43'));
    expect(details[0]).toEqual({ error: { kind: 'fractional-balls', balls: 3.5 }, digits: [[], []] });
    expect(details.slice(1).some((d) => d.error.kind === 'collision')).toBe(true);
    // validate still stops at the fraction.
    expect(validate(vanilla('43'))).toEqual({ ok: false, errors: [{ kind: 'fractional-balls', balls: 3.5 }] });
  });
});
