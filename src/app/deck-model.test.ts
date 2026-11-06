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
  scrollForRow,
  rowsThatFit,
  fitFontPx,
  nextFit,
  wheelNotch,
  menuRows,
  menuBand,
  nearestTop,
  editorShows,
  wheelPlace,
  grownRows,
  nextPhase,
  filteredPresets,
  chooseFilter,
  filterKeeper,
  filterChips,
  cardJugglers,
  sameFilter,
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
    const ids = [stepIndex(i, 1, list.length)!, stepIndex(stepIndex(i, 1, list.length), 1, list.length)!].map((j) => list[j]!.id);
    expect(ids).toEqual(['shower', 'pause']);
  });
  test('a loaded preset is found; a hand-made pattern is none', () => {
    expect(presetIndex(loaded('box'))).toBe(at('box'));
    expect(presetIndex(typed(['66']))).toBeNull();
  });
});

describe('stepIndex', () => {
  test('stops at both ends (v6.2 ruling 2): ‹ on the first and › on the last go nowhere', () => {
    expect(stepIndex(0, -1, 5)).toBeNull();
    expect(stepIndex(4, 1, 5)).toBeNull();
    expect(stepIndex(2, 1, 5)).toBe(3);
    expect(stepIndex(2, -1, 5)).toBe(1);
    expect(stepIndex(0, 1, 1)).toBeNull();
  });
  test('from no preset, › goes to the first and ‹ to the last', () => {
    expect(stepIndex(null, 1, 5)).toBe(0);
    expect(stepIndex(null, -1, 5)).toBe(4);
    // A hand-made pattern with Make your own chosen: still the first, or the last.
    expect(stepIndex(null, 1, 5, true)).toBe(0);
  });
  test('Make your own chosen, a card on stage: ↓ goes nowhere, ↑ to the last card', () => {
    expect(stepIndex(0, 1, 5, true)).toBeNull();
    expect(stepIndex(0, -1, 5, true)).toBe(4);
    expect(stepIndex(4, -1, 5, true)).toBe(4);
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
  test('the row in the band is the nearest whole row, clamped to the list', () => {
    // 10 rows: row r is in the band at r rows down, the blank rows above the first included.
    expect(wheelRowAt(0, 32, 10)).toBe(0);
    expect(wheelRowAt(47, 32, 10)).toBe(1);
    expect(wheelRowAt(49, 32, 10)).toBe(2);
    expect(wheelRowAt(-200, 32, 10)).toBe(0);
    expect(wheelRowAt(10_000, 32, 10)).toBe(9);
    for (const row of [0, 4, 9]) expect(wheelRowAt(scrollForRow(row, 32), 32, 10)).toBe(row);
    expect(scrollForRow(3, 32)).toBe(96);
  });
  test('the wheel has ends: up from Cascade nothing, down from Make your own nothing', () => {
    const length = list.length + 1; // the cards, then Make your own
    const own = list.length;
    expect(wheelRowAt(scrollForRow(0, 32) - 64, 32, length)).toBe(0);
    expect(wheelRowAt(scrollForRow(own, 32) + 64, 32, length)).toBe(own);
    expect(settledPick(own, 0, list.length)).toBeNull();
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
  test('where a turning key lands, stopping at the ends', () => {
    expect(rowAfterKey('ArrowDown', 3, 10, 7)).toBe(4);
    expect(rowAfterKey('ArrowUp', 3, 10, 7)).toBe(2);
    expect(rowAfterKey('ArrowUp', 0, 10, 7)).toBe(0);
    expect(rowAfterKey('ArrowDown', 9, 10, 7)).toBe(9);
    expect(rowAfterKey('PageDown', 5, 10, 7)).toBe(9);
    expect(rowAfterKey('PageDown', 1, 10, 7)).toBe(8);
    expect(rowAfterKey('PageUp', 8, 10, 7)).toBe(1);
    expect(rowAfterKey('PageUp', 5, 10, 7)).toBe(0);
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

describe('the filter chips in two groups (v6.1 ruling 4)', () => {
  const ids = (ps: readonly { id: string }[]) => ps.map((p) => p.id);
  const balls = (n: number) => ({ by: 'balls' as const, n });
  const jugglers = (n: number) => ({ by: 'jugglers' as const, n });
  test('the chips come from the deck: Balls 3 4 5, Jugglers 2 3 4', () => {
    expect(filterChips(list)).toEqual({ balls: [3, 4, 5], jugglers: [2, 3, 4] });
    expect(filterChips()).toEqual(filterChips(list));
    // A deck of other cards brings its own chips, ascending, with no repeats.
    const some = [list[12]!, list[0]!, list[1]!, list[20]!];
    expect(filterChips(some)).toEqual({ balls: [3, 5], jugglers: [3] });
    expect(filterChips([])).toEqual({ balls: [], jugglers: [] });
  });
  test('a passing card counts its jugglers, a solo card none', () => {
    expect(cardJugglers(list.find((p) => p.id === 'ultimates')!)).toBe(2);
    expect(cardJugglers(list.find((p) => p.id === 'three-feed')!)).toBe(3);
    expect(cardJugglers(list[0]!)).toBeNull();
  });
  test('Balls n holds the solo cards of n balls, Jugglers n the passing cards of n jugglers, in deck order', () => {
    expect(filteredPresets(list, null)).toBe(list);
    expect(ids(filteredPresets(list, balls(3)))).toEqual(ids(list.filter((p) => p.group === '3')));
    expect(filteredPresets(list, balls(4))).toHaveLength(4);
    expect(ids(filteredPresets(list, balls(5)))).toEqual(['five-cascade', 'five-744', 'ramp']);
    expect(ids(filteredPresets(list, jugglers(2)))).toEqual(['passing', 'ultimates', 'three-count', 'seven-fours', 'rising-passes']);
    expect(ids(filteredPresets(list, jugglers(3)))).toEqual(['three-feed', 'three-triangle', 'three-ultimates']);
    // A passing card of six balls is not a six-ball solo card; no chip holds nothing.
    expect(filteredPresets(list, balls(6))).toEqual([]);
    expect(ids(filteredPresets(list, jugglers(4)))).toEqual(['four-typewriter', 'four-square']);
    expect(filteredPresets(list, jugglers(5))).toEqual([]);
    // Every card is under exactly one chip.
    const chips = filterChips(list);
    const all = [...chips.balls.map(balls), ...chips.jugglers.map(jugglers)].flatMap((f) => ids(filteredPresets(list, f)));
    expect(all.sort()).toEqual(ids(list).sort());
  });
  test('two filters are the same choice by group and count', () => {
    expect(sameFilter(null, null)).toBe(true);
    expect(sameFilter(balls(3), balls(3))).toBe(true);
    expect(sameFilter(balls(3), jugglers(3))).toBe(false);
    expect(sameFilter(balls(3), balls(4))).toBe(false);
    expect(sameFilter(balls(3), null)).toBe(false);
    expect(sameFilter(null, jugglers(2))).toBe(false);
  });
  test('↑ ↓ step within the filter and stop at its ends', () => {
    const five = filteredPresets(list, balls(5));
    expect(stepIndex(five.length - 1, 1, five.length)).toBeNull();
    expect(stepIndex(0, -1, five.length)).toBeNull();
    expect(stepIndex(0, 1, five.length)).toBe(1);
    expect(presetIndex(loaded(five[1]!.id), five)).toBe(1);
  });
  test('a chip that holds the card on stage lights and the pattern stays', () => {
    const s = { ...defaultState(), deckFilter: null };
    expect(chooseFilter(s, balls(3))).toEqual({ deckFilter: balls(3), load: null });
    const feed = { ...loaded('three-feed'), deckFilter: null };
    expect(chooseFilter(feed, jugglers(3))).toEqual({ deckFilter: jugglers(3), load: null });
  });
  test("a chip that does not hold it loads the filter's first card", () => {
    const s = { ...defaultState(), deckFilter: null };
    expect(chooseFilter(s, jugglers(2))).toEqual({ deckFilter: jugglers(2), load: filteredPresets(list, jugglers(2))[0] });
    expect(chooseFilter({ ...s, deckFilter: balls(4) }, balls(5)).load?.id).toBe('five-cascade');
    // Across the groups: from Jugglers 2 to Jugglers 3, and from Balls 3 to Jugglers 3.
    expect(chooseFilter({ ...loaded('ultimates'), deckFilter: jugglers(2) }, jugglers(3)).load?.id).toBe('three-feed');
    expect(chooseFilter({ ...s, deckFilter: balls(3) }, jugglers(3))).toEqual({ deckFilter: jugglers(3), load: filteredPresets(list, jugglers(3))[0] });
    // A hand-made pattern holds no card: the first is loaded.
    const own = reduce(defaultState(), { type: 'editDraft', part: 0, text: '9' });
    expect(chooseFilter(own, balls(4)).load?.id).toBe(filteredPresets(list, balls(4))[0]!.id);
  });
  test('the lit chip tapped again clears; the pattern stays', () => {
    expect(chooseFilter({ ...defaultState(), deckFilter: jugglers(2) }, jugglers(2))).toEqual({ deckFilter: null, load: null });
    // The same count in the other group is another chip.
    expect(chooseFilter({ ...defaultState(), deckFilter: balls(3) }, jugglers(3)).deckFilter).toEqual(jugglers(3));
  });
  test('a filter with no card loads nothing', () => {
    expect(chooseFilter({ ...defaultState(), deckFilter: null }, balls(5), filteredPresets(list, balls(3)))).toEqual({ deckFilter: balls(5), load: null });
  });
  test('a new pattern that is a card outside the filter clears it; in it, or hand-made, keeps it', () => {
    const keep = filterKeeper();
    const three = { ...defaultState(), deckFilter: balls(3) };
    const four = { ...loaded(filteredPresets(list, balls(4))[0]!.id), deckFilter: balls(3) };
    expect(keep(four, three)).toEqual({ deckFilter: null });
    const box = { ...loaded(filteredPresets(list, balls(3))[1]!.id), deckFilter: balls(3) };
    expect(keep(box, three)).toEqual({});
    const feed = { ...loaded('three-feed'), deckFilter: jugglers(3) };
    expect(keep(feed, three)).toEqual({});
    expect(keep({ ...loaded('ultimates'), deckFilter: jugglers(3) }, feed)).toEqual({ deckFilter: null });
    const own = { ...reduce(defaultState(), { type: 'editDraft', part: 0, text: '9' }), deckFilter: balls(3) };
    expect(keep(own, three)).toEqual({});
    // No filter, or the pattern unchanged: nothing to do.
    expect(keep({ ...four, deckFilter: null }, three)).toEqual({});
    expect(keep({ ...three, bpm: 90 }, three)).toEqual({});
  });
});

describe('the phone wheel phase on its side (and a short wide screen)', () => {
  test('a turn spins; a stop settles; the return delay ends the settle (the mount then closes the wheel)', () => {
    let phase = nextPhase('rest', 'turn');
    expect(phase).toBe('spinning');
    phase = nextPhase(phase, 'stop');
    expect(phase).toBe('settling');
    expect(nextPhase(phase, 'return')).toBe('compact');
  });
  test('a turn while settling spins again, and the return delay of the old stop does nothing then', () => {
    expect(nextPhase('settling', 'turn')).toBe('spinning');
    expect(nextPhase('spinning', 'return')).toBe('spinning');
  });
  test('a stop or a return at rest changes nothing; close always rests', () => {
    expect(nextPhase('rest', 'stop')).toBe('rest');
    expect(nextPhase('rest', 'return')).toBe('rest');
    for (const phase of ['spinning', 'settling', 'compact', 'grown'] as const) expect(nextPhase(phase, 'close')).toBe('rest');
  });
  test('a compact wheel turned on its side grows to rest; nothing else grows', () => {
    expect(nextPhase('compact', 'grow')).toBe('rest');
    expect(nextPhase('rest', 'grow')).toBe('rest');
    expect(nextPhase('spinning', 'grow')).toBe('spinning');
    expect(nextPhase('settling', 'grow')).toBe('settling');
  });
});

describe('the upright phone wheel phase (v6.6 ruling 4)', () => {
  const up = (phase: Parameters<typeof nextPhase>[0], event: Parameters<typeof nextPhase>[1]) => nextPhase(phase, event, true);
  test('a turn grows it in place, spinning, from any phase', () => {
    for (const phase of ['compact', 'grown', 'spinning', 'settling'] as const) expect(up(phase, 'turn')).toBe('spinning');
  });
  test('a stop settles a spinning wheel and nothing else', () => {
    expect(up('spinning', 'stop')).toBe('settling');
    for (const phase of ['compact', 'grown', 'settling'] as const) expect(up(phase, 'stop')).toBe(phase);
  });
  test('the return delay makes a settled wheel and a grown one compact; a spinning one stays', () => {
    expect(up('settling', 'return')).toBe('compact');
    expect(up('grown', 'return')).toBe('compact');
    expect(up('spinning', 'return')).toBe('spinning');
    expect(up('compact', 'return')).toBe('compact');
  });
  test('a press and lift that turns nothing grows only the compact wheel', () => {
    expect(up('compact', 'grow')).toBe('grown');
    for (const phase of ['grown', 'spinning', 'settling'] as const) expect(up(phase, 'grow')).toBe(phase);
  });
  test('a row tapped makes it compact, from any phase', () => {
    for (const phase of ['compact', 'grown', 'spinning', 'settling'] as const) expect(up(phase, 'tap')).toBe('compact');
  });
  test('Escape, a tap outside, Details, Make your own: compact, never rest; on a compact wheel nothing changes', () => {
    for (const phase of ['compact', 'grown', 'spinning', 'settling', 'rest'] as const) expect(up(phase, 'close')).toBe('compact');
  });
});

describe('the upright phone wheel grown in place (v6.6 ruling 5)', () => {
  // Heights as the mount measures them (illustrative): the card's chrome (its 12 px top margin, the
  // border, the chips row) 62 px here, about 64 in the page,
  // the strip 120 (100 with the sheet open), the sound row 53; the closed sheet 20 (44 with the
  // sound's status row showing, as the stubbed e2e has it).
  const at = (view: number, sheet = 20, strip = 120) => ({ view, chrome: 62, strip, sound: 53, sheet });
  test('390×844 (800 under the top bar): seven rows, the juggler keeping its 200 px', () => {
    expect(grownRows(at(800), 32, 7, 3, 200)).toBe(7);
    expect(grownRows(at(800, 44), 32, 7, 3, 200)).toBe(7);
  });
  test('375×667 (623): five rows; seven would leave the juggler 104', () => {
    expect(grownRows(at(623), 32, 7, 3, 200)).toBe(5);
    // Exactly 200 px left at five rows; one pixel less, three.
    expect(grownRows(at(615), 32, 7, 3, 200)).toBe(5);
    expect(grownRows(at(614), 32, 7, 3, 200)).toBe(3);
  });
  test('a stage shorter than an SE’s: never fewer than the compact rows', () => {
    expect(grownRows(at(400), 32, 7, 3, 200)).toBe(3);
    expect(grownRows(at(0), 32, 7, 3, 200)).toBe(3);
  });
  test('the sheet open: its head and tabs stay, the juggler at its open floor', () => {
    expect(grownRows(at(623, 116, 100), 32, 7, 3, 120)).toBe(5);
    expect(grownRows(at(800, 116, 100), 32, 7, 3, 120)).toBe(7);
  });
});

describe('the web wheel, a menu (v6 rulings 1 to 3, v6.2 ruling 3)', () => {
  test('rows from a height: as many as fit, never fewer than the floor, never more than the list', () => {
    expect(menuRows(22, 1024, 44, 7)).toBe(22);
    expect(menuRows(22, 744, 44, 7)).toBe(16);
    expect(menuRows(22, 44 * 12, 44, 7)).toBe(12);
    expect(menuRows(22, 44 * 13 - 1, 44, 7)).toBe(12);
    expect(menuRows(22, 100, 44, 7)).toBe(7);
    // Jugglers 3: three cards and Make your own, as tall as its rows.
    expect(menuRows(4, 744, 44, 7)).toBe(4);
  });
  test('the band is on the card on stage, or on Make your own when it was chosen or the pattern is hand-made', () => {
    expect(menuBand(2, 21, false)).toBe(2);
    expect(menuBand(2, 21, true)).toBe(21);
    expect(menuBand(null, 21, false)).toBe(21);
  });
  test('a picked row comes into view the nearest way, or stays where it is', () => {
    // A view of 5 rows of 44 at scrollTop 88 shows rows 2 to 6.
    expect(nearestTop(88, 44, 88, 220)).toBe(88);
    expect(nearestTop(264, 44, 88, 220)).toBe(88);
    expect(nearestTop(44, 44, 88, 220)).toBe(44);
    expect(nearestTop(308, 44, 88, 220)).toBe(132);
    expect(nearestTop(0, 44, 0, 220)).toBe(0);
  });
  test('the editor: a card hides it, Make your own and a non-card show it, typing into a card keeps it', () => {
    expect(editorShows(true, { kind: 'pickCard' })).toBe(false);
    expect(editorShows(false, { kind: 'makeOwn' })).toBe(true);
    expect(editorShows(false, { kind: 'pattern', card: false })).toBe(true);
    expect(editorShows(true, { kind: 'pattern', card: true })).toBe(true);
    expect(editorShows(false, { kind: 'pattern', card: true })).toBe(false);
  });
});
