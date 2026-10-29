import { FIXES, MAX_PERIOD } from '../tunables';
import { activeHands, cycleLength, isVanilla } from './grid';
import { ballCount, validate } from './validate';
import type { Hand, PatternInput, Throw, ValidationError } from './types';

/** Digits run 0-9 in the notation (parse.ts). */
const DIGITS = 10;

export interface FixLimits {
  readonly count: number;
  readonly budget: number;
}

/** One digit changed in place, at one position of one hand. */
interface Sub {
  readonly to: Throw;
  /** How far the height moves. */
  readonly cost: number;
  /** Tie-break at equal cost: raising before lowering, keeping the `x` before toggling it. */
  readonly order: number;
}

interface Position {
  readonly hand: Hand;
  readonly index: number;
}

/**
 * SPEC §4.2: up to three patterns, each valid, nearest to `input` by edit distance. No swap: a
 * swap keeps the set of landings, so it never repairs a collision (MATH.md §3). None for a valid
 * pattern (`errors` empty).
 *
 * The search, in order, stopping at `count` fixes:
 * 1. One digit substituted: smallest height change first, then the lowest position (hand 1
 *    before hand 2), then raising over lowering, then keeping the `x` over toggling it. At
 *    other ratios than 1:1 a substitution may toggle the `x` (a cross that cannot land is often
 *    fixed by moving it); at 1:1 the `x` means nothing and is left as typed. For a fractional
 *    ball count this order makes the first fix the one-digit change that makes the count whole:
 *    `12` → `22`.
 * 2. One digit deleted, lowest position first (never a hand's last digit).
 * 3. One digit inserted, lowest position first, then lowest digit (never past MAX_PERIOD).
 * 4. Two digits substituted, smallest total height change first, then positions, then as in 1.
 * Insertions and deletions are not combined at distance 2: it keeps the search small.
 *
 * `budget` bounds the work, not the number of candidates: a candidate whose ball count is whole
 * costs its cycle length in pulses (validating it walks every flight of the cycle), and one
 * whose count is fractional costs its digit count (it stops at the count). A candidate that
 * would take the work past `budget` is not validated: the search stops with what it has.
 * Duplicates (an insertion at two places giving one pattern) are offered once.
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
  const found: PatternInput[] = [];
  let work = 0;
  if (errors.length === 0) return { fixes: found, work };
  const vanilla = isVanilla(input.ratio);
  const hands = activeHands(input).map((h) => [...h]);
  const crosses = (t: Throw) => (vanilla ? [t.cross] : [t.cross, !t.cross]);

  const seen = new Set<string>([textOf(hands)]);
  /** Validates one candidate, keeping it if it is new and valid. True when the search is over. */
  const offer = (candidate: Throw[][]): boolean => {
    const next: PatternInput = {
      ratio: input.ratio,
      hands: vanilla ? [candidate[0] as Throw[], ...input.hands.slice(1)] : candidate,
    };
    // A fractional count is never valid: the count is all there is to check, and nothing to remember.
    const whole = Number.isInteger(ballCount(next));
    let text = '';
    if (whole) {
      text = textOf(candidate);
      if (seen.has(text)) return false;
    }
    const cost = whole ? cycleLength(next) : candidate.reduce((n, h) => n + h.length, 0);
    if (work + cost > limits.budget) return true;
    work += cost;
    if (!whole) return false;
    seen.add(text);
    if (validate(next).ok) found.push(next);
    return found.length >= limits.count;
  };
  const edited = (edits: readonly (readonly [Position, Throw])[]) => {
    const out = hands.map((h) => [...h]);
    for (const [p, t] of edits) (out[p.hand] as Throw[])[p.index] = t;
    return out;
  };

  const positions: Position[] = hands.flatMap((h, hand) => h.map((_, index) => ({ hand: hand as Hand, index })));
  const subs: Sub[][] = positions.map(({ hand, index }) => {
    const t = (hands[hand] as Throw[])[index] as Throw;
    const out: Sub[] = [];
    for (let height = 0; height < DIGITS; height++) {
      for (const cross of crosses(t)) {
        if (height === t.height && cross === t.cross) continue;
        const order = (height > t.height ? 0 : 2) + (cross === t.cross ? 0 : 1);
        out.push({ to: { height, cross }, cost: Math.abs(height - t.height), order });
      }
    }
    return out.sort((p, q) => p.cost - q.cost || p.order - q.order);
  });

  // 1. One substitution.
  const ones = positions
    .flatMap((p, i) => (subs[i] as Sub[]).map((s) => ({ p, i, s })))
    .sort((a, b) => a.s.cost - b.s.cost || a.i - b.i || a.s.order - b.s.order);
  for (const { p, s } of ones) if (offer(edited([[p, s.to]]))) return { fixes: found, work };

  // 2. One deletion.
  for (const { hand, index } of positions) {
    const h = hands[hand] as Throw[];
    if (h.length === 1) continue;
    const out = hands.map((x) => [...x]);
    out[hand] = h.filter((_, i) => i !== index);
    if (offer(out)) return { fixes: found, work };
  }

  // 3. One insertion.
  for (let hand = 0; hand < hands.length; hand++) {
    const h = hands[hand] as Throw[];
    if (h.length >= MAX_PERIOD) continue;
    for (let index = 0; index <= h.length; index++) {
      for (let height = 0; height < DIGITS; height++) {
        for (const cross of vanilla ? [false] : [false, true]) {
          const out = hands.map((x) => [...x]);
          out[hand] = [...h.slice(0, index), { height, cross }, ...h.slice(index)];
          if (offer(out)) return { fixes: found, work };
        }
      }
    }
  }

  // 4. Two substitutions, by total cost.
  for (let total = 0; total <= 2 * (DIGITS - 1); total++) {
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        for (const a of subs[i] as Sub[]) {
          if (a.cost > total) break;
          for (const b of subs[j] as Sub[]) {
            if (b.cost > total - a.cost) break;
            if (b.cost < total - a.cost) continue;
            const pi = positions[i] as Position;
            const pj = positions[j] as Position;
            if (offer(edited([[pi, a.to], [pj, b.to]]))) return { fixes: found, work };
          }
        }
      }
    }
  }
  return { fixes: found, work };
}

const textOf = (hands: readonly (readonly Throw[])[]) =>
  hands.map((h) => h.map((t) => `${t.height}${t.cross ? 'x' : ''}`).join(' ')).join(' / ');
