import { describe, expect, test } from 'vitest';
import { buildSchedule, fixesFor, parsePattern } from '../core/legacy';
import type { PatternInput, Schedule } from '../core/legacy';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import type { PlayerView, Segment } from '../view/types';
import {
  analyse,
  badChar,
  clampBpm,
  cyclePosition,
  editText,
  fixLabel,
  fixTexts,
  hand2Bpm,
  handState,
  patternText,
  pieces,
  siteCovering,
  statusLines,
  stepRatio,
  swapText,
  toggleSite,
  warnSites,
} from './knobs-model';

const one = { a: 1, b: 1 };
const threeTwo = { a: 3, b: 2 };
function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

describe('analyse and the fix state', () => {
  test('a valid pattern: ball count, both indicators ok (hand 2 hidden at 1:1), no warnings', () => {
    const a = analyse(['3', '2'], one);
    expect(a.balls).toBe(3);
    expect(a.details).toEqual([]);
    expect(handState(a, 0)).toBe('ok');
    expect(handState(a, 1)).toBe('hidden');
    expect(statusLines(a)).toEqual(['I have 3 balls.']);
    expect(warnSites(a, 0).size).toBe(0);
    expect(badChar(a, 0)).toBeNull();
    expect(badChar(a, 1)).toBeNull();
  });

  test('432: one message naming all three throws, every digit in the warning colour', () => {
    const a = analyse(['432', ''], one);
    expect(a.balls).toBeNull();
    expect([...warnSites(a, 0)].sort()).toEqual([0, 1, 2]);
    expect(handState(a, 0)).toBe('bad');
    const lines = statusLines(a);
    expect(lines).toEqual([
      'I can’t catch that: throws 1, 2 and 3 all land in hand 1 on beat 5.',
      'I have no ball in hand 1 to throw on beats 1 and 3.',
      'I have no ball in hand 2 to throw on beats 4 and 6.',
    ]);
  });

  test('a two-throw collision says both; at 3:2 the beat is the catching hand’s own', () => {
    // `1 3 2` on hand 1 at 3:2 collides on hand 1's own grid (validate.test.ts).
    const a = analyse(['1 3 2', '2'], threeTwo);
    expect(statusLines(a)).toEqual([
      'I can’t catch that: hand 1’s throws 1, 2 and 3 all land on its beat 2.',
      'I have no ball in hand 1 to throw on beats 1 and 3.',
    ]);
    // A cross into the other hand names that hand's beat; two throws say both.
    const b = analyse(['1 1', '3x'], threeTwo);
    expect(statusLines(b)).toContain('I can’t catch that: hand 1’s throw 2 and hand 2’s throw 1 both land on hand 1’s beat 1.');
    expect(statusLines(b)).toContain('I have no ball in hand 2 to throw on beats 1, 2, 3 and 4.');
    // Hand 2 is not named by any digit, but the pattern fails: neutral.
    expect(handState(a, 1)).toBe('neutral');
    expect(handState(a, 0)).toBe('bad');
  });

  test('12: a fractional ball count marks every input bad and offers 22 first', () => {
    const a = analyse(['12', ''], one);
    expect(handState(a, 0)).toBe('bad');
    expect(statusLines(a)[0]).toMatch(/1\.5 balls/);
    const fixes = fixesFor(a.input as PatternInput, a.details.map((d) => d.error));
    expect(fixLabel(fixes[0] as PatternInput)).toBe('22');
  });

  test('parse errors: no input, the bad character found, hand named at other ratios', () => {
    const v = analyse(['4a1', ''], one);
    expect(v.input).toBeNull();
    expect(badChar(v, 0)).toBe(1);
    expect(handState(v, 0)).toBe('bad');
    expect(statusLines(v)).toEqual(['I only read digits and x; character 2 isn’t one.']);

    const r = analyse(['2', ''], threeTwo);
    expect(handState(r, 0)).toBe('neutral');
    expect(handState(r, 1)).toBe('bad');
    expect(badChar(r, 1)).toBeNull();
    expect(statusLines(r)).toEqual(['Hand 2 pattern: I need a pattern.']);
  });

  test('other errors use the shared wording: 2x 2 2 / 2 2x is rejected', () => {
    const a = analyse(['2x 2 2', '2 2x'], threeTwo);
    expect(a.balls).toBeNull();
    expect(statusLines(a).length).toBe(a.details.length);
    expect(statusLines(a).some((l) => l.includes('lands between'))).toBe(true);
  });
});

describe('pattern text', () => {
  test('patternText: run together at 1:1, spaced otherwise; fixTexts keeps the unused hand 2', () => {
    expect(patternText(pat('4 4 1'), true)).toBe('441');
    expect(patternText(pat('22x2'), false)).toBe('2 2x 2');
    expect(fixTexts({ ratio: one, hands: [pat('423')] }, ['432', '2'])).toEqual(['423', '2']);
    expect(fixTexts({ ratio: threeTwo, hands: [pat('2'), pat('2')] }, ['x', 'y'])).toEqual(['2', '2']);
    expect(fixLabel({ ratio: threeTwo, hands: [pat('22x2'), pat('2x2')] })).toBe('2 2x 2 / 2x 2');
  });

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

  test('swapText: 531 sites 0 and 1 is 441 (MATH §3); impossible or unreadable is null', () => {
    expect(swapText('531', 1, 2, true)).toBe('522');
    expect(swapText('441', 0, 1, true)).toBe('531');
    expect(swapText('2 2', 0, 1, false)).toBe('3 1');
    expect(swapText('03', 0, 1, true)).toBeNull();
    expect(swapText('4a', 0, 1, true)).toBeNull();
  });
});

describe('ratio, tempo and time', () => {
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
    const s: Schedule = buildSchedule({ ratio: one, hands: [pat('441')] });
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
    const three = buildSchedule({ ratio: one, hands: [pat('3')] });
    expect(cyclePosition(view(1, [seg(0, 3), seg(3, null, three)]))).toEqual({ pulse: 2, cycle: 6 });
    expect(cyclePosition(view(3.5, [seg(0, 3), seg(3, null, three)]))).toEqual({ pulse: 1, cycle: 2 });
  });
});
