import { linesParts, ratioSpacings, vanillaPair } from '../parts';
import type { Parts } from '../types';
import { activeHands, isVanilla } from './grid';
import type { PatternInput } from './types';

/**
 * The two-hand input as parts: at 1:1 the one vanilla siteswap as a vanilla pair (an `x` there
 * means nothing, as before), otherwise one manual part per hand on the ratio's spacings.
 */
export function partsOfInput(input: PatternInput): Parts {
  if (isVanilla(input.ratio)) return vanillaPair((input.hands[0] ?? []).map((t) => t.height));
  return linesParts(
    activeHands(input).map((hand, h) => hand.map((t) => ({ height: t.height, to: t.cross ? 1 - h : null }))),
    ratioSpacings(input.ratio),
  );
}
