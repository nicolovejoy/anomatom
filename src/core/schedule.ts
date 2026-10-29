import { flightsOf } from './flights';
import { judge, onsetPulses } from './judge';
import { lcm, mod } from './math';
import { cycleOf } from './parts';
import type { Event, Flight, PartIndex, Parts, Schedule } from './types';

/**
 * Every event of one period, for every onset of every part. Never throws (design §6): the sound
 * plays whatever the flights say.
 *
 * Parts in a fault-free cross group get stable ball ids. Following each landing to the throw made
 * from that part on that pulse partitions their flights into orbits; an orbit whose flights add
 * up to m cycles of air time is the path of m balls one cycle apart, so ids repeat after lcm(m)
 * cycles: the period (1 cycle when no group is fault-free).
 *
 * Parts in a group with faults get `ball: null`, and each onset's flight is the gap to that part's
 * next onset, landing in the same part (governor ruling 2026-10-29), so a height-reading mapping
 * still has a length to read; the faulty digits stay in `verdict`.
 */
export function buildSchedule(parts: Parts): Schedule {
  const cycle = cycleOf(parts);
  const verdict = judge(parts);
  const broken = new Set<PartIndex>(verdict.groups.filter((g) => g.faults.length > 0).flatMap((g) => g.parts));
  const flights = flightsOf(parts).filter((f) => !broken.has(f.from));
  const orbits = findOrbits(flights, cycle);
  const period = cycle * orbits.reduce((acc, o) => lcm(acc, o.balls), 1);
  const unit = (p: PartIndex) => (parts[p] as Parts[number]).unit;

  const events: Event[] = [];
  let ball = 0;
  for (const orbit of orbits) {
    const orbitLength = orbit.balls * cycle;
    for (let j = 0; j < orbit.balls; j++, ball++) {
      for (let start = j * cycle; start < period; start += orbitLength) {
        for (const { flight: f, at } of orbit.slots) {
          const pulse = mod(start + at, period);
          const flight = f.land - f.launch;
          const shared = { ball, height: flight / unit(f.from), flight, cross: f.cross };
          events.push({ kind: 'throw', pulse, part: f.from, ...shared });
          events.push({ kind: 'catch', pulse: pulse + flight, part: f.to, ...shared });
        }
      }
    }
  }

  onsetPulses(parts, cycle).forEach((onsets, part) => {
    if (!broken.has(part)) return;
    onsets.forEach((o, i) => {
      const flight = (onsets[i + 1] ?? (onsets[0] as number) + cycle) - o;
      const shared = { ball: null, height: flight / unit(part), flight, cross: false };
      for (let pulse = o; pulse < period; pulse += cycle) {
        events.push({ kind: 'throw', pulse, part, ...shared });
        events.push({ kind: 'catch', pulse: pulse + flight, part, ...shared });
      }
    });
  });
  events.sort((p, q) => p.pulse - q.pulse || kindOrder(p) - kindOrder(q) || p.part - q.part);

  const balls = verdict.groups.reduce((s, g) => s + (g.balls ?? 0), 0);
  const grids = parts.map((p) => ({ spacing: p.spacing, phase: p.phase }));
  return { cycle, period, grids, balls, events, verdict };
}

const kindOrder = (e: Event): number => (e.kind === 'catch' ? 0 : 1);

interface Orbit {
  /** Each flight on the orbit with its launch time measured from the orbit's first launch. */
  readonly slots: readonly { flight: Flight; at: number }[];
  readonly balls: number;
}

/** Orbits of the landing-to-next-throw map over fault-free flights, where it is a bijection. */
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
