import type { HandPattern, Throw } from './types';

/**
 * MATH.md §3. Exchange the landing beats of the throws at sites i and j of one hand. The
 * throw at the earlier site takes the later landing and vice versa; the `x` mark belongs to
 * the landing, so it moves with it. Returns null if a height would go negative.
 */
export function swapSites(pattern: HandPattern, i: number, j: number): HandPattern | null {
  if (i === j) return pattern;
  const [lo, hi] = i < j ? [i, j] : [j, i];
  const a = pattern[lo] as Throw;
  const b = pattern[hi] as Throw;
  const d = hi - lo;
  if (a.height - d < 0) return null;
  const out = [...pattern];
  out[lo] = { height: b.height + d, cross: b.cross };
  out[hi] = { height: a.height - d, cross: a.cross };
  return out;
}
