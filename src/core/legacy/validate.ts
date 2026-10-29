import { flightsOf } from './flights';
import { activeHands, cycleLength, isVanilla, makeGrids } from './grid';
import { lcm, mod } from '../math';
import type { ErrorDetail, Flight, HandPattern, PatternInput, Validation, ValidationError } from './types';

/**
 * MATH.md §2 and §6. The ball count must be whole, and for each hand the pulses on which balls
 * land (its own uncrossed throws plus the other hand's crosses) must be exactly the pulses on
 * which it throws, with no pulse landed on twice. A cross is only ever legal where both grids
 * coincide, so an off-grid cross is reported with the next coincident pulse.
 */
export function validate(input: PatternInput): Validation {
  const balls = ballCount(input);
  if (!Number.isInteger(balls)) return { ok: false, errors: [{ kind: 'fractional-balls', balls }] };
  const errors = landingErrors(input);
  return errors.length === 0 ? { ok: true, balls } : { ok: false, errors };
}

/**
 * Every error, each with the digits it involves; empty when the pattern is valid. Unlike
 * `validate`, a fractional ball count does not stop the landing checks: it comes first, followed
 * by every off-grid cross, collision and missing ball (`validate`'s order), so the input can
 * colour all of them. For a whole ball count the errors are exactly `validate`'s.
 */
export function validateAll(input: PatternInput): ErrorDetail[] {
  const balls = ballCount(input);
  const errors: ValidationError[] = Number.isInteger(balls) ? [] : [{ kind: 'fractional-balls', balls }];
  errors.push(...landingErrors(input));
  return errors.map((error) => ({ error, digits: errorDigits(input, error) }));
}

/** The digits one error involves, per hand (see `ErrorDetail.digits`). */
export function errorDigits(input: PatternInput, error: ValidationError): [number[], number[]] {
  const digits: [Set<number>, Set<number>] = [new Set(), new Set()];
  const vanilla = isVanilla(input.ratio);
  // At 1:1 a beat of either hand is a beat of the one sequence; otherwise of that hand's own.
  const at = (hand: 0 | 1, beat: number) => {
    const h = vanilla ? 0 : hand;
    digits[h].add(beat % (input.hands[h] as HandPattern).length);
  };
  switch (error.kind) {
    case 'collision':
      for (const t of error.throws) digits[t.hand].add(t.index);
      break;
    case 'cross-off-grid':
      at(error.fromHand, error.beat);
      break;
    case 'no-ball':
      at(error.hand, error.beat);
      break;
    case 'fractional-balls':
      break;
  }
  const sorted = (s: Set<number>) => [...s].sort((p, q) => p - q);
  return [sorted(digits[0]), sorted(digits[1])];
}

/** MATH.md §2 and §6, the per-hand landing check: off-grid crosses, collisions, missing balls. */
function landingErrors(input: PatternInput): ValidationError[] {
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

  return [...offGrid, ...collisions, ...noBall];
}

/** The average theorem, summed over hands: total flight time per cycle over the cycle. */
export function ballCount(input: PatternInput): number {
  return activeHands(input).reduce(
    (sum, hand) => sum + hand.reduce((s, t) => s + t.height, 0) / hand.length,
    0,
  );
}
