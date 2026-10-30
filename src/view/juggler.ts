// SPEC §4.1 "Juggler": where every ball is at time `now`, in scene metres. Pure; the canvas
// module draws it.
//
// The motion model is ported from sani.js by Jan Ivica (https://github.com/monkape/sani.js),
// `src/prepare.js`, `src/motion.js` and `src/spline.js`:
// - a throw leaves the throwing hand's inner (throw) point and flies on a parabola under gravity,
//   x moving at constant speed, to the catching hand's outer (catch) point; its apex is
//   g·air²/8 (sani's `throwHeight = motion.s(0, g, airTime / 2)`);
// - during the dwell the ball rides a scoop in the catching hand from the catch point to the
//   throw point, dipping along a cubic spline through sani's five catch points.
// Deviation (ruling 2026-10-29): before its first throw a ball waits at its hand's catch point
// and rides the scoop in over the dwell before that throw, not at the throw point, so two balls
// waiting in one hand never overlap.
// What is not ported: sani's rAF delta clock (`Ball.update` accumulates elapsed time and steps
// through an animation list), its `siteswap.js` dependency and its multiplex handling. Here a
// position is a function of `now` and the integer pulses of the Schedule, so there is nothing
// to accumulate and nothing to drift. The spline is solved with the textbook natural-spline
// recurrence (sani's indexing is one place off; the curve still passes through its points).
//
// sani.js is under the MIT licence:
//
//   MIT License
//
//   Copyright (c) 2017 Jan Ivica
//
//   Permission is hereby granted, free of charge, to any person obtaining a copy of this
//   software and associated documentation files (the "Software"), to deal in the Software
//   without restriction, including without limitation the rights to use, copy, modify, merge,
//   publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons
//   to whom the Software is furnished to do so, subject to the following conditions:
//
//   The above copyright notice and this permission notice shall be included in all copies or
//   substantial portions of the Software.
//
//   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
//   INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
//   PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE
//   FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
//   OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER
//   DEALINGS IN THE SOFTWARE.
//
// Timing (docs/plans/v1-parallel.md, wave 1 A): each throw event owns [t, t + flight) of its
// segment's pulses. The ball is in the air for flight − d, then in the catching hand for d,
// d = min(dwell × catching hand's spacing, maxDwellShare × flight), so it reaches the
// throw point exactly when it is thrown again. Pulses stay integers; seconds appear only as
// startTime + pulse × pulseLen.
//
// A part in a faulted cross group has events with no ball (design §6): it sounds, and this draws
// no ball for it. Two parts are drawn, hand 1 and hand 2.
import type { Event, Schedule } from '../core/types';
import { ballColours } from './colours';
import { catchPart, handOf, isCoincident, type Hand } from './grids';
import type { Segment } from './types';

/** The scene, in metres, x to the right and y up, y = 0 the height of the hands. */
export interface JugglerLayout {
  /** Each hand's outer point, where it catches: hand 1 first, on the left. */
  readonly catchX: readonly [number, number];
  /** Each hand's inner point, where it throws. */
  readonly throwX: readonly [number, number];
  /** Gravity, m/s². */
  readonly g: number;
  /** Time a ball spends in the catching hand, in that hand's beats. */
  readonly dwellBeats: number;
  /** The dwell never takes more than this share of a flight (below 1, so every throw is a toss). */
  readonly maxDwellShare: number;
  readonly radius: number;
  /** Deepest dip of the scoop below the hands. */
  readonly scoopDepth: number;
  /** The scoop is no deeper than this share of the incoming throw's apex (sani: one half). */
  readonly scoopApexShare: number;
  /** The flash lasts this many pulses after the clap. */
  readonly flashPulses: number;
  /** Seconds over which the scene height follows a switch, so the scale never jumps. Above 0. */
  readonly boundsEaseSeconds: number;
}

export interface JugglerBall {
  /** Colour index, from `ballColours`: stable across switches. */
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  /** The hand holding the ball (riding the scoop, or waiting for its first throw); null in the air. */
  readonly held: Hand | null;
  /** 0 → 1 through the throw that owns the ball, air then dwell; 0 while waiting. */
  readonly progress: number;
  /**
   * 0 → 1 → 0 over [catch, clap + flashPulses) for a cross landing on a pulse where both grids
   * tick: rises from the catch to 1 on the clap (the landing pulse), falls to 0 after it.
   */
  readonly flash: number;
}

/** What the canvas must fit: every ball, its radius included, through any switch on screen. */
export interface SceneBounds {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
}

export interface JugglerFrame {
  readonly balls: readonly JugglerBall[];
  readonly bounds: SceneBounds;
}

// ---------------------------------------------------------------------------------------------
// The scoop: sani's catch spline, x and y in percent of the scoop.
// ---------------------------------------------------------------------------------------------

