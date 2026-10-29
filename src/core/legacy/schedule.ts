import { buildSchedule as buildPartSchedule } from '../schedule';
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
