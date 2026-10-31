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
// no ball for it. Its fault is drawn instead (`faults`): the colliding or off-onset flights as
// arcs, meeting where they land. The Schedule keeps no faulted digits (its stand-in flights are
// the k = 1 gaps), so those flights come from the caller's lookup by schedule, the model's own
// `flightsOf` of the parts that schedule was built from.
//
// N parts (lanes ruling 4): parts pair into figures, parts 0 and 1 the first figure's left and
// right hands, 2 and 3 the second's, side by side `figureStride` apart; an odd last part is a
// one-handed figure, its hand centred where the pair would stand. A flight from one figure to
// another is a pass: the same parabola, from the thrower's throw point across to the catcher's
// catch point. Two parts are one figure, exactly as before.
//
// SPEC §4.1 (v2): a flight longer than `humanAirtimeSeconds` from throw to catch, at its
// segment's tempo, is "not a human throw" (`inhuman`): presentation only.
import { mod } from '../core/math';
import type { Event, Flight, PartIndex, Schedule } from '../core/types';
import { ballColours } from './colours';
import { catchPart, isCoincident } from './grids';
import type { Segment } from './types';

/** The scene, in metres, x to the right and y up, y = 0 the height of the hands. */
export interface JugglerLayout {
  /** One figure's hands: each hand's outer point, where it catches, hand 1 first, on the left. */
  readonly catchX: readonly [number, number];
  /** Each hand's inner point, where it throws. */
  readonly throwX: readonly [number, number];
  /** Figures stand side by side this far apart, left edge to left edge. */
  readonly figureStride: number;
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
  /** A flight longer than this, throw to catch in seconds, is not a human throw (SPEC §4.1 v2). */
  readonly humanAirtimeSeconds: number;
}

/** Where a part's hand stands: its catch (outer) and throw (inner) points, in scene metres. */
export interface HandPlace {
  readonly part: PartIndex;
  readonly catchX: number;
  readonly throwX: number;
}

/**
 * Every hand of a picture of `parts` parts, by pairing (lanes ruling 4): part p stands in figure
 * ⌊p/2⌋, as its left hand when p is even and its right hand when odd, except an odd last part
 * past the first figure, which is a one-handed figure: hand 1's span, moved to the middle of its
 * figure. One part draws as the pair it always was (ruling on PR 43), so the juggler, the
 * ladder's two lanes and the "two hands" label agree; its ball stays in hand 1.
 */
export function handPlaces(parts: number, layout: Pick<JugglerLayout, 'catchX' | 'throwX' | 'figureStride'>): HandPlace[] {
  const [c0, c1] = layout.catchX;
  const [t0, t1] = layout.throwX;
  const centre = (c0 + c1) / 2 - (c0 + t0) / 2;
  const drawn = Math.max(parts, 2);
  return Array.from({ length: drawn }, (_, part) => {
    const offset = Math.floor(part / 2) * layout.figureStride;
    if (part % 2 === 0 && part === drawn - 1) return { part, catchX: offset + c0 + centre, throwX: offset + t0 + centre };
    return part % 2 === 0 ? { part, catchX: offset + c0, throwX: offset + t0 } : { part, catchX: offset + c1, throwX: offset + t1 };
  });
}

/** One figure (a juggler): its index, its first part, and the x extent of its hands. */
export interface FigureSpan {
  readonly figure: number;
  /** The figure's first part, 2 × figure: the part whose colour names it. */
  readonly part: PartIndex;
  readonly left: number;
  readonly right: number;
}

/**
 * Each figure of a picture of `parts` parts, left to right, with the extent of its hands, from
 * `handPlaces` (so an odd last part is a figure of its own, spanning its one hand). Figure f is
 * parts 2f and 2f + 1.
 */
export function figureSpans(parts: number, layout: Pick<JugglerLayout, 'catchX' | 'throwX' | 'figureStride'>): FigureSpan[] {
  const spans: FigureSpan[] = [];
  for (const h of handPlaces(parts, layout)) {
    const figure = Math.floor(h.part / 2);
    const left = Math.min(h.catchX, h.throwX);
    const right = Math.max(h.catchX, h.throwX);
    const seen = spans[figure];
    spans[figure] = seen
      ? { ...seen, left: Math.min(seen.left, left), right: Math.max(seen.right, right) }
      : { figure, part: figure * 2, left, right };
  }
  return spans;
}

