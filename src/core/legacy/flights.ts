import { beatsOf } from '../flights';
import { cycleOf, throwsOf, vanillaIndex } from '../parts';
import { partsOfInput } from './convert';
import { isVanilla } from './grid';
import type { Flight, Hand, PatternInput } from './types';

/**
 * Every throw of one cycle, placed on the pulse grid, in the two-hand shape: the part model's
 * flights (src/core/flights.ts), plus each `0` as a zero-length flight landing on its own beat,
 * which keeps the landing set a permutation of the beat set (MATH.md §2). At 1:1 a throw's id is
 * its position in the one siteswap, and its beat is the shared beat (the pulse).
 */
export function flightsOf(input: PatternInput): Flight[] {
  const parts = partsOfInput(input);
  const cycle = cycleOf(parts);
  const vanilla = isVanilla(input.ratio);
  const length = input.hands[0]?.length ?? 0;
  const flights: Flight[] = [];
  parts.forEach((part, p) => {
    const from = p as Hand;
    const throws = throwsOf(part);
    beatsOf(part, cycle, (beat, launch, index) => {
      const t = throws[index] as (typeof throws)[number];
      const to = (t.to ?? from) as Hand;
      flights.push({
        id: vanilla ? { hand: 0, index: vanillaIndex(p, index, length) } : { hand: from, index },
        from,
        to,
        beat: vanilla ? launch : beat,
        height: t.height / part.unit,
        cross: to !== from,
        launch,
        land: launch + t.height,
      });
    });
  });
  return flights.sort((p, q) => p.launch - q.launch || p.from - q.from);
}
