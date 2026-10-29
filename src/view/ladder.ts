// SPEC §4.1 "Ladder strip": what to draw, in pulse coordinates. Pure; the canvas module draws
// it. This is the one place the playhead is a fraction of a pulse.
//
// The strip's x axis counts pulses across segments: within a segment it advances one unit per
// pulse of that segment, and each segment starts where the previous one's `endTime` falls. So
// the strip keeps one pulse per unit of width through a tempo or ratio change and never jumps;
// only its scroll speed follows the new pulse length.
import { isCoincident } from '../core/grid';
import { mod } from '../core/math';
import type { Hand } from '../core/types';
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
  /** The ball id within its segment's schedule. */
  readonly ball: number;
  /** The ball's lasting identity, carried across segments: picks its colour and its row. */
  readonly colour: number;
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

/**
 * Each segment's colour for each of its balls. A ball the switch carries keeps the colour of
 * the ball it continues (and so, transitively, of the ball it first was). A ball it does not
 * carry takes the lowest colour no carried ball in that segment uses.
 */
function colours(segments: readonly Segment[]): Map<number, number>[] {
  const out: Map<number, number>[] = [];
  segments.forEach((s, i) => {
    const previous = out[i - 1];
    const map = new Map<number, number>();
    if (previous) {
      for (let ball = 0; ball < s.schedule.balls; ball++) {
        const old = s.carry.get(ball);
        const colour = old === undefined ? undefined : previous.get(old);
        if (colour !== undefined) map.set(ball, colour);
      }
    }
    const used = new Set(map.values());
    let next = 0;
    for (let ball = 0; ball < s.schedule.balls; ball++) {
      if (map.has(ball)) continue;
      while (used.has(next)) next++;
      map.set(ball, next++);
    }
    out.push(map);
  });
  return out;
}

export function ladderFrame(segments: readonly Segment[], now: number, view: LadderView): Frame {
  const playhead = view.windowPulses * view.playheadFraction;
  const start = axisPulse(segments, now) - playhead;
  const end = start + view.windowPulses;
  const origin = origins(segments);
  const colour = colours(segments);

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
        if (next && launch + e.flight > B) land = nextOrigin + (launch + e.flight - B);
        bars.push({
          x0: u0 + launch - start,
          x1: land - start,
          from: e.hand,
          to: e.cross ? ((1 - e.hand) as Hand) : e.hand,
          ball: e.ball,
          colour: colour[i]?.get(e.ball) as number,
          height: e.height,
          cross: e.cross,
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
      grids.forEach((g, hand) => {
        if (mod(p - g.offset, g.pulsesPerBeat) === 0) ticks.push({ hand: hand as Hand, x: u - start, coincident });
      });
    }
    for (let u = u0 + Math.max(0, Math.ceil((lo - u0) / cycle) * cycle); u < hi; u += cycle) {
      cycleLines.push(u - start);
    }
  });

  return { start, windowPulses: view.windowPulses, playhead, bars, ticks, cycleLines };
}
