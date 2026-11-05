// The deck (docs/plans/v4-deck.md, rulings 1 to 4), headless: the presets in deck order, where a
// step lands, what the transport bar says for a state, which wheel row sits in the band, which
// key steps, the master gain under mute, and how Play starts. Pure: no DOM, no timers.
// `mount-deck.ts` is the elements.
import { copy } from '../ui/copy';
import { derived } from './derived';
import { cardGroups, cardPattern, matchPreset } from './first-minute';
import { analyse } from './knobs-model';
import type { Player } from './player';
import type { CardGroup, Preset } from './presets';
import { SHEET } from '../tunables';
import { summary } from './sheet-model';
import { jugglerCount } from '../sound/drummers';
import type { AppState, DeckFilter } from './state';

/** Every preset in `cardGroups()` order: what ‹ › and the wheel walk. Read afresh, so new presets join. */
export function deckPresets(): readonly Preset[] {
  return cardGroups().flatMap((g) => g.presets);
}

/*
 * The filter chips (docs/plans/v6-wheel-filters-three.md, ruling 4; in two groups after
 * docs/plans/v6-1-wheel-feel.md, ruling 4): Balls 3 4 5, Jugglers 2 3, one lit at a time across
 * both. Under a filter the wheel, ‹ › and ↑ ↓ walk its cards alone (stepIndex over the filtered
 * order), then Make your own. UI state, never in the link.
 */

/** The jugglers of a passing card (a pair of hands each), or null for a solo card. */
export function cardJugglers(p: Preset): number | null {
  return p.group === 'passing' ? jugglerCount(p.parts.length) : null;
}

/** Whether `p` is one of the cards `filter` holds. */
export function inFilter(p: Preset, filter: DeckFilter): boolean {
  return filter.by === 'balls' ? p.group !== 'passing' && p.balls === filter.n : cardJugglers(p) === filter.n;
}

/** Whether two filters (or none) are the same choice. */
export function sameFilter(a: DeckFilter | null, b: DeckFilter | null): boolean {
  return a === b || (a !== null && b !== null && a.by === b.by && a.n === b.n);
}

/** The cards a filter leaves, in deck order: all of `list` for none. */
export function filteredPresets(list: readonly Preset[], filter: DeckFilter | null): readonly Preset[] {
  return filter === null ? list : list.filter((p) => inFilter(p, filter));
}

/**
 * The chips, derived from the deck: the ball counts of the solo cards and the juggler counts of
 * the passing cards, each ascending, so a new kind of card brings its chip with no UI change.
 */
export function filterChips(list: readonly Preset[] = deckPresets()): { readonly balls: readonly number[]; readonly jugglers: readonly number[] } {
  const counts = (ns: readonly (number | null)[]) => [...new Set(ns.filter((n): n is number => n !== null))].sort((a, b) => a - b);
  return {
    balls: counts(list.map((p) => (p.group === 'passing' ? null : p.balls))),
    jugglers: counts(list.map(cardJugglers)),
  };
}

/**
 * A tap on the `chip`: it lights (the filter becomes `chip`), or, lit already, clears (null).
 * `load` is the card to load: the filter's first when the stage holds no card of it (a card
 * outside it, or a hand-made pattern), else null and the pattern stays.
 */
export function chooseFilter(
  state: Pick<AppState, 'parts' | 'ratio' | 'deckFilter'>,
  chip: DeckFilter,
  list: readonly Preset[] = deckPresets(),
): { readonly deckFilter: DeckFilter | null; readonly load: Preset | null } {
  if (sameFilter(state.deckFilter, chip)) return { deckFilter: null, load: null };
  const held = matchPreset(state, list);
  return { deckFilter: chip, load: held && inFilter(held, chip) ? null : (filteredPresets(list, chip)[0] ?? null) };
}

/**
 * A store deriver: a new pattern that is a card outside the lit filter (typed, or opened from a
 * link) clears the filter, so the wheel always holds the card on stage. A hand-made pattern keeps it.
 */
export function filterKeeper(list: () => readonly Preset[] = deckPresets) {
  return (next: AppState, previous: AppState): Partial<AppState> => {
    if (next.deckFilter === null || (next.parts === previous.parts && next.ratio === previous.ratio)) return {};
    const held = matchPreset(next, list());
    return held && !inFilter(held, next.deckFilter) ? { deckFilter: null } : {};
  };
}

