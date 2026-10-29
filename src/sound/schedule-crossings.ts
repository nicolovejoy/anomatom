// The crossing count of a Schedule (MATH §5), for the filter that follows it. Pure.
//
// `countCrossings` reads the flights of one cycle; a Schedule holds the events of one period,
// so the cycle's flights are its throws that start inside the first cycle (a throw event is a
// flight: it launches at its pulse and lands `flight` pulses later). Height-0 throws are not
// arcs and `countCrossings` skips them.
import { countCrossings } from '../core/crossings';
import type { Flight, Schedule } from '../core/types';

const memo = new WeakMap<Schedule, number>();

export function crossingsOfSchedule(schedule: Schedule): number {
  const known = memo.get(schedule);
  if (known !== undefined) return known;
  const flights: Flight[] = schedule.events
    .filter((e) => e.kind === 'throw' && e.pulse < schedule.cycle)
    .map((e, index) => ({
      id: { hand: e.hand, index },
      from: e.hand,
      to: e.cross ? (e.hand === 0 ? 1 : 0) : e.hand,
      beat: 0,
      height: e.height,
      cross: e.cross,
      launch: e.pulse,
      land: e.pulse + e.flight,
    }));
  const count = countCrossings(flights, schedule.cycle);
  memo.set(schedule, count);
  return count;
}