const SCOOP_POINTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [5, 30],
  [30, 100],
  [95, 30],
  [100, 0],
];

/** A natural cubic spline through `points` (x increasing), as one function of x. */
function spline(points: readonly (readonly [number, number])[]): (x: number) => number {
  const xs = points.map(([x]) => x);
  const ys = points.map(([, y]) => y);
  const n = points.length - 1;
  const h = (i: number) => (xs[i + 1] as number) - (xs[i] as number);
  const q = (i: number) => ((ys[i + 1] as number) - (ys[i] as number)) / h(i);
  // Second derivatives m[0..n], m[0] = m[n] = 0: one tridiagonal solve.
  const u: number[] = [];
  const v: number[] = [];
  u[1] = 2 * (h(0) + h(1));
  v[1] = 6 * (q(1) - q(0));
  for (let i = 2; i < n; i++) {
    const r = h(i - 1) / (u[i - 1] as number);
    u[i] = 2 * (h(i - 1) + h(i)) - h(i - 1) * r;
    v[i] = 6 * (q(i) - q(i - 1)) - (v[i - 1] as number) * r;
  }
  const m: number[] = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i > 0; i--) m[i] = ((v[i] as number) - h(i) * (m[i + 1] as number)) / (u[i] as number);
  return (x) => {
    let i = 0;
    while (i < n - 1 && x > (xs[i + 1] as number)) i++;
    const t = x - (xs[i] as number);
    const mi = m[i] as number;
    const mj = m[i + 1] as number;
    const a = (mj - mi) / (6 * h(i));
    const b = mi / 2;
    const c = q(i) - (h(i) * (mj + 2 * mi)) / 6;
    return ((a * t + b) * t + c) * t + (ys[i] as number);
  };
}

const scoopCurve = spline(SCOOP_POINTS);
/** The curve's highest value, so the scoop's deepest dip is exactly its depth. */
const scoopPeak = Math.max(...Array.from({ length: 1001 }, (_, k) => scoopCurve(k / 10)));
/** The scoop's dip at fraction `f` of the dwell: 0 at both ends, 1 at its deepest. */
const scoop = (f: number): number => scoopCurve(f * 100) / scoopPeak;

// ---------------------------------------------------------------------------------------------
// Schedules, indexed by ball.
// ---------------------------------------------------------------------------------------------

interface Index {
  /** Each ball's throws over one period. */
  readonly throws: readonly (readonly Event[])[];
  /** Each ball's first throw at or after pulse 0. */
  readonly first: readonly Event[];
  readonly maxFlight: number;
}

const indexes = new WeakMap<Schedule, Index>();

function indexOf(schedule: Schedule): Index {
  const cached = indexes.get(schedule);
  if (cached) return cached;
  const throws: Event[][] = Array.from({ length: schedule.balls }, () => []);
  let maxFlight = 0;
  for (const e of schedule.events) {
    if (e.kind !== 'throw' || e.ball === null) continue;
    (throws[e.ball] as Event[]).push(e);
    maxFlight = Math.max(maxFlight, e.flight);
  }
  // Events are sorted by pulse, so each ball's first throw is its first entry.
  const index = { throws, first: throws.map((t) => t[0] as Event), maxFlight };
  indexes.set(schedule, index);
  return index;
}

interface Owned {
  readonly event: Event;
  /** The repetition's launch, in the segment's pulses: an integer. */
  readonly launch: number;
}

/**
 * The throw of `ball` whose flight [launch, launch + flight) holds pulse `p`, launched at or
 * after pulse 0; null before the ball's first throw. A ball's flights tile its period (each
 * landing is its next throw), and none is longer than the period, so only the latest
 * repetition at or before `p` of each throw can hold it.
 */
function owner(schedule: Schedule, ball: number, p: number): Owned | null {
  const { period } = schedule;
  for (const event of indexOf(schedule).throws[ball] as Event[]) {
    const launch = event.pulse + Math.floor((p - event.pulse) / period) * period;
    if (launch >= 0 && p < launch + event.flight) return { event, launch };
  }
  return null;
}

/** The hand a throw leaves, and the hand that catches it (from its catch event), as drawn. */
const thrower = (e: Event): Hand => handOf(e.part);
const catcher = (schedule: Schedule, e: Event): Hand => handOf(catchPart(schedule, e));

/** Pulses the ball spends in the catching hand at the end of throw `e`. */
const dwellPulses = (schedule: Schedule, e: Event, layout: JugglerLayout): number =>
  Math.min(layout.dwellBeats * spacing(schedule, catchPart(schedule, e)), layout.maxDwellShare * e.flight);

const spacing = (schedule: Schedule, part: number): number => schedule.grids[part]?.spacing ?? 1;

