// The first screen (docs/plans/phone-sheet.md, stream B; presets from the sourcebook, model
// waves stream F), headless: when it shows, which cards, what a card loads, which card is
// playing. Pure: no DOM, no timers. `mount-first-minute.ts` is the elements.
import { textOf } from '../core';
import type { Parts, Schedule } from '../core';
import { type Action } from './actions';
import { derived } from './derived';
import { hitGrid, isPresetParts, PRESETS } from './presets';
import type { Preset } from './presets';
import { route } from './route';
import type { AppState } from './state';

export type { Preset } from './presets';

/** First minute shows when the page opens with no state in the hash; About and links skip it. */
export function showsFirstMinute(hash: string): boolean {
  const r = route(hash);
  return r.view === 'play' && r.state === null && (hash === '' || hash === '#');
}

/** The cards on show: the default set, or every card once "more" is open. */
export function cardsShown(expanded: boolean): readonly Preset[] {
  return expanded ? PRESETS : PRESETS.filter((p) => p.first);
}

/** How many cards "more" reveals. */
export const moreCount = (): number => PRESETS.length - cardsShown(false).length;

/** What tapping a card does: loads its parts, ratio, tempo and mapping (design §7). */
export function presetPatch(preset: Preset): Action {
  return { type: 'loadPreset', parts: preset.parts, ratio: { ...preset.ratio }, bpm: preset.bpm, mapping: preset.mapping };
}

/** The pattern a juggling card shows: hand 1's text, or both hands' at other ratios than 1:1. */
export function cardPattern(preset: Preset): string {
  return preset.ratio.a === preset.ratio.b ? (preset.texts[0] as string) : preset.texts.join(' / ');
}

/** The lines a card draws: a juggling card's pattern text, a sourcebook card's hit grid per hand. */
export function cardLines(preset: Preset): string[] {
  return preset.kind === 'juggling' ? [cardPattern(preset)] : preset.parts.map(hitGrid);
}

const textsOf = (parts: Parts) => parts.map((p) => textOf(p, parts)).join(' / ');

/** The id of the card whose parts and ratio the store holds while the player plays, else null. */
export function playingPreset(state: Pick<AppState, 'parts' | 'ratio'>, playing: boolean): string | null {
  if (!playing) return null;
  const same = (p: Preset) => p.ratio.a === state.ratio.a && p.ratio.b === state.ratio.b;
  // The parts as built first, then as typed: the same vanilla pattern typed matches its card.
  const found =
    PRESETS.find((p) => same(p) && isPresetParts(p, state.parts)) ??
    PRESETS.find((p) => same(p) && p.kind === 'juggling' && textsOf(p.parts) === textsOf(state.parts));
  return found?.id ?? null;
}

/** The schedule for the store's parts: always one, since the sound is never gated. */
export function scheduleFor(state: AppState): Schedule {
  return derived(state).schedule;
}
