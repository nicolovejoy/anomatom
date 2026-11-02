// The preset cards as data (docs/plans/v3-classics-controls.md, stream C1): the juggling classics,
// grouped by ball count, and the passing cards. Pure: no DOM, no timers. Reader-facing words
// (names, what to listen for) are in `copy.presets`, keyed by `id`. A card is a pattern only: it
// carries no sound (docs/plans/v5-sound-model.md, ruling 5).
import { partsFromLines, partsFromPassing, partsFromSync, partsFromVanilla } from '../core';
import type { Parts, PartsResult, Ratio } from '../core';

/** The card screen's groups: a card's ball count, the passing cards (two or three jugglers) apart. */
export type CardGroup = '3' | '4' | '5' | 'passing';

export interface Preset {
  readonly id: string;
  /** The group the card sits under: its ball count, or "passing". */
  readonly group: CardGroup;
  /** The line of each hand as written (digits); a vanilla card has the one siteswap. */
  readonly texts: readonly string[];
  readonly parts: Parts;
  readonly ratio: Ratio;
  /** Balls the pattern carries. */
  readonly balls: number;
  /** Cycle in pulses. */
  readonly cycle: number;
}

const must = (r: PartsResult): Parts => {
  if (!r.ok) throw new Error(`preset does not read: ${JSON.stringify(r.error)}`);
  return r.parts;
};

/** A juggling card: a vanilla siteswap at 1:1, one line per hand otherwise. */
function juggling(id: string, texts: readonly string[], ratio: Ratio, balls: number, cycle: number): Preset {
  const parts = ratio.a === ratio.b ? must(partsFromVanilla(texts[0] as string)) : must(partsFromLines(texts, ratio));
  return { id, group: String(balls) as CardGroup, texts, parts, ratio, balls, cycle };
}

/** A sync card (form 5, MATH.md §11): both hands throw together. */
function syncCard(id: string, text: string, balls: number, cycle: number): Preset {
  return { id, group: String(balls) as CardGroup, texts: [text], parts: must(partsFromSync(text)), ratio: R(1, 1), balls, cycle };
}

/** A passing card: two jugglers, each on a drum machine of their own and panned where the stage draws them (`mappingOf`). */
function passingCard(id: string, text: string, balls: number, cycle: number): Preset {
  return { id, group: 'passing', texts: [text], parts: must(partsFromPassing(text)), ratio: { a: 1, b: 1 }, balls, cycle };
}

const R = (a: number, b: number): Ratio => ({ a, b });

/**
 * The cards in screen order, group by group (docs/plans/v3-classics-controls.md, ruling 2): the 18
 * of docs/plans/v5-sound-model.md §4. The nine cut there (423, 55500, (4,4), 534, 645, four-count,
 * five-pass, seven-four-count, seven-pass) still play as typed patterns and short links.
 */
export const PRESETS: readonly Preset[] = [
  juggling('cascade', ['3'], R(1, 1), 3, 2),
  juggling('shower', ['51'], R(1, 1), 3, 2),
  juggling('pause', ['441'], R(1, 1), 3, 6),
  juggling('classic', ['531'], R(1, 1), 3, 6),
  juggling('boston', ['52512'], R(1, 1), 3, 10),
  syncCard('box', '(4,2x)(2x,4)', 3, 4),
  juggling('fountain', ['4'], R(1, 1), 4, 2),
  juggling('half-shower', ['53'], R(1, 1), 4, 2),
  juggling('tower-4', ['7531'], R(1, 1), 4, 4),
  juggling('polyrhythm', ['2 2x 2', '2x 2'], R(3, 2), 4, 6),
  juggling('five-cascade', ['5'], R(1, 1), 5, 2),
  juggling('five-744', ['744'], R(1, 1), 5, 6),
  juggling('ramp', ['97531'], R(1, 1), 5, 10),
  passingCard('passing', '<3p 3|3p 3>', 6, 2),
  passingCard('ultimates', '<3p|3p>', 6, 2),
  passingCard('three-count', '<3p 3 3|3p 3 3>', 6, 6),
  passingCard('seven-fours', '<4p 4p 3 3|3p 3p 4 4>', 7, 4),
  passingCard('rising-passes', '<3p 4p 5p 3 0 3|3p 3 3p 3 3p 3>', 6, 6),
];

const sameStructure = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => sameStructure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** True when `parts` are exactly the preset's parts, field for field. */
export const isPresetParts = (preset: Preset, parts: Parts): boolean => sameStructure(preset.parts, parts);
