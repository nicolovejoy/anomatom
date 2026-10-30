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
//
// One lane per part (lanes ruling 4). Two parts keep the two lanes they always had, hand 1's at
// the top with its rows growing down and hand 2's at the bottom with its rows growing up; three
// or more stack one band each, top to bottom, rows growing down (`laneGeometry`).
import type { PartIndex } from '../core/types';
import { ballColours } from './colours';
import { catchPart, isCoincident, onBeat } from './grids';
import type { Segment } from './types';

export interface LadderView {
  /** Pulses visible across the strip. */
  readonly windowPulses: number;
  /** Where the playhead sits, as a fraction of the window from the left. */
  readonly playheadFraction: number;
  /** A flight longer than this, throw to catch in seconds, is not a human throw (SPEC §4.1 v2); none is, without it. */
  readonly humanAirtimeSeconds?: number;
}

/** A flight as a bar, x in pulses from the left edge of the window. */
export interface Bar {
  readonly x0: number;
  readonly x1: number;
  readonly from: PartIndex;
  readonly to: PartIndex;
  /** The ball id within its segment's schedule; null for a part in a faulted group. */
  readonly ball: number | null;
  /** The ball's lasting identity, carried across segments: picks its colour and its row. Null with no ball. */
  readonly colour: number | null;
  readonly height: number;
  readonly cross: boolean;
  /** True for a flight with no ball: a part in a faulted cross group, drawn grey. */
  readonly broken: boolean;
  /** Longer than a human throw at its segment's tempo: drawn dimmed, as the juggler dims its ball. */
  readonly inhuman: boolean;
}

export interface Tick {
  readonly part: PartIndex;
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
  /** Lanes to draw: the most parts of any segment on the strip (at least 1). */
  readonly parts: number;
}

/** What `laneGeometry` reads of the strip's tunables. */
export interface LaneLayout {
  readonly lanePaddingPx: number;
  readonly barPx: number;
  readonly rowGapPx: number;
}

/** Where each part's lane line sits on a strip `height` pixels tall, and which way its rows grow. */
export interface LaneGeometry {
  readonly y: readonly number[];
  /** +1: rows grow down from the line; -1: up. */
  readonly dir: readonly (1 | -1)[];
  /** Ball rows per lane before they repeat. */
  readonly rows: number;
  readonly step: number;
  readonly barPx: number;
  readonly rowGapPx: number;
}

/**
 * The lanes. Up to two parts: two lines, `lanePaddingPx` in from the top and the bottom, rows
 * growing towards each other, one row per ball colour (`colours` of them), as the strip always
 * was. Three or more: the strip between the paddings split into one band per part, each lane's
 * line at its band's top and its rows growing down, as many rows as fit in the band (at least one).
 */
export function laneGeometry(parts: number, height: number, layout: LaneLayout, colours: number): LaneGeometry {
  const step = layout.barPx + layout.rowGapPx;
  const pad = layout.lanePaddingPx;
  const base = { step, barPx: layout.barPx, rowGapPx: layout.rowGapPx };
  if (parts <= 2) return { ...base, y: [pad, height - pad], dir: [1, -1], rows: colours };
  const band = (height - 2 * pad) / parts;
  const rows = Math.max(1, Math.floor((band - layout.barPx - layout.rowGapPx) / step) + 1);
  return { ...base, y: Array.from({ length: parts }, (_, i) => pad + i * band), dir: Array.from({ length: parts }, () => 1 as const), rows };
}

/** The y of a bar's end in `part`'s lane: each ball colour its own row, so overlapping flights stay visible. */
export function rowY(g: LaneGeometry, part: PartIndex, colour: number | null): number {
  const row = ((colour ?? 0) % g.rows) * g.step + g.barPx / 2 + g.rowGapPx;
  return (g.y[part] as number) + (g.dir[part] as number) * row;
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
  const human = layout.humanAirtimeSeconds ?? Infinity;

  const bars: Bar[] = [];
  const ticks: Tick[] = [];
  const cycleLines: number[] = [];
  let parts = 1;
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
        parts = Math.max(parts, grids.length);
        bars.push({
          x0: u0 + launch - start,
          x1: land - start,
          from: e.part,
          to: catchPart(seg.schedule, e),
          ball: e.ball,
          colour: e.ball === null ? null : (colour[i]?.get(e.ball) as number),
          height: e.height,
          cross: e.cross,
          broken: e.ball === null,
          inhuman: e.flight * seg.pulseLen > human,
        });
      }
    }

    // Ticks and cycle lines over the part of the window this segment owns. The first segment
    // also ticks the pulses before it started, as the strip always has.
    const lo = i === 0 ? start : Math.max(start, u0);
    const hi = next ? Math.min(end, nextOrigin) : end;
    if (lo < hi) parts = Math.max(parts, grids.length);
    for (let u = Math.ceil(lo); u < hi; u++) {
      const p = u - u0;
      const coincident = isCoincident(grids, p);
      // One lane per part.
      grids.forEach((_, part) => {
        if (onBeat(grids, part, p)) ticks.push({ part, x: u - start, coincident });
      });
    }
    for (let u = u0 + Math.max(0, Math.ceil((lo - u0) / cycle) * cycle); u < hi; u += cycle) {
      cycleLines.push(u - start);
    }
  });

  return { start, windowPulses: layout.windowPulses, playhead, bars, ticks, cycleLines, parts };
}
