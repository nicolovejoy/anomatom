// The first screen (docs/plans/phone-sheet.md, stream B; v3 stream C1), headless: when it shows, which cards, what a card loads, which card is
// playing. Pure: no DOM, no timers. `mount-first-minute.ts` is the elements.
import { textOf } from '../core';
import type { Parts, Schedule } from '../core';
import { type Action } from './actions';
import { derived } from './derived';
import { isPresetParts, PRESETS } from './presets';
import type { CardGroup, Preset } from './presets';
import { route } from './route';
import type { AppState, SheetTab } from './state';

export type { Preset } from './presets';

/** First minute shows when the page opens with no state in the hash; About and links skip it. */
export function showsFirstMinute(hash: string): boolean {
  const r = route(hash);
  return r.view === 'play' && r.state === null && (hash === '' || hash === '#');
}

/** The card screen in order: a group per ball count, then passing. Every card is in exactly one. */
export function cardGroups(): readonly { id: CardGroup; presets: readonly Preset[] }[] {
  return (['3', '4', '5', 'passing'] as const).map((id) => ({ id, presets: PRESETS.filter((p) => p.group === id) }));
}

/** What tapping a card does: loads its parts, ratio and mapping; the reader's tempo stays (design §7). */
export function presetPatch(preset: Preset): Action {
  return { type: 'loadPreset', parts: preset.parts, ratio: { ...preset.ratio }, mapping: preset.mapping };
}

/** The pattern a juggling card shows: hand 1's text, or both hands' at other ratios than 1:1. */
export function cardPattern(preset: Preset): string {
  return preset.ratio.a === preset.ratio.b ? (preset.texts[0] as string) : preset.texts.join(' / ');
}

const textsOf = (parts: Parts) => parts.map((p) => textOf(p, parts)).join(' / ');

/** The id of the card whose parts and ratio the store holds while the player plays, else null. */
export function playingPreset(state: Pick<AppState, 'parts' | 'ratio'>, playing: boolean): string | null {
  if (!playing) return null;
  const same = (p: Preset) => p.ratio.a === state.ratio.a && p.ratio.b === state.ratio.b;
  // The parts as built first, then as typed: the same vanilla pattern typed matches its card.
  const found = PRESETS.find((p) => same(p) && isPresetParts(p, state.parts)) ?? PRESETS.find((p) => same(p) && textsOf(p.parts) === textsOf(state.parts));
  return found?.id ?? null;
}

/** The patch that shows (true) or hides (false) the card screen. Showing closes the sheet; hiding opens it on `tab`. */
export function cardsPatch(show: boolean, tab: SheetTab = 'pattern'): Partial<AppState> {
  return show ? { cards: true, sheetTab: null } : { cards: false, sheetTab: tab };
}

/** The schedule for the store's parts: always one, since the sound is never gated. */
export function scheduleFor(state: AppState): Schedule {
  return derived(state).schedule;
}
