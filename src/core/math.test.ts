import { expect, test } from 'vitest';
import { gcd, lcm, mod } from './math';

test('gcd and lcm', () => {
  expect(gcd(6, 4)).toBe(2);
  expect(gcd(7, 1)).toBe(1);
  expect(lcm(6, 4)).toBe(12);
  expect(lcm(3, 2)).toBe(6);
});

test('mod is never negative', () => {
  expect(mod(-1, 6)).toBe(5);
  expect(mod(7, 6)).toBe(1);
});
