import { describe, expect, test } from 'vitest';
import bibliography from '../../docs/BIBLIOGRAPHY.md?raw';
import polyrhythms from '../../docs/POLYRHYTHMS.md?raw';
import { buildSchedule, cycleOf, judge, ratioOf, textOf } from '../core';
import { presetOf } from '../sound/mapping';
import { KIT_SAMPLES } from '../tunables';
import { copy } from '../ui/copy';
import { hitGrid, isPresetParts, PRESETS } from './presets';

/** Every URL the two docs list, with markdown's escaped underscores undone. */
const listed = new Set(
  [polyrhythms, bibliography]
    .flatMap((doc) => doc.replace(/\\_/g, '_').match(/https?:\/\/[^\s)\]>]+/g) ?? [])
    .map((u) => u.replace(/[.,;:]+$/, '')),
);

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
  test('cites a source the docs list, or none', () => {
    if (p.sourceUrl !== null) expect(listed.has(p.sourceUrl), p.sourceUrl).toBe(true);
  });
  test('has its words', () => {
    const w = copy.presets[p.id];
    expect(w?.name).toBeTruthy();
    expect(w?.source).toBeTruthy();
    expect(w?.listen).toBeTruthy();
  });
  test('plays at a tempo the player takes, on samples the kit has', () => {
    if (p.bpm !== null) {
      expect(p.bpm).toBeGreaterThanOrEqual(40);
      expect(p.bpm).toBeLessThanOrEqual(240);
    }
    for (const v of p.mapping.parts) expect(KIT_SAMPLES).toContain(v.sample);
  });
});

/** bpm and voices (hand 1 / hand 2) as the POLYRHYTHMS.md preset table gives them, with the palette's 808 stand-ins. */
const TABLE: Record<string, [number, string, string]> = {
  bell: [120, 'cowbell', 'tom-low'],
  'son-clave': [95, 'rimshot', 'kick'],
  clapping: [160, 'clap', 'clap'],
  afrobeat: [105, 'hihat-close', 'kick'],
  rumba: [95, 'rimshot', 'kick'],
  cascara: [95, 'hihat-close', 'rimshot'],
  kotekan: [180, 'cowbell', 'clave'],
  hocket: [200, 'conga-hi', 'conga-low'],
  nadai: [60, 'clave', 'kick'],
  tihai: [100, 'snare', 'kick'],
  mbira: [130, 'cowbell', 'tom-low'],
  trance: [138, 'clave', 'kick'],
  acid: [128, 'clave', 'hihat-close'],
  'blue-rondo': [180, 'hihat-close', 'snare'],
  pyramid: [80, 'conga-mid', 'kick'],
  elvin: [200, 'hihat-open', 'kick'],
  discipline: [120, 'clave', 'cowbell'],
};

describe('the sourcebook rows', () => {
  test('tempo and voices match the table', () => {
    const rows = PRESETS.filter((p) => p.kind === 'sourcebook' && p.parts.length === 2);
    expect(rows.map((p) => p.id).sort()).toEqual(Object.keys(TABLE).sort());
    for (const p of rows) expect([p.bpm, ...p.mapping.parts.map((v) => v.sample)], p.id).toEqual(TABLE[p.id]);
  });
  const rows = PRESETS.filter((p) => p.kind === 'sourcebook' && p.parts.length === 2);
  test('each line of hits is one ball: the digits are the gap to the next hit, so they sum to the period', () => {
    for (const p of rows) {
      expect(p.balls, p.id).toBe(2);
      p.parts.forEach((part, i) => expect(textOf(part, p.parts).replace(/x/g, ''), p.id).toBe(p.texts[i]));
    }
  });
  test('play voice per part, with the row’s own drums', () => {
    for (const p of rows) {
      expect(p.mapping.byHeight, p.id).toBe(false);
      expect(presetOf(p.mapping), p.id).toBe('custom'); // the Sound tab reads own drums as an edited preset
    }
  });
  test('Clapping Music’s second hand is three pulses late, the mbira’s one', () => {
    const phase = (id: string) => PRESETS.find((p) => p.id === id)!.parts[1]!.phase;
    expect(phase('clapping')).toBe(3);
    expect(phase('mbira')).toBe(1);
    expect(phase('son-clave')).toBe(0);
  });
  test('the table’s “first five” are the polyrhythm card and four rows', () => {
    expect(PRESETS.filter((p) => p.first).map((p) => p.id)).toEqual([
      'cascade', 'pause', 'classic', 'ramp', 'polyrhythm', 'bell', 'son-clave', 'clapping', 'afrobeat',
    ]);
  });
});

