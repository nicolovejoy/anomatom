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
  nextFit,
  nearEnd,
  wheelNotch,
  dockedRows,
  wheelCopies,
  rowOfSlot,
  slotNear,
  wheelDeltaPx,
  wheelInput,
  easeOut,
  glideAt,
  glideDone,
  restTop,
  notchGlide,
  shiftGlide,
  settleGlide,
  settleTarget,
  burstAdd,
  BURST_AT_REST,
  editorShows,
  wheelPlace,
  sheetWheelPlace,
  nextPhase,
  filteredPresets,
  chooseFilter,
  filterKeeper,
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
  test('near an end: within two rows of either end of the list, the band turns the list at once', () => {
    // 28 rows, 7 shown (half 3): the band's place is round(scrollTop / 32) + 3.
    const at = (place: number) => (place - 3) * 32;
    expect(nearEnd(at(14), 32, 3, 28, 2)).toBe(false);
    expect(nearEnd(at(5), 32, 3, 28, 2)).toBe(false);
    expect(nearEnd(at(4), 32, 3, 28, 2)).toBe(true);
    expect(nearEnd(at(3), 32, 3, 28, 2)).toBe(true);
    expect(nearEnd(at(22), 32, 3, 28, 2)).toBe(false);
    expect(nearEnd(at(23), 32, 3, 28, 2)).toBe(true);
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
  test('measured again: shrinks on when the text did not scale down in proportion; stops when it fits or at the floor', () => {
    // 19 glyphs of 7 px (rounded advances) at 11.3 px: 133 px in 132 available.
    expect(nextFit(11.3, 133, 132, 11)).toBe(11.2);
    expect(nextFit(13, 200, 100, 11)).toBe(11);
    expect(nextFit(11.3, 132, 132, 11)).toBeNull();
    expect(nextFit(11, 140, 132, 11)).toBeNull();
  });
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
  test('stopped: Play plays the store’s schedule, derived mapping and tempo', () => {
    const p = fake('stopped');
    toggle(p, s);
    expect(p.play).toHaveBeenCalledWith(derived(s).schedule, derived(s).mapping, s.bpm);
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

describe('the phone wheel takes the sheet', () => {
  const view = { left: 0, top: 0, width: 390, height: 800 };
  test('a closed sheet: seven rows along the bottom, the stage keeps the overlap clear', () => {
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 690 }, 690, 32, 7, 200)).toEqual({
      left: 0,
      top: 576,
      width: 390,
      height: 224,
      padBottom: 114,
      padRight: 0,
      rows: 7,
    });
  });
  test('an open sheet: as many rows as cover it, rounded up to odd', () => {
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 280 }, 280, 32, 7, 200)).toMatchObject({ rows: 17, top: 256, padBottom: 24 });
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 544 }, 544, 32, 7, 200)).toMatchObject({ rows: 9, top: 512 });
  });
  test('never so tall that the figure loses its minimum', () => {
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 220 }, 220, 32, 7, 200)).toMatchObject({ rows: 17, top: 256, padBottom: 0 });
  });
  test('no room for even three rows: null', () => {
    expect(sheetWheelPlace({ ...view, height: 300 }, { left: 0, top: 0, width: 390, height: 100 }, 100, 32, 7, 280)).toBeNull();
  });
  test('the filter chips above the rows count in the place (v6 ruling 4)', () => {
    // Closed sheet, 40 px of chips: still seven rows, the place 40 px taller and higher.
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 690 }, 690, 32, 7, 200, 40)).toEqual({
      left: 0,
      top: 536,
      width: 390,
      height: 264,
      padBottom: 154,
      padRight: 0,
      rows: 7,
    });
    // Open sheet: the chips sit above the seventeen rows, still clear of the figure's 200 px.
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 220 }, 220, 32, 7, 200, 40)).toMatchObject({ rows: 17, top: 216 });
    // Where the figure's minimum is what limits: a row pair fewer than without the chips.
    expect(sheetWheelPlace(view, { left: 0, top: 0, width: 390, height: 220 }, 220, 32, 7, 280, 40)).toMatchObject({ rows: 15, top: 280 });
  });
});