/** The caption tunables `captionRoom` and `captionPlace` read. */
export interface CaptionLayout {
  readonly captionFontPx: number;
  readonly captionGapPx: number;
  readonly captionSceneShare: number;
  readonly handBarPx: number;
}

/**
 * Height the scene gives up under its hands for the captions: the font and the gap, but on a
 * short canvas the gap shrinks first (never the font), so the scene keeps `captionSceneShare` of the height.
 */
export function captionRoom(height: number, layout: CaptionLayout): number {
  return Math.min(layout.captionFontPx + layout.captionGapPx, Math.max(layout.captionFontPx, height * (1 - layout.captionSceneShare)));
}

/** The pixel row of the captions' top: under the hand bars at `handY`, after the shrunk gap, never past the canvas bottom. */
export function captionPlace(height: number, handY: number, layout: CaptionLayout): number {
  const gap = captionRoom(height, layout) - layout.captionFontPx;
  return Math.min(handY + layout.handBarPx + gap, height - layout.captionFontPx);
}

/** The flights of the parts a schedule was built from, for drawing its faults; undefined when unknown. */
export type FlightLookup = (schedule: Schedule) => readonly Flight[] | undefined;

/** A faulted flight (design §6), drawn as a whole arc from its thrower's throw point to its catcher's catch point. */
export interface FaultArc {
  readonly x0: number;
  readonly x1: number;
  readonly apex: number;
  /** Longer than a human throw. */
  readonly inhuman: boolean;
}

export interface JugglerBall {
  /** Colour index, from `ballColours`: stable across switches. */
  readonly ball: number;
  readonly x: number;
  readonly y: number;
  /** The part whose hand holds the ball (riding the scoop, or waiting for its first throw); null in the air. */
  readonly held: PartIndex | null;
  /** 0 → 1 through the throw that owns the ball, air then dwell; 0 while waiting. */
  readonly progress: number;
  /**
   * 0 → 1 → 0 over [catch, clap + flashPulses) for a cross landing on a pulse where both grids
   * tick: rises from the catch to 1 on the clap (the landing pulse), falls to 0 after it.
   */
  readonly flash: number;
  /** The flight the ball is on is longer than a human throw: drawn dimmed. */
  readonly inhuman: boolean;
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
  /** The faults of the segment playing now: every flight a fault names, as an arc. */
  readonly faults: readonly FaultArc[];
  /** True while a ball is in the air on a flight longer than a human throw: the label shows. */
  readonly inhuman: boolean;
  readonly bounds: SceneBounds;
  /** The hands to draw: every hand of every segment on screen (a part-count switch shows both). */
  readonly hands: readonly HandPlace[];
  /** The most parts of any segment on screen (2 with none), as the ladder's `Frame.parts`: above 2 the hands take their part colours. */
  readonly parts: number;
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

const places = new WeakMap<Schedule, Map<JugglerLayout, readonly HandPlace[]>>();

/** Where part `part`'s hand stands in a picture of the schedule's parts. */
function place(schedule: Schedule, part: PartIndex, layout: JugglerLayout): HandPlace {
  let byLayout = places.get(schedule);
  if (!byLayout) places.set(schedule, (byLayout = new Map()));
  let hands = byLayout.get(layout);
  if (!hands) byLayout.set(layout, (hands = handPlaces(schedule.grids.length, layout)));
  return hands[part] as HandPlace;
}

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
  readonly held: PartIndex | null;
  readonly progress: number;
}

/**
 * Where a ball is at `now` on throw `e`, launched at `tLaunch` and thrown again at `tEnd`. The
 * air takes the same share of the span as `flight − d` of `flight`, so a flight retimed across
 * a switch is still one parabola, ending in a scoop.
 */
