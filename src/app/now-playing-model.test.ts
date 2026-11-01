import { describe, expect, test } from 'vitest';
import { KIT_IDS } from '../tunables';
import { copy } from '../ui/copy';
import { presetOf } from '../sound/mapping';
import { kitEdit, nowPlaying, presetEdit, soundOf } from './now-playing-model';
import { PRESETS } from './presets';
import { applyEdit } from './sound-panel-model';
import { defaultState } from './state';

describe('nowPlaying', () => {
  test('the default state shows its kit and preset', () => {
    const s = defaultState();
    expect(nowPlaying(s)).toEqual({ kit: s.mapping.parts[0]?.kit, kitLabel: '', preset: 'voice-per-part' });
  });
  test('parts on different kits read as mixed', () => {
    const passing = PRESETS.find((p) => p.id === 'passing')!;
    const mapping = applyEdit(passing.mapping!, { kind: 'jugglerKit', juggler: 0, kit: KIT_IDS[1] as string });
    const base = applyEdit(mapping, { kind: 'jugglerKit', juggler: 1, kit: KIT_IDS[0] as string });
    expect(new Set(base.parts.map((v) => v.kit)).size).toBeGreaterThan(1);
    expect(nowPlaying({ mapping: base }).kit).toBe('mixed');
    // In order of first appearance: juggler 1's kit first.
    expect(nowPlaying({ mapping: base }).kitLabel).toBe(`${copy.kitShortNames[KIT_IDS[1] as string]} / ${copy.kitShortNames[KIT_IDS[0] as string]}`);
  });
  test('a passing card reads "Height to drum" and "TR-808 / LM-2"; its short-link preset is unchanged', () => {
    const passing = PRESETS.find((p) => p.id === 'passing')!;
    const now = nowPlaying({ mapping: passing.mapping! });
    expect(now.kit).toBe('mixed');
    expect(now.kitLabel).toBe('TR-808 / LM-2');
    expect(now.preset).toBe('height-drum');
    expect(copy.presetNames[now.preset]).toBe('Height to drum');
    // The short link's ~name reads presetOf, which still counts the jugglers' pans: unchanged.
    expect(presetOf(passing.mapping!)).toBe('custom');
    for (const p of PRESETS.filter((q) => q.group === 'passing')) expect(soundOf(p.mapping!)).toBe('height-drum');
  });
  test('a hand-edited per-height mapping still reads Custom, on a passing card too', () => {
    const passing = PRESETS.find((p) => p.id === 'passing')!;
    const edited = applyEdit(passing.mapping!, { kind: 'height', height: 3, sample: 'cowbell' });
    expect(soundOf(edited)).toBe('custom');
    expect(nowPlaying({ mapping: applyEdit(defaultState().mapping, { kind: 'height', height: 3, sample: 'cowbell' }) }).preset).toBe('custom');
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