describe('the open phone wheel with the filter chips above it', () => {
  test('along the stage bottom, the chips over the rows', () => {
    expect(wheelPlace({ left: 0, top: 0, width: 390, height: 600 }, 32, 7, 200, 300, null, 40)).toEqual({
      left: 0,
      top: 336,
      width: 390,
      height: 264,
      padBottom: 264,
      padRight: 0,
      rows: 7,
    });
  });
  test('in the column: the chips take their height before the rows', () => {
    const stage = { left: 0, top: 0, width: 307, height: 331 };
    expect(wheelPlace(stage, 32, 7, 200, 300, { left: 444, top: 68, width: 400, height: 250 }, 40)).toMatchObject({ top: 68, height: 200, rows: 5 });
  });
});

describe('the filter chips (v6 ruling 4)', () => {
  const ids = (ps: readonly { id: string }[]) => ps.map((p) => p.id);
  test('a filter leaves its group, in deck order; none leaves every card', () => {
    expect(filteredPresets(list, null)).toBe(list);
    for (const g of ['3', '4', '5', 'passing'] as const) {
      const f = filteredPresets(list, g);
      expect(f.length).toBeGreaterThan(0);
      expect(f.every((p) => p.group === g)).toBe(true);
      expect(ids(f)).toEqual(ids(list.filter((p) => p.group === g)));
    }
    expect(filteredPresets(list, '5')).toHaveLength(3);
  });
  test('← → step within the group, round its loop', () => {
    const five = filteredPresets(list, '5');
    expect(stepIndex(five.length - 1, 1, five.length)).toBe(0);
    expect(stepIndex(0, -1, five.length)).toBe(five.length - 1);
    expect(presetIndex(loaded(five[1]!.id), five)).toBe(1);
  });
  test('a chip whose group holds the card on stage lights and the pattern stays', () => {
    const s = { ...defaultState(), deckFilter: null };
    expect(chooseFilter(s, '3')).toEqual({ deckFilter: '3', load: null });
  });
  test('a chip whose group does not hold it loads the group\'s first card', () => {
    const s = { ...defaultState(), deckFilter: null };
    expect(chooseFilter(s, 'passing')).toEqual({ deckFilter: 'passing', load: filteredPresets(list, 'passing')[0] });
    expect(chooseFilter({ ...s, deckFilter: '4' }, '5').load?.id).toBe(filteredPresets(list, '5')[0]!.id);
    // A hand-made pattern holds no card: the first is loaded.
    const own = reduce(defaultState(), { type: 'editDraft', part: 0, text: '9' });
    expect(chooseFilter(own, '4').load?.id).toBe(filteredPresets(list, '4')[0]!.id);
  });
  test('the lit chip tapped again clears; the pattern stays', () => {
    expect(chooseFilter({ ...defaultState(), deckFilter: 'passing' }, 'passing')).toEqual({ deckFilter: null, load: null });
  });
  test('a group with no card loads nothing', () => {
    expect(chooseFilter({ ...defaultState(), deckFilter: null }, '5', filteredPresets(list, '3'))).toEqual({ deckFilter: '5', load: null });
  });
  test('a new pattern that is a card outside the filter clears it; in it, or hand-made, keeps it', () => {
    const keep = filterKeeper();
    const three = { ...defaultState(), deckFilter: '3' as const };
    const four = { ...loaded(filteredPresets(list, '4')[0]!.id), deckFilter: '3' as const };
    expect(keep(four, three)).toEqual({ deckFilter: null });
    const box = { ...loaded(filteredPresets(list, '3')[1]!.id), deckFilter: '3' as const };
    expect(keep(box, three)).toEqual({});
    const own = { ...reduce(defaultState(), { type: 'editDraft', part: 0, text: '9' }), deckFilter: '3' as const };
    expect(keep(own, three)).toEqual({});
    // No filter, or the pattern unchanged: nothing to do.
    expect(keep({ ...four, deckFilter: null }, three)).toEqual({});
    expect(keep({ ...three, bpm: 90 }, three)).toEqual({});
  });
});

