import { carryOver as carryParts } from '../carry';
import type { CarrySchedule } from '../carry';
import type { Schedule } from './types';

const asParts = (s: Schedule): CarrySchedule => ({
  period: s.period,
  events: s.events.map((e) => ({ kind: e.kind, pulse: e.pulse, part: e.hand, ball: e.ball, flight: e.flight })),
});

/** The part model's carry-over (src/core/carry.ts) on two-hand schedules. */
export function carryOver(old: Schedule, next: Schedule, boundary: number): Map<number, number> {
  return carryParts(asParts(old), asParts(next), boundary);
}
