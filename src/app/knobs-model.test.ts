import { describe, expect, test } from 'vitest';
import { scheduleOf, typed } from '../test/schedules';
import { partsFromOnsets } from '../core';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import type { PlayerView, Segment } from '../view/types';
import { reduce } from './actions';
import { derived } from './derived';
import {
  analyse,
  badChar,
  clampBpm,
  cyclePosition,
  cycleSamples,
  draftAction,
  joinInputs,
  showsPassKey,
  splitInputs,
  splitText,
  editChanged,
  editText,
  fixActions,
  fixLabel,
  hand2Bpm,
  handState,
  inputText,
  joinAction,
  pieces,
  reduceRatio,
  siteCovering,
  statusLines,
  stepRatio,
  swapAction,
  toggleSite,
  warnSites,
} from './knobs-model';
import { defaultState, type AppState } from './state';

const one = { a: 1, b: 1 };
const threeTwo = { a: 3, b: 2 };

describe('analyse and the fix state', () => {
  test('a juggleable pattern: ball count, the indicator ok (hand 2 hidden at 1:1), no warnings', () => {
    const a = analyse(typed(['3']));
    expect(a.balls).toBe(3);
    expect(a.fixable).toBe(false);
    expect(handState(a, 0)).toBe('ok');
    expect(handState(a, 1)).toBe('hidden');
    expect(statusLines(a)).toEqual(['I have 3 balls.']);
    expect(warnSites(a, 0).size).toBe(0);
    expect(warnSites(a, 1).size).toBe(0);
    expect(badChar(a, 0)).toBeNull();
    expect(badChar(a, 1)).toBeNull();
  });

  test('what each input shows: its draft, else its part’s text; at 1:1 the parts with a slash', () => {
    const s = typed(['22']);
    expect(inputText(s, derived(s), 0)).toBe('22');
    const d = defaultState();
    expect(inputText(d, derived(d), 0)).toBe('3');
    // `a / b` at 1:1 shows as two inputs, one per part, typed or not.
    const form2 = { ...typed(['3 / 2']), drafts: [null, null] };
    expect([0, 1].map((i) => inputText(form2, derived(form2), i))).toEqual(['3', '2']);
    const typedForm2 = typed(['3  /2 1']);
    expect([0, 1].map((i) => inputText(typedForm2, derived(typedForm2), i))).toEqual(['3 ', '2 1']);
    // One part at 1:1: its line, in the one input.
    const lone = { ...form2, parts: form2.parts.slice(0, 1), drafts: [null] };
    expect(inputText(lone, derived(lone), 0)).toBe('3');
    const r = { ...typed(['2 2x 2', '2x 2'], threeTwo), drafts: [null, null] };
    expect([0, 1, 2].map((i) => inputText(r, derived(r), i))).toEqual(['2 2x 2', '2x 2', '']);
  });

  test('432: one message naming all three throws, every digit in the warning colour', () => {
    const a = analyse(typed(['432']));
    expect(a.balls).toBeNull();
    expect(a.fixable).toBe(true);
    expect([...warnSites(a, 0)].sort()).toEqual([0, 1, 2]);
    expect(handState(a, 0)).toBe('bad');
    expect(statusLines(a)).toEqual([
      'I can’t catch that: throws 1, 2 and 3 all land in hand 1 on beat 5.',
      'I have no ball in hand 1 to throw on beats 1 and 3.',
      'I have no ball in hand 2 to throw on beats 4 and 6.',
    ]);
  });

  test('510: a flight onto a 0 lands where the hand has nothing to throw', () => {
    const a = analyse(typed(['510']));
    expect(statusLines(a)).toContain('I can’t catch that: throw 1 lands in hand 2 on beat 6, where I have nothing to throw.');
    // At a ratio the catching hand's own beat is named.
    const r = analyse(typed(['1 0', '2'], threeTwo));
    expect(statusLines(r)).toContain('I can’t catch that: hand 1’s throw 1 lands on hand 1’s beat 2, where I have nothing to throw.');
  });

  test('a two-throw collision says both; at 3:2 the beat is the catching hand’s own', () => {
    const a = analyse(typed(['1 3 2', '2'], threeTwo));
    expect(statusLines(a)).toEqual([
      'I can’t catch that: hand 1’s throws 1, 2 and 3 all land on its beat 2.',
      'I have no ball in hand 1 to throw on beats 1 and 3.',
    ]);
    const b = analyse(typed(['1 1', '3x'], threeTwo));
    expect(statusLines(b)).toContain('I can’t catch that: hand 1’s throw 2 and hand 2’s throw 1 both land on hand 1’s beat 1.');
    // Hand 2 is not named by any digit, but the pattern fails: neutral.
    expect(handState(a, 1)).toBe('neutral');
    expect(handState(a, 0)).toBe('bad');
  });

  test('12: a fractional mean comes first and marks every input bad; 22 is the first fix', () => {
    const s = typed(['12']);
    const a = analyse(s);
    expect(handState(a, 0)).toBe('bad');
    expect(a.fractional).toBe(true);
    expect(statusLines(a)[0]).toBe('That makes 1.5 balls. I can only juggle a whole number.');
    const texts = derived(s).fixTexts[0] as string[];
    expect(fixLabel(texts)).toBe('22');
    expect(fixActions(s, texts)).toEqual([{ type: 'editDraft', part: 0, text: '22' }]);
    const fixed = fixActions(s, texts).reduce(reduce, s);
    expect(analyse(fixed).balls).toBe(2);
    expect(fixActions({ ratio: threeTwo, parts: defaultState().parts }, ['2', '2x'])).toEqual([
      { type: 'editDraft', part: 0, text: '2' },
      { type: 'editDraft', part: 1, text: '2x' },
    ]);
    expect(fixLabel(['2 2x 2', '2x 2'])).toBe('2 2x 2 / 2x 2');
  });

  test('parse errors: the bad character found, the hand named at other ratios', () => {
    const v = analyse(typed(['4#1']));
    expect(badChar(v, 0)).toBe(1);
    expect(handState(v, 0)).toBe('bad');
    expect(v.balls).toBeNull();
    expect(statusLines(v)).toEqual(['I only read digits, x and p; character 2 isn’t one.']);

    const r = analyse(typed(['2', ''], threeTwo));
    expect(handState(r, 0)).toBe('neutral');
    expect(handState(r, 1)).toBe('bad');
    expect(badChar(r, 1)).toBeNull();
    expect(statusLines(r)).toEqual(['Hand 2 pattern: I need a pattern.']);
  });

  test('a cross between the catching hand’s beats names that hand’s next onset at or after the landing (MATH.md §9.3)', () => {
    const a = analyse(typed(['2x 2 2', '2 2x'], threeTwo));
    expect(a.balls).toBeNull();
    const lines = statusLines(a);
    expect(lines).toContain('I can’t catch that: the cross from hand 1 on beat 1 lands between hand 2’s beats. The nearest pulse it could land on is 6.');
    expect(lines).toContain('I can’t catch that: the cross from hand 2 on beat 2 lands between hand 1’s beats. The nearest pulse it could land on is 10.');
    expect([...warnSites(a, 0)]).toContain(0);
    expect([...warnSites(a, 1)]).toContain(1);
    expect(statusLines(analyse(typed(['1x 1 1', '1 1'], threeTwo)))).toContain(
      'I can’t catch that: the cross from hand 1 on beat 1 lands between hand 2’s beats. The nearest pulse it could land on is 3.',
    );
    // A catching hand with no onset at all has no nearest one.
    const empty = analyse(typed(['1x 1 1', '0'], threeTwo));
    expect(statusLines(empty)).toContain('I can’t catch that: the cross from hand 1 on beat 1 lands between hand 2’s beats.');
  });

  test('more than two patterns at 1:1 is refused: two hands are on screen', () => {
    // At 1:1 the pattern splits at its first `/`; the second is in hand 2's input.
    const a = analyse(typed(['1 / 1 / 1']));
    expect(a.split).toBe(true);
    expect(a.inputs).toEqual(['1', '1 / 1']);
    expect(statusLines(a)).toEqual(['Hand 2 pattern: I have 2 hands; write at most 2 patterns, with a / between them.']);
    expect(handState(a, 0)).toBe('neutral');
    expect(handState(a, 1)).toBe('bad');
    // Each side reads on its own, its x to the other hand.
    const side = analyse(typed(['3x / 0x']));
    expect(side.errors).toEqual([null, { kind: 'bad-target', index: 1 }]);
    expect(badChar(side, 1)).toBeNull();
    const bad = analyse(typed(['3 / 4#']));
    expect(badChar(bad, 1)).toBe(1);
    expect(statusLines(bad)).toEqual(['Hand 2 pattern: I only read digits, x and p; character 2 isn’t one.']);
  });

  test('splitText and joinInputs: two inputs and one draft, either way, exactly', () => {
    expect(splitText('3 / 2 1')).toEqual(['3', '2 1']);
    expect(splitText('3/2')).toEqual(['3', '2']);
    expect(splitText('3')).toEqual(['3', '']);
    expect(splitText(joinInputs('2 ', ' 2x'))).toEqual(['2 ', ' 2x']);
  });

  test('splitInputs: at 1:1 from a typed `/`, or two parts that are not one vanilla siteswap', () => {
    expect(splitInputs(typed(['531']))).toBe(false);
    expect(splitInputs(typed(['5#']))).toBe(false);
    expect(splitInputs(typed(['3 /']))).toBe(true);
    expect(splitInputs({ ...typed(['3 / 3']), drafts: [null, null] })).toBe(true);
    expect(splitInputs(typed(['2 2x 2', '2x 2'], threeTwo))).toBe(false);
    // A vanilla pair reset to its default rule is two parts of their own.
    const reset = reduce(typed(['531']), { type: 'resetGroup', part: 0 });
    expect(splitInputs(reset)).toBe(true);
  });

  test('draftAction: one input edits its own draft; two at 1:1 make the one draft', () => {
    const v = typed(['3']);
    expect(draftAction(v, derived(v), 0, '531')).toEqual({ type: 'editDraft', part: 0, text: '531' });
    const r = typed(['2 2', '2'], threeTwo);
    expect(draftAction(r, derived(r), 1, '2x')).toEqual({ type: 'editDraft', part: 1, text: '2x' });
    const s = typed(['3 / 3']);
    expect(draftAction(s, derived(s), 1, '4 2')).toEqual({ type: 'editDraft', part: 0, text: '3 / 4 2' });
    expect(draftAction(s, derived(s), 0, '')).toEqual({ type: 'editDraft', part: 0, text: ' / 3' });
  });

  test('draftAction: a `/` typed in hand 1 while split is dropped, hand 2’s text stays put', () => {
    const s = typed(['3 / 3']);
    const action = draftAction(s, derived(s), 0, '3/4');
    expect(action).toEqual({ type: 'editDraft', part: 0, text: '34 / 3' });
    const after = reduce(s, action);
    expect([0, 1].map((i) => inputText(after, derived(after), i))).toEqual(['34', '3']);
  });

  test('joinAction: only a vanilla pair or a split typed here joins back; never two parts of their own', () => {
    const v = typed(['531 /']);
    expect(joinAction(v, derived(v), false)).toEqual({ type: 'editDraft', part: 0, text: '531' });
    const s = typed(['3 / 3']);
    expect(joinAction(s, derived(s), true)).toEqual({ type: 'editDraft', part: 0, text: '3' });
    expect(joinAction(s, derived(s), false)).toBeNull();
    // Clapping Music, hand 2 at phase 3, hand 2's input cleared: Backspace changes no part.
    const clap = [true, true, true, false, true, true, false, true, false, true, true, false];
    let c: AppState = { ...defaultState(), parts: partsFromOnsets([clap, clap], [1, 1]), drafts: [null, null] };
    c = reduce(c, { type: 'setPhase', part: 1, phase: 3 });
    const parts = c.parts;
    c = reduce(c, draftAction(c, derived(c), 1, ''));
    expect(c.parts).toBe(parts);
    expect(joinAction(c, derived(c), false)).toBeNull();
    expect(joinAction(typed(['531']), derived(typed(['531'])), true)).toBeNull();
  });

  test('editChanged: the player hears a new schedule, tempo or ratio, even when the schedule object is the same', () => {
    const s = typed(['441']);
    expect(editChanged(null, s)).toBe(true);
    expect(editChanged(s, { ...s, volume: 0.2 })).toBe(false);
    // A link differing only in tempo: same parts, same schedule object, new bpm.
    expect(editChanged(s, { ...s, bpm: s.bpm + 1 })).toBe(true);
    expect(editChanged(s, { ...s, ratio: { a: 2, b: 2 } })).toBe(true);
    expect(editChanged(s, reduce(s, { type: 'editDraft', part: 0, text: '531' }))).toBe(true);
    // A draft that does not read leaves the schedule as it was.
    expect(editChanged(s, reduce(s, { type: 'editDraft', part: 0, text: '5#' }))).toBe(false);
  });

  test('at 1:1 `a / b` warns in each part’s own input', () => {
    const a = analyse(typed(['3 / 2 1']));
    expect(a.balls).toBeNull();
    expect(warnSites(a, 0).size).toBe(0);
    expect([...warnSites(a, 1)].sort()).toEqual([0, 1]);
  });

  test('the last action’s notice follows the status', () => {
    const s = reduce(typed(['531']), { type: 'toggleOnset', part: 0, beat: 0 });
    expect(statusLines(analyse(s)).at(-1)).toBe('I reset hands 1 and 2 to 1 ball each.');
    const bad = { ...typed(['4#']), notice: 'n' };
    expect(statusLines(analyse(bad)).at(-1)).toBe('n');
    const broken = { ...typed(['432']), notice: 'n' };
    expect(statusLines(analyse(broken)).at(-1)).toBe('n');
    expect(analyse(broken).notice).toBe('n');
    expect(analyse(typed(['432'])).notice).toBeNull();
  });
});