const apex = (air: number, layout: JugglerLayout): number => (layout.g * air * air) / 8;

/** A segment's `endTime` in its own pulses (a whole pulse, rounded to absorb float error). */
const boundary = (s: Segment): number =>
  s.endTime === null ? Infinity : Math.round((s.endTime - s.startTime) / s.pulseLen);

const pulseAt = (s: Segment, t: number): number => (t - s.startTime) / s.pulseLen;

// ---------------------------------------------------------------------------------------------
// One flight.
// ---------------------------------------------------------------------------------------------

interface Place {
  readonly x: number;
  readonly y: number;
  readonly held: Hand | null;
  readonly progress: number;
}

/**
 * Where a ball is at `now` on throw `e`, launched at `tLaunch` and thrown again at `tEnd`. The
 * air takes the same share of the span as `flight − d` of `flight`, so a flight retimed across
 * a switch is still one parabola, ending in a scoop.
 */
function along(schedule: Schedule, e: Event, d: number, tLaunch: number, tEnd: number, now: number, layout: JugglerLayout) {
  const from = thrower(e);
  const to = catcher(schedule, e);
  const span = tEnd - tLaunch;
  const air = (span * (e.flight - d)) / e.flight;
  const u = Math.min(Math.max(now - tLaunch, 0), span);
  const progress = u / span;
  if (u < air) {
    const x = layout.throwX[from] + ((layout.catchX[to] - layout.throwX[from]) * u) / air;
    // y = v·u − g·u²/2 with v = g·air/2: back to 0 at `air`, apex g·air²/8 at air/2.
    const place: Place = { x, y: (layout.g * u * (air - u)) / 2, held: null, progress };
    return { place, air, span };
  }
  const f = (u - air) / (span - air);
  const depth = Math.min(layout.scoopDepth, layout.scoopApexShare * apex(air, layout));
  const x = layout.catchX[to] + (layout.throwX[to] - layout.catchX[to]) * f;
  const place: Place = { x, y: -depth * scoop(f), held: to, progress };
  return { place, air, span };
}

// ---------------------------------------------------------------------------------------------
// The frame.
// ---------------------------------------------------------------------------------------------

/**
 * A ball waiting for its first throw `first`: at the hand's catch point, then over the dwell
 * before the throw (dwellBeats of that hand's beats) along the scoop to the throw point, as if
 * it had just been caught. A hand's throws are a beat apart, so the next ball to go is never
 * where the one after it waits. Deviates from the plan's "held at its throw point" (ruling
 * 2026-10-29), which overlapped two balls waiting in one hand.
 */
function waiting(seg: Segment, first: Event, now: number, layout: JugglerLayout): Place {
  const hand = thrower(first);
  const dwell = layout.dwellBeats * spacing(seg.schedule, first.part) * seg.pulseLen;
  const tThrow = seg.startTime + first.pulse * seg.pulseLen;
  const f = dwell > 0 ? clamp01(1 - (tThrow - now) / dwell) : 1;
  const air = (first.flight - dwellPulses(seg.schedule, first, layout)) * seg.pulseLen;
  const depth = Math.min(layout.scoopDepth, layout.scoopApexShare * apex(air, layout));
  const x = layout.catchX[hand] + (layout.throwX[hand] - layout.catchX[hand]) * f;
  return { x, y: -depth * scoop(f), held: hand, progress: 0 };
}

/**
 * Every ball on screen at `now`, one entry each, with the scene bounds.
 *
 * - Before a ball's first throw at or after pulse 0 it waits in that hand, as the ladder draws
 *   nothing before 0 (SPEC §7.1): at the catch point, riding the scoop to the throw point over
 *   the dwell before its first throw (see `waiting`). In a later segment only a ball the switch
 *   did not carry waits, from the segment's `startTime`; a carried one is still in its old flight.
 * - A flight that crosses a segment's boundary B (launch < B ≤ land) is drawn from its launch,
 *   in old time, to its landing at `next.startTime + (land − B) × next.pulseLen` (Retiming). If
 *   the next segment carries its ball, the ball is handed over at that instant, when the new
 *   segment's first throw of it begins; if not, the ball vanishes into the hand at the catch.
 */
