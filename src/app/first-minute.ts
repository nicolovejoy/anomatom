// The first screen (docs/plans/phone-sheet.md, stream B), headless: when it shows, what a card
// loads, which card is playing. Pure: no DOM, no timers. `mount-first-minute.ts` is the elements.
import { buildSchedule } from '../core/legacy';
import type { Ratio, Schedule } from '../core/legacy';
import { FIRST_MINUTE_PRESETS } from '../tunables';
import { analyse } from './knobs-model';
import { route } from './route';
import type { AppState } from './state';

export type Preset = (typeof FIRST_MINUTE_PRESETS)[number];

/** First minute shows when the page opens with no state in the hash; About and links skip it. */
export function showsFirstMinute(hash: string): boolean {
  const r = route(hash);
  return r.view === 'play' && r.state === null && (hash === '' || hash === '#');
}

/** What tapping a card puts in the store: its pattern and ratio. Tempo, sound and the rest stay. */
export function presetPatch(preset: Preset): Pick<AppState, 'patterns' | 'ratio'> {
  return { patterns: [preset.patterns[0], preset.patterns[1]], ratio: { ...preset.ratio } };
}

/** The pattern a card shows: hand 1's text, or both hands' at other ratios than 1:1. */
export function cardPattern(preset: Preset): string {
  return preset.ratio.a === preset.ratio.b ? preset.patterns[0] : `${preset.patterns[0]} / ${preset.patterns[1]}`;
}

const sameRatio = (a: Ratio, b: Ratio) => a.a === b.a && a.b === b.b;

/**
 * The id of the card whose pattern and ratio the store holds while the player plays, else null.
 * Hand 2's text counts only at other ratios than 1:1.
 */
export function playingPreset(state: Pick<AppState, 'patterns' | 'ratio'>, playing: boolean): string | null {
  if (!playing) return null;
  const vanilla = state.ratio.a === state.ratio.b;
  const found = FIRST_MINUTE_PRESETS.find(
    (p) =>
      sameRatio(p.ratio, state.ratio) &&
      p.patterns[0] === state.patterns[0] &&
      (vanilla || p.patterns[1] === state.patterns[1]),
  );
  return found?.id ?? null;
}

/** The schedule for the store's pattern, or null when it is not valid. */
export function scheduleFor(state: Pick<AppState, 'patterns' | 'ratio'>): Schedule | null {
  const analysis = analyse(state.patterns, state.ratio);
  return analysis.balls !== null && analysis.input ? buildSchedule(analysis.input) : null;
}
