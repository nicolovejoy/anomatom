import { describe, expect, test, vi } from 'vitest';
import { typed } from '../test/schedules';
import { copy } from '../ui/copy';
import { reduce } from './actions';
import {
  deckLabel,
  deckPresets,
  groupTag,
  keyTarget,
  masterGain,
  presetIndex,
  presetMeta,
  settledPick,
  start,
  stepIndex,
  stepKey,
  toggle,
  volumePatch,
  wheelIndexAt,
  wheelNotch,
} from './deck-model';
import { derived } from './derived';
import { cardGroups, presetPatch } from './first-minute';
import { PRESETS } from './presets';
import { defaultState, type AppState } from './state';

const list = deckPresets();
const at = (id: string) => list.findIndex((p) => p.id === id);
const loaded = (id: string) => reduce(defaultState(), presetPatch(list[at(id)]!));
const none = { ctrl: false, meta: false, alt: false };

describe('the deck order', () => {
  test('every preset once, in cardGroups() order', () => {
    expect(list.map((p) => p.id)).toEqual(cardGroups().flatMap((g) => g.presets.map((p) => p.id)));
    expect(new Set(list).size).toBe(PRESETS.length);
  });
  test('the default state is the cascade, so → twice goes 3 → 51 → 441', () => {
    const i = presetIndex(defaultState());
    expect(i).toBe(0);
    const ids = [stepIndex(i, 1, list.length), stepIndex(stepIndex(i, 1, list.length), 1, list.length)].map((j) => list[j]!.id);
    expect(ids).toEqual(['shower', 'pause']);
  });
  test('a loaded preset is found; a hand-made pattern is none', () => {
    expect(presetIndex(loaded('box'))).toBe(at('box'));
    expect(presetIndex(typed(['66']))).toBeNull();
  });
});

describe('stepIndex', () => {
  test('wraps at both ends', () => {
    expect(stepIndex(0, -1, 5)).toBe(4);
    expect(stepIndex(4, 1, 5)).toBe(0);
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(2, -1, 5)).toBe(1);
  });
  test('from no preset, › goes to the first and ‹ to the last', () => {
    expect(stepIndex(null, 1, 5)).toBe(0);
    expect(stepIndex(null, -1, 5)).toBe(4);
  });
});

describe('the label', () => {
  test('a juggling preset: notation, name, balls', () => {
    expect(deckLabel(loaded('classic'))).toEqual({ pattern: '531', name: copy.presets.classic!.name, meta: '3 balls', valid: true });
    expect(deckLabel(loaded('polyrhythm')).pattern).toBe('2 2x 2 / 2x 2');
  });
  test('a passing preset counts jugglers', () => {
    expect(deckLabel(loaded('passing')).meta).toBe('2 jugglers');
    expect(presetMeta(list[at('passing')]!)).toBe('2 jugglers');
    expect(copy.deck.jugglers(1)).toBe('1 juggler');
  });
  test('a hand-made pattern: its text, "Your pattern", its balls or can’t juggle', () => {
    expect(deckLabel(typed(['66']))).toEqual({ pattern: '66', name: copy.deck.yourOwn, meta: '6 balls', valid: true });
    expect(deckLabel(typed(['432']))).toMatchObject({ pattern: '432', meta: copy.summaryCantJuggle, valid: false });
  });
  test('a preset with no name in copy shows an empty name', () => {
    const odd = [{ ...list[0]!, id: 'no-such-name' }];
    expect(deckLabel(defaultState(), odd).name).toBe('');
  });
  test('group tags', () => {
    expect(groupTag('3')).toBe('3');
    expect(groupTag('passing')).toBe('Pass');
  });
});