describe('cycleSamples', () => {
  const clap = [true, true, true, false, true, true, false, true, false, true, true, false];
  const clapping = (): AppState => ({ ...defaultState(), parts: partsFromOnsets([clap, clap], [1, 1]), drafts: [null, null] });

  test('cycleSamples leaves out throws the mapping keeps silent', () => {
    const s = clapping();
    const silent = { ...s.mapping, parts: s.mapping.parts.map((p, i) => (i === 0 ? { ...p, sample: null } : p)) };
    expect(cycleSamples(derived(s).schedule, silent).split(' ')).toHaveLength(8);
  });
});

describe('the Pattern editor over three lanes (docs/plans/lanes.md ruling 3)', () => {
  // The vanilla `3` and a third hand: at 1:1, yet one input per lane in one-hand counting.
  const three = () => reduce(defaultState(), { type: 'addLane' });

  test('one input per lane, each its part’s text with x<n> targets; no split, no join', () => {
    const s = three();
    const a = analyse(s);
    expect(a.vanilla).toBe(false);
    expect(a.split).toBe(false);
    expect(a.inputs).toEqual(['3x2', '3x1', '1']);
    expect(a.balls).toBe(4);
    expect([0, 1, 2, 3].map((i) => handState(a, i))).toEqual(['ok', 'ok', 'ok', 'hidden']);
    expect(splitInputs(s)).toBe(false);
    expect(inputText(s, derived(s), 2)).toBe('1');
    expect(joinAction(s, derived(s), true)).toBeNull();
  });

  test('typing in lane 3 edits lane 3; a `/` there is refused', () => {
    const s = three();
    const action = draftAction(s, derived(s), 2, '2');
    expect(action).toEqual({ type: 'editDraft', part: 2, text: '2' });
    const typedIn = reduce(s, action);
    expect(analyse(typedIn).inputs).toEqual(['3x2', '3x1', '2']);
    expect(analyse(typedIn).balls).toBe(5);
    const slash = analyse(reduce(s, { type: 'editDraft', part: 2, text: '1 / 1' }));
    expect(handState(slash, 2)).toBe('bad');
    expect(badChar(slash, 2)).toBe(2);
    expect(statusLines(slash)[0]).toMatch(/^Hand 3/);
  });

  test('a fault in lane 3 colours lane 3; fixes and swaps act on each lane', () => {
    const s = reduce(three(), { type: 'editDraft', part: 2, text: '1x1' });
    const a = analyse(s);
    expect(a.balls).toBeNull();
    expect([...warnSites(a, 2)]).toEqual([0]);
    expect(fixActions(s, ['3x2', '3x1', '1'])).toEqual([
      { type: 'editDraft', part: 0, text: '3x2' },
      { type: 'editDraft', part: 1, text: '3x1' },
      { type: 'editDraft', part: 2, text: '1' },
    ]);
    expect(swapAction(s, 2, 0, 1)).toEqual({ type: 'swapSites', part: 2, i: 0, j: 1 });
  });
});