describe('the layered cards', () => {
  const layers = PRESETS.filter((p) => p.parts.length > 2);
  const byId = (id: string) => PRESETS.find((p) => p.id === id)!;
  test('there are four, behind "more", within the lane limit', () => {
    expect(layers.map((p) => p.id)).toEqual(['ewe-layers', 'mbira-layers', 'clave-layers', 'stack-345']);
    for (const p of layers) {
      expect(p.first, p.id).toBe(false);
      expect(p.parts.length, p.id).toBeLessThanOrEqual(4);
      expect(judge(p.parts).ok, p.id).toBe(true);
      expect(p.mapping.parts.length, p.id).toBe(p.parts.length);
      expect(p.mapping.byHeight, p.id).toBe(false);
    }
  });
  test('the ratio is the one the parts derive', () => {
    for (const p of layers) expect(p.ratio, p.id).toEqual(ratioOf(p.parts));
  });
  test('each cites the page its two-hand sibling cites, none of its own', () => {
    expect(byId('ewe-layers').sourceUrl).toBe(byId('bell').sourceUrl);
    expect(byId('mbira-layers').sourceUrl).toBe(byId('mbira').sourceUrl);
    expect(byId('clave-layers').sourceUrl).toBe(byId('son-clave').sourceUrl);
    expect(byId('stack-345').sourceUrl).toBeNull();
  });
  test('mbira hand 2 throws on pulses 1, 4, 7, 10 of the twelve', () => {
    const s = buildSchedule(byId('mbira-layers').parts);
    const pulses = [...new Set(s.events.filter((e) => e.kind === 'throw' && e.part === 1).map((e) => e.pulse % 12))].sort((a, b) => a - b);
    expect(Array.from({ length: 12 }, (_, i) => (pulses.includes(i) ? 'x' : '.')).join('')).toBe('.x..x..x..x.');
  });
  test('part counts and cycles', () => {
    expect(layers.map((p) => [p.parts.length, p.cycle])).toEqual([[3, 12], [3, 12], [3, 16], [3, 60]]);
  });
  test('Ewe: the bell, a clap every three, the felt beat every four', () => {
    const p = byId('ewe-layers');
    expect(p.parts.map(hitGrid)).toEqual(['x.x.xx.x.x.x', 'x..x..x..x..', 'x...x...x...']);
  });
  test('mbira: the second hand one pulse late, the rattle on every pulse', () => {
    const p = byId('mbira-layers');
    expect(p.parts.map((x) => x.phase)).toEqual([0, 1, 0]);
    expect(hitGrid(p.parts[2]!)).toBe('xxxxxxxxxxxx');
  });
  test('clave: son, cascara, a four-pulse count', () => {
    const p = byId('clave-layers');
    expect(p.parts.map(hitGrid)).toEqual(['x..x..x...x.x...', 'x.xx.x.xx.x.xx.x', 'x...x...x...x...']);
  });
  test('3:4:5: spacings 20, 15, 12, one hit each, all meeting at the start', () => {
    const p = byId('stack-345');
    expect(p.parts.map((x) => x.spacing)).toEqual([20, 15, 12]);
    expect(p.balls).toBe(3);
  });
});

describe('the juggling cards', () => {
  test('come first, in order, and play height to drum', () => {
    expect(PRESETS.slice(0, 5).map((p) => [p.id, p.kind, p.mapping.byHeight])).toEqual([
      ['cascade', 'juggling', true],
      ['pause', 'juggling', true],
      ['classic', 'juggling', true],
      ['ramp', 'juggling', true],
      ['polyrhythm', 'juggling', true],
    ]);
  });
  test('ids are unique', () => {
    expect(new Set(PRESETS.map((p) => p.id)).size).toBe(PRESETS.length);
  });
});

describe('hitGrid and isPresetParts', () => {
  test('a hit grid writes x for a hit and a dot for a rest', () => {
    const son = PRESETS.find((p) => p.id === 'son-clave')!;
    expect(hitGrid(son.parts[0]!)).toBe('x..x..x...x.x...');
    expect(hitGrid(PRESETS.find((p) => p.id === 'hocket')!.parts[1]!)).toBe('.x');
  });
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
