// The preset cards as data (docs/plans/v3-classics-controls.md, stream C1): the juggling classics,
// grouped by ball count, and the passing cards. Pure: no DOM, no timers. Reader-facing words
// (names, what to listen for) are in `copy.presets`, keyed by `id`.
import { partsFromLines, partsFromPassing, partsFromSync, partsFromVanilla } from '../core';
import type { Parts, PartsResult, Ratio } from '../core';
import { applyPreset, withPartCount } from '../sound/mapping';
import type { Mapping } from '../sound/mapping';
import { PASSING_CARD } from '../tunables';

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
  readonly mapping: Mapping;
  /** Balls the pattern carries. */
  readonly balls: number;
  /** Cycle in pulses. */
  readonly cycle: number;
}

const must = (r: PartsResult): Parts => {
  if (!r.ok) throw new Error(`preset does not read: ${JSON.stringify(r.error)}`);
  return r.parts;
};

const HEIGHT_DRUM = applyPreset('height-drum');

/** A juggling card: a vanilla siteswap at 1:1, one line per hand otherwise. Plays height to drum (design §7). */
function juggling(id: string, texts: readonly string[], ratio: Ratio, balls: number, cycle: number): Preset {
  const parts = ratio.a === ratio.b ? must(partsFromVanilla(texts[0] as string)) : must(partsFromLines(texts, ratio));
  return { id, group: String(balls) as CardGroup, texts, parts, ratio, mapping: HEIGHT_DRUM, balls, cycle };
}

/** A sync card (form 5, MATH.md §11): both hands throw together, height to drum. */
function syncCard(id: string, text: string, balls: number, cycle: number): Preset {
  return { id, group: String(balls) as CardGroup, texts: [text], parts: must(partsFromSync(text)), ratio: R(1, 1), mapping: HEIGHT_DRUM, balls, cycle };
}

/** A passing card: height to drum on one voice per hand, a kit and a pan of their own for each juggler (ruling 5). */
function passingCard(id: string, text: string, balls: number, cycle: number): Preset {
  const parts = must(partsFromPassing(text));
  const grown = withPartCount(HEIGHT_DRUM, parts.length);
  const mapping: Mapping = { ...grown, parts: grown.parts.map((v, i) => ({ ...v, ...(PASSING_CARD.voices[i] as (typeof PASSING_CARD.voices)[number]) })) };
  return { id, group: 'passing', texts: [text], parts, ratio: { a: 1, b: 1 }, mapping, balls, cycle };
}

const R = (a: number, b: number): Ratio => ({ a, b });

/** The cards in screen order, group by group (docs/plans/v3-classics-controls.md, ruling 2). */
export const PRESETS: readonly Preset[] = [
  juggling('cascade', ['3'], R(1, 1), 3, 2),
  juggling('shower', ['51'], R(1, 1), 3, 2),
  juggling('pause', ['441'], R(1, 1), 3, 6),
  juggling('classic', ['531'], R(1, 1), 3, 6),
  juggling('two-in-ones', ['423'], R(1, 1), 3, 6),
  juggling('boston', ['52512'], R(1, 1), 3, 10),
  juggling('flash', ['55500'], R(1, 1), 3, 10),
  syncCard('box', '(4,2x)(2x,4)', 3, 4),
  juggling('fountain', ['4'], R(1, 1), 4, 2),
  juggling('half-shower', ['53'], R(1, 1), 4, 2),
  juggling('high-low-fountain', ['534'], R(1, 1), 4, 6),
  juggling('tower-4', ['7531'], R(1, 1), 4, 4),
  juggling('polyrhythm', ['2 2x 2', '2x 2'], R(3, 2), 4, 6),
  syncCard('sync-fountain', '(4,4)', 4, 2),
  juggling('five-cascade', ['5'], R(1, 1), 5, 2),
  juggling('five-744', ['744'], R(1, 1), 5, 6),
  juggling('five-645', ['645'], R(1, 1), 5, 6),
  juggling('ramp', ['97531'], R(1, 1), 5, 10),
  passingCard('passing', '<3p 3|3p 3>', 6, 2),
  passingCard('ultimates', '<3p|3p>', 6, 2),
  passingCard('three-count', '<3p 3 3|3p 3 3>', 6, 6),
  passingCard('four-count', '<3p 3 3 3|3p 3 3 3>', 6, 4),
  // D3 (docs/plans/v4-deck.md, ruling 8): notation as printed in docs/BIBLIOGRAPHY.md entries 24 and 25.
  passingCard('pass-pass-self', '<3p 3p 3|3p 3p 3>', 6, 6),
  passingCard('book-ends', '<3p 3 3p 3 3p|3p 3 3p 3 3p>', 6, 10),
  passingCard('five-pass', '<5p 3 1|3 3 3p>', 6, 6),
  passingCard('seven-four-count', '<3p 3 4 4|4 4 3p 3>', 7, 4),
  passingCard('seven-fours', '<4p 4p 3 3|3p 3p 4 4>', 7, 4),
];

const sameStructure = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => sameStructure((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
};

/** True when `parts` are exactly the preset's parts, field for field. */
export const isPresetParts = (preset: Preset, parts: Parts): boolean => sameStructure(preset.parts, parts);