describe('pattern text', () => {
  test('pieces: each character with its throw, x and whitespace as the parser reads them', () => {
    const p = pieces('2x 3', new Set([1]), new Set([0]), null);
    expect(p).toEqual([
      { text: '2', site: 0, warn: false, selected: true },
      { text: 'x', site: 0, warn: false, selected: true },
      { text: ' ', site: null, warn: false, selected: false },
      { text: '3', site: 1, warn: true, selected: false },
    ]);
    // `2 x` crosses the 2, as parsePattern reads it; a second x is unreadable.
    expect(pieces('2 xx', new Set(), new Set(), 3).map((q) => [q.site, q.warn])).toEqual([
      [0, false],
      [null, false],
      [0, false],
      [null, true],
    ]);
  });

  test('editText: insert at the caret or over a selection; backspace', () => {
    expect(editText('41', { start: 1, end: 1 }, '4')).toEqual({ text: '441', caret: 2 });
    expect(editText('432', { start: 2, end: 1 }, '5')).toEqual({ text: '452', caret: 2 });
    expect(editText('3', { start: 9, end: 9 }, 'x')).toEqual({ text: '3x', caret: 2 });
    expect(editText('441', { start: 3, end: 3 }, 'backspace')).toEqual({ text: '44', caret: 2 });
    expect(editText('441', { start: 0, end: 2 }, 'backspace')).toEqual({ text: '1', caret: 0 });
    expect(editText('441', { start: 0, end: 0 }, 'backspace')).toEqual({ text: '441', caret: 0 });
  });
});

