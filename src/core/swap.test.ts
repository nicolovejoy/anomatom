import { expect, test } from 'vitest';
import { swapSites } from './swap';

test('on part throws in pulses: one site is `step` pulses, and the destination moves with the landing', () => {
  // 3:2 hand 1, `2 2x 2` in pulses (spacing 2): swapping sites 0 and 1 gives `3x 1 2`.
  const throws = [
    { height: 4, to: null },
    { height: 4, to: 1 },
    { height: 4, to: null },
  ];
  expect(swapSites(throws, 0, 1, 2)).toEqual([
    { height: 6, to: 1 },
    { height: 2, to: null },
    { height: 4, to: null },
  ]);
  expect(swapSites(throws, 0, 2, 3)).toBeNull();
});