function along(schedule: Schedule, e: Event, d: number, tLaunch: number, tEnd: number, now: number, layout: JugglerLayout) {
  const to = catchPart(schedule, e);
  const from = place(schedule, e.part, layout);
  const into = place(schedule, to, layout);
  const span = tEnd - tLaunch;
  const air = (span * (e.flight - d)) / e.flight;
  const u = Math.min(Math.max(now - tLaunch, 0), span);
  const progress = u / span;
  if (u < air) {
    const x = from.throwX + ((into.catchX - from.throwX) * u) / air;
    // y = v·u − g·u²/2 with v = g·air/2: back to 0 at `air`, apex g·air²/8 at air/2.
    return { place: { x, y: (layout.g * u * (air - u)) / 2, held: null, progress } as Place, air, span };
  }
  const f = (u - air) / (span - air);
  const depth = Math.min(layout.scoopDepth, layout.scoopApexShare * apex(air, layout));
  const x = into.catchX + (into.throwX - into.catchX) * f;
  return { place: { x, y: -depth * scoop(f), held: to, progress }, air, span };
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
  const hand = place(seg.schedule, first.part, layout);
  const dwell = layout.dwellBeats * spacing(seg.schedule, first.part) * seg.pulseLen;
  const tThrow = seg.startTime + first.pulse * seg.pulseLen;
  const f = dwell > 0 ? clamp01(1 - (tThrow - now) / dwell) : 1;
  const air = (first.flight - dwellPulses(seg.schedule, first, layout)) * seg.pulseLen;
  const depth = Math.min(layout.scoopDepth, layout.scoopApexShare * apex(air, layout));
  const x = hand.catchX + (hand.throwX - hand.catchX) * f;
  return { x, y: -depth * scoop(f), held: first.part, progress: 0 };
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
export function jugglerFrame(
  segments: readonly Segment[],
  now: number,
  layout: JugglerLayout,
  lookup: FlightLookup = () => undefined,
): JugglerFrame {
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
        balls.push({ ball: colour.get(ball) as number, ...place, flash: 0, inhuman: false });
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

      balls.push({ ball: colour.get(ball) as number, ...place, flash, inhuman: span > layout.humanAirtimeSeconds });
    }
  });

  const playing = segments.find((s) => s.endTime === null || now < s.endTime);
  const scene = bounds(segments, now, layout, lookup);
  return {
    balls,
    faults: playing ? faultArcs(playing, layout, lookup) : [],
    inhuman: balls.some((b) => b.inhuman && b.held === null),
    bounds: scene.bounds,
    hands: scene.hands,
    parts: scene.parts,
  };
}

/** A faulted flight in pulses: who throws and catches it, how long it is, and the catcher's spacing. */
interface FaultFlight {
  readonly from: PartIndex;
  readonly to: PartIndex;
  readonly flight: number;
  readonly toSpacing: number;
}

const faultFlights = new WeakMap<Schedule, readonly FaultFlight[]>();

/**
 * Every flight a fault of the schedule's verdict names, once each: the throws of a collision
 * (those landing on its pulse) and the throw of a no-onset fault. An unfed onset has no flight.
 * Empty when the lookup does not know the schedule's flights.
 */
function faultedFlights(schedule: Schedule, lookup: FlightLookup): readonly FaultFlight[] {
  const cached = faultFlights.get(schedule);
  if (cached) return cached;
  const flights = lookup(schedule);
  if (!flights) return [];
  const named = new Set<Flight>();
  const same = (f: Flight, part: number, index: number) => f.id.part === part && f.id.index === index;
  for (const fault of schedule.verdict.groups.flatMap((g) => g.faults)) {
    for (const f of flights) {
      if (fault.kind === 'collision') {
        if (f.to === fault.part && mod(f.land, schedule.cycle) === fault.pulse && fault.throws.some((t) => same(f, t.part, t.index))) named.add(f);
      } else if (fault.kind === 'no-onset' && f.land === fault.pulse && same(f, fault.from.part, fault.from.index)) named.add(f);
    }
  }
  const out = [...named].map((f) => ({ from: f.from, to: f.to, flight: f.land - f.launch, toSpacing: spacing(schedule, f.to) }));
  faultFlights.set(schedule, out);
  return out;
}

