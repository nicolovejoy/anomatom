import { flightsOf } from './flights';
import { cycleLength, makeGrids } from './grid';
import { lcm, mod } from './math';
import { validate } from './validate';
import type { Event, Flight, PatternInput, Schedule } from './types';

/**
 * Every event of one period of a valid pattern, with stable ball ids. Following each landing
 * to the throw made from that hand on that pulse partitions the cycle's flights into orbits.
 * An orbit whose flights add up to m cycles of air time is the path of m balls, one cycle
 * apart. Ball ids repeat after lcm(m) cycles: the period.
 */
export function buildSchedule(input: PatternInput): Schedule {
  const v = validate(input);
  if (!v.ok) throw new Error('buildSchedule: pattern is not valid');
  const cycle = cycleLength(input);
  const flights = flightsOf(input).filter((f) => f.height > 0);
  const orbits = findOrbits(flights, cycle);
  const period = cycle * orbits.reduce((acc, o) => lcm(acc, o.balls), 1);

  const events: Event[] = [];
  let ball = 0;
  for (const orbit of orbits) {
    const orbitLength = orbit.balls * cycle;
    for (let j = 0; j < orbit.balls; j++, ball++) {
      for (let start = j * cycle; start < period; start += orbitLength) {
        for (const { flight: f, at } of orbit.slots) {
          const pulse = mod(start + at, period);
          const flight = f.land - f.launch;
          const shared = { ball, height: f.height, flight, cross: f.cross };
          events.push({ kind: 'throw', pulse, hand: f.from, ...shared });
          events.push({ kind: 'catch', pulse: pulse + flight, hand: f.to, ...shared });
        }
      }
    }
  }
  events.sort((p, q) => p.pulse - q.pulse || kindOrder(p) - kindOrder(q) || p.hand - q.hand);

  return { cycle, period, grids: makeGrids(input.ratio), balls: v.balls, events };
}

const kindOrder = (e: Event): number => (e.kind === 'catch' ? 0 : 1);

interface Orbit {
  /** Each flight on the orbit with its launch time measured from the orbit's first launch. */
  readonly slots: readonly { flight: Flight; at: number }[];
  readonly balls: number;
}

function findOrbits(flights: readonly Flight[], cycle: number): Orbit[] {
  const at = new Map<string, number>();
  flights.forEach((f, i) => at.set(`${f.from}:${f.launch}`, i));
  const next = (f: Flight): number => at.get(`${f.to}:${mod(f.land, cycle)}`) as number;

  const seen = new Set<number>();
  const orbits: Orbit[] = [];
  for (let start = 0; start < flights.length; start++) {
    if (seen.has(start)) continue;
    const slots: { flight: Flight; at: number }[] = [];
    const first = flights[start] as Flight;
    let t = first.launch;
    for (let i = start; !seen.has(i); i = next(flights[i] as Flight)) {
      seen.add(i);
      const f = flights[i] as Flight;
      slots.push({ flight: f, at: t });
      t += f.land - f.launch;
    }
    orbits.push({ slots, balls: (t - first.launch) / cycle });
  }
  return orbits;
}
