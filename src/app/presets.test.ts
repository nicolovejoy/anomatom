import { describe, expect, test } from 'vitest';
import bibliography from '../../docs/BIBLIOGRAPHY.md?raw';
import { buildSchedule, cycleOf, isPassingSet, isSyncSet, judge } from '../core';
import { partsFromPassing, partsFromSync, partsFromVanilla } from '../core';
import { copy } from '../ui/copy';
import { isPresetParts, PRESETS } from './presets';

describe.each(PRESETS)('preset $id', (p) => {
  test('is juggleable', () => {
    expect(judge(p.parts).ok).toBe(true);
  });
  test('carries the expected balls and cycle', () => {
    const s = buildSchedule(p.parts);
    expect(s.balls).toBe(p.balls);
    expect(cycleOf(p.parts)).toBe(p.cycle);
    expect(s.cycle).toBe(p.cycle);
    expect(s.events.length).toBeGreaterThan(0);
  });
  test('has its name', () => {
    expect(copy.presets[p.id]?.name).toBeTruthy();
  });
  test('carries no sound (v5 ruling 5)', () => {
    expect(p).not.toHaveProperty('mapping');
  });
  test('sits in the group of its ball count, passing apart', () => {
    expect(p.group).toBe(isPassingSet(p.parts) ? 'passing' : String(p.balls));
  });
});

