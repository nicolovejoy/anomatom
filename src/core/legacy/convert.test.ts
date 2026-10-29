import { describe, expect, test } from 'vitest';
import { judge } from '../judge';
import { partsOfInput } from './convert';
import { parsePattern } from './parse';
import type { PatternInput } from './types';
import { validate } from './validate';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

describe('the two-hand validator and the part model agree on what is juggleable', () => {
  const vanilla = ['3', '441', '531', '51', '501', '0', '12', '43', '432', '510', '97531', '6240', '4x41'];
  const pairs: [string, string, number, number][] = [
    ['2', '2', 3, 2],
    ['2x 2 2', '2 2x', 3, 2],
    ['2 2x 2', '2x 2', 3, 2],
    ['2x 2', '2 2', 3, 2],
    ['2 2x 2', '2 2', 3, 2],
    ['3x', '3', 4, 3],
    ['132', '2', 3, 2],
  ];
  const inputs: PatternInput[] = [
    ...vanilla.map((t) => ({ ratio: { a: 1, b: 1 }, hands: [pat(t)] })),
    ...pairs.map(([h1, h2, a, b]) => ({ ratio: { a, b }, hands: [pat(h1), pat(h2)] })),
  ];
  test.each(inputs.map((i) => [i.hands.map((h) => h.length).join('/'), i] as const))('%s', (_, input) => {
    expect(judge(partsOfInput(input)).ok).toBe(validate(input).ok);
  });

  test('an x on a 1:1 siteswap means nothing', () => {
    const input = { ratio: { a: 1, b: 1 }, hands: [pat('4x41')] };
    expect(partsOfInput(input)).toEqual(partsOfInput({ ratio: { a: 1, b: 1 }, hands: [pat('441')] }));
  });
});