describe('swap', () => {
  test('siteCovering: a selection over exactly one throw, its digit and x', () => {
    expect(siteCovering('5 3x1', 0, 1)).toBe(0);
    expect(siteCovering('5 3x1', 2, 4)).toBe(1);
    expect(siteCovering('5 3x1', 4, 3)).toBe(1);
    expect(siteCovering('5 3x1', 1, 2)).toBeNull();
    expect(siteCovering('5 3x1', 0, 3)).toBeNull();
    expect(siteCovering('5 3x1', 3, 5)).toBeNull();
    expect(siteCovering('531', 1, 1)).toBeNull();
    expect(siteCovering('531', 3, 4)).toBeNull();
  });

  test('toggleSite: two in one hand, untap, other hand restarts, a third keeps the last two', () => {
    let s = toggleSite(null, 0, 1);
    expect(s).toEqual({ hand: 0, sites: [1] });
    s = toggleSite(s, 0, 2);
    expect(s).toEqual({ hand: 0, sites: [1, 2] });
    expect(toggleSite(s, 0, 0)).toEqual({ hand: 0, sites: [2, 0] });
    expect(toggleSite(s, 1, 0)).toEqual({ hand: 1, sites: [0] });
    expect(toggleSite(s, 0, 2)).toEqual({ hand: 0, sites: [1] });
    expect(toggleSite({ hand: 0, sites: [1] }, 0, 1)).toBeNull();
  });


  test('swapAction: the sites of one input as the swap action, or null across a slash', () => {
    expect(swapAction(typed(['531']), 0, 1, 2)).toEqual({ type: 'swapSites', part: 0, i: 1, j: 2 });
    expect(swapAction(typed(['2 2', '2'], threeTwo), 1, 0, 1)).toEqual({ type: 'swapSites', part: 1, i: 0, j: 1 });
    // `a / b` at 1:1 is two inputs: each input's sites are its part's.
    const form2 = typed(['2 2 / 3 3']);
    expect(swapAction(form2, 1, 0, 1)).toEqual({ type: 'swapSites', part: 1, i: 0, j: 1 });
    expect(swapAction(form2, 0, 0, 1)).toEqual({ type: 'swapSites', part: 0, i: 0, j: 1 });
    // One input over parts that are not a vanilla pair (a lone part) counts across them.
    const lone = { ...form2, parts: form2.parts.slice(0, 1), drafts: [null] };
    expect(swapAction(lone, 0, 0, 1)).toEqual({ type: 'swapSites', part: 0, i: 0, j: 1 });
    expect(swapAction(lone, 0, 1, 2)).toBeNull();
  });

  test('pieces: letters are throws (10-35); a slash separates parts and is no throw', () => {
    expect(pieces('a / 3x', new Set(), new Set(), null).map((q) => q.site)).toEqual([0, null, null, null, 1, 1]);
    expect(pieces('3/', new Set(), new Set(), 1).map((q) => q.warn)).toEqual([false, true]);
  });
});

