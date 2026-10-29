/**
 * MATH.md §3. Exchange the landing beats of the throws at sites i and j of one sequence. The
 * throw at the earlier site takes the later landing and vice versa; everything but the height
 * (the `x` mark, the destination part) belongs to the landing, so it moves with it. `step` is the
 * height of one site's distance: 1 for digits, the part's spacing for heights in pulses. Returns
 * null if a height would go negative or a site is out of range.
 */
export function swapSites<T extends { readonly height: number }>(
  pattern: readonly T[],
  i: number,
  j: number,
  step = 1,
): readonly T[] | null {
  if (i === j) return pattern;
  const [lo, hi] = i < j ? [i, j] : [j, i];
  const a = pattern[lo];
  const b = pattern[hi];
  if (a === undefined || b === undefined) return null;
  const d = (hi - lo) * step;
  if (a.height - d < 0) return null;
  const out = [...pattern];
  out[lo] = { ...b, height: b.height + d };
  out[hi] = { ...a, height: a.height - d };
  return out;
}