describe('the wheel', () => {
  test('the row in the band is the nearest whole row, clamped', () => {
    expect(wheelIndexAt(0, 32, 10)).toBe(0);
    expect(wheelIndexAt(47, 32, 10)).toBe(1);
    expect(wheelIndexAt(49, 32, 10)).toBe(2);
    expect(wheelIndexAt(-20, 32, 10)).toBe(0);
    expect(wheelIndexAt(10_000, 32, 10)).toBe(9);
  });
  test('a settle picks a new preset, never Make your own or the one loaded', () => {
    expect(settledPick(3, 1, 10)).toBe(3);
    expect(settledPick(3, null, 10)).toBe(3);
    expect(settledPick(1, 1, 10)).toBeNull();
    expect(settledPick(10, 1, 10)).toBeNull();
  });
  test('a mouse wheel steps once a notch', () => {
    expect(wheelNotch(0, 20, 50)).toEqual({ step: null, acc: 20 });
    expect(wheelNotch(20, 40, 50)).toEqual({ step: 1, acc: 0 });
    expect(wheelNotch(0, -100, 50)).toEqual({ step: -1, acc: 0 });
  });
});

describe('the keys', () => {
  test('what has focus', () => {
    expect(keyTarget('BUTTON', null, 'tab')).toBe('tab');
    expect(keyTarget('SELECT', null, null)).toBe('select');
    expect(keyTarget('TEXTAREA', null, null)).toBe('text');
    expect(keyTarget('INPUT', 'range', null)).toBe('range');
    expect(keyTarget('INPUT', 'text', null)).toBe('text');
    expect(keyTarget('INPUT', 'number', null)).toBe('text');
    expect(keyTarget('INPUT', 'checkbox', null)).toBe('other');
    expect(keyTarget('INPUT', 'radio', null)).toBe('other');
    expect(keyTarget('INPUT', 'button', null)).toBe('other');
    expect(keyTarget('BUTTON', null, null)).toBe('other');
    expect(keyTarget('BODY', null, null)).toBe('other');
  });
  test('← and → step from anywhere else; a modifier or a control that keeps its arrows passes', () => {
    expect(stepKey('ArrowLeft', 'other', none)).toBe(-1);
    expect(stepKey('ArrowRight', 'other', none)).toBe(1);
    expect(stepKey('ArrowUp', 'other', none)).toBeNull();
    for (const t of ['text', 'select', 'range', 'tab'] as const) expect(stepKey('ArrowRight', t, none), t).toBeNull();
    expect(stepKey('ArrowRight', 'other', { ...none, ctrl: true })).toBeNull();
    expect(stepKey('ArrowRight', 'other', { ...none, meta: true })).toBeNull();
    expect(stepKey('ArrowRight', 'other', { ...none, alt: true })).toBeNull();
  });
});

describe('volume and mute', () => {
  test('muted is silent; otherwise the volume', () => {
    expect(masterGain(0.6, true)).toBe(0);
    expect(masterGain(0.6, false)).toBe(0.6);
  });
  test('the slider unmutes', () => {
    expect(volumePatch(0.3)).toEqual({ volume: 0.3, muted: false });
  });
});

describe('the transport', () => {
  const fake = (state: 'playing' | 'paused' | 'stopped') => ({
    view: vi.fn(() => ({ state }) as ReturnType<import('./player').Player['view']>),
    playing: vi.fn(() => state === 'playing'),
    play: vi.fn(),
    resume: vi.fn(),
    pause: vi.fn(),
  });
  const s: AppState = defaultState();
  test('stopped: Play plays the store’s schedule, mapping and tempo', () => {
    const p = fake('stopped');
    toggle(p, s);
    expect(p.play).toHaveBeenCalledWith(derived(s).schedule, s.mapping, s.bpm);
  });
  test('paused: Play resumes', () => {
    const p = fake('paused');
    toggle(p, s);
    expect(p.resume).toHaveBeenCalled();
    expect(p.play).not.toHaveBeenCalled();
  });
  test('playing: Play pauses; start does nothing', () => {
    const p = fake('playing');
    toggle(p, s);
    expect(p.pause).toHaveBeenCalled();
    start(p, s);
    expect(p.play).not.toHaveBeenCalled();
    expect(p.resume).not.toHaveBeenCalled();
  });
});
