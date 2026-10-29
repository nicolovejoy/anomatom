import { gcd, lcm, mod } from './math';
import type { Grid, HandPattern, PatternInput, Ratio } from './types';

export function reduceRatio(ratio: Ratio): Ratio {
  const g = gcd(ratio.a, ratio.b);
  return { a: ratio.a / g, b: ratio.b / g };
}

export function isVanilla(ratio: Ratio): boolean {
  return ratio.a === ratio.b;
}

/**
 * Hand 1 beats every b pulses, hand 2 every a pulses (reduced), so hand 1 makes a beats while
 * hand 2 makes b. At 1:1 the input is vanilla siteswap: a shared beat on which the hands
 * alternate, modelled as both hands on 2-pulse beats with hand 2 one pulse behind.
 */
export function makeGrids(ratio: Ratio): [Grid, Grid] {
  const r = reduceRatio(ratio);
  if (isVanilla(r)) {
    return [
      { pulsesPerBeat: 2, offset: 0 },
      { pulsesPerBeat: 2, offset: 1 },
    ];
  }
  return [
    { pulsesPerBeat: r.b, offset: 0 },
    { pulsesPerBeat: r.a, offset: 0 },
  ];
}

/** The sequences in play: one vanilla sequence at 1:1, one per hand otherwise. */
export function activeHands(input: PatternInput): readonly HandPattern[] {
  return isVanilla(input.ratio) ? input.hands.slice(0, 1) : input.hands;
}

/** Pulses after which both hands repeat. */
export function cycleLength(input: PatternInput): number {
  if (isVanilla(input.ratio)) {
    // n shared beats, one pulse each; both hands repeat after an even number of beats.
    return lcm((input.hands[0] as HandPattern).length, 2);
  }
  const grids = makeGrids(input.ratio);
  return input.hands.reduce(
    (acc, hand, h) => lcm(acc, hand.length * (grids[h] as Grid).pulsesPerBeat),
    1,
  );
}

/** True when both hands have a beat on this pulse: the only place a cross may land. */
export function isCoincident(grids: readonly [Grid, Grid], pulse: number): boolean {
  return grids.every((g) => mod(pulse - g.offset, g.pulsesPerBeat) === 0);
}
