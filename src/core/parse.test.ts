import { expect, test } from 'vitest';
import { parsePattern } from './parse';

test('spaces are optional: 2x22 and 2x 2 2 parse the same', () => {
  const a = parsePattern('2x22');
  const b = parsePattern('2x 2 2');
  expect(a).toEqual(b);
  expect(a).toEqual({
    ok: true,
    pattern: [
      { height: 2, cross: true },
      { height: 2, cross: false },
      { height: 2, cross: false },
    ],
  });
});

test('a vanilla siteswap parses to uncrossed throws', () => {
  expect(parsePattern('441')).toEqual({
    ok: true,
    pattern: [
      { height: 4, cross: false },
      { height: 4, cross: false },
      { height: 1, cross: false },
    ],
  });
});

test.each([
  ['', { kind: 'empty' }],
  ['   ', { kind: 'empty' }],
  ['4a1', { kind: 'bad-char', index: 1 }],
  ['x', { kind: 'bad-char', index: 0 }],
  ['2xx', { kind: 'bad-char', index: 2 }],
  ['3'.repeat(17), { kind: 'too-long', max: 16 }],
])('rejects %j', (text, error) => {
  expect(parsePattern(text)).toEqual({ ok: false, error });
});
