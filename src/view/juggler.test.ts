import { describe, expect, test } from 'vitest';
import { buildSchedule, flightsOf, partsFromOnsets } from '../core';
import type { Event, Parts, Schedule } from '../core';
import { scheduleOf, vanillaParts } from '../test/schedules';
import { JUGGLER } from '../tunables';
import { captionPlace, captionRoom, figureSpans, handPlaces, jugglerFrame, sceneScale } from './juggler';
import type { JugglerBall, JugglerLayout, SceneScale } from './juggler';
import type { Segment } from './types';

const layout: JugglerLayout = JUGGLER;
const R = layout.radius;

const vanilla = (text: string): Schedule => scheduleOf(text);
const ratio = (a: number, b: number, h1: string, h2: string): Schedule => scheduleOf([h1, h2], { a, b });

const START = 3.7;
const LEN = 0.25;
const single = (schedule: Schedule, pulseLen = LEN, startTime = START): Segment => ({
  schedule,
  startTime,
  pulseLen,
  endTime: null,
  carry: new Map(),
});
const at = (seg: Segment, pulse: number) => seg.startTime + pulse * seg.pulseLen;
const frame = (segments: readonly Segment[], now: number) => jugglerFrame(segments, now, layout);
const byColour = (balls: readonly JugglerBall[]) => new Map(balls.map((b) => [b.ball, b]));
const throwsOf = (s: Schedule) => s.events.filter((e) => e.kind === 'throw');
const catchesOf = (s: Schedule) => s.events.filter((e) => e.kind === 'catch');
/** Pulses in the catching hand at the end of the flight of throw or catch `e`. */
const dwell = (s: Schedule, e: Event) => {
  const to = e.kind === 'catch' || !e.cross ? (e.part as 0 | 1) : 1 - (e.part as 0 | 1);
  return Math.min(layout.dwellBeats * (s.grids[to] as { spacing: number }).spacing, layout.maxDwellShare * e.flight);
};
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

/** Every ball moves less than `tol` between consecutive samples `dt` apart over [t0, t1]. */
function expectContinuous(segments: readonly Segment[], t0: number, t1: number, dt: number, tol: number) {
  let prev = byColour(frame(segments, t0).balls);
  for (let t = t0 + dt; t <= t1; t += dt) {
    const cur = byColour(frame(segments, t).balls);
    for (const [colour, b] of cur) {
      const p = prev.get(colour);
      if (p) expect(dist(p, b), `ball ${colour} at ${t}`).toBeLessThan(tol);
    }
    prev = cur;
  }
}

const PATTERNS: Record<string, Schedule> = {
  '3': vanilla('3'),
  '441': vanilla('441'),
  '531': vanilla('531'),
  '51': vanilla('51'),
  '97531': vanilla('97531'),
  '2': vanilla('2'),
  '2/2 at 3:2': ratio(3, 2, '2', '2'),
  '2 2x 2/2x 2 at 3:2': ratio(3, 2, '2 2x 2', '2x 2'),
};

