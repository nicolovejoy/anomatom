// The presets as the deck reads them (docs/plans/v4-deck.md; once the first screen of
// docs/plans/phone-sheet.md, stream B): which presets in which order, what a preset loads, which
// preset the store holds. Pure: no DOM, no timers. `deck-model.ts` builds on it.
import { textOf } from '../core';
import type { Parts, Schedule } from '../core';
import { type Action } from './actions';
import { derived } from './derived';
import { isPresetParts, PRESETS } from './presets';
import type { CardGroup, Preset } from './presets';
import type { AppState } from './state';

export type { Preset } from './presets';

/** The presets in order: a group per ball count, then passing. Every preset is in exactly one. */
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

/** The preset in `list` whose parts and ratio the state holds: as built first, then as typed (the same vanilla pattern typed matches its preset). */
export function matchPreset(state: Pick<AppState, 'parts' | 'ratio'>, list: readonly Preset[] = PRESETS): Preset | undefined {
  const same = (p: Preset) => p.ratio.a === state.ratio.a && p.ratio.b === state.ratio.b;
  return list.find((p) => same(p) && isPresetParts(p, state.parts)) ?? list.find((p) => same(p) && textsOf(p.parts) === textsOf(state.parts));
}

/** The id of the preset whose parts and ratio the store holds while the player plays, else null. */
export function playingPreset(state: Pick<AppState, 'parts' | 'ratio'>, playing: boolean): string | null {
  if (!playing) return null;
  return matchPreset(state)?.id ?? null;
}

/** The schedule for the store's parts: always one, since the sound is never gated. */
export function scheduleFor(state: AppState): Schedule {
  return derived(state).schedule;
}