export function jugglerFrame(segments: readonly Segment[], now: number, layout: JugglerLayout): JugglerFrame {
  const colours = ballColours(segments);
  const balls: JugglerBall[] = [];

  segments.forEach((seg, i) => {
    const previous = segments[i - 1];
    const next = segments[i + 1];
    if (previous && now < seg.startTime) return;
    const { schedule } = seg;
    const index = indexOf(schedule);
    const B = boundary(seg);
    const ended = seg.endTime !== null && now >= seg.endTime;
    // Long after its end, a segment has nothing left in the air.
    if (ended && next && now >= next.startTime + index.maxFlight * next.pulseLen) return;
    // Once ended, only the flights in the air at the boundary are left: those holding B − ½.
    const p = ended ? B - 0.5 : pulseAt(seg, now);
    // Old ball → the new ball that continues it.
    const onward = new Map<number, number>();
    next?.carry.forEach((old, fresh) => onward.set(old, fresh));
    const colour = colours[i] as ReadonlyMap<number, number>;

    for (let ball = 0; ball < schedule.balls; ball++) {
      const own = owner(schedule, ball, p);
      if (!own) {
        if (ended || seg.carry.has(ball)) continue;
        const place = waiting(seg, index.first[ball] as Event, now, layout);
        balls.push({ ball: colour.get(ball) as number, ...place, flash: 0 });
        continue;
      }

      const { event: e, launch } = own;
      const land = launch + e.flight;
      const crossing = next !== undefined && land >= B;
      const tLaunch = seg.startTime + launch * seg.pulseLen;
      const tEnd = crossing ? next.startTime + (land - B) * next.pulseLen : seg.startTime + land * seg.pulseLen;
      const d = dwellPulses(schedule, e, layout);
      const { place, air, span } = along(schedule, e, d, tLaunch, tEnd, now, layout);

      if (crossing) {
        const fresh = onward.get(ball);
        // Not carried: caught, and gone into the hand.
        if (fresh === undefined && place.held !== null) continue;
        // Carried: the next segment draws it from its first throw there.
        if (fresh !== undefined && owner(next.schedule, fresh, pulseAt(next, now))) continue;
      }

      // Flash, rising from the catch to the clap on this flight's landing...
      let flash = 0;
      const [landGrids, landPulse] = crossing ? [next.schedule.grids, land - B] : [schedule.grids, land];
      const dwell = span - air;
      if (e.cross && isCoincident(landGrids, landPulse) && now - tLaunch > air) {
        flash = 1 - (tEnd - now) / dwell;
      }
      // ...and falling after the clap that ended the previous flight, which landed at `launch`.
      const before = previousCross(segments, i, ball, launch);
      const after = now - tLaunch;
      const flashLen = layout.flashPulses * seg.pulseLen;
      if (before && isCoincident(schedule.grids, launch) && after < flashLen) {
        flash = Math.max(flash, 1 - after / flashLen);
      }

      balls.push({ ball: colour.get(ball) as number, ...place, flash });
    }
  });

  return { balls, bounds: bounds(segments, now, layout) };
}

/**
 * Whether the flight that brought `ball` of segment `i` to its throw at `launch` was a cross:
 * its previous throw in the same segment, or, for its first throw after a switch, the old
 * flight the carry continues.
 */
function previousCross(segments: readonly Segment[], i: number, ball: number, launch: number): boolean {
  const seg = segments[i] as Segment;
  const before = owner(seg.schedule, ball, launch - 0.5);
  if (before) return before.event.cross;
  const old = seg.carry.get(ball);
  const previous = segments[i - 1];
  if (old === undefined || !previous) return false;
  return owner(previous.schedule, old, boundary(previous) - 0.5)?.event.cross ?? false;
}

const clamp01 = (x: number): number => Math.min(Math.max(x, 0), 1);

/**
 * The scene: both hands' outer points across, from the deepest scoop to the highest apex up,
 * each widened by a ball radius. The height is the largest of the segments on screen, each
 * weighed in over the `boundsEaseSeconds` before it starts and out over the same after its last
 * flight lands, so a switch never makes the scale jump. A segment's apex is taken at the longer
 * of its own and the next pulse length, which bounds its retimed crossing flights too.
 */
function bounds(segments: readonly Segment[], now: number, layout: JugglerLayout): SceneBounds {
  const ease = layout.boundsEaseSeconds;
  let top = 0;
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    const index = indexOf(seg.schedule);
    const end = next ? next.startTime + index.maxFlight * next.pulseLen : Infinity;
    const weight = Math.min(
      i === 0 ? 1 : clamp01((now - seg.startTime + ease) / ease),
      clamp01(1 - (now - end) / ease),
    );
    if (weight === 0) return;
    const pulseLen = Math.max(seg.pulseLen, next?.pulseLen ?? 0);
    for (const e of seg.schedule.events) {
      if (e.ball === null) continue;
      const air = (e.flight - dwellPulses(seg.schedule, e, layout)) * pulseLen;
      top = Math.max(top, weight * apex(air, layout));
    }
  });
  const r = layout.radius;
  return {
    left: Math.min(...layout.catchX) - r,
    right: Math.max(...layout.catchX) + r,
    bottom: -layout.scoopDepth - r,
    top: top + r,
  };
}
