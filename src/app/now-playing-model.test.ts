import { describe, expect, test } from 'vitest';
import { KIT_IDS } from '../tunables';
import { kitEdit, nowPlaying, presetEdit } from './now-playing-model';
import { PRESETS } from './presets';
import { applyEdit } from './sound-panel-model';
import { defaultState } from './state';

describe('nowPlaying', () => {
  test('the default state shows its kit and preset', () => {
    const s = defaultState();
    expect(nowPlaying(s)).toEqual({ kit: s.mapping.parts[0]?.kit, preset: 'voice-per-part' });
  });
  test('parts on different kits read as mixed', () => {
    const passing = PRESETS.find((p) => p.id === 'passing')!;
    const mapping = applyEdit(passing.mapping!, { kind: 'jugglerKit', juggler: 0, kit: KIT_IDS[1] as string });
    const base = applyEdit(mapping, { kind: 'jugglerKit', juggler: 1, kit: KIT_IDS[0] as string });
    expect(new Set(base.parts.map((v) => v.kit)).size).toBeGreaterThan(1);
    expect(nowPlaying({ mapping: base }).kit).toBe('mixed');
  });
  test('a mapping with no parts falls back to the first kit', () => {
    const mapping = { ...defaultState().mapping, parts: [] };
    expect(nowPlaying({ mapping }).kit).toBe(KIT_IDS[0]);
  });
  test('a custom mapping reads as custom', () => {
    const mapping = applyEdit(defaultState().mapping, { kind: 'accent', velocity: 3 });
    expect(nowPlaying({ mapping }).preset).toBe('custom');
  });
});

describe('the edits', () => {
  test('kit and preset are the Sound tab edits and keep each other', () => {
    expect(kitEdit('LM-2')).toEqual({ kind: 'kit', kit: 'LM-2' });
    expect(presetEdit('height-pitch')).toEqual({ kind: 'preset', name: 'height-pitch' });
    const m = applyEdit(applyEdit(defaultState().mapping, kitEdit('LM-2')), presetEdit('height-pitch'));
    expect(nowPlaying({ mapping: m })).toMatchObject({ kit: 'LM-2', preset: 'height-pitch' });
  });
});
