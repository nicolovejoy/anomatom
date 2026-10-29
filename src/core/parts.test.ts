import { describe, expect, test } from 'vitest';
import {
  cycleOf,
  isVanillaPair,
  normalise,
  onsetsOf,
  partsFromLines,
  partsFromOnsets,
  partsFromVanilla,
  periodOf,
  textOf,
  throwsOf,
  vanillaIndex,
  withPhase,
} from './parts';
import type { Part, Parts } from './types';

function ok(r: ReturnType<typeof partsFromVanilla>): Parts {
  if (!r.ok) throw new Error(JSON.stringify(r.error));
  return r.parts;
}

const X = true;
const _ = false;
const line = (s: string) => [...s.replace(/ /g, '')].map((c) => c === 'x');

describe('vanilla', () => {
  test('531 is two parts on spacing 2, phases 0 and 1, unit 1, odd digits crossing', () => {
    const parts = ok(partsFromVanilla('531'));
    expect(parts).toEqual([
      {
        spacing: 2,
        phase: 0,
        unit: 1,
        flights: { kind: 'manual', throws: [{ height: 5, to: 1 }, { height: 1, to: 1 }, { height: 3, to: 1 }] },
      },
      {
        spacing: 2,
        phase: 1,
        unit: 1,
        flights: { kind: 'manual', throws: [{ height: 3, to: 0 }, { height: 5, to: 0 }, { height: 1, to: 0 }] },
      },
    ]);
    expect(cycleOf(parts)).toBe(6);
    expect(isVanillaPair(parts)).toBe(true);
    expect(textOf(parts[1] as Part, parts)).toBe('531');
  });

  test('an even-length siteswap splits between the parts: 441 / 51 / 4', () => {
    const parts = ok(partsFromVanilla('51'));
    expect(parts.map(periodOf)).toEqual([1, 1]);
    expect(cycleOf(parts)).toBe(2);
    expect(textOf(parts[0] as Part, parts)).toBe('51');
    const three = ok(partsFromVanilla('3'));
    expect(textOf(three[0] as Part, three)).toBe('3');
  });

  test('vanilla text reduces to its shortest period; letters are written as letters', () => {
    const p = ok(partsFromVanilla('4141'));
    expect(textOf(p[0] as Part, p)).toBe('41');
    const b = ok(partsFromVanilla('b1'));
    expect(textOf(b[0] as Part, b)).toBe('b1');
  });

  test('the siteswap position of a part beat', () => {
    // 531: part 0 beats 0,1,2 are siteswap 0,2,1; part 1 beats 0,1,2 are 1,0,2.
    expect([0, 1, 2].map((j) => vanillaIndex(0, j, 3))).toEqual([0, 2, 1]);
    expect([0, 1, 2].map((j) => vanillaIndex(1, j, 3))).toEqual([1, 0, 2]);
  });

  test('a slash, a cross mark or a bad character is a parse error', () => {
    expect(partsFromVanilla('3 / 3')).toEqual({ ok: false, part: 0, error: { kind: 'bad-char', index: 2 } });
    expect(partsFromVanilla('3x')).toEqual({ ok: false, part: 0, error: { kind: 'bad-target', index: 1 } });
    expect(partsFromVanilla('')).toEqual({ ok: false, part: 0, error: { kind: 'empty' } });
  });

  test('isVanillaPair refuses other shapes', () => {
    const v = ok(partsFromVanilla('531'));
    const [a, b] = v as [Part, Part];
    expect(isVanillaPair([a])).toBe(false);
    expect(isVanillaPair(partsFromOnsets([[X], [X]], [2, 2]))).toBe(false);
    expect(isVanillaPair([a, { ...b, phase: 0 }])).toBe(false);
    expect(isVanillaPair([a, { ...b, flights: { kind: 'manual', throws: [{ height: 3, to: 0 }] } }])).toBe(false);
    expect(isVanillaPair([a, { ...b, flights: { kind: 'manual', throws: [{ height: 3, to: null }, { height: 5, to: 0 }, { height: 1, to: 0 }] } }])).toBe(false);
  });
});