describe('ratio, tempo and time', () => {
  test('reduceRatio: a chip’s 2:2 is 1:1', () => {
    expect(reduceRatio({ a: 2, b: 2 })).toEqual(one);
    expect(reduceRatio({ a: 6, b: 4 })).toEqual(threeTwo);
  });

  test('stepRatio clamps and stays unreduced', () => {
    expect(stepRatio(threeTwo, 0, 1)).toEqual({ a: 4, b: 2 });
    expect(stepRatio(threeTwo, 1, -1)).toEqual({ a: 3, b: 1 });
    expect(stepRatio({ a: 1, b: 1 }, 1, -1)).toEqual({ a: 1, b: 1 });
    expect(stepRatio({ a: MAX_RATIO, b: 1 }, 0, 1)).toEqual({ a: MAX_RATIO, b: 1 });
  });

  test('hand2Bpm follows the ratio; clampBpm keeps whole bpm in range', () => {
    expect(hand2Bpm(120, threeTwo)).toBe(80);
    expect(hand2Bpm(100, { a: 3, b: 2 })).toBe(66.7);
    expect(hand2Bpm(120, one)).toBe(120);
    expect(clampBpm(Number.NaN)).toBeNull();
    expect(clampBpm(10)).toBe(BPM_RANGE.min);
    expect(clampBpm(999)).toBe(BPM_RANGE.max);
    expect(clampBpm(99.6)).toBe(100);
  });

  test('cyclePosition: within the owning segment’s cycle; null with none', () => {
    const s = scheduleOf('441');
    const seg = (startTime: number, endTime: number | null, schedule = s): Segment => ({
      schedule,
      startTime,
      pulseLen: 0.5,
      endTime,
      carry: new Map(),
    });
    const view = (now: number, segments: Segment[]): PlayerView => ({ now, state: 'playing', segments, pending: false });
    expect(cyclePosition(view(0, []))).toBeNull();
    // 441: cycle 6 pulses of 0.5 s. At 4 s, pulse 8, 2 into the second cycle.
    expect(cyclePosition(view(4, [seg(0, null)]))).toEqual({ pulse: 2, cycle: 6 });
    // Before the start delay: 0.
    expect(cyclePosition(view(-1, [seg(0, null)]))).toEqual({ pulse: 0, cycle: 6 });
    // Owned by the first of two segments.
    const three = scheduleOf('3');
    expect(cyclePosition(view(1, [seg(0, 3), seg(3, null, three)]))).toEqual({ pulse: 2, cycle: 6 });
    expect(cyclePosition(view(3.5, [seg(0, 3), seg(3, null, three)]))).toEqual({ pulse: 1, cycle: 2 });
  });
});

