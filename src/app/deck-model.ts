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
import { kitRows } from './sound-panel-model';
import type { AppState } from './state';

/** Every preset in `cardGroups()` order: what ‹ › and the wheel walk. Read afresh, so new presets join. */
export function deckPresets(): readonly Preset[] {
  return cardGroups().flatMap((g) => g.presets);
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
  return p.group === 'passing' ? copy.deck.jugglers(kitRows(p.parts.length)) : copy.summaryBalls(p.balls);
}

export interface DeckLabel {
  /** The notation, in mono. */
  readonly pattern: string;
  /** The preset's name, or "Your pattern". */
  readonly name: string;
  /** "3 balls", "2 jugglers", or "can't juggle" for a hand-made pattern that isn't juggleable. */
  readonly meta: string;
  readonly valid: boolean;
  /** At least SHEET.longSummaryChars long: drawn smaller on a phone. */
  readonly long: boolean;
}

/** What the transport bar shows for a state. */
export function deckLabel(state: AppState, list: readonly Preset[] = deckPresets()): DeckLabel {
  const i = presetIndex(state, list);
  if (i !== null) {
    const p = list[i] as Preset;
    const pattern = cardPattern(p);
    return { pattern, name: copy.presets[p.id]?.name ?? '', meta: presetMeta(p), valid: true, long: pattern.length >= SHEET.longSummaryChars };
  }
  const s = summary(analyse(state), SHEET.longSummaryChars);
  return { pattern: s.text, name: copy.deck.yourOwn, meta: s.meta, valid: s.valid, long: s.long };
}

/** The tag at the right of a wheel row: 3, 4, 5 or PASS. */
export const groupTag = (group: CardGroup): string => copy.deck.groupTags[group];

/** The wheel row in the band at `scrollTop`, rows `rowPx` tall, `length` rows. */
export function wheelIndexAt(scrollTop: number, rowPx: number, length: number): number {
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
 * down, a wheel's height (`page` rows) for PageUp and PageDown, the ends for Home and End.
 */
export function rowAfterKey(key: string, row: number, length: number, page: number): number {
  const to = key === 'Home' ? 0 : key === 'End' ? length - 1 : row + ({ ArrowUp: -1, ArrowDown: 1, PageUp: -page, PageDown: page }[key] ?? 0);
  return Math.min(length - 1, Math.max(0, to));
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
}

/**
 * Where the open phone wheel sits so the juggler stays in view (ruling B, 2026-10-31): along the
 * stage's bottom when at least `minFigure` of height stays above it for the figure; else in
 * `column` (a phone on its side: the free part of the right-hand column under the transport bar)
 * when the wheel fits there; else down the stage's right side, at most `sideMax` and at most half
 * the stage wide, centred on the stage's height (or at its top when the stage is shorter).
 */
export function wheelPlace(stage: Box, wheelHeight: number, minFigure: number, sideMax: number, column: Box | null = null): WheelPlace {
  if (stage.height - wheelHeight >= minFigure) {
    return { left: stage.left, top: stage.top + stage.height - wheelHeight, width: stage.width, height: wheelHeight, padBottom: wheelHeight, padRight: 0 };
  }
  if (column && column.height >= wheelHeight) {
    return { left: column.left, top: column.top, width: column.width, height: wheelHeight, padBottom: 0, padRight: 0 };
  }
  const width = Math.min(sideMax, Math.round(stage.width / 2));
  return { left: stage.left + stage.width - width, top: stage.top + Math.max(0, (stage.height - wheelHeight) / 2), width, height: wheelHeight, padBottom: 0, padRight: width };
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

/** The sound's master gain: silent while muted, else the volume (ruling 4). */
export const masterGain = (volume: number, muted: boolean): number => (muted ? 0 : volume);

/** Moving the volume slider sets the volume and unmutes. */
export const volumePatch = (volume: number): Pick<AppState, 'volume' | 'muted'> => ({ volume, muted: false });

type Transport = Pick<Player, 'view' | 'playing' | 'play' | 'resume' | 'pause'>;

/** Starts the store's pattern from stopped, or resumes from paused; playing, nothing. */
export function start(player: Transport, state: AppState): void {
  if (player.view().state === 'paused') player.resume();
  else if (!player.playing()) player.play(derived(state).schedule, state.mapping, state.bpm);
}

/** Play/Pause: pauses while playing, else starts. */
export function toggle(player: Transport, state: AppState): void {
  if (player.playing()) player.pause();
  else start(player, state);
}
