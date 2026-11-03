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
 * Where a step lands: one place on, wrapping at both ends. From no preset (a hand-made pattern),
 * › goes to the first and ‹ to the last (ruling 2).
 */
export function stepIndex(current: number | null, delta: -1 | 1, length: number): number {
  if (current === null) return delta > 0 ? 0 : length - 1;
  return (((current + delta) % length) + length) % length;
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
 * The wheel loops (ruling 1 of docs/plans/v4-1-polish.md): it turns forever both ways, so above
 * Cascade come Make your own and the last passing patterns. Its rows are the presets then Make
 * your own, `length` in all; each sits at a place in the scroll list (its CSS `order`). The list
 * keeps the row in the band at the middle place, `centrePlace`, by turning which row sits at place
 * 0 (the `offset`) whenever the wheel rests, so there are always rows above and below the band
 * and never a blank one. Assumes `length` is more than the rows shown.
 */

/** The middle place of `length`: the band's row sits there whenever the wheel rests. */
export const centrePlace = (length: number): number => Math.floor(length / 2);

/** `n` mod `length`, never negative. */
const wrap = (n: number, length: number): number => ((n % length) + length) % length;

/** The offset (the row at place 0) that puts `row` at the middle place. */
export const offsetFor = (row: number, length: number): number => wrap(row - centrePlace(length), length);

/** The place `row` takes under `offset`: its CSS order. */
export const placeOf = (row: number, offset: number, length: number): number => wrap(row - offset, length);

/** The scrollTop that brings place `place` into the band, rows `rowPx` tall, `half` rows above the band. */
export const scrollForPlace = (place: number, rowPx: number, half: number): number => (place - half) * rowPx;

/** The row in the band at `scrollTop`: the place `half` rows below the top of the view, clamped to the list, through `offset`. */
export function wheelRowAt(scrollTop: number, rowPx: number, half: number, offset: number, length: number): number {
  const place = Math.min(length - 1, Math.max(0, Math.round(scrollTop / rowPx) + half));
  return wrap(place + offset, length);
}

/**
 * Whether the band, at `scrollTop`, is within `margin` rows of either end of the list: then the
 * list turns at once, mid-spin, so a long turn never meets an end (and never stops there to pick).
 */
export function nearEnd(scrollTop: number, rowPx: number, half: number, length: number, margin: number): boolean {
  const place = Math.round(scrollTop / rowPx) + half;
  return place <= half + margin - 1 || place >= length - margin - half;
}

/** The shortest way round the wheel from row `from` to row `to`: a signed number of rows. */
export function loopDelta(from: number, to: number, length: number): number {
  const d = wrap(to - from, length);
  return d > length / 2 ? d - length : d;
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
 * down, a wheel's height (`page` rows) for PageUp and PageDown, round the loop; the first row
 * (Cascade) for Home and the last (Make your own) for End.
 */
export function rowAfterKey(key: string, row: number, length: number, page: number): number {
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return wrap(row + ({ ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page }[key] ?? 0), length);
}

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface WheelPlace extends Box {
  /** What the stage keeps clear for the wheel: below the figure, or to its right. */
  readonly padBottom: number;
  readonly padRight: number;
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
 * docs/plans/v4-1-polish.md). Else along the stage's bottom when at least `minFigure` of height
 * stays above it for the figure (a phone); else down the stage's right side, at most `sideMax`
 * and at most half the stage wide, centred on the stage's height (or at its top when shorter).
 * `head` px above the rows (the filter chips, v6 ruling 4) count in the place: its top is theirs.
 */
export function wheelPlace(stage: Box, rowPx: number, rows: number, minFigure: number, sideMax: number, column: Box | null = null, head = 0): WheelPlace {
  const fit = column ? rowsThatFit(column.height - head, rowPx, rows) : 0;
  if (column && fit > 0) {
    return { left: column.left, top: column.top, width: column.width, height: fit * rowPx + head, padBottom: 0, padRight: 0, rows: fit };
  }
  const wheelHeight = rowPx * rows + head;
  if (stage.height - wheelHeight >= minFigure) {
    return { left: stage.left, top: stage.top + stage.height - wheelHeight, width: stage.width, height: wheelHeight, padBottom: wheelHeight, padRight: 0, rows };
  }
  const width = Math.min(sideMax, Math.round(stage.width / 2));
  return { left: stage.left + stage.width - width, top: stage.top + Math.max(0, (stage.height - wheelHeight) / 2), width, height: wheelHeight, padBottom: 0, padRight: width, rows };
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
  return { left: 0, top, width: view.width, height, padBottom: Math.max(0, stage.top + stage.height - top), padRight: 0, rows };
}

/**
 * The upright phone wheel's phase (ruling 9): at `rest` the controls show and an open wheel sits
 * in its stage place; a reader's turn makes it `spinning` and it takes the sheet; when it stops
 * it is `settling` (still on the sheet, the picked row in the band) until the return delay
 * passes, then `rest` and the wheel closes. A turn during the settling spins it again.
 */
export type WheelPhase = 'rest' | 'spinning' | 'settling';
export type WheelEvent = 'turn' | 'stop' | 'return' | 'close';

export function nextPhase(phase: WheelPhase, event: WheelEvent): WheelPhase {
  switch (event) {
    case 'turn':
      return 'spinning';
    case 'stop':
      return phase === 'spinning' ? 'settling' : phase;
    case 'return':
      return phase === 'settling' ? 'rest' : phase;
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
 * The web wheel (docs/plans/v6-wheel-filters-three.md, rulings 1 to 3). Docked in the right-hand
 * column its rows are taller and it shows as many as the column holds while the editor is hidden.
 */

/** The most rows, odd, whose `rowPx` rows fit in `height`; never fewer than `minRows` (odd). */
export function dockedRows(height: number, rowPx: number, minRows: number): number {
  const fit = Math.floor(height / rowPx);
  return Math.max(minRows, fit % 2 === 0 ? fit - 1 : fit);
}

/**
 * How many copies of the wheel's `length` rows the list holds so it can show `shown` rows and still
 * turn: the band's row rests at the middle place, and a turn of a row either way must not come
 * within `margin` rows of an end (nearEnd), so the list is at least `shown + 2 * margin + 2` places
 * long. One copy (the deck as it is) wherever that fits; more where a tall column shows more rows
 * than there are patterns, or a short (filtered) deck has few. A card then shows more than once.
 */
export function wheelCopies(length: number, shown: number, margin: number): number {
  return Math.max(1, Math.ceil((shown + 2 * margin + 2) / length));
}

/** The wheel row (a pattern, or Make your own) that list item `slot` holds, `length` rows a copy. */
export const rowOfSlot = (slot: number, length: number): number => slot % length;

/**
 * Of the `copies` items holding `row`, the one nearest the band under `offset` (a ring of
 * `length * copies` places): the one to focus and to bring into the band. A tie goes to the later.
 */
export function slotNear(row: number, offset: number, length: number, copies: number): number {
  const slots = length * copies;
  const centre = centrePlace(slots);
  let best = row;
  for (let c = 1; c < copies; c++) {
    const slot = row + c * length;
    const d = Math.abs(placeOf(slot, offset, slots) - centre);
    const bestD = Math.abs(placeOf(best, offset, slots) - centre);
    if (d < bestD || (d === bestD && placeOf(slot, offset, slots) > placeOf(best, offset, slots))) best = slot;
  }
  return best;
}

/** A wheel event's vertical delta in px: lines and pages (Firefox, some mice) converted. */
export function wheelDeltaPx(deltaY: number, deltaMode: number, linePx: number, pagePx: number): number {
  return deltaMode === 1 ? deltaY * linePx : deltaMode === 2 ? deltaY * pagePx : deltaY;
}

/*
 * The docked wheel's feel (docs/plans/v6-1-wheel-feel.md, ruling 1): scaled native scroll. A
 * trackpad's small deltas move the list continuously at `scale` of their size, momentum and all; a
 * mouse notch (a delta of `notchPx` or more, or any delta counted in lines or pages, which only a
 * mouse sends) adds one row to an eased glide's target instead of jumping. When the input stops the
 * list glides onto the nearest row. Positions are scrollTops, in px; times are ms.
 */

/** One wheel event on the docked wheel: a notch one row up or down, or a drag of `px`; null for none. */
export type WheelInput = { readonly kind: 'notch'; readonly dir: -1 | 1 } | { readonly kind: 'drag'; readonly px: number };

export function wheelInput(deltaPx: number, deltaMode: number, notchPx: number, scale: number): WheelInput | null {
  if (deltaPx === 0) return null;
  if (deltaMode !== 0 || Math.abs(deltaPx) >= notchPx) return { kind: 'notch', dir: deltaPx > 0 ? 1 : -1 };
  return { kind: 'drag', px: deltaPx * scale };
}

/** An eased move of the list from `from` to `to`, starting at `start` and lasting `ms`. */
export interface Glide {
  readonly from: number;
  readonly to: number;
  readonly start: number;
  readonly ms: number;
}

/** Ease-out cubic over 0 to 1 (clamped): fast at first, gentle onto the row. */
export const easeOut = (x: number): number => 1 - (1 - Math.min(1, Math.max(0, x))) ** 3;

/** Where a glide has the list at `now`. */
export const glideAt = (g: Glide, now: number): number => (g.ms <= 0 ? g.to : g.from + (g.to - g.from) * easeOut((now - g.start) / g.ms));

/** Whether a glide has arrived by `now`. */
export const glideDone = (g: Glide, now: number): boolean => now - g.start >= g.ms;

/** The scrollTop of the row nearest `top`: rows rest at whole multiples of `rowPx` (scrollForPlace). */
export const restTop = (top: number, rowPx: number): number => Math.round(top / rowPx) * rowPx;

/**
 * A notch at `now`, the list at `top`: a glide from there to one row past the target of the glide
 * still under way (so notches in quick succession add up), or past the row nearest `top`.
 */
export function notchGlide(glide: Glide | null, top: number, dir: -1 | 1, rowPx: number, now: number, ms: number): Glide {
  const base = glide !== null && !glideDone(glide, now) ? glide.to : restTop(top, rowPx);
  return { from: top, to: base + dir * rowPx, start: now, ms };
}

/** A glide moved by `px` at both ends: the list turned under it (recentre), or a drag came during it. */
export const shiftGlide = (g: Glide, px: number): Glide => ({ ...g, from: g.from + px, to: g.to + px });

/**
 * A burst of wheel events on the docked wheel: how many came, each within `gapMs` of the one
 * before, and how far their drags (scaled) moved the list in all. A mouse notch counts as an event
 * and moves nothing here (its glide is aligned already).
 */
export interface Burst {
  readonly events: number;
  readonly px: number;
  readonly last: number | null;
}

export const BURST_AT_REST: Burst = { events: 0, px: 0, last: null };

/** One more event at `now` that moved the list `px`: the same burst, or a new one after a gap of more than `gapMs`. */
export function burstAdd(b: Burst, px: number, now: number, gapMs: number): Burst {
  const fresh = b.last === null || now - b.last > gapMs;
  return { events: (fresh ? 0 : b.events) + 1, px: (fresh ? 0 : b.px) + px, last: now };
}

/**
 * Where the settle takes the list from `top` at `now` after `burst` (fix round 1 of PR 96): to the
 * nearest row, except that a burst of at most two events that moved it some way, but less than half
 * a row, goes one row on in its direction. That is a plain mouse's slow notch on a Mac: Chromium
 * sends it as a few px (an accelerated tick, about 4), which rounding would take straight back. A
 * burst whose last event is more than `maxAgeMs` old is stale (a key or a pick came since) and
 * counts for nothing.
 */
export function settleTarget(top: number, rowPx: number, burst: Burst, now: number, maxAgeMs: number): number {
  const fresh = burst.last !== null && now - burst.last <= maxAgeMs;
  if (fresh && burst.events <= 2 && burst.px !== 0 && Math.abs(burst.px) < rowPx / 2) {
    return restTop(top - burst.px, rowPx) + Math.sign(burst.px) * rowPx;
  }
  return restTop(top, rowPx);
}

/** The settle (ruling 1): a glide from `top` onto the row at `to`, or null when the list is there already. */
export function settleGlide(top: number, to: number, now: number, ms: number): Glide | null {
  return Math.abs(top - to) < 0.5 ? null : { from: top, to, start: now, ms };
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
