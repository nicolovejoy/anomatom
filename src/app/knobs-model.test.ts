import { describe, expect, test } from 'vitest';
import { scheduleOf, typed } from '../test/schedules';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import type { PlayerView, Segment } from '../view/types';
import { reduce } from './actions';
import { derived } from './derived';
import {
  analyse,
  badChar,
  clampBpm,
  cyclePosition,
  editText,
  fixActions,
  fixLabel,
  hand2Bpm,
  handState,
  inputText,
  pieces,
  reduceRatio,
  siteCovering,
  statusLines,
  stepRatio,
  swapAction,
  toggleSite,
  warnSites,
} from './knobs-model';
import { defaultState } from './state';

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
    const form2 = { ...typed(['3 / 2']), drafts: [null, null] };
    expect(inputText(form2, derived(form2), 0)).toBe('3 / 2');
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
    expect(fixActions({ ratio: threeTwo }, ['2', '2x'])).toEqual([
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
    expect(statusLines(v)).toEqual(['I only read digits and x; character 2 isn’t one.']);

    const r = analyse(typed(['2', ''], threeTwo));
    expect(handState(r, 0)).toBe('neutral');
    expect(handState(r, 1)).toBe('bad');
    expect(badChar(r, 1)).toBeNull();
    expect(statusLines(r)).toEqual(['Hand 2 pattern: I need a pattern.']);
  });

  test('a cross between the catching hand’s beats names the next pulse it could land on', () => {
    const a = analyse(typed(['2x 2 2', '2 2x'], threeTwo));
    expect(a.balls).toBeNull();
    const lines = statusLines(a);
    expect(lines).toContain('I can’t catch that: the cross from hand 1 on beat 1 lands between hand 2’s beats. The nearest pulse it could land on is 6.');
    expect(lines).toContain('I can’t catch that: the cross from hand 2 on beat 2 lands between hand 1’s beats. The nearest pulse it could land on is 12.');
    expect([...warnSites(a, 0)]).toContain(0);
    expect([...warnSites(a, 1)]).toContain(1);
  });

  test('at 1:1 `a / b` numbers its sites across the slash', () => {
    const a = analyse(typed(['3 / 2 1']));
    expect(a.balls).toBeNull();
    expect([...warnSites(a, 0)].sort()).toEqual([1, 2]);
  });

  test('the last action’s notice follows the status', () => {
    const s = reduce(typed(['531']), { type: 'toggleOnset', part: 0, beat: 0 });
    expect(statusLines(analyse(s)).at(-1)).toBe('I reset hands 1 and 2 to 1 ball each.');
    const bad = { ...typed(['4#']), notice: 'n' };
    expect(statusLines(analyse(bad)).at(-1)).toBe('n');
    const broken = { ...typed(['432']), notice: 'n' };
    expect(statusLines(analyse(broken)).at(-1)).toBe('n');
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
    const form2 = typed(['2 2 / 3 3']);
    expect(swapAction(form2, 0, 2, 3)).toEqual({ type: 'swapSites', part: 1, i: 0, j: 1 });
    expect(swapAction(form2, 0, 0, 1)).toEqual({ type: 'swapSites', part: 0, i: 0, j: 1 });
    expect(swapAction(form2, 0, 1, 2)).toBeNull();
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
