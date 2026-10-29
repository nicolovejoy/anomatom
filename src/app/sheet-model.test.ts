import { describe, expect, test } from 'vitest';
import { RATIO_CHIPS } from '../tunables';
import { typed } from '../test/schedules';
import { analyse } from './knobs-model';
import { dragEnd, fillPercent, hasChip, pressTab, shownTab, stepTab, summary, tempoLines, TABS } from './sheet-model';

const one = { a: 1, b: 1 };
const threeTwo = { a: 3, b: 2 };

describe('which tab shows', () => {
  test('a phone shows the open tab, or none', () => {
    expect(shownTab('rhythm', 'pattern', false)).toBe('rhythm');
    expect(shownTab(null, 'pattern', false)).toBeNull();
  });
  test('a wide screen always shows one: the open tab, else the last', () => {
    expect(shownTab('sound', 'pattern', true)).toBe('sound');
    expect(shownTab(null, 'rhythm', true)).toBe('rhythm');
  });
});

describe('pressing a tab', () => {
  test('opens it, or switches to it', () => {
    expect(pressTab(null, 'pattern', false)).toBe('pattern');
    expect(pressTab('pattern', 'sound', false)).toBe('sound');
  });
  test('the open tab again closes a phone sheet, never the wide column', () => {
    expect(pressTab('rhythm', 'rhythm', false)).toBeNull();
    expect(pressTab('rhythm', 'rhythm', true)).toBe('rhythm');
  });
});

describe('the handle', () => {
  test('a drag down closes; a drag up opens on the last tab, or keeps the open one', () => {
    expect(dragEnd('rhythm', 'pattern', 80, 24)).toBeNull();
    expect(dragEnd(null, 'sound', 80, 24)).toBeNull();
    expect(dragEnd(null, 'sound', -80, 24)).toBe('sound');
    expect(dragEnd('rhythm', 'sound', -80, 24)).toBe('rhythm');
  });
  test('a tap toggles', () => {
    expect(dragEnd(null, 'pattern', 3, 24)).toBe('pattern');
    expect(dragEnd('sound', 'pattern', -3, 24)).toBeNull();
  });
});

test('arrow keys walk the tabs, wrapping', () => {
  expect(stepTab('pattern', 1)).toBe('rhythm');
  expect(stepTab('sound', 1)).toBe('pattern');
  expect(stepTab('pattern', -1)).toBe('sound');
  expect(TABS).toEqual(['pattern', 'rhythm', 'sound']);
});

describe('the summary', () => {
  test('a valid 1:1 pattern: the pattern, its balls and the tempo', () => {
    const p: [string, string] = ['531', ''];
    expect(summary(analyse(typed(p, one)), 120, 7)).toEqual({ text: '531', meta: '3 balls · 120 bpm', valid: true, long: false });
  });
  test('one ball is singular', () => {
    const p: [string, string] = ['1', ''];
    expect(summary(analyse(typed(p, one)), 90, 7).meta).toBe('1 ball · 90 bpm');
  });
  test('both hands at 3:2, long, so balls only', () => {
    const p: [string, string] = ['2 2x 2', ' 2x 2 '];
    expect(summary(analyse(typed(p, threeTwo)), 120, 7)).toEqual({ text: '2 2x 2 / 2x 2', meta: '4 balls', valid: true, long: true });
  });
  test('invalid says so', () => {
    const p: [string, string] = ['432', ''];
    expect(summary(analyse(typed(p, one)), 120, 7)).toMatchObject({ text: '432', valid: false, meta: 'can’t juggle' });
  });
  test('empty shows a dash', () => {
    const p: [string, string] = ['  ', ''];
    expect(summary(analyse(typed(p, one)), 120, 7).text).toBe('–');
  });
});

test('tempo lines: each hand and the shared beat at 1:1, both hands otherwise', () => {
  expect(tempoLines(120, one)).toEqual(['Each hand · 120 bpm', 'Shared beat · 240 bpm']);
  expect(tempoLines(120, threeTwo)).toEqual(['Hand 1 · 120 bpm', 'Hand 2 · 80 bpm']);
});

test('chips: a ratio with its own chip, and one without', () => {
  expect(hasChip(threeTwo, RATIO_CHIPS)).toBe(true);
  expect(hasChip({ a: 5, b: 3 }, RATIO_CHIPS)).toBe(false);
});

test('slider fill, clamped', () => {
  expect(fillPercent(140, 40, 240)).toBe(50);
  expect(fillPercent(300, 40, 240)).toBe(100);
  expect(fillPercent(0, 40, 240)).toBe(0);
  expect(fillPercent(1, 1, 1)).toBe(0);
});