describe('the phone wheel phase', () => {
  test('a turn spins; a stop settles; the return delay brings the controls back', () => {
    let phase = nextPhase('rest', 'turn');
    expect(phase).toBe('spinning');
    phase = nextPhase(phase, 'stop');
    expect(phase).toBe('settling');
    expect(nextPhase(phase, 'return')).toBe('rest');
  });
  test('a turn while settling spins again, and the return delay of the old stop does nothing then', () => {
    expect(nextPhase('settling', 'turn')).toBe('spinning');
    expect(nextPhase('spinning', 'return')).toBe('spinning');
  });
  test('a stop or a return at rest changes nothing; close always rests', () => {
    expect(nextPhase('rest', 'stop')).toBe('rest');
    expect(nextPhase('rest', 'return')).toBe('rest');
    expect(nextPhase('spinning', 'close')).toBe('rest');
    expect(nextPhase('settling', 'close')).toBe('rest');
  });
});

describe('the web wheel (v6 rulings 1 to 3)', () => {
  test('rows from a height: the most odd rows that fit, never fewer than the floor', () => {
    expect(dockedRows(1024, 44, 7)).toBe(23);
    expect(dockedRows(744, 44, 7)).toBe(15);
    expect(dockedRows(44 * 12, 44, 7)).toBe(11);
    expect(dockedRows(44 * 13, 44, 7)).toBe(13);
    expect(dockedRows(100, 44, 7)).toBe(7);
  });
  test('copies: one while the deck has room to turn; more where the column shows more rows than it holds', () => {
    expect(wheelCopies(19, 7, 2)).toBe(1);
    expect(wheelCopies(19, 13, 2)).toBe(1);
    expect(wheelCopies(19, 15, 2)).toBe(2);
    expect(wheelCopies(19, 23, 2)).toBe(2);
    expect(wheelCopies(5, 7, 2)).toBe(3);
  });
  test('with its copies the band rests clear of both ends, and a row either way does too', () => {
    for (let length = 3; length <= 25; length++) {
      for (let shown = 3; shown <= 31; shown += 2) {
        const slots = length * wheelCopies(length, shown, 2);
        const half = (shown - 1) / 2;
        const rest = scrollForPlace(centrePlace(slots), 44, half);
        for (const d of [-1, 0, 1]) expect(nearEnd(rest + d * 44, 44, half, slots, 2), `${length} ${shown} ${d}`).toBe(false);
        expect(rest - 44).toBeGreaterThanOrEqual(0);
        expect(rest + 44).toBeLessThanOrEqual((slots - shown) * 44);
      }
    }
  });
  test('a slot holds its row; the copy nearest the band is the one to use, a tie to the later', () => {
    expect(rowOfSlot(0, 19)).toBe(0);
    expect(rowOfSlot(20, 19)).toBe(1);
    // One copy: the row itself.
    expect(slotNear(4, 7, 19, 1)).toBe(4);
    // Two copies of 19 (38 places, centre 19): offset 0 puts slot 19 (row 0's copy) at the centre.
    expect(slotNear(0, 0, 19, 2)).toBe(19);
    expect(slotNear(1, 0, 19, 2)).toBe(20);
    // Offset 19 puts slot 0 at place 19, the centre.
    expect(slotNear(0, 19, 19, 2)).toBe(0);
    // A tie: 2 rows, 2 copies (4 places, centre 2); offset 1: slot 0 at place 3, slot 2 at place 1.
    expect(slotNear(0, 1, 2, 2)).toBe(0);
    expect(slotNear(0, 3, 2, 2)).toBe(2);
  });
  test('a wheel delta in px, from px, lines or pages', () => {
    expect(wheelDeltaPx(100, 0, 40, 600)).toBe(100);
    expect(wheelDeltaPx(3, 1, 40, 600)).toBe(120);
    expect(wheelDeltaPx(-1, 2, 40, 600)).toBe(-600);
  });
  test('a wheel event: a notch from a big delta or any in lines or pages, else a drag at the scale', () => {
    expect(wheelInput(0, 0, 50, 0.5)).toBeNull();
    expect(wheelInput(100, 0, 50, 0.5)).toEqual({ kind: 'notch', dir: 1 });
    expect(wheelInput(-50, 0, 50, 0.5)).toEqual({ kind: 'notch', dir: -1 });
    // Firefox counts a mouse notch in lines: a notch however small in px.
    expect(wheelInput(40, 1, 50, 0.5)).toEqual({ kind: 'notch', dir: 1 });
    expect(wheelInput(-600, 2, 50, 0.5)).toEqual({ kind: 'notch', dir: -1 });
    // A trackpad: half its size.
    expect(wheelInput(8, 0, 50, 0.5)).toEqual({ kind: 'drag', px: 4 });
    expect(wheelInput(-49, 0, 50, 0.5)).toEqual({ kind: 'drag', px: -24.5 });
  });
  test('ten small deltas of 8 move the list 40 px, continuously', () => {
    let top = 0;
    const seen: number[] = [];
    for (let i = 0; i < 10; i++) {
      const input = wheelInput(8, 0, 50, 0.5);
      if (input?.kind === 'drag') top += input.px;
      seen.push(top);
    }
    expect(top).toBe(40);
    expect(seen[4]).toBe(20);
  });
  test('the glide eases from its start to its target and stays there', () => {
    expect(easeOut(-1)).toBe(0);
    expect(easeOut(0)).toBe(0);
    expect(easeOut(0.5)).toBe(0.875);
    expect(easeOut(2)).toBe(1);
    const g = { from: 0, to: 44, start: 1000, ms: 180 };
    expect(glideAt(g, 990)).toBe(0);
    expect(glideAt(g, 1090)).toBeCloseTo(38.5);
    expect(glideAt(g, 1180)).toBe(44);
    expect(glideAt(g, 2000)).toBe(44);
    expect(glideAt({ ...g, ms: 0 }, 1000)).toBe(44);
    // Every frame moves on, never back: no row jumps.
    let last = 0;
    for (let t = 1000; t <= 1180; t += 16) {
      const at = glideAt(g, t);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
    expect(glideDone(g, 1179)).toBe(false);
    expect(glideDone(g, 1180)).toBe(true);
  });
  test('rows rest at whole multiples of the row height', () => {
    expect(restTop(40, 44)).toBe(44);
    expect(restTop(21, 44)).toBe(0);
    expect(restTop(-30, 44)).toBe(-44);
    expect(restTop(880, 44)).toBe(880);
  });
  test('a notch glides one row past the row nearest; notches in quick succession add up', () => {
    const one = notchGlide(null, 880, 1, 44, 1000, 180);
    expect(one).toEqual({ from: 880, to: 924, start: 1000, ms: 180 });
    // A second notch mid-glide: from where the list is to a row past the first target.
    const two = notchGlide(one, 900, 1, 44, 1060, 180);
    expect(two).toEqual({ from: 900, to: 968, start: 1060, ms: 180 });
    // Back the other way mid-glide: a row short of the target.
    expect(notchGlide(two, 920, -1, 44, 1100, 180).to).toBe(924);
    // A glide that has arrived counts for nothing: from the row nearest.
    expect(notchGlide(one, 924, -1, 44, 2000, 180).to).toBe(880);
    // After a drag left the list between rows: one row on from the nearest.
    expect(notchGlide(null, 900, 1, 44, 0, 180).to).toBe(924);
  });
  test('a glide moves with the list when the loop turns under it', () => {
    expect(shiftGlide({ from: 10, to: 54, start: 5, ms: 180 }, -440)).toEqual({ from: -430, to: -386, start: 5, ms: 180 });
  });
  test('the settle glides onto its row, or does nothing there', () => {
    expect(settleGlide(920, 924, 7, 180)).toEqual({ from: 920, to: 924, start: 7, ms: 180 });
    expect(settleGlide(900, 880, 7, 180)).toEqual({ from: 900, to: 880, start: 7, ms: 180 });
    expect(settleGlide(924.3, 924, 7, 180)).toBeNull();
  });
  test('a burst counts the events within the gap and adds up their moves', () => {
    const one = burstAdd(BURST_AT_REST, 2, 1000, 160);
    expect(one).toEqual({ events: 1, px: 2, last: 1000 });
    expect(burstAdd(one, 4, 1160, 160)).toEqual({ events: 2, px: 6, last: 1160 });
    // Past the gap: a new burst.
    expect(burstAdd(one, 4, 1161, 160)).toEqual({ events: 1, px: 4, last: 1161 });
  });
  test('the settle target: a Mac mouse notch of a few px goes a row on; a trackpad drag goes to the nearest', () => {
    const scaled = (deltas: number[], gap: number) => {
      let b = BURST_AT_REST;
      let top = 880;
      deltas.forEach((d, i) => {
        b = burstAdd(b, d * 0.5, 1000 + i * gap, 160);
        top += d * 0.5;
      });
      return settleTarget(top, 44, b, 1000 + deltas.length * gap + 170, 320);
    };
    // One accelerated tick of 4 px (2 px scaled): the next row, not back.
    expect(scaled([4], 16)).toBe(924);
    expect(scaled([-4], 16)).toBe(836);
    // Two ticks of 8: one row.
    expect(scaled([8, 8], 30)).toBe(924);
    // Twenty trackpad deltas of 2 (20 px scaled in all): the nearest row, back where it was.
    expect(scaled(Array(20).fill(2), 16)).toBe(880);
    // Twenty of 4 (40 px): the nearest row, a row on.
    expect(scaled(Array(20).fill(4), 16)).toBe(924);
    // Half a row or more in two events: the nearest.
    expect(settleTarget(880 + 30, 44, { events: 2, px: 30, last: 0 }, 170, 320)).toBe(924);
    expect(settleTarget(880 + 22, 44, { events: 1, px: 22, last: 0 }, 170, 320)).toBe(924);
    // Nothing moved (a notch's aligned glide, or no burst): the nearest.
    expect(settleTarget(924, 44, { events: 1, px: 0, last: 0 }, 170, 320)).toBe(924);
    expect(settleTarget(900, 44, BURST_AT_REST, 170, 320)).toBe(880);
  });
  test('a stale burst counts for nothing: a tick long ago, then a key, settles where the key put it', () => {
    const tick = burstAdd(BURST_AT_REST, 2, 1000, 160);
    // Fresh, it goes a row on; at the edge of the age, still; past it, the nearest.
    expect(settleTarget(924, 44, tick, 1170, 320)).toBe(968);
    expect(settleTarget(924, 44, tick, 1320, 320)).toBe(968);
    expect(settleTarget(924, 44, tick, 1321, 320)).toBe(924);
  });
  test('the editor: a card hides it, Make your own and a non-card show it, typing into a card keeps it', () => {
    expect(editorShows(true, { kind: 'pickCard' })).toBe(false);
    expect(editorShows(false, { kind: 'makeOwn' })).toBe(true);
    expect(editorShows(false, { kind: 'pattern', card: false })).toBe(true);
    expect(editorShows(true, { kind: 'pattern', card: true })).toBe(true);
    expect(editorShows(false, { kind: 'pattern', card: true })).toBe(false);
  });
});
