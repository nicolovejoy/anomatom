import { expect, test } from 'vitest';
import { euclid, rotate } from './euclid';

const str = (xs: boolean[]) => xs.map((x) => (x ? 'x' : '.')).join('');

test.each([
  [3, 8, 'x..x..x.'], // tresillo
  [5, 8, 'x.xx.xx.'],
  [7, 12, 'x.xx.x.xx.x.'], // the bell
  [4, 9, 'x.x.x.x..'], // 2+2+2+3
  [6, 16, 'x..x.x..x..x.x..'],
  [8, 12, 'x.xx.xx.xx.x'],
  [4, 16, 'x...x...x...x...'],
  [1, 16, 'x...............'],
  [0, 4, '....'],
  [4, 4, 'xxxx'],
  [6, 4, 'xxxx'],
  [0, 0, ''],
])('E(%i, %i) is %s', (hits, pulses, expected) => {
  const e = euclid(hits, pulses);
  expect(str(e)).toBe(expected);
  expect(e).toHaveLength(pulses);
});

test('rotate moves element `by` to the front, either way round', () => {
  expect(rotate([1, 2, 3, 4], 1)).toEqual([2, 3, 4, 1]);
  expect(rotate([1, 2, 3, 4], -1)).toEqual([4, 1, 2, 3]);
  expect(rotate([1, 2, 3, 4], 6)).toEqual([3, 4, 1, 2]);
  expect(rotate([], 3)).toEqual([]);
});