describe('a passing set in the editor (ruling 7)', () => {
  const passing = (text = '<3p 3|3p 3>') => reduce(defaultState(), { type: 'editDraft', part: 0, text });
  test('one input, never split, one text', () => {
    const s = passing();
    expect(derived(s).texts).toEqual(['<3p 3|3p 3>']);
    expect(splitInputs(s)).toBe(false);
    const a = analyse(s);
    expect(a.vanilla).toBe(true);
    expect(a.inputs).toEqual(['<3p 3|3p 3>']);
    expect(a.balls).toBe(6);
    expect(a.errors).toEqual([null]);
  });
  test('the input shows the passing text after the draft is cleared', () => {
    const s = { ...passing('<3p3|3p3>'), drafts: [null, null, null, null] };
    expect(analyse(s).inputs).toEqual(['<3p 3|3p 3>']);
  });
  test('an error under the one input', () => {
    const a = analyse(passing('<3p 3|3p 3|3p 3|3p 3>'));
    expect(a.errors[0]).toEqual({ kind: 'too-many-jugglers', max: 3 });
    expect(a.inputs).toHaveLength(1);
    const b = analyse(passing('<3p 3|3? 3>'));
    expect(b.errors[0]).toMatchObject({ kind: 'bad-char' });
  });
  test('faults name the throw by its position across the whole text', () => {
    // 3p from part 0 collides in part 3 with juggler 2's own 3 (throws 1 and 3 of the text); throw 2 is the unfed hand's.
    const a = analyse(passing('<3p 3|3 3>'));
    expect(a.balls).toBeNull();
    expect(a.warn).toHaveLength(1);
    expect([...a.warn[0]!].sort()).toEqual([0, 1, 2]);
    expect(a.lines.length).toBeGreaterThan(0);
    expect(a.fixable).toBe(true);
  });
  test('an odd-length sequence read twice puts each position once on each hand', () => {
    const a = analyse(passing('<4p 3 3|3 3 4p>'));
    expect(a.errors).toEqual([null]);
  });
  test('pieces: a p after a digit belongs to its throw, as x does; < > | are separators', () => {
    const p = pieces('<3p 3|3p 3>', new Set(), new Set(), null);
    expect(p.map((q) => q.site)).toEqual([null, 0, 0, null, 1, null, 2, 2, null, 3, null]);
  });
  test('pieces: p<n> names the target only when it is another existing juggler', () => {
    expect(pieces('<3p2 3|3p1 3>', new Set(), new Set(), null).map((q) => q.site)).toEqual([null, 0, 0, 0, null, 1, null, 2, 2, 2, null, 3, null]);
    // 3p3 with two jugglers: the 3 is the next throw.
    expect(pieces('3p3|3', new Set(), new Set(), null).map((q) => q.site)).toEqual([0, 0, 1, null, 2]);
    // A bare p, or one after a space, with no digit before it, is unreadable.
    expect(pieces('3|p 3', new Set(), new Set(), null).map((q) => q.site)).toEqual([0, null, null, null, 1]);
  });
  test('pieces: outside passing text p is the letter 25', () => {
    expect(pieces('3p', new Set(), new Set(), null).map((q) => q.site)).toEqual([0, 1]);
  });
  test('a fix typed into the one input', () => {
    const s = passing('<3p 3|3 3>');
    const d = derived(s);
    expect(d.fixTexts.every((t) => t.length === 1)).toBe(true);
  });
  test('the p key shows while the input holds a | or the parts are a passing set', () => {
    const show = (s: AppState) => showsPassKey(s, derived(s), 0);
    expect(show(typed(['531']))).toBe(false);
    expect(show(passing())).toBe(true);
    expect(show(reduce(defaultState(), { type: 'editDraft', part: 0, text: '3p|' }))).toBe(true);
    // Typed over a passing set, a plain siteswap leaves the set, and the key stays while the parts are one.
    expect(show(reduce(passing(), { type: 'editDraft', part: 0, text: '531' }))).toBe(false);
  });
  test('swap is not offered over a passing set', () => {
    expect(swapAction(passing(), 0, 0, 1)).toBeNull();
  });
});

