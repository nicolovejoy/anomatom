import { expect, test } from 'vitest';
import { parsePattern } from './parse';
import { swapSites } from './swap';
import { validate } from './validate';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

test('51 <-> 24', () => {
  expect(swapSites(pat('51'), 0, 1)).toEqual(pat('24'));
  expect(swapSites(pat('24'), 0, 1)).toEqual(pat('51'));
});

test('441 <-> 531 at sites 1 and 2', () => {
  expect(swapSites(pat('441'), 0, 1)).toEqual(pat('531'));
  expect(swapSites(pat('531'), 0, 1)).toEqual(pat('441'));
});

test('441 at sites 2 and 3 is 423', () => {
  expect(swapSites(pat('441'), 1, 2)).toEqual(pat('423'));
});

test('site order does not matter', () => {
  expect(swapSites(pat('441'), 2, 1)).toEqual(swapSites(pat('441'), 1, 2));
});

test('the x travels with the landing it belongs to', () => {
  // Hand 1 of the valid 3:2 pattern `2 2x 2` / `2x 2`: swapping sites 1 and 2 moves the cross
  // to the throw that now lands on pulse 6: `2 3x 1`... heights become 2+1=3 at site 1 and
  // 2-1=1 at site 2; the landing at pulse 6 belonged to site 1's throw, so x stays at site 1.
  // Swapping sites 0 and 1 instead: site 0 gets 2+1=3 landing at 6 (takes the x), site 1 gets
  // 2-1=1 landing at 4.
  expect(swapSites(pat('2 2x 2'), 0, 1)).toEqual(pat('3x 1 2'));
  const swapped = swapSites(pat('2 2x 2'), 0, 1);
  expect(validate({ ratio: { a: 3, b: 2 }, hands: [swapped!, pat('2x 2')] })).toEqual({
    ok: true,
    balls: 4,
  });
});

test('a swap that would need a negative height is refused', () => {
  expect(swapSites(pat('03'), 0, 1)).toBeNull();
});

test('swapping a site with itself changes nothing', () => {
  expect(swapSites(pat('441'), 1, 1)).toEqual(pat('441'));
});
