// The first screen (docs/plans/phone-sheet.md, stream B), headless: when it shows, what a card
// loads, which card is playing. Pure: no DOM, no timers. `mount-first-minute.ts` is the elements.
import { partsFromLines, partsFromVanilla, textOf } from '../core';
import type { Parts, Ratio, Schedule } from '../core';
import { applyPreset } from '../sound/mapping';
import { FIRST_MINUTE_PRESETS } from '../tunables';
import { oneInput, type Action } from './actions';
import { derived } from './derived';
import { route } from './route';
import type { AppState } from './state';

export type Preset = (typeof FIRST_MINUTE_PRESETS)[number];

/** First minute shows when the page opens with no state in the hash; About and links skip it. */
export function showsFirstMinute(hash: string): boolean {
  const r = route(hash);
  return r.view === 'play' && r.state === null && (hash === '' || hash === '#');
}

const cards = new WeakMap<Preset, Parts>();

/** A card's parts: its vanilla siteswap at 1:1, one line per hand otherwise. The cards always parse. */
export function presetParts(preset: Preset): Parts {
  const known = cards.get(preset);
  if (known) return known;
  const r = oneInput(preset.ratio) ? partsFromVanilla(preset.patterns[0]) : partsFromLines(preset.patterns, preset.ratio);
  const parts = (r as { parts: Parts }).parts;
  cards.set(preset, parts);
  return parts;
}

/** What tapping a card does: loads its pattern, ratio and mapping preset (design §7). Tempo and the rest stay. */
export function presetPatch(preset: Preset): Action {
  return { type: 'loadPreset', parts: presetParts(preset), ratio: { ...preset.ratio }, mapping: applyPreset(preset.mapping) };
}

/** The pattern a card shows: hand 1's text, or both hands' at other ratios than 1:1. */
export function cardPattern(preset: Preset): string {
  return oneInput(preset.ratio) ? preset.patterns[0] : `${preset.patterns[0]} / ${preset.patterns[1]}`;
}

const sameRatio = (a: Ratio, b: Ratio) => a.a === b.a && a.b === b.b;
const textsOf = (parts: Parts) => parts.map((p) => textOf(p, parts)).join(' / ');

/** The id of the card whose parts (as written) and ratio the store holds while the player plays, else null. */
export function playingPreset(state: Pick<AppState, 'parts' | 'ratio'>, playing: boolean): string | null {
  if (!playing) return null;
  const mine = textsOf(state.parts);
  const found = FIRST_MINUTE_PRESETS.find((p) => sameRatio(p.ratio, state.ratio) && textsOf(presetParts(p)) === mine);
  return found?.id ?? null;
}

/** The schedule for the store's parts: always one, since the sound is never gated. */
export function scheduleFor(state: AppState): Schedule {
  return derived(state).schedule;
}
