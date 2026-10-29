import { describe, expect, test } from 'vitest';
import { parseThrows } from './parse';

const t = (height: number, to: number | null = null) => ({ height, to });

describe('parseThrows', () => {
  test('one part: digits, spaces optional', () => {
    expect(parseThrows('441')).toEqual({ ok: true, throws: [[t(4), t(4), t(1)]], parts: 1 });
    expect(parseThrows(' 4 4\t1 ')).toEqual(parseThrows('441'));
  });

  test('letters a-z are 10-35', () => {
    expect(parseThrows('a b g z')).toEqual({ ok: true, throws: [[t(10), t(11), t(16), t(35)]], parts: 1 });
  });

  test('a slash separates parts; a bare x goes to the other part of two', () => {
    expect(parseThrows('2 2x 2 / 2x 2')).toEqual({
      ok: true,
      throws: [
        [t(2), t(2, 1), t(2)],
        [t(2, 0), t(2)],
      ],
      parts: 2,
    });
  });

  test('with two parts a digit after x is the next throw, as today: 2x22 is 2x 2 2', () => {
    expect(parseThrows('2x22 / 2')).toEqual(parseThrows('2x 2 2 / 2'));
  });

  test('with three or more parts x names the destination part, 1-based as written', () => {
    expect(parseThrows('3x2 3 / 3x3 / 3x1')).toEqual({
      ok: true,
      throws: [[t(3, 1), t(3)], [t(3, 2)], [t(3, 0)]],
      parts: 3,
    });
  });

  test('a part parsed on its own takes its place among the others from the context', () => {
    expect(parseThrows('2x 2 2', { part: 0, of: 2 })).toEqual({ ok: true, throws: [[t(2, 1), t(2), t(2)]], parts: 1 });
    expect(parseThrows('2x 2', { part: 1, of: 2 })).toEqual({ ok: true, throws: [[t(2, 0), t(2)]], parts: 1 });
    expect(parseThrows('4x3', { part: 0, of: 3 })).toEqual({ ok: true, throws: [[t(4, 2)]], parts: 1 });
  });

  test.each([
    ['', { kind: 'empty' }],
    ['   ', { kind: 'empty' }],
    ['3 / ', { kind: 'empty' }],
    ['4A1', { kind: 'bad-char', index: 1 }],
    ['4-1', { kind: 'bad-char', index: 1 }],
    ['x', { kind: 'bad-char', index: 0 }],
    ['3 / x', { kind: 'bad-char', index: 4 }],
    ['2xx / 2', { kind: 'bad-char', index: 2 }],
    ['3'.repeat(17), { kind: 'too-long', max: 16 }],
    ['3 / ' + '3'.repeat(17), { kind: 'too-long', max: 16 }],
    // One part: there is no other part to cross to.
    ['3x', { kind: 'bad-target', index: 1 }],
    // Three parts: a bare x is ambiguous, a target past the last part or the part itself is wrong.
    ['3x / 3 / 3', { kind: 'bad-target', index: 1 }],
    ['3x4 / 3 / 3', { kind: 'bad-target', index: 1 }],
    ['3x0 / 3 / 3', { kind: 'bad-target', index: 1 }],
    ['3x1 / 3 / 3', { kind: 'bad-target', index: 1 }],
    // A zero is no throw, so it has no destination.
    ['3 0x / 3', { kind: 'bad-target', index: 3 }],
    ['0x2 / 3 / 3', { kind: 'bad-target', index: 1 }],
  ])('rejects %j', (text, error) => {
    expect(parseThrows(text)).toEqual({ ok: false, error });
  });

  test('a part parsed alone with no others cannot cross', () => {
    expect(parseThrows('3x', { part: 0, of: 1 })).toEqual({ ok: false, error: { kind: 'bad-target', index: 1 } });
  });
});