describe('one segment', () => {
  test.each(Object.entries(PATTERNS))('%s: one ball per schedule ball, each colour once', (_, s) => {
    const seg = single(s);
    for (const p of [0, 0.5, 1, 7.25, s.period + 3.3]) {
      const balls = frame([seg], at(seg, p)).balls;
      expect(balls).toHaveLength(s.balls);
      expect(new Set(balls.map((b) => b.ball)).size).toBe(s.balls);
    }
  });

  test.each(Object.entries(PATTERNS))(
    '%s: at every catch event the ball is at the throw point at the next throw, and at the catch point at landing (SPEC §7.6)',
    (_, s) => {
      const seg = single(s);
      // Two periods on, so every catch follows a real throw.
      for (const c of catchesOf(s)) {
        const pulse = c.pulse + s.period;
        const ball = byColour(frame([seg], at(seg, pulse)).balls).get(c.ball as number) as JugglerBall;
        // At the throw instant itself the ball is leaving the hand: held or just airborne.
        expect(dist(ball, { x: layout.throwX[(c.part as 0 | 1)], y: 0 })).toBeLessThan(R);
        const landing = byColour(frame([seg], at(seg, pulse - dwell(s, c))).balls).get(c.ball as number) as JugglerBall;
        expect(dist(landing, { x: layout.catchX[(c.part as 0 | 1)], y: 0 })).toBeLessThan(R);
      }
    },
  );

  test.each(Object.entries(PATTERNS))('%s: each apex is g·air²/8', (_, s) => {
    const seg = single(s);
    for (const e of throwsOf(s)) {
      const air = (e.flight - dwell(s, e)) * LEN;
      const t = at(seg, e.pulse + s.period) + air / 2;
      const ball = byColour(frame([seg], t).balls).get((e.ball as number)) as JugglerBall;
      expect(ball.held).toBeNull();
      expect(ball.y).toBeCloseTo((layout.g * air * air) / 8, 9);
      // Just either side is lower: it is the top.
      const near = (dt: number) => (byColour(frame([seg], t + dt).balls).get((e.ball as number)) as JugglerBall).y;
      expect(near(-1e-3)).toBeLessThan(ball.y);
      expect(near(1e-3)).toBeLessThan(ball.y);
    }
  });

  test('a cross ends at the other hand, a self throw in the same hand', () => {
    const s = PATTERNS['441'] as Schedule;
    const seg = single(s);
    for (const e of throwsOf(s)) {
      const to = e.cross ? 1 - (e.part as 0 | 1) : (e.part as 0 | 1);
      const landing = at(seg, e.pulse + s.period + e.flight - dwell(s, e));
      const ball = byColour(frame([seg], landing - 1e-9).balls).get((e.ball as number)) as JugglerBall;
      expect(ball.x).toBeCloseTo(layout.catchX[to as 0 | 1], 6);
      if (e.cross) expect(Math.sign(ball.x - 0.45)).not.toBe(Math.sign(layout.throwX[(e.part as 0 | 1)] - 0.45));
    }
  });

  test('a vanilla 2 is a small toss, not a hold', () => {
    const s = PATTERNS['2'] as Schedule;
    const seg = single(s);
    const heights = Array.from({ length: 40 }, (_, k) => frame([seg], at(seg, 4 + k / 10)).balls.map((b) => b.y)).flat();
    const top = Math.max(...heights);
    expect(top).toBeGreaterThan(R);
    expect(top).toBeLessThan(0.2);
  });

  test.each(Object.entries(PATTERNS))('%s: continuous through the period wrap and at large now', (_, s) => {
    const seg = single(s);
    const wrap = at(seg, s.period);
    expectContinuous([seg], wrap - 0.3, wrap + 0.3, 1e-3, 0.03);
    // Ten thousand seconds in, still continuous and the same as one period earlier: no drift.
    const late = START + 10_000;
    expectContinuous([seg], late - 0.3, late + 0.3, 1e-3, 0.03);
    const periodSeconds = s.period * LEN;
    const a = byColour(frame([seg], late).balls);
    const b = byColour(frame([seg], late - 37 * periodSeconds).balls);
    for (const [colour, ball] of a) {
      const other = b.get(colour) as JugglerBall;
      expect(dist(ball, other)).toBeLessThan(1e-6);
    }
  });

  test('before the first throw every ball is held in its hand, riding the scoop in to its throw', () => {
    for (const s of Object.values(PATTERNS)) {
      const seg = single(s);
      const firsts = new Map<number, Event>();
      for (const e of throwsOf(s)) if (!firsts.has((e.ball as number))) firsts.set((e.ball as number), e);
      // Long before: every ball waits at its hand's catch point.
      const early = frame([seg], START - 5).balls;
      expect(early).toHaveLength(s.balls);
      for (const b of early) {
        const first = firsts.get(b.ball) as Event;
        expect(b).toMatchObject({ x: layout.catchX[(first.part as 0 | 1)], held: (first.part as 0 | 1), progress: 0, flash: 0 });
        expect(b.y).toBeCloseTo(0, 12);
      }
      // Just before the start: held, between its hand's catch and throw points; the first to
      // throw is at its throw point.
      for (const b of frame([seg], START - 1e-9).balls) {
        const first = firsts.get(b.ball) as Event;
        expect(b).toMatchObject({ held: (first.part as 0 | 1), progress: 0, flash: 0 });
        const [lo, hi] = [layout.catchX[(first.part as 0 | 1)], layout.throwX[(first.part as 0 | 1)]].sort((p, q) => p - q);
        expect(b.x).toBeGreaterThanOrEqual(lo as number);
        expect(b.x).toBeLessThanOrEqual(hi as number);
        if (first.pulse === 0) expect(dist(b, { x: layout.throwX[(first.part as 0 | 1)], y: 0 })).toBeLessThan(R);
      }
      // A ball whose first throw is later is still waiting a little after the start.
      const late = [...firsts.values()].filter((e) => e.pulse > 0);
      const balls = byColour(frame([seg], at(seg, 0.5)).balls);
      for (const e of late) expect((balls.get((e.ball as number)) as JugglerBall).held).toBe((e.part as 0 | 1));
      // And no ball jumps from waiting into its first throw.
      expectContinuous([seg], START - 1, at(seg, s.period), 1e-3, 0.03);
    }
  });

  test('stopped 3: two balls waiting in one hand are at distinct places', () => {
    const balls = frame([single(PATTERNS['3'] as Schedule)], START).balls; // stopped: now is pulse 0
    expect(balls).toHaveLength(3);
    for (const a of balls) for (const b of balls) if (a !== b) expect(dist(a, b)).toBeGreaterThan(2 * R);
    // Hand 1 throws at pulses 0 and 2: one ball leaves its throw point, the other waits at its catch point.
    expect(balls.some((b) => b.x === layout.catchX[0] && b.held === 0)).toBe(true);
    expect(balls.some((b) => dist(b, { x: layout.throwX[0], y: 0 }) < 1e-9)).toBe(true);
  });

  test('with no dwell a waiting ball sits at its throw point', () => {
    const balls = jugglerFrame([single(PATTERNS['3'] as Schedule)], START - 1, { ...layout, dwellBeats: 0 }).balls;
    for (const b of balls) expect(b.x === layout.throwX[0] || b.x === layout.throwX[1]).toBe(true);
  });

  test('progress runs 0 → 1 over the throw, air then dwell', () => {
    const s = PATTERNS['3'] as Schedule;
    const seg = single(s);
    const ball = (p: number) => byColour(frame([seg], at(seg, p)).balls).get(0) as JugglerBall;
    // Ball 0 throws from hand 1 at pulses 0, 3, 6, ...: a 3-pulse flight, 2 in the air.
    expect(ball(12 + 1e-9).progress).toBeCloseTo(0);
    expect(ball(12.75).progress).toBeCloseTo(0.25);
    expect(ball(12.75).held).toBeNull();
    expect(ball(14.5).progress).toBeCloseTo(2.5 / 3);
    expect(ball(14.5).held).toBe(1);
    expect(ball(14.5).y).toBeLessThan(0); // in the scoop
  });
});

