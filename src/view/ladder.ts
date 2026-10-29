// SPEC §4.1 "Ladder strip": what to draw, in pulse coordinates. Pure; the canvas module draws
// it. This is the one place the playhead is a fraction of a pulse.
//
// The strip's x axis counts pulses across segments: within a segment it advances one unit per
// pulse of that segment, and each segment starts where the previous one's `endTime` falls. So
// the strip keeps one pulse per unit of width through a tempo or ratio change and never jumps;
// only its scroll speed follows the new pulse length.
import { flightsOf } from '../core/flights';
import { activeHands, cycleLength, isCoincident, makeGrids } from '../core/grid';
import { mod } from '../core/math';
import type { Flight, Grid, Hand, PatternInput, ValidationError } from '../core/types';
import { ballColours } from './colours';
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
  /**
   * Set only by `brokenFrame`: true for a flight in a reported collision (it shares its landing
   * pulse and hand with another flight of the group) or an off-grid cross. Absent in `ladderFrame`.
   */
  readonly broken?: boolean;
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

  return { start, windowPulses: layout.windowPulses, playhead, bars, ticks, cycleLines };
}

/**
 * SPEC §4.2: the ladder frame of an invalid pattern, to draw greyed over (or, with nothing
 * playing, in place of) `ladderFrame(segments, now, layout)`. Same window, same pulse axis.
 *
 * Placement: the broken pattern's pulse 0 sits at the start of the segment that owns `now`, so
 * while stopped (that segment starts at `now`) it is at the playhead, and while playing it runs in
 * phase with the pattern that plays. With no segment at all it is at the playhead too. Unlike
 * a played segment it is a loop, not a performance: its cycle repeats across the whole window,
 * before pulse 0 as well, so the picture does not change as `now` moves within a segment.
 *
 * Bars: one per flight of `flightsOf(input)` per cycle in the window, with `broken` set on the
 * flights the errors name: in a collision, the group's flights that share a landing pulse and
 * hand (so the flagged bars meet where they collide); an off-grid cross, its flight. Zero-length
 * flights (a `0`) are drawn only when flagged, as a bar of no length at its pulse. An invalid
 * pattern has no ball ids, so `ball` numbers its digits across hands (hand 1's 0 to n − 1, then
 * hand 2's), and `colour` is what `ballColours` gives such balls after the segments: none
 * carried, none sharing a colour with the last segment. Ticks and cycle lines are the broken
 * pattern's own grid and cycle.
 */
export function brokenFrame(
  input: PatternInput,
  errors: readonly ValidationError[],
  segments: readonly Segment[],
  now: number,
  layout: LadderView,
): Frame {
  const playhead = layout.windowPulses * layout.playheadFraction;
  const start = axisPulse(segments, now) - playhead;
  const end = start + layout.windowPulses;
  const anchor = segments.length === 0 ? 0 : (origins(segments)[segmentAt(segments, now)] as number);

  const cycle = cycleLength(input);
  const grids = makeGrids(input.ratio);
  const flights = flightsOf(input);
  const flagged = brokenFlights(flights, errors, cycle);
  const hands = activeHands(input);
  const firstBall = [0, (hands[0] as readonly unknown[]).length];
  const balls = hands.reduce((n, h) => n + h.length, 0);
  // A stand-in segment with `balls` uncarried balls, so the colours follow the one rule.
  const loop: Segment = {
    schedule: { cycle, period: cycle, grids, balls, events: [] },
    startTime: now,
    pulseLen: 1,
    endTime: null,
    carry: new Map(),
  };
  const colour = ballColours([...segments, loop])[segments.length] as ReadonlyMap<number, number>;

  const bars: Bar[] = [];
  flights.forEach((f, i) => {
    const broken = flagged.has(i);
    if (f.height === 0 && !broken) return;
    const ball = (firstBall[f.id.hand] as number) + f.id.index;
    // Every repetition whose flight overlaps the window: anchor + land + k·cycle > start.
    for (let k = Math.floor((start - anchor - f.land) / cycle) + 1; ; k++) {
      const launch = anchor + f.launch + k * cycle;
      if (launch >= end) break;
      bars.push({
        x0: launch - start,
        x1: launch + (f.land - f.launch) - start,
        from: f.from,
        to: f.to,
        ball,
        colour: colour.get(ball) as number,
        height: f.height,
        cross: f.cross,
        broken,
      });
    }
  });

  const ticks: Tick[] = [];
  for (let u = Math.ceil(start); u < end; u++) {
    const p = u - anchor;
    const coincident = isCoincident(grids, p);
    grids.forEach((g: Grid, hand) => {
      if (mod(p - g.offset, g.pulsesPerBeat) === 0) ticks.push({ hand: hand as Hand, x: u - start, coincident });
    });
  }
  const cycleLines: number[] = [];
  for (let u = anchor + Math.ceil((start - anchor) / cycle) * cycle; u < end; u += cycle) cycleLines.push(u - start);

  return { start, windowPulses: layout.windowPulses, playhead, bars, ticks, cycleLines };
}

/** Indices into `flights` of the flights the errors name (see `brokenFrame`). */
function brokenFlights(flights: readonly Flight[], errors: readonly ValidationError[], cycle: number): Set<number> {
  const out = new Set<number>();
  for (const e of errors) {
    if (e.kind === 'collision') {
      const group = new Set(e.throws.map((t) => `${t.hand}:${t.index}`));
      // A group can collide on several pulses and in either hand; one cycle's repetition of a
      // digit can collide while another does not. Flag the group's flights that share a landing.
      const landings = new Map<string, number[]>();
      flights.forEach((f, i) => {
        if (!group.has(`${f.id.hand}:${f.id.index}`)) return;
        const at = `${f.to}:${mod(f.land, cycle)}`;
        landings.set(at, [...(landings.get(at) ?? []), i]);
      });
      for (const same of landings.values()) if (same.length > 1) for (const i of same) out.add(i);
    } else if (e.kind === 'cross-off-grid') {
      flights.forEach((f, i) => {
        if (f.from === e.fromHand && f.beat === e.beat) out.add(i);
      });
    }
  }
  return out;
}
