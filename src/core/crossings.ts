import type { Flight } from './types';

/**
 * MATH.md §5. Count the pairs of arcs in the ladder that cross: arcs (s1, e1) and (s2, e2)
 * cross iff s1 < s2 < e1 < e2. Each arc of one cycle is compared against the arcs of this
 * cycle and of as many following cycles as it spans. Zero-length flights are not arcs.
 */
export function countCrossings(flights: readonly Flight[], cycle: number): number {
  const arcs = flights.filter((f) => f.height > 0);
  let count = 0;
  for (const f of arcs) {
    for (const g of arcs) {
      for (let shift = 0; shift < f.land; shift += cycle) {
        const s2 = g.launch + shift;
        const e2 = g.land + shift;
        if (f.launch < s2 && s2 < f.land && f.land < e2) count++;
      }
    }
  }
  return count;
}
