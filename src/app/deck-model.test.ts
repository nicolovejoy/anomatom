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
  rowAfterKey,
  settledPick,
  start,
  stepIndex,
  stepKey,
  toggle,
  turnsWheel,
  volumePatch,
  wheelRowAt,
  centrePlace,
  offsetFor,
  placeOf,
  scrollForPlace,
  loopDelta,
  rowsThatFit,
  fitFontPx,
  wheelNotch,
  wheelPlace,
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
  test('the row in the band is the nearest whole place, half the rows down, clamped, through the offset', () => {
    // 10 rows, 7 shown (3 above the band), offset 0: scrollTop 0 bands place 3.
    expect(wheelRowAt(0, 32, 3, 0, 10)).toBe(3);
    expect(wheelRowAt(47, 32, 3, 0, 10)).toBe(4);
    expect(wheelRowAt(49, 32, 3, 0, 10)).toBe(5);
    expect(wheelRowAt(-200, 32, 3, 0, 10)).toBe(0);
    expect(wheelRowAt(10_000, 32, 3, 0, 10)).toBe(9);
    // Offset 8: place 0 holds row 8, so place 3 holds row 1 (8, 9, 0, 1).
    expect(wheelRowAt(0, 32, 3, 8, 10)).toBe(1);
  });
  test('the loop: the band row sits at the middle place, every place filled', () => {
    expect(centrePlace(10)).toBe(5);
    expect(centrePlace(28)).toBe(14);
    expect(offsetFor(0, 10)).toBe(5);
    expect(offsetFor(7, 10)).toBe(2);
    expect(placeOf(0, offsetFor(0, 10), 10)).toBe(5);
    // Every row a place, each place once.
    const off = offsetFor(2, 10);
    expect(new Set(Array.from({ length: 10 }, (_, r) => placeOf(r, off, 10))).size).toBe(10);
    expect(scrollForPlace(5, 32, 3)).toBe(64);
    // The band's row at rest is the row the offset was made for.
    for (const row of [0, 4, 9]) expect(wheelRowAt(scrollForPlace(centrePlace(10), 32, 3), 32, 3, offsetFor(row, 10), 10)).toBe(row);
  });
  test('the looped wheel: Cascade has Make your own and the last passing patterns above it, Make your own has Cascade below', () => {
    const length = list.length + 1; // the presets, then Make your own
    const own = list.length;
    const lastPassing = list.length - 1;
    expect(list[lastPassing]!.group).toBe('passing');
    const off = offsetFor(0, length); // Cascade in the band
    const rowAtPlace = (place: number) => Array.from({ length }, (_, r) => r).find((r) => placeOf(r, off, length) === place);
    const band = centrePlace(length);
    expect(list[rowAtPlace(band)!]!.id).toBe('cascade');
    expect(rowAtPlace(band - 1)).toBe(own);
    expect(rowAtPlace(band - 2)).toBe(lastPassing);
    expect(list[rowAtPlace(band - 3)!]!.group).toBe('passing');
    expect(list[rowAtPlace(band + 1)!]!.id).toBe('shower');
    // Scrolling two rows up from Cascade settles on the last passing pattern; one on Make your own, which picks nothing.
    const top = scrollForPlace(band, 32, 3);
    expect(wheelRowAt(top - 64, 32, 3, off, length)).toBe(lastPassing);
    expect(wheelRowAt(top - 32, 32, 3, off, length)).toBe(own);
    expect(settledPick(own, 0, list.length)).toBeNull();
    // Across the other seam: from Make your own, one down is Cascade again.
    const offOwn = offsetFor(own, length);
    expect(wheelRowAt(scrollForPlace(band, 32, 3) + 32, 32, 3, offOwn, length)).toBe(0);
  });
  test('the shortest way round', () => {
    expect(loopDelta(0, 2, 10)).toBe(2);
    expect(loopDelta(0, 9, 10)).toBe(-1);
    expect(loopDelta(9, 0, 10)).toBe(1);
    expect(loopDelta(3, 3, 10)).toBe(0);
    expect(loopDelta(0, 5, 10)).toBe(5);
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

describe('the wheel by keyboard', () => {
  test('only the turning keys turn it; Tab moves focus', () => {
    for (const k of ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End']) expect(turnsWheel(k), k).toBe(true);
    for (const k of ['Tab', 'Enter', ' ', 'ArrowLeft', 'a']) expect(turnsWheel(k), k).toBe(false);
  });
  test('where a turning key lands, round the loop', () => {
    expect(rowAfterKey('ArrowDown', 3, 10, 7)).toBe(4);
    expect(rowAfterKey('ArrowUp', 0, 10, 7)).toBe(9);
    expect(rowAfterKey('ArrowDown', 9, 10, 7)).toBe(0);
    expect(rowAfterKey('PageDown', 5, 10, 7)).toBe(2);
    expect(rowAfterKey('PageUp', 8, 10, 7)).toBe(1);
    expect(rowAfterKey('Home', 5, 10, 7)).toBe(0);
    expect(rowAfterKey('End', 5, 10, 7)).toBe(9);
    expect(rowAfterKey('Tab', 5, 10, 7)).toBe(5);
  });
});

describe('the open phone wheel keeps the juggler in view', () => {
  test('a tall stage: along its bottom, the figure above', () => {
    expect(wheelPlace({ left: 0, top: 0, width: 390, height: 600 }, 32, 7, 200, 300)).toEqual({
      left: 0,
      top: 376,
      width: 390,
      height: 224,
      padBottom: 224,
      padRight: 0,
      rows: 7,
    });
  });
  test('a short stage: down its right side, the figure to the left', () => {
    expect(wheelPlace({ left: 8, top: 0, width: 420, height: 290 }, 32, 7, 200, 300)).toEqual({
      left: 218,
      top: 33,
      width: 210,
      height: 224,
      padBottom: 0,
      padRight: 210,
      rows: 7,
    });
    expect(wheelPlace({ left: 0, top: 10, width: 800, height: 200 }, 32, 7, 200, 300)).toMatchObject({ left: 500, top: 10, width: 300 });
  });
  test('a phone on its side or a short wide screen: in the column below Kit and Sound, as many rows as fit', () => {
    const stage = { left: 0, top: 0, width: 307, height: 331 };
    // 844×390: room for all seven rows.
    expect(wheelPlace(stage, 32, 7, 200, 300, { left: 444, top: 68, width: 400, height: 278 })).toEqual({
      left: 444,
      top: 68,
      width: 400,
      height: 224,
      padBottom: 0,
      padRight: 0,
      rows: 7,
    });
    // 667×375: 221 px, so five rows.
    expect(wheelPlace(stage, 32, 7, 200, 300, { left: 307, top: 110, width: 360, height: 221 })).toMatchObject({ top: 110, height: 160, rows: 5 });
    // Not even three rows: down the stage's side.
    expect(wheelPlace(stage, 32, 7, 200, 300, { left: 307, top: 57, width: 360, height: 90 }).padRight).toBe(154);
  });
  test('rows that fit: odd, at most the wheel, at least three', () => {
    expect(rowsThatFit(224, 32, 7)).toBe(7);
    expect(rowsThatFit(223, 32, 7)).toBe(5);
    expect(rowsThatFit(96, 32, 7)).toBe(3);
    expect(rowsThatFit(95, 32, 7)).toBe(0);
  });
});

describe('the notation fits', () => {
  test('full size when it fits; shrunk to fit, a tenth of a pixel at a time; never below the floor', () => {
    expect(fitFontPx(100, 120, 16, 11)).toBe(16);
    expect(fitFontPx(120, 120, 16, 11)).toBe(16);
    expect(fitFontPx(200, 150, 16, 11)).toBe(12);
    expect(fitFontPx(192, 132, 16, 11)).toBe(11);
    expect(fitFontPx(300, 100, 16, 11)).toBe(11);
    expect(fitFontPx(0, 0, 16, 11)).toBe(16);
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
