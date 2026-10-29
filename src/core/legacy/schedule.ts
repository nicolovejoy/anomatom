import { buildSchedule as buildPartSchedule } from '../schedule';
import type { Schedule as PartSchedule } from '../types';
import { partsOfInput } from './convert';
import { makeGrids } from './grid';
import type { Event, Hand, PatternInput, Schedule } from './types';

/**
 * The part model's schedule (src/core/schedule.ts) in the two-hand shape. As before, only for a
 * valid pattern: the part model always has a schedule, but the two-hand one has a ball on every
 * event, so an invalid pattern throws here.
 */
export function buildSchedule(input: PatternInput): Schedule {
  const s = buildPartSchedule(partsOfInput(input));
  if (!s.verdict.ok) throw new Error('buildSchedule: pattern is not valid');
  const events: Event[] = s.events.map((e) => ({
    kind: e.kind,
    pulse: e.pulse,
    hand: e.part as Hand,
    ball: e.ball as number,
    height: e.height,
    flight: e.flight,
    cross: e.cross,
  }));
  return { cycle: s.cycle, period: s.period, grids: makeGrids(input.ratio), balls: s.balls, events };
}

const partSchedules = new WeakMap<Schedule, PartSchedule>();

/**
 * A two-hand Schedule in the part model's shape, for src/sound, which reads only the new types.
 * Memoized per object, so a player that converts on every tick converts once. A legacy schedule
 * is only ever of a valid pattern, so its verdict is `ok` with no groups spelled out.
 */
export function toPartSchedule(s: Schedule): PartSchedule {
  const known = partSchedules.get(s);
  if (known) return known;
  const converted: PartSchedule = {
    cycle: s.cycle,
    period: s.period,
    grids: s.grids.map((g) => ({ spacing: g.pulsesPerBeat, phase: g.offset })),
    balls: s.balls,
    events: s.events.map((e) => ({
      kind: e.kind,
      pulse: e.pulse,
      part: e.hand,
      ball: e.ball,
      height: e.height,
      flight: e.flight,
      cross: e.cross,
    })),
    verdict: { groups: [], ok: true },
  };
  partSchedules.set(s, converted);
  return converted;
}
