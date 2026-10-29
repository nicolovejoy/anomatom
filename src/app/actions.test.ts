import { describe, expect, test } from 'vitest';
import { judge, partsFromLines, partsFromOnsets, textOf, throwsOf } from '../core';
import type { Part, Parts } from '../core';
import { applyPreset } from '../sound/mapping';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { BPM_RANGE } from '../tunables';
import { groupOf, isManualGroup, parseDraft, reduce, rescale, type Action } from './actions';
import { defaultState, type AppState } from './state';

const one = { a: 1, b: 1 };
const threeTwo = { a: 3, b: 2 };
const on = (s: string) => [...s].map((c) => c === 'x');
const texts = (parts: Parts) => parts.map((p) => textOf(p, parts));
const kind = (s: AppState, i: number) => (s.parts[i] as Part).flights.kind;
const at = (parts: Parts, ratio = one, extra: Partial<AppState> = {}): AppState => ({
  ...defaultState(),
  parts,
  drafts: parts.map(() => null),
  ratio,
  ...extra,
});
const run = (s: AppState, ...actions: Action[]) => actions.reduce(reduce, s);

describe('every action clears the notice first', () => {
  test('even one that changes nothing else', () => {
    const s = { ...defaultState(), notice: 'old' };
    const next = reduce(s, { type: 'setBpm', bpm: s.bpm });
    expect(next.notice).toBeNull();
    expect(next.parts).toBe(s.parts);
    // With no notice to clear, a no-op is the very same state.
    expect(reduce(defaultState(), { type: 'setBpm', bpm: Number.NaN })).toEqual(defaultState());
    const d = defaultState();
    expect(reduce(d, { type: 'setBpm', bpm: d.bpm })).toBe(d);
  });
});

describe('editDraft', () => {
  test('at 1:1 one input is vanilla siteswap: the parts follow, the draft stays as typed', () => {
    const s = reduce(defaultState(), { type: 'editDraft', part: 0, text: '531' });
    expect(s.parts).toEqual(vanillaParts('531'));
    expect(s.drafts).toEqual(['531', null]);
    // `22` reads as the cascade `2` and still shows as typed.
    const t = reduce(s, { type: 'editDraft', part: 0, text: '22' });
    expect(texts(t.parts)).toEqual(['2', '2']);
    expect(t.drafts[0]).toBe('22');
  });

  test('at 1:1 a slash means form 2: two parts at phase 0, spacing 1, unit 1', () => {
    const s = reduce(defaultState(), { type: 'editDraft', part: 0, text: '3 / 3' });
    expect(s.parts).toEqual(partsFromLines(['3', '3'], one).ok && (partsFromLines(['3', '3'], one) as { parts: Parts }).parts);
    expect(s.parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [1, 0, 1],
      [1, 0, 1],
    ]);
    expect(s.drafts).toEqual(['3 / 3', null]);
    // Three parts: the drafts follow the parts.
    const three = reduce(s, { type: 'editDraft', part: 0, text: '1 / 1 / 1' });
    expect(three.parts.length).toBe(3);
    expect(three.drafts).toEqual(['1 / 1 / 1', null, null]);
  });

  test('a failed parse keeps the draft and leaves the parts alone', () => {
    const d = defaultState();
    const s = reduce(d, { type: 'editDraft', part: 0, text: '4#1' });
    expect(s.parts).toBe(d.parts);
    expect(s.drafts).toEqual(['4#1', null]);
    expect(parseDraft(d, 0, '4#1')).toEqual({ ok: false, error: { kind: 'bad-char', index: 1 } });
    expect(parseDraft(d, 0, '3 / #')).toEqual({ ok: false, error: { kind: 'bad-char', index: 4 } });
    // At other ratios, the other input keeps its draft.
    const r = typed(['2', '2'], threeTwo);
    const bad = run(r, { type: 'editDraft', part: 1, text: '9?' }, { type: 'editDraft', part: 0, text: '' });
    expect(bad.drafts).toEqual(['', '9?']);
    expect(bad.parts).toBe(r.parts);
    const good = reduce(bad, { type: 'editDraft', part: 0, text: '4' });
    expect(good.drafts).toEqual(['4', '9?']);
  });

  test('at a ratio each input is one hand in one-hand counting; a slash is not allowed', () => {
    const s = typed(['2 2x 2', '2x 2'], threeTwo);
    expect(s.parts).toEqual(lineParts(['2 2x 2', '2x 2'], threeTwo));
    expect(parseDraft(s, 0, '2 / 2')).toEqual({ ok: false, error: { kind: 'bad-char', index: 2 } });
    // An input with no part, or past the one input at 1:1, does nothing.
    expect(reduce(s, { type: 'editDraft', part: 2, text: '3' })).toBe(s);
    const d = defaultState();
    expect(reduce(d, { type: 'editDraft', part: 1, text: '3' })).toBe(d);
  });

  test('an x into a default part makes it manual: the group is manual, with the throws its rule had', () => {
    const s = at(partsFromOnsets([on('xxx'), on('xx')], [2, 3]), threeTwo);
    const next = reduce(s, { type: 'editDraft', part: 0, text: '2 2x 2' });
    expect([kind(next, 0), kind(next, 1)]).toEqual(['manual', 'manual']);
    expect(throwsOf(next.parts[1] as Part)).toEqual(throwsOf(s.parts[1] as Part));
    // Without a cross the other part stays default.
    const plain = reduce(s, { type: 'editDraft', part: 0, text: '3 3 3' });
    expect([kind(plain, 0), kind(plain, 1)]).toEqual(['manual', 'default']);
  });
});

