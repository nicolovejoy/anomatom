import { FIXES } from '../../tunables';
import { searchFixes as searchParts } from '../fixes';
import type { FixLimits } from '../fixes';
import { partsOfInput } from './convert';
import { isVanilla } from './grid';
import type { PatternInput, Throw, ValidationError } from './types';

export type { FixLimits };

/**
 * The part model's fix search (src/core/fixes.ts) on the two-hand input: both hands are one
 * group, as before. None for a valid pattern (`errors` empty). At 1:1 the second box is passed
 * through untouched.
 */
export function fixesFor(
  input: PatternInput,
  errors: readonly ValidationError[],
  limits: FixLimits = FIXES,
): PatternInput[] {
  return searchFixes(input, errors, limits).fixes;
}

/** `fixesFor`, with the work it spent (never more than `limits.budget`). */
export function searchFixes(
  input: PatternInput,
  errors: readonly ValidationError[],
  limits: FixLimits = FIXES,
): { fixes: PatternInput[]; work: number } {
  if (errors.length === 0) return { fixes: [], work: 0 };
  const { digits, work } = searchParts(partsOfInput(input), [0, 1], limits);
  const vanilla = isVanilla(input.ratio);
  const fixes = digits.map((seqs): PatternInput => {
    const hands = seqs.map((s) => s.map((d): Throw => ({ height: d.digit, cross: d.to !== null })));
    return { ratio: input.ratio, hands: vanilla ? [hands[0] as Throw[], ...input.hands.slice(1)] : hands };
  });
  return { fixes, work };
}
