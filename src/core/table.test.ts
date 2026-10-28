// MATH.md §8, one test per row. These rows are the contract; the 3:2 rows prove the project.
import { describe, expect, test } from 'vitest';
import { parsePattern } from './parse';
import { validate } from './validate';
import { cycleLength } from './grid';
import type { PatternInput, ValidationError } from './types';

function vanilla(text: string): PatternInput {
  return { ratio: { a: 1, b: 1 }, hands: [pat(text)] };
}

function twoHands(h1: string, h2: string, a: number, b: number): PatternInput {
  return { ratio: { a, b }, hands: [pat(h1), pat(h2)] };
}

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(`bad test pattern ${text}`);
  return r.pattern;
}

function errorsOf(input: PatternInput): readonly ValidationError[] {
  const v = validate(input);
  return v.ok ? [] : v.errors;
}

describe('1:1 vanilla, valid', () => {
  test.each([
    ['3', 3, 2],
    ['441', 3, 6],
    ['531', 3, 6],
    ['51', 3, 2],
    ['5551', 4, 4],
    ['97531', 5, 10],
  ])('%s has %i balls and a %i-pulse cycle', (text, balls, cycle) => {
    const input = vanilla(text);
    expect(validate(input)).toEqual({ ok: true, balls });
    expect(cycleLength(input)).toBe(cycle);
  });
});

describe('1:1 vanilla, fractional mean', () => {
  test.each([
    ['12', 1.5],
    ['21', 1.5],
    ['43', 3.5],
    ['4441', 3.25],
  ])('%s averages %f balls', (text, balls) => {
    expect(errorsOf(vanilla(text))).toEqual([{ kind: 'fractional-balls', balls }]);
  });
});

test('432: all three throws land on the same beat', () => {
  // Landings 0+4, 1+3, 2+2 are 4, 4, 4 (0-based), i.e. 5, 5, 5 as MATH.md counts them.
  const errors = errorsOf(vanilla('432'));
  expect(errors[0]).toEqual({
    kind: 'collision',
    hand: 0,
    pulse: 4,
    throws: [
      { hand: 0, index: 0 },
      { hand: 0, index: 1 },
      { hand: 0, index: 2 },
    ],
  });
});

describe('3:2, Nickmans', () => {
  test('2 / 2: two fountains on their own grids, no crossing', () => {
    const input = twoHands('2', '2', 3, 2);
    expect(validate(input)).toEqual({ ok: true, balls: 4 });
    expect(cycleLength(input)).toBe(6);
  });

  test('2x 2 2 / 2 2x: both crosses miss the other grid (pulses 4 and 9)', () => {
    const errors = errorsOf(twoHands('2x 2 2', '2 2x', 3, 2));
    expect(errors).toContainEqual({
      kind: 'cross-off-grid',
      fromHand: 0,
      beat: 0,
      landingPulse: 4,
      nearestLegal: 6,
    });
    expect(errors).toContainEqual({
      kind: 'cross-off-grid',
      fromHand: 1,
      beat: 1,
      landingPulse: 9,
      nearestLegal: 12,
    });
  });

  test('2 2x 2 / 2x 2: both crosses land on the downbeat, pulse 6', () => {
    const input = twoHands('2 2x 2', '2x 2', 3, 2);
    expect(validate(input)).toEqual({ ok: true, balls: 4 });
    expect(cycleLength(input)).toBe(6);
  });

  test('2x 2 / 2 2: period 2 on a 3-beat hand gives a 12-pulse cycle; the cross from beat 0 lands at 4', () => {
    const input = twoHands('2x 2', '2 2', 3, 2);
    expect(cycleLength(input)).toBe(12);
    const errors = errorsOf(input);
    expect(errors[0]).toEqual({
      kind: 'cross-off-grid',
      fromHand: 0,
      beat: 0,
      landingPulse: 4,
      nearestLegal: 6,
    });
  });
});