describe('lines in one-hand counting', () => {
  test('3:2: hand 1 every 2 pulses, hand 2 every 3, digits scaled to pulses', () => {
    const parts = ok(partsFromLines(['2 2x 2', '2x 2'], { a: 3, b: 2 }));
    expect(parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 0, 2],
      [3, 0, 3],
    ]);
    expect(throwsOf(parts[0] as Part)).toEqual([{ height: 4, to: null }, { height: 4, to: 1 }, { height: 4, to: null }]);
    expect(throwsOf(parts[1] as Part)).toEqual([{ height: 6, to: 0 }, { height: 6, to: null }]);
    expect(cycleOf(parts)).toBe(6);
    expect(textOf(parts[0] as Part, parts)).toBe('2 2x 2');
    expect(textOf(parts[1] as Part, parts)).toBe('2x 2');
  });

  test('a ratio is reduced: 6:4 is 3:2', () => {
    expect(ok(partsFromLines(['2', '2'], { a: 6, b: 4 }))).toEqual(ok(partsFromLines(['2', '2'], { a: 3, b: 2 })));
  });

  test('1:1 lines are two parts at spacing 1, both at phase 0', () => {
    const parts = ok(partsFromLines(['3', '3'], { a: 1, b: 1 }));
    expect(parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [1, 0, 1],
      [1, 0, 1],
    ]);
  });

  test('three parts: spacing 1 each unless given, x<n> written back', () => {
    const parts = ok(partsFromLines(['3x2 3', '3x3', '3x1'], { a: 1, b: 1 }));
    expect(parts.map((p) => p.spacing)).toEqual([1, 1, 1]);
    expect(textOf(parts[0] as Part, parts)).toBe('3x2 3');
    const spaced = ok(partsFromLines(['2', '2', '2'], { a: 1, b: 1 }, [2, 3, 6]));
    expect(spaced.map((p) => p.spacing)).toEqual([2, 3, 6]);
  });

  test('a parse error names the part', () => {
    expect(partsFromLines(['3', '3-'], { a: 3, b: 2 })).toEqual({ ok: false, part: 1, error: { kind: 'bad-char', index: 1 } });
    expect(partsFromLines(['3 / 3', '3'], { a: 3, b: 2 })).toEqual({ ok: false, part: 0, error: { kind: 'bad-char', index: 2 } });
  });
});

describe('onsets and the default rule', () => {
  const sonClave = line('x..x..x...x.x...');

  test('son clave at k = 1 is its gaps, at k = 2 the sums of two (design §5)', () => {
    const one = partsFromOnsets([sonClave], [1]);
    expect(textOf(one[0] as Part, one)).toBe('3 0 0 3 0 0 4 0 0 0 2 0 4 0 0 0');
    const two = partsFromOnsets([sonClave], [1], [2]);
    expect(textOf(two[0] as Part, two)).toBe('6 0 0 7 0 0 6 0 0 0 6 0 7 0 0 0');
    expect(onsetsOf(two[0] as Part)).toEqual(sonClave);
    expect(onsetsOf(ok(partsFromVanilla('501'))[0] as Part)).toEqual([X, X, _]);
  });

  test('a part with no onsets has no throws; heights past z are written in braces', () => {
    const empty = partsFromOnsets([[_, _]], [1]);
    expect(textOf(empty[0] as Part, empty)).toBe('0 0');
    const far = partsFromOnsets([[X, ...Array<boolean>(15).fill(_)]], [1], [3]);
    expect(textOf(far[0] as Part, far).split(' ')[0]).toBe('{48}');
    const g = partsFromOnsets([[X, ...Array<boolean>(15).fill(_)]], [1]);
    expect(textOf(g[0] as Part, g).split(' ')[0]).toBe('g');
  });

  test('default parts on a ratio are normalised', () => {
    const parts = partsFromOnsets([[X], [X]], [4, 6]);
    expect(parts.map((p) => [p.spacing, p.unit])).toEqual([
      [2, 2],
      [3, 3],
    ]);
  });
});

describe('the lattice', () => {
  test('normalise divides out the common factor, heights included, and leaves coarse parts alone', () => {
    const parts: Parts = [
      { spacing: 4, phase: 2, unit: 4, flights: { kind: 'manual', throws: [{ height: 8, to: null }] } },
      { spacing: 6, phase: 0, unit: 6, flights: { kind: 'default', onsets: [X], k: 1 } },
    ];
    expect(normalise(parts)).toEqual([
      { spacing: 2, phase: 1, unit: 2, flights: { kind: 'manual', throws: [{ height: 4, to: null }] } },
      { spacing: 3, phase: 0, unit: 3, flights: { kind: 'default', onsets: [X], k: 1 } },
    ]);
    const coarse = partsFromOnsets([[X]], [1]);
    expect(normalise(coarse)).toBe(coarse);
  });

  test('vanilla 531 as a phase: two spacing-1 parts, part 2 half a beat late, refine to spacing 2', () => {
    const lines = ok(partsFromLines(['5 3 1', '5 3 1'], { a: 1, b: 1 }));
    const half = withPhase(lines, 1, 0.5);
    expect(half.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 0, 2],
      [2, 1, 2],
    ]);
    expect(cycleOf(half)).toBe(6);
  });

  test('a phase on the lattice changes no spacing and wraps into the period', () => {
    const clap = partsFromOnsets([line('xxx.xx.x.xx.'), line('xxx.xx.x.xx.')], [1, 1]);
    expect(withPhase(clap, 1, 3)[1]?.phase).toBe(3);
    expect(withPhase(clap, 1, 15)[1]?.phase).toBe(3);
    expect(withPhase(clap, 1, -1)[1]?.phase).toBe(11);
    expect(cycleOf(withPhase(clap, 1, 9))).toBe(12);
  });

  test('a third of a pulse refines three times; a phase past the limit or a missing part changes nothing', () => {
    const parts = partsFromOnsets([[X], [X]], [1, 1]);
    const third = withPhase(parts, 0, 1 / 3);
    expect(third.map((p) => [p.spacing, p.phase])).toEqual([
      [3, 1],
      [3, 0],
    ]);
    expect(withPhase(parts, 0, Math.PI)).toBe(parts);
    expect(withPhase(parts, 5, 1)).toBe(parts);
  });

  test('an empty model has cycle 1', () => {
    expect(cycleOf([])).toBe(1);
  });
});