describe('onset changes on a manual group reset it, with a notice', () => {
  test('toggleOnset: a default part keeps its k and no notice', () => {
    const s = at(partsFromOnsets([on('x.x.'), on('xx')], [1, 1], [2, 1]));
    const next = reduce(s, { type: 'toggleOnset', part: 0, beat: 1 });
    expect(next.parts[0]?.flights).toEqual({ kind: 'default', onsets: on('xxx.'), k: 2 });
    expect(next.notice).toBeNull();
    expect(next.parts[1]).toBe(s.parts[1]);
    expect(reduce(s, { type: 'toggleOnset', part: 0, beat: 4 })).toBe(s);
    expect(reduce(s, { type: 'toggleOnset', part: 5, beat: 0 })).toBe(s);
  });

  test('toggleOnset on a vanilla pair drops its flights and re-derives both hands at k = 1', () => {
    const s = typed(['531']);
    const next = reduce(s, { type: 'toggleOnset', part: 1, beat: 2 });
    expect(next.parts.map((p) => p.flights)).toEqual([
      { kind: 'default', onsets: on('xxx'), k: 1 },
      { kind: 'default', onsets: on('xx.'), k: 1 },
    ]);
    expect(next.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
    expect(next.drafts).toEqual([null, null]);
    expect(judge(next.parts).ok).toBe(true);
  });

  test('generate: euclid over the part’s period; a manual part on its own is reset with a notice for one hand', () => {
    const s = at(partsFromOnsets([on('........'), on('x')], [1, 1], [3, 1]));
    const next = reduce(s, { type: 'generate', part: 0, hits: 3 });
    expect(next.parts[0]?.flights).toEqual({ kind: 'default', onsets: on('x..x..x.'), k: 3 });
    expect(next.notice).toBeNull();
    expect(reduce(s, { type: 'generate', part: 2, hits: 3 })).toBe(s);
    const manual = typed(['3 3', '2'], threeTwo);
    const reset = reduce(manual, { type: 'generate', part: 1, hits: 1 });
    expect(reset.parts[1]?.flights).toEqual({ kind: 'default', onsets: [true], k: 1 });
    expect(kind(reset, 0)).toBe('manual');
    expect(reset.notice).toBe('I reset hand 2 to 1 ball.');
  });
});

describe('setK', () => {
  test('sets a default part’s ball knob; a manual group has none', () => {
    const s = at(partsFromOnsets([on('x..x..x.')], [1]));
    const next = reduce(s, { type: 'setK', part: 0, k: 2.2 });
    expect(next.parts[0]?.flights).toEqual({ kind: 'default', onsets: on('x..x..x.'), k: 2 });
    expect(reduce(s, { type: 'setK', part: 0, k: 0 }).parts[0]?.flights).toMatchObject({ k: 1 });
    expect(reduce(s, { type: 'setK', part: 0, k: 1 })).toBe(s);
    expect(reduce(s, { type: 'setK', part: 0, k: Number.NaN })).toBe(s);
    expect(reduce(s, { type: 'setK', part: 3, k: 2 })).toBe(s);
    const v = typed(['531']);
    expect(reduce(v, { type: 'setK', part: 0, k: 2 })).toBe(v);
  });

  test('a default part an x lands in belongs to a manual group: ignored there too', () => {
    // Hand 1 manual, crossing into hand 2, which is default.
    const parts: Parts = [
      { spacing: 1, phase: 0, unit: 1, flights: { kind: 'manual', throws: [{ height: 1, to: 1 }] } },
      { spacing: 1, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } },
    ];
    expect(isManualGroup(parts, groupOf(parts, 1))).toBe(true);
    const s = at(parts);
    expect(reduce(s, { type: 'setK', part: 1, k: 2 })).toBe(s);
  });
});

