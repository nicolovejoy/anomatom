import { describe, expect, test } from 'vitest';
import { judge } from '../core';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { derived } from './derived';
import { defaultState } from './state';

const threeTwo = { a: 3, b: 2 };

describe('derived', () => {
  test('memoised on the state, and on the parts: a change elsewhere reuses everything', () => {
    const s = typed(['441']);
    const d = derived(s);
    expect(derived(s)).toBe(d);
    expect(derived({ ...s, volume: 0.1 })).toBe(d);
    expect(derived(typed(['441']))).not.toBe(d);
  });

  test('the schedule, the texts and the groups', () => {
    const d = derived(typed(['531']));
    expect(d.schedule.balls).toBe(3);
    expect(d.texts).toEqual(['531']);
    expect(d.groups).toBe(d.schedule.verdict.groups);
    const poly = derived(typed(['2 2x 2', '2x 2'], threeTwo));
    expect(poly.texts).toEqual(['2 2x 2', '2x 2']);
    expect(poly.fractional).toBeNull();
    expect(poly.fixes).toEqual([]);
    expect(poly.fixTexts).toEqual([]);
  });

  test('fractional: the non-whole mean of a faulted manual group, else null', () => {
    expect(derived(typed(['43'])).fractional).toBe(3.5);
    expect(derived(typed(['4441'])).fractional).toBe(3.25);
    // 432 fails with a whole mean.
    expect(derived(typed(['432'])).fractional).toBeNull();
    expect(derived(defaultState()).fractional).toBeNull();
  });

  test('fixes: the nearest juggleable edits, worked out once on first read; a vanilla fix keeps its written length', () => {
    const d = derived(typed(['12']));
    expect(d.fixTexts[0]).toEqual(['22']);
    expect(d.fixes[0]).toEqual(vanillaParts('22'));
    expect(d.fixes).toBe(d.fixes);
    for (const fix of d.fixes) expect(judge(fix).ok).toBe(true);
    const lines = derived(typed(['2x 2 2', '2 2x'], threeTwo));
    expect(lines.fixTexts.length).toBeGreaterThan(0);
    for (const [i, fix] of lines.fixes.entries()) {
      expect(judge(fix).ok).toBe(true);
      expect(lineParts(lines.fixTexts[i] as string[], threeTwo)).toEqual(fix);
    }
  });
});
