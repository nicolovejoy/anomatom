// SPEC §4.1 "Ladder strip": what to draw, in pulse coordinates. Pure; the canvas module draws
// it. This is the one place the playhead is a fraction of a pulse.
import { isCoincident } from '../core/grid';
import { mod } from '../core/math';
import type { Hand, Schedule } from '../core/types';

export interface LadderView {
  /** Pulses visible across the strip. */
  readonly windowPulses: number;
  /** Where the playhead sits, as a fraction of the window from the left. */
  readonly playheadFraction: number;
}

/** A flight as a bar, x in pulses from the left edge of the window. */
export interface Bar {
  readonly x0: number;
  readonly x1: number;
  readonly from: Hand;
  readonly to: Hand;
  readonly ball: number;
  readonly height: number;
  readonly cross: boolean;
}

export interface Tick {
  readonly hand: Hand;
  readonly x: number;
  readonly coincident: boolean;
}

export interface Frame {
  /** The pulse at the left edge of the window. */
  readonly start: number;
  readonly windowPulses: number;
  /** The playhead's x, in pulses from the left edge. */
  readonly playhead: number;
  readonly bars: readonly Bar[];
  readonly ticks: readonly Tick[];
  /** x of each cycle start in the window. */
  readonly cycleLines: readonly number[];
}

export function ladderFrame(schedule: Schedule, position: number, view: LadderView): Frame {
  const playhead = view.windowPulses * view.playheadFraction;
  const start = position - playhead;
  const end = start + view.windowPulses;
  const { period, cycle, grids } = schedule;

  const bars: Bar[] = [];
  for (const e of schedule.events) {
    if (e.kind !== 'throw') continue;
    // The repetitions of this throw whose flight overlaps [start, end), none before pulse 0:
    // launch + flight > start, i.e. a flight landing exactly at the window start is out.
    const first = Math.max(0, Math.floor((start - e.flight - e.pulse) / period) + 1);
    for (let k = first; e.pulse + k * period < end; k++) {
      const launch = e.pulse + k * period;
      bars.push({
        x0: launch - start,
        x1: launch + e.flight - start,
        from: e.hand,
        to: e.cross ? ((1 - e.hand) as Hand) : e.hand,
        ball: e.ball,
        height: e.height,
        cross: e.cross,
      });
    }
  }

  const ticks: Tick[] = [];
  for (let p = Math.ceil(start); p < end; p++) {
    const coincident = isCoincident(grids, p);
    grids.forEach((g, hand) => {
      if (mod(p - g.offset, g.pulsesPerBeat) === 0) ticks.push({ hand: hand as Hand, x: p - start, coincident });
    });
  }

  const cycleLines: number[] = [];
  for (let p = Math.max(0, Math.ceil(start / cycle) * cycle); p < end; p += cycle) cycleLines.push(p - start);

  return { start, windowPulses: view.windowPulses, playhead, bars, ticks, cycleLines };
}