describe('the cards', () => {
  test('the original six cards keep their ids, and each group lists them in screen order', () => {
    const ids = PRESETS.map((p) => p.id);
    for (const id of ['cascade', 'pause', 'classic', 'ramp', 'polyrhythm', 'passing']) expect(ids).toContain(id);
    const order = ['3', '4', '5', 'passing'];
    expect(PRESETS.map((p) => order.indexOf(p.group))).toEqual(PRESETS.map((p) => order.indexOf(p.group)).sort());
    expect(ids.indexOf('cascade')).toBeLessThan(ids.indexOf('pause'));
    expect(ids.indexOf('pause')).toBeLessThan(ids.indexOf('classic'));
    expect(ids.indexOf('polyrhythm')).toBeLessThan(ids.indexOf('ramp'));
  });
  test('the deck is the 18 of v5 §4, in this order', () => {
    expect(PRESETS.map((p) => [p.id, p.group, p.texts.join(' / ')])).toEqual([
      ['cascade', '3', '3'],
      ['shower', '3', '51'],
      ['pause', '3', '441'],
      ['classic', '3', '531'],
      ['boston', '3', '52512'],
      ['box', '3', '(4,2x)(2x,4)'],
      ['fountain', '4', '4'],
      ['half-shower', '4', '53'],
      ['tower-4', '4', '7531'],
      ['polyrhythm', '4', '2 2x 2 / 2x 2'],
      ['five-cascade', '5', '5'],
      ['five-744', '5', '744'],
      ['ramp', '5', '97531'],
      ['passing', 'passing', '<3p 3|3p 3>'],
      ['ultimates', 'passing', '<3p|3p>'],
      ['three-count', 'passing', '<3p 3 3|3p 3 3>'],
      ['seven-fours', 'passing', '<4p 4p 3 3|3p 3p 4 4>'],
      ['rising-passes', 'passing', '<3p 4p 5p 3 0 3|3p 3 3p 3 3p 3>'],
    ]);
    expect(Object.keys(copy.presets).sort()).toEqual(PRESETS.map((p) => p.id).sort());
  });
  test('the nine cut cards still read as typed patterns (v5 ruling 10)', () => {
    for (const text of ['423', '55500', '534', '645']) expect(judge((partsFromVanilla(text) as { ok: true; parts: never }).parts).ok, text).toBe(true);
    expect(judge((partsFromSync('(4,4)') as { ok: true; parts: never }).parts).ok).toBe(true);
    for (const text of ['<3p 3 3 3|3p 3 3 3>', '<5p 3 1|3 3 3p>', '<3p 3 4 4|4 4 3p 3>', '<7p 1 3 1|3p 3 3 3>']) {
      expect(judge((partsFromPassing(text) as { ok: true; parts: never }).parts).ok, text).toBe(true);
    }
  });
  test('the passing cards are four hands, two jugglers', () => {
    for (const p of PRESETS.filter((q) => q.group === 'passing')) expect(p.parts.length, p.id).toBe(4);
  });
  test('the v4 passing cards (ruling 8): sourced notation, the ball count the source states, last in the group', () => {
    const sourced: Record<string, [string, number]> = {
      'seven-fours': ['<4p 4p 3 3|3p 3p 4 4>', 7],
      'rising-passes': ['<3p 4p 5p 3 0 3|3p 3 3p 3 3p 3>', 6],
    };
    const ids = PRESETS.map((q) => q.id);
    for (const q of PRESETS.filter((x) => x.group === 'passing')) expect([6, 7], q.id).toContain(q.balls);
    expect(ids.slice(-2)).toEqual(Object.keys(sourced));
    for (const [id, [text, balls]] of Object.entries(sourced)) {
      const q = PRESETS.find((x) => x.id === id)!;
      expect([q.group, q.texts, q.balls], id).toEqual(['passing', [text], balls]);
      expect(judge(q.parts).ok, id).toBe(true);
      expect(buildSchedule(q.parts).balls, id).toBe(balls);
    }
  });
  test('the sync card (v3 ruling 5): the box in 3 balls, one sync text', () => {
    const box = PRESETS.find((q) => q.id === 'box')!;
    expect([box.group, box.texts, isSyncSet(box.parts)]).toEqual(['3', ['(4,2x)(2x,4)'], true]);
    expect(copy.presets.box?.name).toBe('Box');
  });
  test('ids are unique', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe('isPresetParts', () => {
  test('parts match field for field, not by identity', () => {
    const [a, b] = [PRESETS[0]!, PRESETS[1]!];
    expect(isPresetParts(a, a.parts)).toBe(true);
    expect(isPresetParts(a, structuredClone(a.parts) as typeof a.parts)).toBe(true);
    expect(isPresetParts(a, b.parts)).toBe(false);
    expect(isPresetParts(a, [] as never)).toBe(false);
    expect(isPresetParts(a, null as never)).toBe(false);
  });
});

describe('the About page cites only checked sources', () => {
  /** Entries whose next line is the not-yet-opened marker. */
  const unopened = new Set(
    [...bibliography.matchAll(/^(\d+)\..*\n<!--/gm)].map((m) => Number(m[1])),
  );
  const prose = [...copy.aboutIntro, ...copy.aboutHow, ...copy.aboutGlossary.map((g) => g.text)];
  const cited = [...new Set(prose.flatMap((t) => [...t.matchAll(/\[(\d+(?:, \d+)*)\]/g)].flatMap((m) => (m[1] as string).split(', ').map(Number))))];

  test('the marker finds the unopened entries', () => {
    expect([...unopened].sort((a, b) => a - b)).toEqual([2, 17, 23]);
  });
  test('the three layers cite nothing by number: the sources live below them (v4.1 ruling 4)', () => {
    expect(cited).toEqual([]);
    // The pattern does find a citation, so an empty list means none, not a broken pattern.
    expect([...'as shown [16, 18].'.matchAll(/\[(\d+(?:, \d+)*)\]/g)]).toHaveLength(1);
  });
  test('three short layers: four lines on what it is, three on how to use it, four to six words', () => {
    expect(copy.aboutIntro).toHaveLength(4);
    expect(copy.aboutHow).toHaveLength(3);
    expect(copy.aboutGlossary.length).toBeGreaterThanOrEqual(4);
    expect(copy.aboutGlossary.length).toBeLessThanOrEqual(6);
    expect(copy.aboutGlossary.map((g) => g.term)).toEqual(expect.arrayContaining(['Siteswap', 'Cascade', 'Pass', 'Sync']));
  });
});
