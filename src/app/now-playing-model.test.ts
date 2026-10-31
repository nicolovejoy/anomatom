import { describe, expect, test } from 'vitest';
import { BPM_RANGE, KIT_IDS, TEMPO_STEP } from '../tunables';
import { reduce } from './actions';
import { cardsPatch } from './first-minute';
import { kitEdit, nowPlaying, presetEdit, tempoAction } from './now-playing-model';
import { PRESETS } from './presets';
import { applyEdit } from './sound-panel-model';
import { defaultState } from './state';

describe('nowPlaying', () => {
  test('the default state shows its kit, preset and tempo', () => {
    const s = defaultState();
    expect(nowPlaying(s)).toEqual({ kit: s.mapping.parts[0]?.kit, preset: 'voice-per-part', bpm: s.bpm, canSlower: true, canFaster: true });
  });
  test('parts on different kits read as mixed', () => {
    const passing = PRESETS.find((p) => p.id === 'passing')!;
    const mapping = applyEdit(passing.mapping!, { kind: 'jugglerKit', juggler: 0, kit: KIT_IDS[1] as string });
    const base = applyEdit(mapping, { kind: 'jugglerKit', juggler: 1, kit: KIT_IDS[0] as string });
    expect(new Set(base.parts.map((v) => v.kit)).size).toBeGreaterThan(1);
    expect(nowPlaying({ mapping: base, bpm: 120 }).kit).toBe('mixed');
  });
  test('a mapping with no parts falls back to the first kit', () => {
    const mapping = { ...defaultState().mapping, parts: [] };
    expect(nowPlaying({ mapping, bpm: 120 }).kit).toBe(KIT_IDS[0]);
  });
  test('a custom mapping reads as custom', () => {
    const mapping = applyEdit(defaultState().mapping, { kind: 'accent', velocity: 3 });
    expect(nowPlaying({ mapping, bpm: 120 }).preset).toBe('custom');
  });
  test('the tempo buttons disable at the ends of the range', () => {
    const m = defaultState().mapping;
    expect(nowPlaying({ mapping: m, bpm: BPM_RANGE.min })).toMatchObject({ canSlower: false, canFaster: true });
    expect(nowPlaying({ mapping: m, bpm: BPM_RANGE.max })).toMatchObject({ canSlower: true, canFaster: false });
  });
});

describe('the edits', () => {
  test('kit and preset are the Sound tab edits and keep each other', () => {
    expect(kitEdit('LM-2')).toEqual({ kind: 'kit', kit: 'LM-2' });
    expect(presetEdit('height-pitch')).toEqual({ kind: 'preset', name: 'height-pitch' });
    const m = applyEdit(applyEdit(defaultState().mapping, kitEdit('LM-2')), presetEdit('height-pitch'));
    expect(nowPlaying({ mapping: m, bpm: 120 })).toMatchObject({ kit: 'LM-2', preset: 'height-pitch' });
  });
  test('tempo steps by TEMPO_STEP and clamps', () => {
    expect(reduce(defaultState(), tempoAction(120, 1)).bpm).toBe(120 + TEMPO_STEP);
    expect(reduce(defaultState(), tempoAction(120, -1)).bpm).toBe(120 - TEMPO_STEP);
    expect(reduce({ ...defaultState(), bpm: BPM_RANGE.max }, tempoAction(BPM_RANGE.max, 1)).bpm).toBe(BPM_RANGE.max);
  });
});

describe('cardsPatch', () => {
  test('showing the cards closes the sheet', () => {
    expect(cardsPatch(true)).toEqual({ cards: true, sheetTab: null });
  });
  test('leaving opens the sheet on the Pattern tab, or the tab asked for', () => {
    expect(cardsPatch(false)).toEqual({ cards: false, sheetTab: 'pattern' });
    expect(cardsPatch(false, 'sound')).toEqual({ cards: false, sheetTab: 'sound' });
  });
});
