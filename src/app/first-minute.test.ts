import { describe, expect, test } from 'vitest';
import { FIRST_MINUTE_PRESETS } from '../tunables';
import { cardPattern, playingPreset, presetPatch, scheduleFor, showsFirstMinute } from './first-minute';
import { analyse } from './knobs-model';
import { defaultState } from './state';

const preset = (id: string) => FIRST_MINUTE_PRESETS.find((p) => p.id === id)!;

describe('showsFirstMinute', () => {
  test('shows on an empty hash and a bare #', () => {
    expect(showsFirstMinute('')).toBe(true);
    expect(showsFirstMinute('#')).toBe(true);
  });
  test('skips About, shared state and any other hash', () => {
    expect(showsFirstMinute('#about')).toBe(false);
    expect(showsFirstMinute('#v1.e30')).toBe(false);
    expect(showsFirstMinute('#garbage')).toBe(false);
  });
});

describe('presets', () => {
  test('every card is a valid pattern', () => {
    for (const p of FIRST_MINUTE_PRESETS) expect(analyse(p.patterns, p.ratio).balls, p.id).not.toBeNull();
  });
  test('the polyrhythm card is the canonical two-hand pattern at 3:2', () => {
    expect(presetPatch(preset('polyrhythm'))).toEqual({ patterns: ['2 2x 2', '2x 2'], ratio: { a: 3, b: 2 } });
    expect(cardPattern(preset('polyrhythm'))).toBe('2 2x 2 / 2x 2');
    expect(cardPattern(preset('pause'))).toBe('441');
  });
  test('a patch is a copy: the shared preset is never handed out', () => {
    const patch = presetPatch(preset('pause'));
    expect(patch.ratio).not.toBe(preset('pause').ratio);
    expect(patch).toEqual({ patterns: ['441', '2'], ratio: { a: 1, b: 1 } });
  });
});

describe('playingPreset', () => {
  test('names the card the store holds, only while playing', () => {
    const s = { ...defaultState(), ...presetPatch(preset('pause')) };
    expect(playingPreset(s, true)).toBe('pause');
    expect(playingPreset(s, false)).toBeNull();
  });
  test('hand 2 is ignored at 1:1 and matters at 3:2', () => {
    const odd = { ...defaultState(), patterns: ['531', '9'] as [string, string] };
    expect(playingPreset(odd, true)).toBe('classic');
    const poly = { ...defaultState(), ...presetPatch(preset('polyrhythm')) };
    expect(playingPreset(poly, true)).toBe('polyrhythm');
    expect(playingPreset({ ...poly, patterns: ['2 2x 2', '2'] }, true)).toBeNull();
  });
  test('a pattern of the reader’s own matches no card', () => {
    expect(playingPreset({ ...defaultState(), patterns: ['4', '2'] }, true)).toBeNull();
    expect(playingPreset({ ...defaultState(), ratio: { a: 4, b: 3 } }, true)).toBeNull();
  });
});

describe('scheduleFor', () => {
  test('builds a schedule for a valid pattern and null for an invalid one', () => {
    expect(scheduleFor(presetPatch(preset('polyrhythm')))).not.toBeNull();
    expect(scheduleFor({ patterns: ['432', '2'], ratio: { a: 1, b: 1 } })).toBeNull();
  });
});