describe('flash', () => {
  const flashes = (segments: readonly Segment[], now: number) => frame(segments, now).balls.filter((b) => b.flash > 0);

  test('2 2x 2 / 2x 2 at 3:2 flashes either side of pulse 6, both crossing balls, peaking on the clap', () => {
    const s = PATTERNS['2 2x 2/2x 2 at 3:2'] as Schedule;
    const seg = single(s);
    const eps = 1e-3;
    expect(flashes([seg], at(seg, 6) - eps)).toHaveLength(2);
    expect(flashes([seg], at(seg, 6) + eps)).toHaveLength(2);
    for (const b of flashes([seg], at(seg, 6) - 1e-9)) expect(b.flash).toBeCloseTo(1, 5);
    for (const b of flashes([seg], at(seg, 6) + 1e-9)) expect(b.flash).toBeCloseTo(1, 5);
    // Every cycle, and not far from the clap: before the catch and after flashPulses it is dark.
    for (const c of [6, 12, 18, 24, 60]) {
      expect(flashes([seg], at(seg, c) - eps)).toHaveLength(2);
      expect(flashes([seg], at(seg, c - 2.5))).toHaveLength(0);
      expect(flashes([seg], at(seg, c + layout.flashPulses) + eps)).toHaveLength(0);
    }
  });

  test.each(['2/2 at 3:2', '3', '441', '97531', '531', '51'])('%s never flashes', (name) => {
    const s = PATTERNS[name] as Schedule;
    const seg = single(s);
    for (let p = 0; p < 2 * s.period; p += 0.05) expect(flashes([seg], at(seg, p))).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Switches, built by hand as stream B's player builds them: the switch at old pulse SWITCH, a
// cycle boundary of every pattern here, with `endTime === next.startTime`.
// ---------------------------------------------------------------------------------------------

const SWITCH = 30;

/** The carry-over rule (docs/plans/v1-parallel.md), as a test fixture; B owns the real one. */
function carryFor(old: Schedule, fresh: Schedule, b: number): Map<number, number> {
  const landing = new Map<string, number>();
  for (const e of throwsOf(old)) {
    const launch = e.pulse + Math.floor((b - 1 - e.pulse) / old.period) * old.period;
    if (launch >= 0 && launch + e.flight >= b) {
      landing.set(`${launch + e.flight - b}:${e.cross ? 1 - (e.part as 0 | 1) : (e.part as 0 | 1)}`, (e.ball as number));
    }
  }
  const carry = new Map<number, number>();
  const seen = new Set<number>();
  for (const e of throwsOf(fresh)) {
    if (seen.has((e.ball as number))) continue;
    seen.add((e.ball as number));
    const old = landing.get(`${e.pulse}:${(e.part as 0 | 1)}`);
    if (old !== undefined) carry.set((e.ball as number), old);
  }
  return carry;
}

function switchOf(first: Schedule, firstLen: number, second: Schedule, secondLen: number, carry = true): [Segment, Segment] {
  const endTime = START + SWITCH * firstLen;
  return [
    { schedule: first, startTime: START, pulseLen: firstLen, endTime, carry: new Map() },
    {
      schedule: second,
      startTime: endTime,
      pulseLen: secondLen,
      endTime: null,
      carry: carry ? carryFor(first, second, SWITCH) : new Map(),
    },
  ];
}

/** Samples densely around the switch: [endTime − 3 s, endTime + 3 s]. */
function around(segments: readonly Segment[], step = 2e-3): number[] {
  const t = (segments[1] as Segment).startTime;
  return Array.from({ length: Math.round(6 / step) }, (_, k) => t - 3 + k * step);
}

describe('switches', () => {
  test('the fixture carries every ball for 3 → 441 and a tempo change, three of four for 4 → 3', () => {
    expect(carryFor(vanilla('3'), vanilla('441'), SWITCH).size).toBe(3);
    expect(carryFor(vanilla('3'), vanilla('3'), SWITCH).size).toBe(3);
    expect(carryFor(vanilla('4'), vanilla('3'), SWITCH).size).toBe(3);
    expect(carryFor(vanilla('3'), vanilla('4'), SWITCH).size).toBe(3);
  });

  test.each([
    ['3 → 441', switchOf(vanilla('3'), LEN, vanilla('441'), LEN)],
    ['3 → 3 faster', switchOf(vanilla('3'), LEN, vanilla('3'), 0.18)],
    ['3 → 3 slower', switchOf(vanilla('3'), LEN, vanilla('3'), 0.4)],
  ])('%s: three balls on screen throughout, and none jumps', (_, segments) => {
    for (const t of around(segments)) {
      const balls = frame(segments, t).balls;
      expect(balls, `at ${t}`).toHaveLength(3);
      expect(new Set(balls.map((b) => b.ball)).size).toBe(3);
    }
    const t = (segments[1] as Segment).startTime;
    expectContinuous(segments, t - 3, t + 3, 1e-3, 0.03);
    // Exactly at the switch, and either side of it.
    const a = byColour(frame(segments, t - 1e-9).balls);
    const b = byColour(frame(segments, t + 1e-9).balls);
    for (const [colour, ball] of a) expect(dist(ball, b.get(colour) as JugglerBall)).toBeLessThan(1e-6);
  });

  test('3 → 3 at a new tempo: a carried ball is at the throw point when its new throw sounds', () => {
    const segments = switchOf(vanilla('3'), LEN, vanilla('3'), 0.4);
    const [, next] = segments;
    for (const p of [0, 1, 2]) {
      const t = at(next, p);
      const hand = (p % 2) as 0 | 1;
      const balls = frame(segments, t - 1e-9).balls.filter((b) => dist(b, { x: layout.throwX[hand], y: 0 }) < R);
      expect(balls.length).toBeGreaterThanOrEqual(1);
    }
  });

  // 3 → 51 cannot carry every ball (51 is excited): an unmatched old ball is still landing
  // while an unmatched new one waits, so it may show one more, as the carry-over rule accepts.
  test.each([
    ['3 → 4', vanilla('3'), vanilla('4'), 0],
    ['4 → 3', vanilla('4'), vanilla('3'), 0],
    ['441 → 531', vanilla('441'), vanilla('531'), 0],
    ['3 → 51', vanilla('3'), vanilla('51'), 1],
  ])('%s: the count never exceeds the larger pattern (+%i), and settles on the new one', (_, first, second, extra) => {
    const segments = switchOf(first, LEN, second, LEN);
    const most = Math.max(first.balls, second.balls) + extra;
    for (const t of around(segments)) {
      const balls = frame(segments, t).balls;
      expect(balls.length, `at ${t}`).toBeLessThanOrEqual(most);
      expect(new Set(balls.map((b) => b.ball)).size).toBe(balls.length);
    }
    const settled = frame(segments, (segments[1] as Segment).startTime + 5).balls;
    expect(settled).toHaveLength(second.balls);
    const t = (segments[1] as Segment).startTime;
    expectContinuous(segments, t - 3, t + 3, 1e-3, 0.03);
  });

  test('3 → 4: the unmatched new ball appears held in its hand at startTime', () => {
    const segments = switchOf(vanilla('3'), LEN, vanilla('4'), LEN);
    const [, next] = segments;
    expect(frame(segments, next.startTime - 1e-9).balls).toHaveLength(3);
    const balls = frame(segments, next.startTime).balls;
    expect(balls).toHaveLength(4);
    const waiting = balls.filter((b) => b.held !== null && b.progress === 0 && b.y === 0);
    // Its first throw is from hand 2, three pulses on: it waits at hand 2's catch point.
    expect(waiting.some((b) => b.x === layout.catchX[1] && b.held === 1)).toBe(true);
  });

  test('4 → 3: the unmatched old ball vanishes into the hand at its catch', () => {
    const segments = switchOf(vanilla('4'), LEN, vanilla('3'), LEN);
    const [, next] = segments;
    // 4's flights from 26..29 land at 30..33 (new pulses 0..3); the one landing at new pulse 3 is
    // unmatched, and is caught one pulse earlier.
    const catchTime = at(next, 3 - dwell(vanilla('4'), throwsOf(vanilla('4'))[0] as Event));
    expect(frame(segments, catchTime - 1e-6).balls).toHaveLength(4);
    expect(frame(segments, catchTime + 1e-6).balls).toHaveLength(3);
  });

  test('without a carry, old balls land and vanish and new ones wait: never more than both', () => {
    const segments = switchOf(vanilla('3'), LEN, vanilla('441'), LEN, false);
    for (const t of around(segments)) expect(frame(segments, t).balls.length).toBeLessThanOrEqual(6);
    expect(frame(segments, (segments[1] as Segment).startTime + 5).balls).toHaveLength(3);
  });

  test('a later segment draws nothing before it starts', () => {
    const [first, second] = switchOf(vanilla('3'), LEN, vanilla('441'), LEN);
    const queued: Segment = { ...second, carry: new Map() };
    expect(frame([first, queued], at(first, 10)).balls).toHaveLength(3);
  });

  test('a cross landing on the clap across a switch flashes on both sides of it', () => {
    const s = PATTERNS['2 2x 2/2x 2 at 3:2'] as Schedule;
    // Its cycle is 6, so pulse 30 is a coincident landing of both crosses.
    const segments = switchOf(s, LEN, s, 0.3);
    const t = (segments[1] as Segment).startTime;
    expect(frame(segments, t - 1e-3).balls.filter((b) => b.flash > 0)).toHaveLength(2);
    expect(frame(segments, t + 1e-3).balls.filter((b) => b.flash > 0)).toHaveLength(2);
  });

  test('scene bounds never jump across a switch, and fit every ball', () => {
    for (const [a, b] of [
      ['3', '97531'],
      ['97531', '3'],
    ] as const) {
      const segments = switchOf(vanilla(a), LEN, vanilla(b), LEN, false);
      let prev = frame(segments, START).bounds;
      const t0 = (segments[1] as Segment).startTime;
      for (let t = t0 - 4; t < t0 + 8; t += 1e-3) {
        const f = frame(segments, t);
        expect(Math.abs(f.bounds.top - prev.top), `${a} → ${b} at ${t}`).toBeLessThan(0.05);
        for (const ball of f.balls) {
          expect(ball.y + R).toBeLessThanOrEqual(f.bounds.top + 1e-9);
          expect(ball.y - R).toBeGreaterThanOrEqual(f.bounds.bottom - 1e-9);
          expect(ball.x - R).toBeGreaterThanOrEqual(f.bounds.left - 1e-9);
          expect(ball.x + R).toBeLessThanOrEqual(f.bounds.right + 1e-9);
        }
        prev = f.bounds;
      }
    }
  });

  test('the scene settles to the new pattern after the switch', () => {
    const big = frame([single(vanilla('97531'))], START).bounds.top;
    const small = frame([single(vanilla('3'))], START).bounds.top;
    const segments = switchOf(vanilla('97531'), LEN, vanilla('3'), LEN);
    const t0 = (segments[1] as Segment).startTime;
    expect(frame(segments, t0 - 1).bounds.top).toBeCloseTo(big);
    expect(frame(segments, t0 + 20).bounds.top).toBeCloseTo(small);
  });

  test('no segment: no balls, bounds of the hands alone', () => {
    const f = frame([], 0);
    expect(f.balls).toEqual([]);
    expect(f.bounds).toEqual({
      left: -R,
      right: layout.catchX[1] + R,
      bottom: -layout.scoopDepth - R,
      top: R,
    });
  });
});

test('a faulted group sounds but draws no ball; the other group keeps its balls', () => {
  // 432 cannot be juggled: every event has no ball.
  const broken = vanilla('432');
  expect(broken.events.every((e) => e.ball === null)).toBe(true);
  expect(frame([single(broken)], START + 1).balls).toEqual([]);
  // At 3:2 hand 1 alone is broken (1 3 2 collides); hand 2's 2 is a fountain of two.
  const half = ratio(3, 2, '1 3 2', '2');
  expect(half.balls).toBe(2);
  expect(frame([single(half)], START + 1).balls.length).toBe(2);
});

describe('the fault, drawn as arcs (design §6)', () => {
  /** A schedule and the lookup that knows its parts' flights, as the mount keeps them. */
  const known = (parts: Parts) => {
    const schedule = buildSchedule(parts);
    const flights = flightsOf(parts);
    return { schedule, lookup: (s: Schedule) => (s === schedule ? flights : undefined) };
  };

  test('432: the colliding flights meet at hand 1’s catch point; none without the lookup', () => {
    const { schedule, lookup } = known(vanillaParts('432'));
    expect(frame([single(schedule)], START + 1).faults).toEqual([]);
    expect(frame([single(schedule)], START + 1).bounds.top).toBe(R);
    const f =jugglerFrame([single(schedule)], START + 1, layout, lookup);
    const intoHand1 = f.faults.filter((a) => a.x1 === layout.catchX[0]);
    expect(intoHand1.map((a) => a.x0).sort()).toEqual([layout.throwX[0], layout.throwX[0], layout.throwX[1]].sort());
    // Flights of 4, 3 and 2 pulses, the dwell taken off as the balls' own flights have it.
    const air = (n: number) => (n - Math.min(layout.dwellBeats * 2, layout.maxDwellShare * n)) * LEN;
    const apexes = intoHand1.map((a) => a.apex).sort((p, q) => p - q);
    [2, 3, 4].forEach((n, i) => expect(apexes[i]).toBeCloseTo((layout.g * air(n) ** 2) / 8, 12));
    expect(f.faults.every((a) => !a.inhuman)).toBe(true);
    // The axis fits them: no balls, yet the scene is as tall as the tallest arc.
    expect(f.bounds.top).toBeCloseTo(Math.max(...f.faults.map((a) => a.apex)) + R, 9);
    // Worked out once per schedule, and kept: a schedule's flights never change.
    expect(frame([single(schedule)], START + 2).faults).toEqual(f.faults);
  });

  test('510: the flight onto hand 2’s 0 is drawn, crossing to its catch point', () => {
    const { schedule, lookup } = known(vanillaParts('510'));
    const f = jugglerFrame([single(schedule)], START, layout, lookup);
    expect(f.faults).toContainEqual(expect.objectContaining({ x0: layout.throwX[0], x1: layout.catchX[1] }));
  });

  test('only the segment playing now draws its fault, at its own tempo', () => {
    const broken = known(vanillaParts('432'));
    const fine = vanilla('3');
    const segments: Segment[] = [
      { ...single(broken.schedule), endTime: START + 6 * LEN },
      { schedule: fine, startTime: START + 6 * LEN, pulseLen: LEN, endTime: null, carry: new Map() },
    ];
    expect(jugglerFrame(segments, START, layout, broken.lookup).faults.length).toBeGreaterThan(0);
    expect(jugglerFrame(segments, START + 7 * LEN, layout, broken.lookup).faults).toEqual([]);
  });

  test('a faulted flight longer than a human throw is marked', () => {
    const { schedule, lookup } = known(vanillaParts('432'));
    const f = jugglerFrame([single(schedule, 1)], START, layout, lookup);
    expect(f.faults.filter((a) => a.inhuman).length).toBeGreaterThan(0);
  });
});

describe('the axes (sceneScale)', () => {
  const at390 = (s: Schedule, pulseLen = LEN) => sceneScale(frame([single(s, pulseLen)], START + 1).bounds, 390, 300, JUGGLER);
  const handsY = (k: SceneScale, bottom: number) => k.floor - (0 - bottom) * k.sy;

  test('short patterns share one uniform scale, the hands at one height', () => {
    const three = at390(vanilla('3'));
    const one = at390(vanilla('1'));
    const bottom = frame([single(vanilla('3'))], START + 1).bounds.bottom;
    for (const k of [three, one]) expect(k.sy / k.sx).toBe(1);
    expect(handsY(one, bottom)).toBe(handsY(three, bottom));
    expect(one).toEqual(three);
  });

  test('a tall apex squeezes only the height, and stays on the canvas', () => {
    const line = buildSchedule(partsFromOnsets([Array.from({ length: 16 }, (_, i) => i === 0)], [1]));
    const f = frame([single(line, 0.5)], START + 1);
    const k = sceneScale(f.bounds, 390, 300, JUGGLER);
    const short = at390(vanilla('3'));
    expect(k.sx).toBe(short.sx);
    expect(k.sy).toBeLessThan(k.sx);
    expect(k.floor - (f.bounds.top - f.bounds.bottom) * k.sy).toBeCloseTo(JUGGLER.minRadiusPx, 9);
  });

  test('a narrow canvas fits across first; the height never scales past it', () => {
    const k = sceneScale(frame([single(vanilla('3'))], START + 1).bounds, 60, 800, JUGGLER);
    expect(k.sy).toBe(k.sx);
    expect(k.x0).toBeCloseTo(JUGGLER.minRadiusPx, 9);
  });
});

describe('not a human throw (SPEC §4.1 v2)', () => {
  // One hit in a 16-step line at k = 1: a 16-beat flight, 8 s at 120 bpm.
  const line = buildSchedule(partsFromOnsets([Array.from({ length: 16 }, (_, i) => i === 0)], [1]));

  test('at 120 bpm the ball is dimmed and the label shows while it is up; caught, it hides', () => {
    const seg = single(line, 0.5);
    const up = jugglerFrame([seg], at(seg, 4), layout);
    expect(up.balls).toHaveLength(1);
    expect(up.balls[0]?.inhuman).toBe(true);
    expect(up.inhuman).toBe(true);
    // In the hand for the dwell before the next throw: still the long flight, but not in the air.
    const held = jugglerFrame([seg], at(seg, 15.9), layout);
    expect(held.balls[0]?.held).toBe(0);
    expect(held.inhuman).toBe(false);
  });

  test('fast enough, it is a human throw', () => {
    const seg = single(line, 0.15);
    expect(jugglerFrame([seg], at(seg, 4), layout).inhuman).toBe(false);
  });
});

describe('figureSpans', () => {
  const stride = layout.figureStride;
  const [c0] = layout.catchX;
  const [, c1] = layout.catchX;
  const wide = { left: c0, right: c1 };

  test('two parts are one figure spanning both hands', () => {
    expect(figureSpans(2, layout)).toEqual([{ figure: 0, part: 0, ...wide }]);
  });

  test('one part draws as the pair it always was', () => {
    expect(figureSpans(1, layout)).toEqual(figureSpans(2, layout));
  });

  test('four parts are two figures a stride apart, the second led by part 2', () => {
    expect(figureSpans(4, layout)).toEqual([
      { figure: 0, part: 0, ...wide },
      { figure: 1, part: 2, left: c0 + stride, right: c1 + stride },
    ]);
  });

  test('an odd last part is a figure of its own, spanning its one hand', () => {
    const spans = figureSpans(3, layout);
    expect(spans.map((s) => [s.figure, s.part])).toEqual([[0, 0], [1, 2]]);
    const lone = handPlaces(3, layout)[2] as { catchX: number; throwX: number };
    expect(spans[1]).toEqual({ figure: 1, part: 2, left: Math.min(lone.catchX, lone.throwX), right: Math.max(lone.catchX, lone.throwX) });
    // The one hand stands in the middle of its figure.
    expect(((spans[1] as { left: number }).left + (spans[1] as { right: number }).right) / 2).toBeCloseTo((c0 + c1) / 2 + stride, 10);
  });

  test('six parts are three figures at stride multiples', () => {
    const spans = figureSpans(6, layout);
    expect(spans.map((s) => s.part)).toEqual([0, 2, 4]);
    expect(spans.map((s) => s.left)).toEqual([c0, c0 + stride, c0 + 2 * stride]);
    expect(spans.map((s) => s.right)).toEqual([c1, c1 + stride, c1 + 2 * stride]);
  });
});

describe('captionPlace', () => {
  const L = JUGGLER;
  test('a normal height keeps the whole gap under the bars', () => {
    expect(captionRoom(300, L)).toBe(L.captionFontPx + L.captionGapPx);
    expect(captionPlace(300, 200, L)).toBe(200 + L.handBarPx + L.captionGapPx);
  });

  test('a short height shrinks the gap, never the font, and the caption is not clipped', () => {
    const height = 40;
    const room = captionRoom(height, L);
    expect(room).toBeGreaterThanOrEqual(L.captionFontPx);
    expect(room).toBeLessThan(L.captionFontPx + L.captionGapPx);
    // The scene, which sits above `height - room`, puts its bars at the bottom of that.
    const handY = height - room - 6 - L.handBarPx;
    expect(captionPlace(height, handY, L) + L.captionFontPx).toBeLessThanOrEqual(height);
  });

  test('a hand bar pushed to the very bottom still leaves the caption on the canvas', () => {
    expect(captionPlace(40, 40 - L.handBarPx, L)).toBe(40 - L.captionFontPx);
  });
});
