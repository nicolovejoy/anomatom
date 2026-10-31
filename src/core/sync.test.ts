import { describe, expect, test } from 'vitest';
import { MAX_PERIOD } from '../tunables';
import { judge } from './judge';
import { cycleOf, partsFromLines, partsFromVanilla, textOf } from './parts';
import { buildSchedule } from './schedule';
import { isSyncSet, parseSync, partsFromSync, syncText } from './sync';
import type { Part, Parts } from './types';

function parts(text: string): Parts {
  const r = partsFromSync(text);
  if (!r.ok) throw new Error(`${text}: ${JSON.stringify(r.error)}`);
  return r.parts;
}

const balls = (ps: Parts) => {
  const s = buildSchedule(ps);
  return s.verdict.ok ? s.balls : null;
};

describe('parseSync', () => {
  test('pairs of (left,right), x crossing, spaces ignored', () => {
    const want = {
      ok: true,
      pairs: [
        [{ height: 4, cross: false }, { height: 2, cross: true }],
        [{ height: 2, cross: true }, { height: 4, cross: false }],
      ],
    };
    expect(parseSync('(4,2x)(2x,4)')).toEqual(want);
    expect(parseSync(' ( 4 , 2 x ) ( 2x,4 )\t')).toEqual(want);
  });
  test('* repeats the sequence with the hands exchanged', () => {
    expect(parseSync('(4,2x)*')).toEqual(parseSync('(4,2x)(2x,4)'));
    expect(parseSync('(6x,4) *')).toEqual(parseSync('(6x,4)(4,6x)'));
  });
  test('odd heights are bad-sync at the digit', () => {
    expect(parseSync('(3,4)')).toEqual({ ok: false, error: { kind: 'bad-sync', index: 1, open: false } });
    expect(parseSync('(4,4)(4,5)')).toEqual({ ok: false, error: { kind: 'bad-sync', index: 8, open: false } });
  });
  test('a pair left open is bad-sync at the end', () => {
    expect(parseSync('(4,2x)(2x')).toEqual({ ok: false, error: { kind: 'bad-sync', index: 9, open: true } });
    expect(parseSync('(4,')).toEqual({ ok: false, error: { kind: 'bad-sync', index: 3, open: true } });
    expect(parseSync('(4')).toEqual({ ok: false, error: { kind: 'bad-sync', index: 2, open: true } });
  });
  test('anything out of place is bad-char; 0x a bad-target; nothing at all empty', () => {
    expect(parseSync('(4;4)')).toEqual({ ok: false, error: { kind: 'bad-char', index: 2 } });
    expect(parseSync('(x,4)')).toEqual({ ok: false, error: { kind: 'bad-char', index: 1 } });
    expect(parseSync('(,4)')).toEqual({ ok: false, error: { kind: 'bad-char', index: 1 } });
    expect(parseSync('4,4')).toEqual({ ok: false, error: { kind: 'bad-char', index: 0 } });
    expect(parseSync('*')).toEqual({ ok: false, error: { kind: 'bad-char', index: 0 } });
    expect(parseSync('(4,4)**')).toEqual({ ok: false, error: { kind: 'bad-char', index: 6 } });
    expect(parseSync('(4,4)*(4,4)')).toEqual({ ok: false, error: { kind: 'bad-char', index: 6 } });
    expect(parseSync('(0x,4)')).toEqual({ ok: false, error: { kind: 'bad-target', index: 2 } });
    expect(parseSync('  ')).toEqual({ ok: false, error: { kind: 'empty' } });
  });
  test(`at most ${MAX_PERIOD} pairs, counting the * repeat`, () => {
    expect(parseSync('(4,4)'.repeat(MAX_PERIOD)).ok).toBe(true);
    expect(parseSync(`${'(4,4)'.repeat(MAX_PERIOD / 2 + 1)}*`)).toEqual({ ok: false, error: { kind: 'too-long', max: MAX_PERIOD } });
  });
});

