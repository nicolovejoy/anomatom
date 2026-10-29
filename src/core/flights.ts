import { mod } from './math';
import { cycleOf, periodOf, throwsOf } from './parts';
import type { Flight, Part, PartIndex, Parts } from './types';

/** Visit every beat of part `p` in one cycle: its pulse in [0, cycle) and its index in the period. */
export function beatsOf(part: Part, cycle: number, visit: (beat: number, pulse: number, index: number) => void): void {
  const n = periodOf(part);
  const first = mod(part.phase, part.spacing);
  for (let beat = 0; first + beat * part.spacing < cycle; beat++) {
    const pulse = first + beat * part.spacing;
    visit(beat, pulse, mod((pulse - part.phase) / part.spacing, n));
  }
}

/**
 * Every flight of one cycle on the lattice: a manual part's throws as written, a default part's
 * by the default rule (onset i to onset i + k, same part). Beats with height ≤ 0 are not onsets and
 * launch nothing. Launches fall in [0, cycle); sorted by launch, then by part.
 */
export function flightsOf(parts: Parts): Flight[] {
  const cycle = cycleOf(parts);
  const flights: Flight[] = [];
  parts.forEach((part, from: PartIndex) => {
    const throws = throwsOf(part);
    beatsOf(part, cycle, (beat, launch, index) => {
      const t = throws[index] as (typeof throws)[number];
      // A throw launches iff its height is positive, the test onsetsOf uses.
      if (t.height <= 0) return;
      const to = t.to ?? from;
      flights.push({ id: { part: from, index }, from, to, beat, cross: to !== from, launch, land: launch + t.height });
    });
  });
  return flights.sort((p, q) => p.launch - q.launch || p.from - q.from);
}