describe('a sync set in the editor (v3 ruling 5)', () => {
  const sync = (text = '(4,2x)(2x,4)') => reduce(defaultState(), { type: 'editDraft', part: 0, text });
  test('one input, never split, one text', () => {
    const s = { ...sync('(4,2x)*'), drafts: [null, null] };
    expect(derived(s).texts).toEqual(['(4,2x)(2x,4)']);
    expect(splitInputs(s)).toBe(false);
    const a = analyse(s);
    expect(a.inputs).toEqual(['(4,2x)(2x,4)']);
    expect(a.balls).toBe(3);
  });
  test('an odd height points at its digit; an open pair at nothing', () => {
    const odd = analyse(sync('(4,3)'));
    expect(odd.errors[0]).toEqual({ kind: 'bad-sync', index: 3, open: false });
    expect(badChar(odd, 0)).toBe(3);
    // The odd digit is a throw (it has a site), and pieces still colours it.
    const shown = pieces('(4,3)', new Set(), new Set(), badChar(odd, 0));
    expect(shown.map((q) => [q.text, q.site, q.warn])).toEqual([
      ['(', null, false],
      ['4', 0, false],
      [',', null, false],
      ['3', 1, true],
      [')', null, false],
    ]);
    expect(odd.lines[0]).toContain('even');
    const stray = analyse(sync('(4;4)'));
    expect(badChar(stray, 0)).toBe(2);
    expect(stray.lines[0]).toContain('parentheses, commas');
    expect(analyse(reduce(defaultState(), { type: 'editDraft', part: 0, text: '4?' })).lines[0]).toContain('digits, x and p');
    const open = analyse(sync('(4,2x)(2x'));
    expect(badChar(open, 0)).toBeNull();
    expect(open.lines[0]).toContain('closes');
  });
  test('faults mark the sites of the one input, pair by pair', () => {
    const a = analyse(sync('(4,2x)(4,2x)'));
    expect(a.balls).toBeNull();
    expect(a.warn).toHaveLength(1);
    expect([...a.warn[0]!].every((i) => i >= 0 && i < 4)).toBe(true);
    expect(a.warn[0]!.size).toBeGreaterThan(0);
    expect(a.fixable).toBe(true);
  });
  test('a fix is written in sync notation: (4,2x)(2x,2) offers the box', () => {
    expect(derived(sync('(4,2x)(2x,2)')).fixTexts).toContainEqual(['(4,2x)(2x,4)']);
  });
  test('no swap over a sync set this wave', () => {
    expect(swapAction(sync(), 0, 0, 2)).toBeNull();
  });
});