describe('partsFromSync (ruling 5)', () => {
  test('the box is two parts at spacing 2, both at phase 0, unit 1, 3 balls', () => {
    const box = parts('(4,2x)(2x,4)');
    expect(box).toEqual([
      { spacing: 2, phase: 0, unit: 1, flights: { kind: 'manual', throws: [{ height: 4, to: null }, { height: 2, to: 1 }] } },
      { spacing: 2, phase: 0, unit: 1, flights: { kind: 'manual', throws: [{ height: 2, to: 0 }, { height: 4, to: null }] } },
    ]);
    expect(judge(box).ok).toBe(true);
    expect(cycleOf(box)).toBe(4);
    expect(balls(box)).toBe(3);
  });
  test('(4,2x)* equals the box', () => {
    expect(parts('(4,2x)*')).toEqual(parts('(4,2x)(2x,4)'));
  });
  test('(4,4) is the 4-ball sync fountain; (6x,4)* is 5 balls', () => {
    expect(balls(parts('(4,4)'))).toBe(4);
    expect(balls(parts('(6x,4)*'))).toBe(5);
    expect(balls(parts('(4x,2x)'))).toBe(3);
  });
  test('a collision fails the judge: (4,2x)(4,2x)', () => {
    expect(judge(parts('(4,2x)(4,2x)')).ok).toBe(false);
  });
  test('an error names part 0', () => {
    expect(partsFromSync('(3,4)')).toEqual({ ok: false, part: 0, error: { kind: 'bad-sync', index: 1, open: false } });
  });
});

describe('isSyncSet and syncText', () => {
  test.each(['(4,2x)(2x,4)', '(4,4)', '(6x,4)(4,6x)', '(4x,2x)', '(4,4)(4,0)', '(6,6)(6x,2x)'])('round trip %s', (t) => {
    const ps = parts(t);
    expect(isSyncSet(ps)).toBe(true);
    expect(syncText(ps)).toBe(t);
    expect(textOf(ps[0] as Part, ps)).toBe(t);
    expect(textOf(ps[1] as Part, ps)).toBe(t);
  });
  test('the * form is never written back', () => {
    expect(syncText(parts('(4,2x)*'))).toBe('(4,2x)(2x,4)');
  });
  test('false for a vanilla pair, two default parts, one part, and off-shape pairs', () => {
    const vanilla = partsFromVanilla('42');
    expect(vanilla.ok && isSyncSet(vanilla.parts)).toBe(false);
    const defaults: Parts = [0, 1].map(() => ({ spacing: 2, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } }) as Part);
    expect(isSyncSet(defaults)).toBe(false);
    const box = parts('(4,2x)(2x,4)');
    expect(isSyncSet([box[0] as Part])).toBe(false);
    const lines = partsFromLines(['4', '4'], { a: 1, b: 1 });
    expect(lines.ok && isSyncSet(lines.parts)).toBe(false);
    const manual = (throws: { height: number; to: number | null }[], over: Partial<Part> = {}): Part => ({
      spacing: 2,
      phase: 0,
      unit: 1,
      flights: { kind: 'manual', throws },
      ...over,
    });
    const four = manual([{ height: 4, to: null }]);
    expect(isSyncSet([four, four])).toBe(true);
    expect(isSyncSet([four, manual([{ height: 4, to: null }], { phase: 1 })])).toBe(false);
    expect(isSyncSet([four, manual([{ height: 4, to: null }], { unit: 2 })])).toBe(false);
    expect(isSyncSet([four, manual([{ height: 4, to: null }, { height: 4, to: null }])])).toBe(false);
    expect(isSyncSet([four, manual([{ height: 3, to: 0 }])])).toBe(false);
    expect(isSyncSet([four, manual([{ height: 4, to: 1 }])])).toBe(false);
    expect(isSyncSet([four, manual([{ height: 0, to: 0 }])])).toBe(false);
  });
});
