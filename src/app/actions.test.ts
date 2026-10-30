import { describe, expect, test } from 'vitest';
import { judge, onsetsOf, partsFromLines, partsFromOnsets, ratesOf, textOf, throwsOf, withPhase } from '../core';
import type { Part, Parts } from '../core';
import { applyPreset } from '../sound/mapping';
import { lineParts, typed, vanillaParts } from '../test/schedules';
import { BPM_RANGE, MAX_LANES, MAX_PERIOD, MAX_RATE } from '../tunables';
import { groupOf, isManualGroup, parseDraft, reduce, rescale, type Action } from './actions';
import { derived } from './derived';
import { fixActions } from './knobs-model';
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
    // Two hands on screen: the editor writes at most two parts.
    const three = reduce(s, { type: 'editDraft', part: 0, text: '1 / 1 / 1' });
    expect(three.parts).toBe(s.parts);
    expect(parseDraft(s, 0, '1 / 1 / 1')).toEqual({ ok: false, error: { kind: 'too-many-parts', max: 2 } });
  });

  test('a draft edits flights, never grids: phases, spacings and a refined lattice stay', () => {
    const clapping = on('xxx.xx.x.xx.');
    const s = at(withPhase(partsFromOnsets([clapping, clapping], [1, 1]), 1, 3, 1));
    const text = texts(s.parts).join(' / ');
    const again = reduce(s, { type: 'editDraft', part: 0, text });
    expect(again.parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [1, 0, 1],
      [1, 3, 1],
    ]);
    expect(texts(again.parts)).toEqual(texts(s.parts));
    // `3 0 / 1 1`, part 2 half a pulse late, then a fix applied: the lattice stays refined.
    const refined = reduce(typed(['3 0 / 1 1']), { type: 'setPhase', part: 1, phase: 0.5 });
    expect(refined.parts.map((p) => [p.spacing, p.phase])).toEqual([
      [2, 0],
      [2, 1],
    ]);
    const d = derived(refined);
    expect(d.fixes.length).toBeGreaterThan(0);
    const fixed = fixActions(refined, d.fixTexts[0] as string[]).reduce(reduce, refined);
    expect(fixed.parts).toEqual(d.fixes[0]);
    expect(fixed.parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 0, 2],
      [2, 1, 2],
    ]);
    // A part the text adds comes in at phase 0 on the last part's spacing; one it drops is gone.
    const solo = at([{ spacing: 2, phase: 1, unit: 2, flights: { kind: 'default', onsets: [true], k: 1 } }]);
    const two = reduce(solo, { type: 'editDraft', part: 0, text: '2 / 2' });
    expect(two.parts.map((p) => [p.spacing, p.phase, p.unit])).toEqual([
      [2, 1, 2],
      [2, 0, 2],
    ]);
    expect(two.drafts).toEqual(['2 / 2', null]);
    const three = at(lineParts(['1x2', '1x3', '1x1'], one).map((p, i) => ({ ...p, spacing: i + 1, unit: i + 1 })));
    // Three parts have an input each (lanes ruling 3): a `/` there is refused, not a way to drop one.
    const dropped = reduce(three, { type: 'editDraft', part: 0, text: '1 / 1' });
    expect(dropped.parts).toBe(three.parts);
    expect(dropped.drafts).toEqual(['1 / 1', null, null]);
  });

  test('a single string is vanilla over two parts, and one part’s line over one', () => {
    const s = at(partsFromOnsets([on('x.x')], [1]));
    const next = reduce(s, { type: 'editDraft', part: 0, text: '4 0 2' });
    expect(next.parts.length).toBe(1);
    expect(texts(next.parts)).toEqual(['4 0 2']);
    expect(next.parts[0]?.flights.kind).toBe('manual');
    // An x has no other hand to go to.
    expect(parseDraft(s, 0, '3x')).toMatchObject({ ok: false, error: { kind: 'bad-target' } });
    // Over two parts the same string is vanilla.
    const two = at(partsFromOnsets([on('x'), on('x')], [1, 1]));
    expect(reduce(two, { type: 'editDraft', part: 0, text: '531' }).parts).toEqual(vanillaParts('531'));
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
    const three = at(lineParts(['1x2', '1x3', '1x1'], one));
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

describe('lanes (docs/plans/lanes.md)', () => {
  const voice = (sample: string) => ({ kit: 'TR-808', sample, pan: 0, gain: 1 });
  const withVoices = (s: AppState, ...samples: string[]): AppState => ({ ...s, mapping: { ...s.mapping, parts: samples.map(voice) } });
  const flights = (s: AppState) => s.parts.map((p) => p.flights);

  test('addLane: a default part on the last part’s rate and steps, phase 0, one onset on beat 0, k = 1', () => {
    const s = typed(['2 2 0', '2 0'], threeTwo);
    const next = reduce(s, { type: 'addLane' });
    expect(next.parts).toHaveLength(3);
    expect(next.parts[2]).toEqual({ spacing: 3, phase: 0, unit: 3, flights: { kind: 'default', onsets: [true, false], k: 1 } });
    expect(ratesOf(next.parts)).toEqual([3, 2, 2]);
    expect(next.parts.slice(0, 2)).toEqual(s.parts);
    expect(next.drafts).toEqual([null, null, null]);
    expect(next.ratio).toEqual(threeTwo);
    // On the vanilla pair: the last part's steps, its spacing, a voice for the new part.
    const v = reduce(defaultState(), { type: 'addLane' });
    expect(v.parts[2]).toMatchObject({ phase: 0, flights: { kind: 'default', onsets: [true], k: 1 } });
    expect(v.parts[2]?.spacing).toBe(v.parts[0]?.spacing);
    expect(v.mapping.parts).toHaveLength(3);
    expect(v.mapping.parts[2]).toEqual(defaultState().mapping.parts[0]);
    expect(v.notice).toBeNull();
  });

  test('addLane stops at MAX_LANES', () => {
    const full = run(defaultState(), ...Array.from({ length: MAX_LANES }, (): Action => ({ type: 'addLane' })));
    expect(full.parts).toHaveLength(MAX_LANES);
    expect(reduce(full, { type: 'addLane' })).toBe(full);
    const none = at([]);
    expect(reduce(none, { type: 'addLane' })).toBe(none);
  });

  test('removeLane: a lane a cross reaches resets the rest of its group, with a notice', () => {
    const s = reduce(defaultState(), { type: 'removeLane', part: 1 });
    expect(s.parts).toHaveLength(1);
    expect(s.parts[0]).toEqual({ spacing: 1, phase: 0, unit: 1, flights: { kind: 'default', onsets: [true], k: 1 } });
    expect(s.notice).toBe('I reset hand 1 to 1 ball.');
    expect(s.mapping.parts).toEqual([defaultState().mapping.parts[0]]);
    expect(s.drafts).toEqual([null]);
    // The only lane stays; a missing one is refused.
    const quiet = { ...s, notice: null };
    expect(reduce(quiet, { type: 'removeLane', part: 0 })).toBe(quiet);
    const d = defaultState();
    expect(reduce(d, { type: 'removeLane', part: 2 })).toBe(d);
  });

  test('removeLane: a lone lane goes with its voice; crosses into later lanes are renumbered', () => {
    const r = partsFromLines(['1', '2 2x3 2', '2x2 2'], one, [6, 2, 3]);
    const s = withVoices(at((r as { parts: Parts }).parts), 'kick', 'snare', 'clap');
    const next = reduce(s, { type: 'removeLane', part: 0 });
    expect(texts(next.parts)).toEqual(['2 2x 2', '2x 2']);
    expect(judge(next.parts).ok).toBe(true);
    expect(next.notice).toBeNull();
    expect(next.mapping.parts.map((p) => p.sample)).toEqual(['snare', 'clap']);
    expect(next.ratio).toEqual(threeTwo);
    // A mapping that borrows voices (fewer than the parts) keeps what it has, up to the parts left.
    const borrowing = withVoices(at((r as { parts: Parts }).parts), 'kick', 'snare');
    expect(reduce(borrowing, { type: 'removeLane', part: 2 }).mapping.parts.map((p) => p.sample)).toEqual(['kick', 'snare']);
    // The last lane of a cross group: the other one is reset, and named as numbered after.
    const tail = reduce(s, { type: 'removeLane', part: 2 });
    expect(tail.notice).toBe('I reset hand 2 to 1 ball.');
    expect(kind(tail, 1)).toBe('default');
  });

  test('setRate: rates 3 and 2 are 3:2; 3, 4 and 5 are a layered stack', () => {
    const two = at(partsFromOnsets([on('x'), on('x')], [1, 1]));
    const tp = run(two, { type: 'setRate', part: 0, rate: 3 }, { type: 'setRate', part: 1, rate: 2 });
    expect(ratesOf(tp.parts)).toEqual([3, 2]);
    expect(tp.ratio).toEqual(threeTwo);
    expect(flights(tp)).toEqual(flights(two));
    const three = at(partsFromOnsets([on('x'), on('x'), on('x')], [1, 1, 1]));
    const stack = run(three, { type: 'setRate', part: 0, rate: 3 }, { type: 'setRate', part: 1, rate: 4 }, { type: 'setRate', part: 2, rate: 5 });
    expect(ratesOf(stack.parts)).toEqual([3, 4, 5]);
    expect(stack.parts.map((p) => p.spacing)).toEqual([20, 15, 12]);
    expect(stack.ratio).toEqual({ a: 3, b: 4 });
  });

  test('setRate refuses a rate out of range, the same rates, a lone part, a missing one and a cycle no link could carry', () => {
    const two = at(partsFromOnsets([on('x'), on('x')], [1, 1]));
    expect(reduce(two, { type: 'setRate', part: 0, rate: 0 })).toBe(two);
    expect(reduce(two, { type: 'setRate', part: 0, rate: MAX_RATE + 1 })).toBe(two);
    expect(reduce(two, { type: 'setRate', part: 0, rate: 1 })).toBe(two);
    expect(reduce(two, { type: 'setRate', part: 2, rate: 2 })).toBe(two);
    const lone = at(partsFromOnsets([on('x')], [1]));
    expect(reduce(lone, { type: 'setRate', part: 0, rate: 3 })).toBe(lone);
    const long = on('x...............');
    const wide = at(partsFromOnsets([long, long, long, long], [280, 315, 360, 1]));
    expect(reduce(wide, { type: 'setRate', part: 3, rate: 5 })).toBe(wide);
  });

  test('setRate on a vanilla pair resets it, with a notice, as setRatio does; a manual lone part keeps its digits', () => {
    const v = reduce(defaultState(), { type: 'setRate', part: 0, rate: 3 });
    expect(ratesOf(v.parts)).toEqual([3, 1]);
    expect(v.parts.map((p) => p.flights.kind)).toEqual(['default', 'default']);
    expect(v.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
    expect(v.ratio).toEqual({ a: 3, b: 1 });
    const manual = at([...lineParts(['3 0 0'], one), ...partsFromOnsets([on('x')], [1])]);
    const next = reduce(manual, { type: 'setRate', part: 1, rate: 2 });
    expect(ratesOf(next.parts)).toEqual([1, 2]);
    expect(kind(next, 0)).toBe('manual');
    expect(texts(next.parts)).toEqual(['3 0 0', '1']);
    expect(next.notice).toBeNull();
  });

  test('setSteps pads with rests and drops the tail; a default part keeps its k; the phase wraps', () => {
    const s = at(partsFromOnsets([on('x.x'), on('x')], [1, 1], [2, 1]));
    const padded = reduce(s, { type: 'setSteps', part: 0, steps: 5 });
    expect(padded.parts[0]?.flights).toEqual({ kind: 'default', onsets: on('x.x..'), k: 2 });
    expect(padded.notice).toBeNull();
    expect(reduce(s, { type: 'setSteps', part: 0, steps: 2 }).parts[0]?.flights).toEqual({ kind: 'default', onsets: on('x.'), k: 2 });
    const late = at([{ spacing: 1, phase: 5, unit: 1, flights: { kind: 'default', onsets: on('x.......'), k: 1 } }]);
    expect(reduce(late, { type: 'setSteps', part: 0, steps: 4 }).parts[0]?.phase).toBe(1);
  });

  test('setSteps on a manual group resets it, with the notice; out of range, the same steps and too long a cycle are refused', () => {
    const v = reduce(typed(['531']), { type: 'setSteps', part: 0, steps: 4 });
    expect(v.parts.map((p) => p.flights.kind)).toEqual(['default', 'default']);
    expect(v.notice).toBe('I reset hands 1 and 2 to 1 ball each.');
    expect(onsetsOf(v.parts[0] as Part)).toEqual(on('xxx.'));
    const s = at(partsFromOnsets([on('x.x')], [1]));
    expect(reduce(s, { type: 'setSteps', part: 0, steps: 0 })).toBe(s);
    expect(reduce(s, { type: 'setSteps', part: 0, steps: MAX_PERIOD + 1 })).toBe(s);
    expect(reduce(s, { type: 'setSteps', part: 0, steps: 3 })).toBe(s);
    expect(reduce(s, { type: 'setSteps', part: 1, steps: 3 })).toBe(s);
    const wide = at(partsFromOnsets([on('x...............'), on('x')], [7, 9]));
    expect(reduce(wide, { type: 'setSteps', part: 1, steps: 15 })).toBe(wide);
  });

  test('the ratio follows the parts after every action; the mapping has a voice per part', () => {
    // A preset whose ratio disagrees with its parts: the parts win.
    const parts = lineParts(['2', '2'], threeTwo);
    const loaded = reduce(defaultState(), { type: 'loadPreset', parts, ratio: { a: 5, b: 4 } });
    expect(loaded.ratio).toEqual(threeTwo);
    // Agreeing, unreduced, it is kept as written (the steppers' 2:2).
    const two = reduce(defaultState(), { type: 'loadPreset', parts: lineParts(['2', '2'], one), ratio: { a: 2, b: 2 } });
    expect(two.ratio).toEqual({ a: 2, b: 2 });
    // Fewer parts than voices: the tail goes.
    const three = withVoices(at(partsFromOnsets([on('x'), on('x'), on('x')], [1, 1, 1])), 'kick', 'snare', 'clap');
    expect(reduce(three, { type: 'loadPreset', parts, ratio: threeTwo }).mapping.parts.map((p) => p.sample)).toEqual(['kick', 'snare']);
    // A mapping with no voices is left alone.
    const silent = { ...three, mapping: { ...three.mapping, parts: [] } };
    expect(reduce(silent, { type: 'loadPreset', parts, ratio: threeTwo }).mapping.parts).toEqual([]);
  });
});
