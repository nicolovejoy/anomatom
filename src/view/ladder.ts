// SPEC §4.1 "Ladder strip": what to draw, in pulse coordinates. Pure; the canvas module draws
// it. This is the one place the playhead is a fraction of a pulse.
//
// The strip's x axis counts pulses across segments: within a segment it advances one unit per
// pulse of that segment, and each segment starts where the previous one's `endTime` falls. So
// the strip keeps one pulse per unit of width through a tempo or ratio change and never jumps;
// only its scroll speed follows the new pulse length.
//
// A part in a faulted cross group (design §6) still sounds, so its flights are still bars: the
// Schedule's stand-in flights for it (each onset to its next one), with no ball, `broken` set,
// drawn grey.
import { ballColours } from './colours';
import { isCoincident, onBeat, type Hand } from './grids';
import type { Segment } from './types';

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
  /** The ball id within its segment's schedule; null for a part in a faulted group. */
  readonly ball: number | null;
  /** The ball's lasting identity, carried across segments: picks its colour and its row. Null with no ball. */
  readonly colour: number | null;
  readonly height: number;
  readonly cross: boolean;
  /** True for a flight with no ball: a part in a faulted cross group, drawn grey. */
  readonly broken: boolean;
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

/**
 * Where each segment begins on the strip's pulse axis. The first begins at 0; each next one at
 * the previous one's boundary, its `endTime` in its own pulses. Switches land on a cycle
 * boundary, a whole pulse, so the boundary is rounded to absorb floating-point error.
 */
function origins(segments: readonly Segment[]): number[] {
  const out: number[] = [];
  let u = 0;
  for (const s of segments) {
    out.push(u);
    if (s.endTime !== null) u += boundary(s);
  }
  return out;
}

/** A segment's `endTime` in its own pulses: the first pulse it does not play. */
const boundary = (s: Segment): number =>
  s.endTime === null ? Infinity : Math.round((s.endTime - s.startTime) / s.pulseLen);

/** The index of the segment that owns time `t`: the last one, or the first whose end is after `t`. */
function segmentAt(segments: readonly Segment[], t: number): number {
  const i = segments.findIndex((s) => s.endTime !== null && t < s.endTime);
  return i === -1 ? segments.length - 1 : i;
}

/** Time `t` on the strip's pulse axis. 0 at the first segment's start; 0 when there is none. */
export function axisPulse(segments: readonly Segment[], t: number): number {
  if (segments.length === 0) return 0;
  const i = segmentAt(segments, t);
  const s = segments[i] as Segment;
  return (origins(segments)[i] as number) + (t - s.startTime) / s.pulseLen;
}

export function ladderFrame(segments: readonly Segment[], now: number, layout: LadderView): Frame {
  const playhead = layout.windowPulses * layout.playheadFraction;
  const start = axisPulse(segments, now) - playhead;
  const end = start + layout.windowPulses;
  const origin = origins(segments);
  const colour = ballColours(segments);

  const bars: Bar[] = [];
  const ticks: Tick[] = [];
  const cycleLines: number[] = [];
  segments.forEach((seg, i) => {
    const u0 = origin[i] as number;
    const B = boundary(seg);
    const next = segments[i + 1];
    const nextOrigin = origin[i + 1] as number;
    const { period, cycle, grids } = seg.schedule;

    for (const e of seg.schedule.events) {
      if (e.kind !== 'throw') continue;
      // The repetitions of this throw whose flight overlaps [start, end), none before the
      // segment's pulse 0 and none at or after its boundary (the next segment owns those):
      // launch + flight > start, i.e. a flight landing exactly at the window start is out.
      const first = Math.max(0, Math.floor((start - u0 - e.flight - e.pulse) / period) + 1);
      for (let k = first; ; k++) {
        const launch = e.pulse + k * period;
        if (launch >= B || u0 + launch >= end) break;
        let land = u0 + launch + e.flight;
        // Retiming: a flight crossing the boundary lands at pulse p of the next segment,
        // where B + p is its landing in this segment's count (docs/plans/v1-parallel.md).
        // On the pulse axis nextOrigin + (launch + flight - B) equals u0 + launch + flight, so
        // retiming does not move the bar in pulses: it is visible only through time (axisPulse),
        // as the next segment's pulse length changes how fast the strip scrolls past it.
        if (next && launch + e.flight > B) land = nextOrigin + (launch + e.flight - B);
        const from = e.part as Hand;
        bars.push({
          x0: u0 + launch - start,
          x1: land - start,
          from,
          to: e.cross ? ((1 - from) as Hand) : from,
          ball: e.ball,
          colour: e.ball === null ? null : (colour[i]?.get(e.ball) as number),
          height: e.height,
          cross: e.cross,
          broken: e.ball === null,
        });
      }
    }

    // Ticks and cycle lines over the part of the window this segment owns. The first segment
    // also ticks the pulses before it started, as the strip always has.
    const lo = i === 0 ? start : Math.max(start, u0);
    const hi = next ? Math.min(end, nextOrigin) : end;
    for (let u = Math.ceil(lo); u < hi; u++) {
      const p = u - u0;
      const coincident = isCoincident(grids, p);
      // Two lanes, hand 1 and hand 2.
      [0, 1].forEach((hand) => {
        if (onBeat(grids, hand, p)) ticks.push({ hand: hand as Hand, x: u - start, coincident });
      });
    }
    for (let u = u0 + Math.max(0, Math.ceil((lo - u0) / cycle) * cycle); u < hi; u += cycle) {
      cycleLines.push(u - start);
    }
  });

  return { start, windowPulses: layout.windowPulses, playhead, bars, ticks, cycleLines };
}