/** The index in `list` of the preset the state holds (parts and ratio), or null for a hand-made pattern. */
export function presetIndex(state: Pick<AppState, 'parts' | 'ratio'>, list: readonly Preset[] = deckPresets()): number | null {
  const found = matchPreset(state, list);
  return found === undefined ? null : list.indexOf(found);
}

/**
 * Where a step lands: one card on, stopping at both ends (docs/plans/v6-2-wheel-ends.md, ruling
 * 2), null where it goes nowhere. From no preset (a hand-made pattern), › goes to the first and ‹
 * to the last (v4 ruling 2). `ownChosen`, Make your own chosen with a card still on stage (the web
 * menu after a click on it): it is the last row, so ↓ goes nowhere and ↑ to the last card.
 */
export function stepIndex(current: number | null, delta: -1 | 1, length: number, ownChosen = false): number | null {
  if (current === null) return delta > 0 ? 0 : length - 1;
  if (ownChosen) return delta > 0 ? null : length - 1;
  const next = current + delta;
  return next < 0 || next >= length ? null : next;
}

/** "3 balls" for a juggling preset, "2 jugglers" for a passing one. */
export function presetMeta(p: Preset): string {
  return p.group === 'passing' ? copy.deck.jugglers(jugglerCount(p.parts.length)) : copy.summaryBalls(p.balls);
}

export interface DeckLabel {
  /** The notation, in mono. */
  readonly pattern: string;
  /** The preset's name, or "Your pattern". */
  readonly name: string;
  /** "3 balls", "2 jugglers", or "can't juggle" for a hand-made pattern that isn't juggleable. */
  readonly meta: string;
  readonly valid: boolean;
}

/** What the transport bar shows for a state. */
export function deckLabel(state: AppState, list: readonly Preset[] = deckPresets()): DeckLabel {
  const i = presetIndex(state, list);
  if (i !== null) {
    const p = list[i] as Preset;
    return { pattern: cardPattern(p), name: copy.presets[p.id]?.name ?? '', meta: presetMeta(p), valid: true };
  }
  const s = summary(analyse(state), SHEET.longSummaryChars);
  return { pattern: s.text, name: copy.deck.yourOwn, meta: s.meta, valid: s.valid };
}

/**
 * The notation's font size so it fits its space (ruling 2 of docs/plans/v4-1-polish.md): `base`
 * when the text, `natural` px wide at `base`, fits in `available` px; else scaled down to fit, to a
 * tenth of a pixel, but never below `min` (past that the CSS ellipsizes it).
 */
export function fitFontPx(natural: number, available: number, base: number, min: number): number {
  if (natural <= available || natural <= 0) return base;
  return Math.max(min, Math.floor((base * available * 10) / natural) / 10);
}

/**
 * The next size to try when the notation, drawn at `size`, still measures `natural` px against
 * `available`: text does not always scale in proportion (a browser that rounds each glyph's advance
 * to whole pixels, as Chromium on Linux does, draws 11.1 px Plex Mono 7 px a glyph, not 6.66), so
 * the fit is measured again and shrunk again. Null when it fits or is already at `min`.
 */
export function nextFit(size: number, natural: number, available: number, min: number): number | null {
  if (natural <= available || size <= min) return null;
  return Math.max(min, Math.min(fitFontPx(natural, available, size, min), Math.round((size - 0.1) * 10) / 10));
}

/** The tag at the right of a wheel row: 3, 4, 5 or PASS. */
export const groupTag = (group: CardGroup): string => copy.deck.groupTags[group];

/*
 * The wheel has ends (docs/plans/v6-2-wheel-ends.md, rulings 1 and 4): its rows are the cards then
 * Make your own, `length` in all, each once, a list item a row. On a phone the list has `half`
 * blank rows above the first and below the last, so both ends reach the band, which sits `half`
 * rows below the top of the view: row r is in the band at a scrollTop of r rows.
 */

/** The scrollTop that brings `row` into the band, rows `rowPx` tall. */
export const scrollForRow = (row: number, rowPx: number): number => row * rowPx;