/** The arcs of a segment's faults, at its pulse length. */
function faultArcs(seg: Segment, layout: JugglerLayout, lookup: FlightLookup, pulseLen = seg.pulseLen): FaultArc[] {
  return faultedFlights(seg.schedule, lookup).map((f) => {
    const d = Math.min(layout.dwellBeats * f.toSpacing, layout.maxDwellShare * f.flight);
    return {
      x0: place(seg.schedule, f.from, layout).throwX,
      x1: place(seg.schedule, f.to, layout).catchX,
      apex: apex((f.flight - d) * pulseLen, layout),
      inhuman: f.flight * pulseLen > layout.humanAirtimeSeconds,
    };
  });
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

/** What `sceneScale` needs of the layout, in pixels and metres. */
export interface ScaleLayout {
  /** Margin round the scene: the smallest drawn radius, so a ball is drawn whole. */
  readonly minRadiusPx: number;
  /** Room under the scene for the hands. */
  readonly handGapPx: number;
  readonly handBarPx: number;
  readonly radius: number;
  readonly uniformTopMetres: number;
}

/** Pixels per metre across (`sx`) and up (`sy`), where the scene's left edge is drawn (`x0`) and the pixel row of its bottom (`floor`). */
export interface SceneScale {
  readonly sx: number;
  readonly sy: number;
  readonly x0: number;
  readonly floor: number;
}

/**
 * The juggler's axes (SPEC §4.1 v2). The scene stands on the canvas's bottom edge. While its
 * tallest apex is at most `uniformTopMetres`, one scale serves both axes, the one that fits a
 * scene that tall (and no wider than the canvas): parabolas keep their shape, and the hands stay
 * at the same height whatever the pattern. A taller apex keeps that scale across and squeezes
 * only the height, so the apex stays on the canvas. The vertical scale never exceeds the
 * horizontal one.
 */
export function sceneScale(bounds: SceneBounds, width: number, height: number, layout: ScaleLayout): SceneScale {
  const { left, right, bottom, top } = bounds;
  const pad = layout.minRadiusPx;
  const floor = height - pad - layout.handGapPx - layout.handBarPx;
  const fit = (t: number) => (floor - pad) / (t - bottom);
  const sx = Math.min((width - 2 * pad) / (right - left), fit(layout.uniformTopMetres + layout.radius));
  const sy = Math.min(sx, fit(top));
  return { sx, sy, x0: (width - (right - left) * sx) / 2, floor };
}

/**
 * The scene: every hand's outer points across, from the deepest scoop to the highest apex up,
 * each widened by a ball radius. The height is the largest of the segments on screen, each
 * weighed in over the `boundsEaseSeconds` before it starts and out over the same after its last
 * flight lands, so a switch never makes the scale jump. A segment's apex is taken at the longer
 * of its own and the next pulse length, which bounds its retimed crossing flights too.
 */
function bounds(segments: readonly Segment[], now: number, layout: JugglerLayout, lookup: FlightLookup): { bounds: SceneBounds; hands: HandPlace[]; parts: number } {
  const ease = layout.boundsEaseSeconds;
  let top = 0;
  // Across, the span of the segment playing now; a segment weighing in or out with a different
  // part count pulls it towards its own span, so a part-count switch never makes the scale jump.
  const playing = segments.find((s) => s.endTime === null || now < s.endTime) ?? segments[segments.length - 1];
  const [lo, hi] = span(playing ? playing.schedule.grids.length : 2, layout);
  let [left, right] = [lo, hi];
  const hands = new Map<string, HandPlace>();
  let most = playing ? 0 : 2;
  if (!playing) for (const h of handPlaces(2, layout)) hands.set(`${h.part}:${h.catchX}`, h);
  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    const index = indexOf(seg.schedule);
    const end = next ? next.startTime + index.maxFlight * next.pulseLen : Infinity;
    const weight = Math.min(
      i === 0 ? 1 : clamp01((now - seg.startTime + ease) / ease),
      clamp01(1 - (now - end) / ease),
    );
    if (weight === 0) return;
    const parts = seg.schedule.grids.length;
    most = Math.max(most, parts);
    const [l, r] = span(parts, layout);
    left = Math.min(left, lo + weight * (l - lo));
    right = Math.max(right, hi + weight * (r - hi));
    for (const h of handPlaces(parts, layout)) hands.set(`${h.part}:${h.catchX}`, h);
    const pulseLen = Math.max(seg.pulseLen, next?.pulseLen ?? 0);
    for (const e of seg.schedule.events) {
      if (e.ball === null) continue;
      const air = (e.flight - dwellPulses(seg.schedule, e, layout)) * pulseLen;
      top = Math.max(top, weight * apex(air, layout));
    }
    // A faulted group draws its faulted flights instead of balls: the axis fits them too.
    for (const arc of faultArcs(seg, layout, lookup, pulseLen)) top = Math.max(top, weight * arc.apex);
  });
  const r = layout.radius;
  return {
    bounds: { left: left - r, right: right + r, bottom: -layout.scoopDepth - r, top: top + r },
    hands: [...hands.values()],
    parts: most,
  };
}

/** The leftmost and rightmost hand points of a picture of `parts` parts. */
function span(parts: number, layout: JugglerLayout): [number, number] {
  const xs = handPlaces(parts, layout).flatMap((h) => [h.catchX, h.throwX]);
  return [Math.min(...xs), Math.max(...xs)];
}
