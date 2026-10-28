import { flightsOf } from './flights';
import { activeHands, cycleLength, makeGrids } from './grid';
import { lcm, mod } from './math';
import type { Flight, PatternInput, Validation, ValidationError } from './types';

/**
 * MATH.md §2 and §6. The ball count must be whole, and for each hand the pulses on which balls
 * land (its own uncrossed throws plus the other hand's crosses) must be exactly the pulses on
 * which it throws, with no pulse landed on twice. A cross is only ever legal where both grids
 * coincide, so an off-grid cross is reported with the next coincident pulse.
 */
export function validate(input: PatternInput): Validation {
  const balls = ballCount(input);
  if (!Number.isInteger(balls)) return { ok: false, errors: [{ kind: 'fractional-balls', balls }] };

  const cycle = cycleLength(input);
  const grids = makeGrids(input.ratio);
  const span = lcm(grids[0].pulsesPerBeat, grids[1].pulsesPerBeat);
  const flights = flightsOf(input);

  const offGrid: ValidationError[] = [];
  const collisions: ValidationError[] = [];
  const noBall: ValidationError[] = [];
  // A cycle holds several periods of a hand's sequence, so one group of throws can collide
  // on several pulses (and, at 1:1, in either hand). Report each group once.
  const seen = new Set<string>();

  for (const hand of [0, 1] as const) {
    const landings = new Map<number, Flight[]>();
    for (const f of flights) {
      if (f.to !== hand) continue;
      const grid = grids[hand];
      if (mod(f.land - grid.offset, grid.pulsesPerBeat) !== 0) {
        offGrid.push({
          kind: 'cross-off-grid',
          fromHand: f.from,
          beat: f.beat,
          landingPulse: f.land,
          nearestLegal: Math.ceil(f.land / span) * span,
        });
        continue;
      }
      const pulse = mod(f.land, cycle);
      landings.set(pulse, [...(landings.get(pulse) ?? []), f]);
    }
    for (const [pulse, group] of landings) {
      if (group.length < 2) continue;
      const throws = group.map((f) => f.id).sort((p, q) => p.hand - q.hand || p.index - q.index);
      const key = throws.map((t) => `${t.hand}:${t.index}`).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      collisions.push({ kind: 'collision', hand, pulse, throws });
    }
    for (const f of flights) {
      if (f.from === hand && !landings.has(mod(f.launch, cycle))) {
        noBall.push({ kind: 'no-ball', hand, beat: f.beat });
      }
    }
  }

  const errors = [...offGrid, ...collisions, ...noBall];
  return errors.length === 0 ? { ok: true, balls } : { ok: false, errors };
}

/** The average theorem, summed over hands: total flight time per cycle over the cycle. */
export function ballCount(input: PatternInput): number {
  return activeHands(input).reduce(
    (sum, hand) => sum + hand.reduce((s, t) => s + t.height, 0) / hand.length,
    0,
  );
}
