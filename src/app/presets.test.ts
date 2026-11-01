import { describe, expect, test } from 'vitest';
import bibliography from '../../docs/BIBLIOGRAPHY.md?raw';
import { buildSchedule, cycleOf, isPassingSet, isSyncSet, judge } from '../core';
import { KIT_IDS, KIT_SAMPLES, PASSING_CARD } from '../tunables';
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
  test('plays height to drum, on samples the kit has', () => {
    expect(p.mapping.byHeight).toBe(true);
    for (const v of p.mapping.parts) expect(KIT_SAMPLES).toContain(v.sample);
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
  test('every kit of PASSING_CARD is a kit the app has', () => {
    for (const v of PASSING_CARD.voices) expect(KIT_IDS).toContain(v.kit);
  });
  test('the passing cards give each juggler a kit and a pan, on four voices', () => {
    for (const p of PRESETS.filter((q) => q.group === 'passing')) {
      expect(p.parts.length, p.id).toBe(4);
      expect(p.mapping.parts.map((v) => [v.kit, v.pan]), p.id).toEqual([['TR-808', -0.8], ['TR-808', -0.4], ['LM-2', 0.4], ['LM-2', 0.8]]);
    }
    expect(PRESETS.find((q) => q.id === 'passing')!.texts).toEqual(['<3p 3|3p 3>']);
  });
  test('the v4 passing cards (ruling 8): sourced notation, the ball count the source states, last in the group', () => {
    const sourced: Record<string, [string, number]> = {
      'pass-pass-self': ['<3p 3p 3|3p 3p 3>', 6],
      'book-ends': ['<3p 3 3p 3 3p|3p 3 3p 3 3p>', 6],
      'five-pass': ['<5p 3 1|3 3 3p>', 6],
      'seven-four-count': ['<3p 3 4 4|4 4 3p 3>', 7],
      'seven-fours': ['<4p 4p 3 3|3p 3p 4 4>', 7],
    };
    const ids = PRESETS.map((q) => q.id);
    expect(ids.slice(-5)).toEqual(Object.keys(sourced));
    for (const [id, [text, balls]] of Object.entries(sourced)) {
      const q = PRESETS.find((x) => x.id === id)!;
      expect([q.group, q.texts, q.balls], id).toEqual(['passing', [text], balls]);
      expect(judge(q.parts).ok, id).toBe(true);
      expect(buildSchedule(q.parts).balls, id).toBe(balls);
    }
  });
  test('the sync cards (v3 ruling 5): the box in 3 balls, the synchronous fountain in 4, each one sync text', () => {
    const box = PRESETS.find((q) => q.id === 'box')!;
    const fountain = PRESETS.find((q) => q.id === 'sync-fountain')!;
    expect([box.group, box.texts, isSyncSet(box.parts)]).toEqual(['3', ['(4,2x)(2x,4)'], true]);
    expect([fountain.group, fountain.texts, isSyncSet(fountain.parts)]).toEqual(['4', ['(4,4)'], true]);
    expect(copy.presets.box?.name).toBe('Box');
    expect(copy.presets['sync-fountain']?.name).toBe('Synchronous fountain');
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
  const prose = [...copy.aboutLayers.flatMap((l) => l.paragraphs), ...copy.aboutPresets, ...copy.aboutColotomy];
  const cited = [...new Set(prose.flatMap((t) => [...t.matchAll(/\[(\d+(?:, \d+)*)\]/g)].flatMap((m) => (m[1] as string).split(', ').map(Number))))];

  test('the marker finds the unopened entries', () => {
    expect([...unopened].sort((a, b) => a - b)).toEqual([2, 17, 23]);
  });
  test('every cited number is a bibliography entry and none is unopened', () => {
    expect(cited.length).toBeGreaterThan(5);
    for (const n of cited) {
      expect(new RegExp(`^${n}\\. `, 'm').test(bibliography), `entry ${n}`).toBe(true);
      expect(unopened.has(n), `entry ${n} is unopened`).toBe(false);
    }
  });
  test('each layer of the model has a section', () => {
    expect(copy.aboutLayers.map((l) => l.heading)).toHaveLength(6);
  });
});
