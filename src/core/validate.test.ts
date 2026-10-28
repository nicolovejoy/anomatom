import { expect, test } from 'vitest';
import { parsePattern } from './parse';
import { validate } from './validate';
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
        { hand: 1, index: 0 },
        { hand: 0, index: 1 },
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
  const v = validate({ ratio: { a: 1, b: 1 }, hands: [pat('510')] });
  expect(v.ok).toBe(false);
  if (v.ok) return;
  expect(v.errors[0]?.kind).toBe('collision');
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