describe('setPhase', () => {
  const clapping = on('xxx.xx.x.xx.');
  test('in whole pulses it moves only that part; the cycle stays', () => {
    const s = at(partsFromOnsets([clapping, clapping], [1, 1]));
    const next = reduce(s, { type: 'setPhase', part: 1, phase: 3 });
    expect(next.parts.map((p) => p.phase)).toEqual([0, 3]);
    expect(next.notice).toBeNull();
    expect(reduce(next, { type: 'setPhase', part: 1, phase: 3 })).toBe(next);
    expect(reduce(s, { type: 'setPhase', part: 4, phase: 1 })).toBe(s);
    expect(reduce(s, { type: 'setPhase', part: 1, phase: Number.NaN })).toBe(s);
  });

  test('a phase between pulses refines the lattice (MATH.md §9.6), up to MAX_PHASE_REFINEMENT', () => {
    const s = at(partsFromOnsets([on('x'), on('x')], [1, 1]));
    const next = reduce(s, { type: 'setPhase', part: 1, phase: 0.5 });
    expect(next.parts.map((p) => [p.spacing, p.phase])).toEqual([
      [2, 0],
      [2, 1],
    ]);
    expect(reduce(s, { type: 'setPhase', part: 1, phase: 1 / 65 })).toBe(s);
    expect(reduce(s, { type: 'setPhase', part: 1, phase: Math.PI })).toBe(s);
  });

  test('a part in a manual group of several parts: its crosses move, so the group is reset first', () => {
    const v = typed(['531']);
    const next = reduce(v, { type: 'setPhase', part: 1, phase: 0 });
    expect(next.parts.every((p) => p.flights.kind === 'default')).toBe(true);
    expect(next.parts.map((p) => p.phase)).toEqual([0, 0]);
    expect(next.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
    // Refused as too fine: nothing is reset either.
    expect(reduce(v, { type: 'setPhase', part: 1, phase: 1 / 65 })).toBe(v);
  });

  test('a manual part on its own keeps its flights: they move with it', () => {
    const s = typed(['3 0 0', '2'], threeTwo);
    const next = reduce(s, { type: 'setPhase', part: 0, phase: 2 });
    expect(kind(next, 0)).toBe('manual');
    expect(next.parts[0]?.phase).toBe(2);
    expect(next.notice).toBeNull();
  });
});

describe('resetGroup', () => {
  test('makes every part of the group default at k = 1, on its onsets, without a notice', () => {
    const v = typed(['501']);
    const next = reduce(v, { type: 'resetGroup', part: 0 });
    expect(next.parts.map((p) => p.flights)).toEqual([
      { kind: 'default', onsets: on('xx.'), k: 1 },
      { kind: 'default', onsets: on('.xx'), k: 1 },
    ]);
    expect(next.notice).toBeNull();
    expect(reduce(next, { type: 'resetGroup', part: 0 })).toBe(next);
    expect(reduce(v, { type: 'resetGroup', part: 2 })).toBe(v);
    const k2 = at(partsFromOnsets([on('x.')], [1], [2]));
    expect(reduce(k2, { type: 'resetGroup', part: 0 }).parts[0]?.flights).toMatchObject({ k: 1 });
  });
});

describe('setRatio', () => {
  test('the same reduced ratio keeps the parts; an invalid one is refused', () => {
    const d = defaultState();
    const s = reduce(d, { type: 'setRatio', ratio: { a: 2, b: 2 } });
    expect(s.ratio).toEqual({ a: 2, b: 2 });
    expect(s.parts).toBe(d.parts);
    expect(reduce(d, { type: 'setRatio', ratio: { a: 1, b: 1 } })).toBe(d);
    expect(reduce(d, { type: 'setRatio', ratio: { a: 0, b: 1 } })).toBe(d);
    expect(reduce(d, { type: 'setRatio', ratio: { a: 10, b: 1 } })).toBe(d);
    // Not two parts: only the chips follow.
    const three = typed(['1 / 1 / 1']);
    expect(reduce(three, { type: 'setRatio', ratio: threeTwo }).parts).toBe(three.parts);
  });

  test('parts keep their digits at the new spacings', () => {
    const s = typed(['2', '2'], threeTwo);
    const next = reduce(s, { type: 'setRatio', ratio: { a: 4, b: 3 } });
    expect(next.parts).toEqual(lineParts(['2', '2'], { a: 4, b: 3 }));
    expect(next.notice).toBeNull();
    expect(next.drafts).toEqual([null, null]);
    // A cross that still lands is kept: 2 2x 2 / 2x 2 at 1:1 is two parts of spacing 1.
    const poly = reduce(typed(['2 2x 2', '2x 2'], threeTwo), { type: 'setRatio', ratio: one });
    expect(texts(poly.parts)).toEqual(['2 2x 2', '2x 2']);
    expect(poly.notice).toBeNull();
  });

  test('a manual group whose cross can no longer land is reset, with a notice; a vanilla pair loses its half-beat offset', () => {
    const next = reduce(defaultState(), { type: 'setRatio', ratio: threeTwo });
    expect(next.parts.map((p) => [p.spacing, p.phase, p.flights.kind])).toEqual([
      [2, 0, 'default'],
      [3, 0, 'default'],
    ]);
    expect(next.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
    // Default parts keep their onsets and k.
    const d = at(partsFromOnsets([on('x.'), on('x')], [1, 1], [2, 1]));
    expect(reduce(d, { type: 'setRatio', ratio: threeTwo }).parts.map((p) => p.flights)).toEqual(d.parts.map((p) => p.flights));
  });

  test('rescale keeps each phase as the same share of its beat, refining when it must', () => {
    const beat = (phase: number): Part => ({ spacing: 2, phase, unit: 2, flights: { kind: 'default', onsets: [true], k: 1 } });
    const half: Parts = [beat(0), beat(1)];
    expect(rescale(half, [2, 3]).map((p) => [p.spacing, p.phase])).toEqual([
      [4, 0],
      [6, 3],
    ]);
    // A share past the finest refinement goes to phase 0.
    const fine: Parts = [
      { spacing: 65, phase: 1, unit: 65, flights: { kind: 'default', onsets: [true], k: 1 } },
      { spacing: 1, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } },
    ];
    expect(rescale(fine, [1, 1]).map((p) => p.phase)).toEqual([0, 0]);
  });
});

describe('setBpm and loadPreset', () => {
  test('setBpm is whole and in range', () => {
    expect(reduce(defaultState(), { type: 'setBpm', bpm: 99.6 }).bpm).toBe(100);
    expect(reduce(defaultState(), { type: 'setBpm', bpm: 1 }).bpm).toBe(BPM_RANGE.min);
  });

  test('loadPreset replaces the parts, ratio and, when given, tempo and mapping', () => {
    const s = { ...typed(['4#']), notice: 'x' };
    const parts = lineParts(['2 2x 2', '2x 2'], threeTwo);
    const next = reduce(s, { type: 'loadPreset', parts, ratio: threeTwo });
    expect(next).toMatchObject({ parts, ratio: threeTwo, bpm: s.bpm, mapping: s.mapping, drafts: [null, null], notice: null });
    const m = applyPreset('height-drum');
    expect(reduce(s, { type: 'loadPreset', parts, ratio: threeTwo, bpm: 90, mapping: m })).toMatchObject({ bpm: 90, mapping: m });
  });
});

describe('swapSites (MATH.md §3)', () => {
  test('on a vanilla pair the sites are the siteswap’s, as the input shows it', () => {
    const s = reduce(typed(['531']), { type: 'swapSites', part: 0, i: 0, j: 1 });
    expect(texts(s.parts)).toEqual(['441', '441']);
    expect(s.drafts).toEqual([null, null]);
    // `22` shows two sites, though as parts it is the cascade `2`.
    expect(texts(reduce(typed(['22']), { type: 'swapSites', part: 0, i: 0, j: 1 }).parts)).toEqual(['31', '31']);
    // A draft that does not read: the parts' own siteswap.
    expect(texts(reduce(typed(['42']), { type: 'editDraft', part: 0, text: '4#' }).parts)).toEqual(['42', '42']);
    expect(texts(run(typed(['42']), { type: 'editDraft', part: 0, text: '4#' }, { type: 'swapSites', part: 0, i: 0, j: 1 }).parts)).toEqual(['3', '3']);
    const impossible = typed(['03']);
    expect(reduce(impossible, { type: 'swapSites', part: 0, i: 0, j: 1 })).toBe(impossible);
  });

  test('on a part, its beats are its sites; a default part becomes manual', () => {
    const s = reduce(typed(['2 2', '2'], threeTwo), { type: 'swapSites', part: 0, i: 0, j: 1 });
    expect(texts(s.parts)).toEqual(['3 1', '2']);
    const d = at(partsFromOnsets([on('xx')], [1]));
    const swapped = reduce(d, { type: 'swapSites', part: 0, i: 0, j: 1 });
    expect(kind(swapped, 0)).toBe('manual');
    expect(texts(swapped.parts)).toEqual(['2 0']);
    expect(reduce(d, { type: 'swapSites', part: 0, i: 0, j: 5 })).toBe(d);
    expect(reduce(d, { type: 'swapSites', part: 3, i: 0, j: 1 })).toBe(d);
  });
});