/** The row in the band at `scrollTop`: the nearest whole row, clamped to the list. */
export function wheelRowAt(scrollTop: number, rowPx: number, length: number): number {
  return Math.min(length - 1, Math.max(0, Math.round(scrollTop / rowPx)));
}

/**
 * The preset a settled wheel picks: the row's preset, or null when the row is "Make your own"
 * (past the presets) or the preset already loaded.
 */
export function settledPick(row: number, current: number | null, presets: number): number | null {
  return row >= presets || row === current ? null : row;
}

/** The keys that turn the wheel when a row has focus; Tab and the rest only move focus. */
const TURN_KEYS = ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End'];

/** Whether a key pressed in the wheel turns it (and so may pick when it settles). */
export const turnsWheel = (key: string): boolean => TURN_KEYS.includes(key);

/**
 * The row a turning key moves the wheel's focus to, from `row`, of `length` rows: one up or
 * down, a wheel's height (`page` rows) for PageUp and PageDown, stopping at the ends (v6.2 ruling
 * 2); the first row for Home and the last (Make your own) for End.
 */
export function rowAfterKey(key: string, row: number, length: number, page: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  const next = row + ({ ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page }[key] ?? 0);
  return Math.min(length - 1, Math.max(0, next));
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface WheelPlace extends Box {
  /** What the stage keeps clear for the wheel: at its foot, or to its right. */
  readonly padBottom: number;
  readonly padRight: number;
  /**
   * What the juggler's region keeps clear under it, the strip still at the stage's foot: the
   * wheel's height when it sits above the strip (docs/plans/v6-5-audio-session-wheel-place.md,
   * ruling 10), else 0.
   */
  readonly padFigure: number;
  /** The rows it shows: `rows`, or fewer (odd, at least 3) where the column is short. */
  readonly rows: number;
}

/** The most rows, odd, at most `rows` and at least 3, that fit in `height`; 0 when not even 3 do. */
export function rowsThatFit(height: number, rowPx: number, rows: number): number {
  for (let n = rows; n >= 3; n -= 2) if (n * rowPx <= height) return n;
  return 0;
}

/**
 * Where the open wheel sits when it is not docked, so the juggler and the beat ladder stay in
 * view. Given `column` (a phone on its side, or a wide screen too short to dock: the right-hand
 * column below Kit and Sound), in that column, with as many rows as fit there (ruling 5 of
 * docs/plans/v4-1-polish.md). Else, given `strip` (a phone upright: the ladder strip's height at
 * the stage's foot), directly above the strip when at least `minFigure` of height stays above the
 * wheel and the strip together (docs/plans/v6-5-audio-session-wheel-place.md, ruling 9; the
 * juggler keeps the wheel's height clear under it, `padFigure`). Else over the stage's foot, under
 * the strip, when at least `minFigure` stays above the wheel (a short phone); else down the
 * stage's right side, at most `sideMax` and at most half the stage wide, centred on the stage's
 * height (or at its top when shorter). `head` px above the rows (the filter chips, v6 ruling 4)
 * count in the place: its top is theirs.
 */
export function wheelPlace(
  stage: Box,
  rowPx: number,
  rows: number,
  minFigure: number,
  sideMax: number,
  column: Box | null = null,
  head = 0,
  strip: number | null = null,
): WheelPlace {
  const fit = column ? rowsThatFit(column.height - head, rowPx, rows) : 0;
  if (column && fit > 0) {
    return { left: column.left, top: column.top, width: column.width, height: fit * rowPx + head, padBottom: 0, padRight: 0, padFigure: 0, rows: fit };
  }
  const wheelHeight = rowPx * rows + head;
  const foot = stage.top + stage.height;
  if (strip !== null && stage.height - strip - wheelHeight >= minFigure) {
    return { left: stage.left, top: foot - strip - wheelHeight, width: stage.width, height: wheelHeight, padBottom: 0, padRight: 0, padFigure: wheelHeight, rows };
  }
  if (stage.height - wheelHeight >= minFigure) {
    return { left: stage.left, top: foot - wheelHeight, width: stage.width, height: wheelHeight, padBottom: wheelHeight, padRight: 0, padFigure: 0, rows };
  }
  const width = Math.min(sideMax, Math.round(stage.width / 2));
  return { left: stage.left + stage.width - width, top: stage.top + Math.max(0, (stage.height - wheelHeight) / 2), width, height: wheelHeight, padBottom: 0, padRight: width, padFigure: 0, rows };
}

/**
 * Where the phone wheel sits when it takes the sheet (docs/plans/v5-sound-model.md, ruling 9):
 * across the full width of the play view, anchored to its bottom, covering the deck and the sheet
 * (`coverTop`, view-relative, is where the deck starts). It shows an odd number of rows, at least
 * `minRows` and enough to cover `coverTop` downwards, but never so many that less than `minFigure`
 * of the stage stays above it. The stage keeps the part the wheel overlaps clear (`padBottom`).
 * Null where not even three rows fit under that rule: the caller falls back to wheelPlace.
 * `head` px above the rows (the filter chips) count in the place, as in wheelPlace.
 */
export function sheetWheelPlace(view: Box, stage: Box, coverTop: number, rowPx: number, minRows: number, minFigure: number, head = 0): WheelPlace | null {
  const wanted = Math.max(minRows, Math.ceil((view.height - coverTop - head) / rowPx));
  const rows = rowsThatFit(view.height - (stage.top + minFigure) - head, rowPx, wanted % 2 === 0 ? wanted + 1 : wanted);
  if (rows === 0) return null;
  const height = rows * rowPx + head;
  const top = view.height - height;
  return { left: 0, top, width: view.width, height, padBottom: Math.max(0, stage.top + stage.height - top), padRight: 0, padFigure: 0, rows };
}

/**
 * Where the compact phone wheel sits (docs/plans/v6-4-wheel-shrinks.md, ruling 1): `rows` rows
 * with no chips above them, the drum's edges cutting `cut` of a row off the outer two, in the
 * open wheel's three places (wheelPlace): directly above the ladder strip, `strip` tall
 * (docs/plans/v6-5-audio-session-wheel-place.md, ruling 9), where the figure keeps `minFigure`
 * above both; else over the stage's foot; else down its side.
 */
export function compactWheelPlace(stage: Box, rowPx: number, rows: number, cut: number, minFigure: number, sideMax: number, strip: number | null = null): WheelPlace {
  // One "row" as tall as the whole drum: wheelPlace's rule for a wheel of that height.
  return { ...wheelPlace(stage, Math.round(rowPx * (rows - 2 * cut)), 1, minFigure, sideMax, null, 0, strip), rows };
}

/**
 * The upright phone wheel's phase (ruling 9): at `rest` the controls show and an open wheel sits
 * in its stage place; a reader's turn makes it `spinning` and it takes the sheet; when it stops
 * it is `settling` (still on the sheet, the picked row in the band) until the return delay
 * passes, then `compact` (docs/plans/v6-4-wheel-shrinks.md, ruling 1): three rows above the ladder
 * strip (docs/plans/v6-5-audio-session-wheel-place.md, ruling 9), the strip and the controls under it. A turn during the settling, or on the compact wheel, spins
 * it again; a touch on the compact wheel that turns nothing `grow`s it back to `rest` (ruling 3);
 * a row tapped plays it and leaves the wheel compact (`tap`, ruling 4). `close` (the wheel shut)
 * always rests.
 */
export type WheelPhase = 'rest' | 'spinning' | 'settling' | 'compact';
export type WheelEvent = 'turn' | 'stop' | 'return' | 'grow' | 'tap' | 'close';

export function nextPhase(phase: WheelPhase, event: WheelEvent): WheelPhase {
  switch (event) {
    case 'turn':
      return 'spinning';
    case 'stop':
      return phase === 'spinning' ? 'settling' : phase;
    case 'return':
      return phase === 'settling' ? 'compact' : phase;
    case 'grow':
      return phase === 'compact' ? 'rest' : phase;
    case 'tap':
      return 'compact';
    case 'close':
      return 'rest';
  }
}

/** What has focus when a key is pressed, as far as ← → care. */
export type KeyTarget = 'text' | 'select' | 'range' | 'tab' | 'other';

/** The kind of a focused element: a text-like input or a textarea, a select, a range, a tab, or anything else. */
export function keyTarget(tagName: string, inputType: string | null, role: string | null): KeyTarget {
  const tag = tagName.toLowerCase();
  if (role === 'tab') return 'tab';
  if (tag === 'select') return 'select';
  if (tag === 'textarea') return 'text';
  if (tag !== 'input') return 'other';
  if (inputType === 'range') return 'range';
  return inputType === 'checkbox' || inputType === 'radio' || inputType === 'button' ? 'other' : 'text';
}

export interface Modifiers {
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
}

/** Whether a key steps the pattern: ← is -1, → is 1; null for any other key, with a modifier, or in a control that keeps its arrows. */
export function stepKey(key: string, target: KeyTarget, mods: Modifiers): -1 | 1 | null {
  if (mods.ctrl || mods.meta || mods.alt || target !== 'other') return null;
  return key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : null;
}

/**
 * A mouse wheel over the pattern name: the deltas add up, and each `notchPx` steps once (down is
 * forward). Returns the step, if any, and what is left over.
 */
export function wheelNotch(acc: number, deltaY: number, notchPx: number): { step: -1 | 1 | null; acc: number } {
  const total = acc + deltaY;
  if (Math.abs(total) < notchPx) return { step: null, acc: total };
  return { step: total > 0 ? 1 : -1, acc: 0 };
}

/*
 * The web wheel (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3), a menu since
 * docs/plans/v6-2-wheel-ends.md, ruling 3. Docked in the right-hand column its rows are taller, top
 * aligned, each once; it is as tall as the column holds while the editor is hidden, or as its rows
 * where they are fewer. A longer list scrolls natively, and scrolling only browses. The band is
 * the chosen row's own highlight.
 */

/** The rows the menu shows: as many `rowPx` rows as fit in `height`, never fewer than `minRows`, never more than its `length`. */
export function menuRows(length: number, height: number, rowPx: number, minRows: number): number {
  return Math.min(length, Math.max(minRows, Math.floor(height / rowPx)));
}

/**
 * The menu's chosen row, the one the band is on: the card on stage (`current`), or Make your own
 * (`own`) when it was chosen (`ownChosen`) or the pattern is hand-made.
 */
export const menuBand = (current: number | null, own: number, ownChosen: boolean): number => (ownChosen || current === null ? own : current);

/**
 * The scrollTop that brings a row (from `top`, `rowPx` tall) into a view `viewPx` tall now at
 * `scrollTop`, the nearest way (scrollIntoView's `block: 'nearest'`): where it is, if the row is
 * whole in view already.
 */
export function nearestTop(top: number, rowPx: number, scrollTop: number, viewPx: number): number {
  if (top < scrollTop) return top;
  if (top + rowPx > scrollTop + viewPx) return top + rowPx - viewPx;
  return scrollTop;
}

/**
 * Whether the web editor (the Pattern and Rhythm tabs under the docked wheel) shows (ruling 2):
 * picking a card hides it and a click on Make your own shows it (never the band passing or resting
 * on it: docs/plans/v6-1-wheel-feel.md, ruling 2); a new pattern that is no card shows it, and a
 * new pattern that is a card (typed into one, or opened from a link) leaves it as it was.
 */
export type EditorEvent = { readonly kind: 'pickCard' } | { readonly kind: 'makeOwn' } | { readonly kind: 'pattern'; readonly card: boolean };

export function editorShows(shown: boolean, event: EditorEvent): boolean {
  if (event.kind === 'pickCard') return false;
  if (event.kind === 'makeOwn') return true;
  return shown || !event.card;
}

/** The sound's master gain: silent while muted, else the volume (ruling 4). */
export const masterGain = (volume: number, muted: boolean): number => (muted ? 0 : volume);

/** Moving the volume slider sets the volume and unmutes. */
export const volumePatch = (volume: number): Pick<AppState, 'volume' | 'muted'> => ({ volume, muted: false });

type Transport = Pick<Player, 'view' | 'playing' | 'play' | 'resume' | 'pause'>;

/** Starts the store's pattern from stopped, or resumes from paused; playing, nothing. */
export function start(player: Transport, state: AppState): void {
  if (player.view().state === 'paused') player.resume();
  else if (!player.playing()) player.play(derived(state).schedule, derived(state).mapping, state.bpm);
}

/** Play/Pause: pauses while playing, else starts. */
export function toggle(player: Transport, state: AppState): void {
  if (player.playing()) player.pause();
  else start(player, state);
}
