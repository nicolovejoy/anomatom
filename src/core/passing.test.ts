import { describe, expect, test } from 'vitest';
import { MAX_JUGGLERS } from '../tunables';
import { judge } from './judge';
import { cycleOf, partsFromVanilla, textOf } from './parts';
import { isPass, isPassingSet, jugglerOf, parsePassing, partsFromPassing, passingText } from './passing';
import { buildSchedule } from './schedule';
import type { Part, Parts } from './types';

function parts(text: string): Parts {
  const r = partsFromPassing(text);
  if (!r.ok) throw new Error(`${text}: ${JSON.stringify(r.error)}`);
  return r.parts;
}
/** Where part `p`'s first throw lands. */
const landing = (ps: Parts, p: number) => {
  const t = (ps[p] as Part).flights as { throws: readonly { to: number | null }[] };
  return t.throws[0]?.to ?? p;
};

describe('jugglers and passes (ruling 1)', () => {
  test('juggler j is parts 2j and 2j + 1', () => {
    expect([0, 1, 2, 3, 4, 5, 6].map(jugglerOf)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
  test('a pass lands in another juggler', () => {
    expect(isPass(0, 1)).toBe(false);
    expect(isPass(1, 1)).toBe(false);
    expect(isPass(0, 3)).toBe(true);
    expect(isPass(3, 4)).toBe(true);
  });
});

describe('parsePassing', () => {
  test('one vanilla sequence per juggler; brackets and spaces optional; p alone is the other juggler', () => {
    const want = {
      ok: true,
      sequences: [
        [{ height: 3, to: 1 }, { height: 3, to: null }],
        [{ height: 3, to: 0 }, { height: 3, to: null }],
      ],
    };
    expect(parsePassing('<3p 3|3p 3>')).toEqual(want);
    expect(parsePassing('3p 3|3p  3')).toEqual(want);
    expect(parsePassing(' < 3p 3 | 3p\t3 > ')).toEqual(want);
  });

  test('p<n> names its target, 1-based, with two jugglers too; a bare p with two is the other one', () => {
    expect(parsePassing('<3p2 3|3p3 3|3p1 3>')).toMatchObject({ ok: true, sequences: [[{ to: 1 }, {}], [{ to: 2 }, {}], [{ to: 0 }, {}]] });
    expect(parsePassing('<3p2 3|3p1 3>')).toEqual(parsePassing('<3p 3|3p 3>'));
    expect(parsePassing('<3p1 3|3p 3>')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-target', index: 2 } });
    expect(parsePassing('<3p 3|3p3 3>')).toEqual({ ok: false, juggler: 1, error: { kind: 'bad-target', index: 7 } });
    expect(parsePassing('<3p0 3|3p 3>')).toMatchObject({ ok: false, error: { kind: 'bad-target', index: 2 } });
    // A letter after p is a height, not a target.
    expect(parsePassing('3pa|3p3')).toMatchObject({ ok: false, juggler: 1 });
    expect(parsePassing('3pa|3pa')).toMatchObject({ ok: true, sequences: [[{ height: 3, to: 1 }, { height: 10, to: null }], [{}, {}]] });
  });

  test('a bare p among three, a p to oneself, a p with no partner or after a 0 is a bad-target', () => {
    expect(parsePassing('<3p 3|3p 3|3p 3>')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-target', index: 2 } });
    expect(parsePassing('<3p1 3|3p3 3|3p1 3>')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-target', index: 2 } });
    expect(parsePassing('<3p4 3|3p3 3|3p1 3>')).toMatchObject({ ok: false, error: { kind: 'bad-target', index: 2 } });
    expect(parsePassing('<3p 3>')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-target', index: 2 } });
    expect(parsePassing('3|0p 3')).toEqual({ ok: false, juggler: 1, error: { kind: 'bad-target', index: 3 } });
    expect(parsePassing('3|3x 3')).toEqual({ ok: false, juggler: 1, error: { kind: 'bad-target', index: 3 } });
  });

  test('a p with no throw before it, a stray bracket or a letter that is not a digit is a bad-char', () => {
    expect(parsePassing('p3|3')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-char', index: 0 } });
    expect(parsePassing('3pp|3')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-char', index: 2 } });
    expect(parsePassing('3<|3')).toEqual({ ok: false, juggler: 0, error: { kind: 'bad-char', index: 1 } });
    expect(parsePassing('3|3>3')).toEqual({ ok: false, juggler: 1, error: { kind: 'bad-char', index: 3 } });
    expect(parsePassing('3|3!')).toEqual({ ok: false, juggler: 1, error: { kind: 'bad-char', index: 3 } });
  });

  test('letters other than p and x are heights; an empty or overlong sequence is refused', () => {
    expect(parsePassing('a|b')).toMatchObject({ ok: true, sequences: [[{ height: 10 }], [{ height: 11 }]] });
    expect(parsePassing('<3||3>')).toEqual({ ok: false, juggler: 1, error: { kind: 'empty' } });
    expect(parsePassing('3|' + '3'.repeat(17))).toEqual({ ok: false, juggler: 1, error: { kind: 'too-long', max: 16 } });
  });

  test(`more than ${MAX_JUGGLERS} jugglers is too-many-jugglers`, () => {
    expect(parsePassing('<3p 3|3p 3|3p 3|3p 3>')).toEqual({
      ok: false,
      juggler: 0,
      error: { kind: 'too-many-jugglers', max: MAX_JUGGLERS },
    });
  });
});

describe('partsFromPassing (ruling 2, MATH.md §10)', () => {
  test('<3p 3|3p 3>: four parts in vanilla layout, ok, 6 balls, cycle 2; part 0 passes to part 3, part 2 to part 1', () => {
    const ps = parts('<3p 3|3p 3>');
    expect(ps).toHaveLength(4);
    expect(ps.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 0, 1],
      [2, 1, 1],
      [2, 0, 1],
      [2, 1, 1],
    ]);
    expect(judge(ps).ok).toBe(true);
    const s = buildSchedule(ps);
    expect([s.balls, s.cycle, cycleOf(ps)]).toEqual([6, 2, 2]);
    expect([0, 1, 2, 3].map((p) => landing(ps, p))).toEqual([3, 0, 1, 2]);
    const passes = s.events.filter((e) => e.kind === 'throw' && isPass(e.part, e.to));
    expect(new Set(passes.map((e) => `${e.part}>${e.to}`))).toEqual(new Set(['0>3', '2>1']));
  });

  test('<3p|3p>, ultimates: ok, 6 balls; every throw a pass', () => {
    const ps = parts('<3p|3p>');
    const s = buildSchedule(ps);
    expect([s.verdict.ok, s.balls, s.cycle]).toEqual([true, 6, 2]);
    expect([0, 1, 2, 3].map((p) => landing(ps, p))).toEqual([3, 2, 1, 0]);
  });

  test('<4p 3|3 4p>: ok, 7 balls, the 4p from part 0 landing in part 2 (same-phase hand)', () => {
    const ps = parts('<4p 3|3 4p>');
    const s = buildSchedule(ps);
    expect([s.verdict.ok, s.balls]).toEqual([true, 7]);
    expect(landing(ps, 0)).toBe(2);
    expect(landing(ps, 3)).toBe(1);
  });

  test('<3p 3|3p 3|3p 3> is a bad-target; <3p2 3|3p3 3|3p1 3> is ok with 9 balls', () => {
    expect(partsFromPassing('<3p 3|3p 3|3p 3>')).toEqual({ ok: false, part: 0, error: { kind: 'bad-target', index: 2 } });
    const ps = parts('<3p2 3|3p3 3|3p1 3>');
    expect(ps).toHaveLength(6);
    const s = buildSchedule(ps);
    expect([s.verdict.ok, s.balls]).toEqual([true, 9]);
    expect([0, 2, 4].map((p) => landing(ps, p))).toEqual([3, 5, 1]);
  });

  test('<3p 3|3 3> has faults: a pass nobody returns', () => {
    const v = judge(parts('<3p 3|3 3>'));
    expect(v.ok).toBe(false);
    expect(v.groups.flatMap((g) => g.faults.map((f) => f.kind))).toEqual(expect.arrayContaining(['collision', 'unfed']));
  });

  test('<5 3|3> (no pass) is two independent jugglers: ok, 4 + 3 = 7 balls', () => {
    const ps = parts('<5 3|3>');
    const v = judge(ps);
    expect(v.groups.map((g) => [g.parts, g.balls])).toEqual([
      [[0, 1], 4],
      [[2, 3], 3],
    ]);
    expect(buildSchedule(ps).balls).toBe(7);
  });

  test('an odd-length sequence is read twice, landings by the pulse: <3p 3 3|3p 3 3>', () => {
    const ps = parts('<3p 3 3|3p 3 3>');
    expect(ps.map((p) => (p.flights as { throws: readonly unknown[] }).throws.length)).toEqual([3, 3, 3, 3]);
    const s = buildSchedule(ps);
    expect([s.verdict.ok, s.balls]).toEqual([true, 6]);
  });

  test('too many jugglers is refused at part 0, an input the editor has', () => {
    expect(partsFromPassing('<3p 3|3p 3|3p 3|3p 3>')).toEqual({
      ok: false,
      part: 0,
      error: { kind: 'too-many-jugglers', max: MAX_JUGGLERS },
    });
  });

  test('3p3 with no | is not form 4: vanilla reads it with p as 25', () => {
    expect(partsFromPassing('3p3')).toMatchObject({ ok: false, error: { kind: 'bad-target' } });
    const v = partsFromVanilla('3p3');
    expect(v.ok && (v.parts[0]?.flights as { throws: readonly { height: number }[] }).throws[0]?.height).toBe(3);
    expect(v.ok && (v.parts[1]?.flights as { throws: readonly { height: number }[] }).throws[0]?.height).toBe(25);
  });
});

describe('passingText and isPassingSet', () => {
  test.each(['<3p 3|3p 3>', '<3p|3p>', '<4p 3|3 4p>', '<3p2 3|3p3 3|3p1 3>', '<3p 3|3>', '<5 3|3>', '<3p 3 3|3p 3 3>', '<a 0|b 1>'])(
    '%s round-trips',
    (text) => {
      const ps = parts(text);
      expect(isPassingSet(ps)).toBe(true);
      expect(passingText(ps)).toBe(text);
      expect(textOf(ps[3] as Part, ps)).toBe(text);
    },
  );

  test('the text is canonical: brackets and single spaces; a repeated half is written once, as vanillaDigits writes 33 as 3', () => {
    expect(passingText(parts('3p 3|3p  3'))).toBe('<3p 3|3p 3>');
    expect(passingText(parts('<3p2 3|3p1 3>'))).toBe('<3p 3|3p 3>');
    // <3p 3|3 3> and <3p 3|3> are the same parts.
    expect(parts('<3p 3|3 3>')).toEqual(parts('<3p 3|3>'));
    expect(passingText(parts('<3p 3|3 3>'))).toBe('<3p 3|3>');
  });

  test('false for a vanilla pair and for four default parts', () => {
    expect(isPassingSet(parts('<531>'))).toBe(false);
    const def: Part = { spacing: 2, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } };
    expect(isPassingSet([def, { ...def, phase: 1 }, def, { ...def, phase: 1 }])).toBe(false);
  });

  test('false for four manual parts where one to breaks the parity rule', () => {
    const ps = parts('<3p 3|3p 3>');
    const bend = (p: Part, to: number | null): Part => ({ ...p, flights: { kind: 'manual', throws: [{ height: 3, to }] } });
    // Part 0's 3p lands in part 3 by the rule; part 2 (same phase) breaks it.
    expect(isPassingSet([bend(ps[0] as Part, 2), ...ps.slice(1)])).toBe(false);
    // A 3 that stays home would land in the other hand.
    expect(isPassingSet([bend(ps[0] as Part, null), ...ps.slice(1)])).toBe(false);
    // A throw to its own part, written out.
    expect(isPassingSet([bend(ps[0] as Part, 0), ...ps.slice(1)])).toBe(false);
  });

  test('false for an odd count, for more than three jugglers, for a broken layout or unequal halves', () => {
    const ps = parts('<3p 3|3p 3>');
    expect(isPassingSet(ps.slice(0, 3))).toBe(false);
    const four = parts('<3p2 3|3p3 3|3p1 3>');
    expect(isPassingSet([...four, ...ps.slice(0, 2)])).toBe(false);
    expect(isPassingSet([ps[0] as Part, { ...(ps[1] as Part), phase: 0 }, ...ps.slice(2)])).toBe(false);
    expect(isPassingSet([{ ...(ps[0] as Part), spacing: 4 }, ...ps.slice(1)])).toBe(false);
    expect(isPassingSet([{ ...(ps[0] as Part), unit: 2 }, ...ps.slice(1)])).toBe(false);
    const long: Part = { ...(ps[0] as Part), flights: { kind: 'manual', throws: [{ height: 3, to: 3 }, { height: 3, to: 3 }] } };
    expect(isPassingSet([long, ...ps.slice(1)])).toBe(false);
    const away: Part = { ...(ps[0] as Part), flights: { kind: 'manual', throws: [{ height: 3, to: 5 }] } };
    expect(isPassingSet([away, ...ps.slice(1)])).toBe(false);
    const zero: Part = { ...(ps[0] as Part), flights: { kind: 'manual', throws: [{ height: 0, to: 3 }] } };
    expect(isPassingSet([zero, ...ps.slice(1)])).toBe(false);
  });

  test('textOf a part outside the set is its own line', () => {
    const ps = parts('<3p 3|3p 3>');
    const stranger: Part = { spacing: 1, phase: 0, unit: 1, flights: { kind: 'manual', throws: [{ height: 3, to: null }] } };
    expect(textOf(stranger, ps)).toBe('3');
  });
});
