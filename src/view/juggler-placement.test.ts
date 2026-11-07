// The world frame and the figure placements (v6.8 R1, rulings 1 and 2).
import { describe, expect, test } from 'vitest';
import { buildSchedule, carryOver } from '../core';
import type { Parts, Schedule } from '../core';
import { lineFixtures } from '../test/juggler-fixtures';
import { lineParts, scheduleOf } from '../test/schedules';
import { JUGGLER, LOOKAHEAD_SECONDS } from '../tunables';
import { ballColours } from './colours';
import { catchPart } from './grids';
import golden from './juggler-line.golden.json';
import { figurePlaces, figureSpans, handPlaces, jugglerFrame, ringFigures } from './juggler';
import type { HandPlace, JugglerLayout } from './juggler';
import type { Segment } from './types';

const layout: JugglerLayout = JUGGLER;
const R = layout.radius;
const S = layout.figureStride;
const LEN = 0.25;
const single = (schedule: Schedule): Segment => ({ schedule, startTime: 0, pulseLen: LEN, endTime: null, carry: new Map() });

const manual = (phase: number, throws: [number, number][]) => ({
  spacing: 2,
  phase,
  unit: 1,
  flights: { kind: 'manual' as const, throws: throws.map(([height, to]) => ({ height, to })) },
});
/** Four hands, two cascades, every other left-hand throw passed to the other figure. */
const FOUR: Parts = [manual(0, [[3, 1], [3, 3]]), manual(1, [[3, 0], [3, 0]]), manual(0, [[3, 3], [3, 1]]), manual(1, [[3, 2], [3, 2]])];

/** Drops the world frame's new fields and turns −0 into 0, as JSON does. */
const today = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (k, v: unknown) => (['z', 'z0', 'z1', 'catchZ', 'throwZ', 'near', 'far', 'figures'].includes(k) ? undefined : v)));

describe('the line placement is today’s picture', () => {
  const recorded = golden as unknown as Record<string, unknown[]>;

  test.each(lineFixtures().map((f) => [f.name, f] as const))('%s: every number as recorded before the world frame', (name, f) => {
    const frames = f.times.map((t) => jugglerFrame(f.segments, t, layout, f.lookup));
    expect(today(frames)).toEqual(recorded[name]);
    // The default is the line, and the line has no depth.
    expect(f.times.map((t) => jugglerFrame(f.segments, t, layout, f.lookup, 'line'))).toEqual(frames);
    for (const frame of frames) {
      expect(frame.balls.every((b) => b.z === 0)).toBe(true);
      expect(frame.hands.every((h) => h.catchZ === 0 && h.throwZ === 0)).toBe(true);
      expect(frame.faults.every((a) => a.z0 === 0 && a.z1 === 0)).toBe(true);
      expect([frame.bounds.near, frame.bounds.far]).toEqual([-R, R]);
    }
  });

  test('the fixtures draw balls in the air and in the hand, and faults', () => {
    const frames = lineFixtures().flatMap((f) => f.times.map((t) => jugglerFrame(f.segments, t, layout, f.lookup)));
    expect(frames.some((fr) => fr.balls.some((b) => b.held === null))).toBe(true);
    expect(frames.some((fr) => fr.balls.some((b) => b.held !== null))).toBe(true);
    expect(frames.some((fr) => fr.faults.length > 0)).toBe(true);
    expect(frames.some((fr) => fr.parts === 4 && fr.balls.length > 0)).toBe(true);
  });
});

describe('where the figures stand in the ring', () => {
  const near = (p: { x: number; z: number }, x: number, z: number) => {
    expect(p.x).toBeCloseTo(x, 4);
    expect(p.z).toBeCloseTo(z, 4);
  };
  const facesCentre = (figures: number) => {
    for (const { centre, facing } of ringFigures(figures, layout)) {
      const r = Math.hypot(centre.x, centre.z);
      near(facing, -centre.x / r, -centre.z / r);
    }
  };

  test('one figure: at the centre, facing the camera', () => {
    const [only] = ringFigures(1, layout);
    expect(ringFigures(1, layout)).toHaveLength(1);
    near(only!.centre, 0, 0);
    near(only!.facing, 0, -1);
  });

  test('two figures: face to face, figureStride apart', () => {
    const [a, b] = ringFigures(2, layout);
    near(a!.centre, -0.95, 0);
    near(a!.facing, 1, 0);
    near(b!.centre, 0.95, 0);
    near(b!.facing, -1, 0);
  });

  test('three: juggler 1 at the back, 2 front-left, 3 front-right, R = 1.10 m', () => {
    const f = ringFigures(3, layout);
    near(f[0]!.centre, 0, 1.097);
    near(f[1]!.centre, -0.95, -0.5485);
    near(f[2]!.centre, 0.95, -0.5485);
    near(f[0]!.facing, 0, -1);
    expect(Math.hypot(f[1]!.centre.x, f[1]!.centre.z)).toBeCloseTo(1.1, 2);
    facesCentre(3);
  });

  test('four: a square turned 45°, 1 back-right, 2 back-left, 3 front-left, 4 front-right, R = 1.34 m', () => {
    const f = ringFigures(4, layout);
    near(f[0]!.centre, 0.95, 0.95);
    near(f[1]!.centre, -0.95, 0.95);
    near(f[2]!.centre, -0.95, -0.95);
    near(f[3]!.centre, 0.95, -0.95);
    expect(Math.hypot(f[0]!.centre.x, f[0]!.centre.z)).toBeCloseTo(1.34, 2);
    facesCentre(4);
  });

  test('five: 1 at the back, the rest at 72° steps going left first, R = 1.62 m', () => {
    const f = ringFigures(5, layout);
    near(f[0]!.centre, 0, 1.6162);
    near(f[1]!.centre, -1.5371, 0.4994);
    near(f[2]!.centre, -0.95, -1.3076);
    near(f[3]!.centre, 0.95, -1.3076);
    near(f[4]!.centre, 1.5371, 0.4994);
    expect(Math.hypot(f[0]!.centre.x, f[0]!.centre.z)).toBeCloseTo(1.62, 2);
    facesCentre(5);
  });

  test.each([2, 3, 4, 5, 6])('%i figures: neighbours figureStride apart, every facing a unit vector', (n) => {
    const f = ringFigures(n, layout);
    for (let i = 0; i < n; i++) {
      const a = f[i]!.centre;
      const b = f[(i + 1) % n]!.centre;
      if (n > 2 || i === 0) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(S, 9);
      expect(Math.hypot(f[i]!.facing.x, f[i]!.facing.z)).toBeCloseTo(1, 12);
    }
  });
});

describe('the hands in the ring', () => {
  /** A hand point's offset along its figure's viewer's left, l = (facing.z, −facing.x). */
  const alongLeft = (h: HandPlace, which: 'catch' | 'throw', figures: number) => {
    const { centre: c, facing: f } = ringFigures(figures, layout)[Math.floor(h.part / 2)]!;
    const [x, z] = which === 'catch' ? [h.catchX, h.catchZ] : [h.throwX, h.throwZ];
    return { left: (x - c.x) * f.z - (z - c.z) * f.x, ahead: (x - c.x) * f.x + (z - c.z) * f.z };
  };

  test('one figure facing the camera: hand 1 on the viewer’s left, today’s line moved 0.45 m left', () => {
    const ring = handPlaces(2, layout, 'ring');
    const line = handPlaces(2, layout);
    const [h1, h2] = ring;
    expect(h1!.catchX).toBeCloseTo(-0.45, 12);
    expect(h1!.throwX).toBeCloseTo(-0.2, 12);
    expect(h2!.throwX).toBeCloseTo(0.2, 12);
    expect(h2!.catchX).toBeCloseTo(0.45, 12);
    ring.forEach((h, i) => {
      expect(h.catchX).toBeCloseTo(line[i]!.catchX - 0.45, 12);
      expect(h.throwX).toBeCloseTo(line[i]!.throwX - 0.45, 12);
      expect(h.catchZ).toBeCloseTo(0, 12);
      expect(h.throwZ).toBeCloseTo(0, 12);
    });
    // One part draws as the pair it always was.
    expect(handPlaces(1, layout, 'ring')).toEqual(ring);
  });

  test.each([3, 4, 6, 7, 10])('%i parts: every hand on its figure’s hand line, hand 1 on the left side, today’s offsets', (parts) => {
    const figures = Math.ceil(parts / 2);
    const hands = handPlaces(parts, layout, 'ring');
    expect(hands.map((h) => h.part)).toEqual(Array.from({ length: parts }, (_, p) => p));
    for (const h of hands) {
      const k = alongLeft(h, 'catch', figures);
      const t = alongLeft(h, 'throw', figures);
      expect(k.ahead).toBeCloseTo(0, 12);
      expect(t.ahead).toBeCloseTo(0, 12);
      if (h.part % 2 === 0 && h.part === parts - 1) {
        // A one-handed figure: its span centred on the figure.
        expect(k.left + t.left).toBeCloseTo(0, 12);
        expect(Math.abs(k.left - t.left)).toBeCloseTo(layout.throwX[0] - layout.catchX[0], 12);
      } else if (h.part % 2 === 0) {
        expect([k.left, t.left].map((v) => +v.toFixed(9))).toEqual([0.45, 0.2]);
      } else {
        expect([k.left, t.left].map((v) => +v.toFixed(9))).toEqual([-0.45, -0.2]);
      }
    }
  });
});

describe('the ring’s frame', () => {
  test('a ball mid-pass between two figures: ground point halfway, height as on the line', () => {
    const schedule = buildSchedule(FOUR);
    const seg = single(schedule);
    const pass = schedule.events.find((e) => e.kind === 'throw' && e.ball !== null && Math.floor(e.part / 2) !== Math.floor(catchPart(schedule, e) / 2));
    expect(pass).toBeDefined();
    const e = pass!;
    const d = Math.min(layout.dwellBeats * schedule.grids[catchPart(schedule, e)]!.spacing, layout.maxDwellShare * e.flight);
    const air = (e.flight - d) * LEN;
    const now = e.pulse * LEN + air / 2;
    const colour = ballColours([seg])[0]!.get(e.ball as number);
    const ring = jugglerFrame([seg], now, layout, undefined, 'ring');
    const line = jugglerFrame([seg], now, layout);
    const ball = ring.balls.find((b) => b.ball === colour)!;
    const flat = line.balls.find((b) => b.ball === colour)!;
    expect(ball.held).toBeNull();
    const from = handPlaces(4, layout, 'ring')[e.part]!;
    const to = handPlaces(4, layout, 'ring')[catchPart(schedule, e)]!;
    expect(from.throwZ).not.toBeCloseTo(to.catchZ, 3);
    expect(ball.z).toBeCloseTo((from.throwZ + to.catchZ) / 2, 9);
    expect(ball.x).toBeCloseTo((from.throwX + to.catchX) / 2, 9);
    expect(ball.y).toBe(flat.y);
    expect(ball.y).toBeCloseTo((layout.g * air * air) / 8, 9);
  });

  test('every ball and fault of the ring is the line’s, but for its ground point', () => {
    for (const f of lineFixtures()) {
      for (const t of f.times) {
        const ring = jugglerFrame(f.segments, t, layout, f.lookup, 'ring');
        const line = jugglerFrame(f.segments, t, layout, f.lookup);
        const strip = <T extends object>(xs: readonly T[], drop: string[]) =>
          xs.map((b) => Object.fromEntries(Object.entries(b).filter(([k]) => !drop.includes(k))));
        expect(strip(ring.balls, ['x', 'z'])).toEqual(strip(line.balls, ['x', 'z']));
        expect(strip(ring.faults, ['x0', 'x1', 'z0', 'z1'])).toEqual(strip(line.faults, ['x0', 'x1', 'z0', 'z1']));
        expect([ring.inhuman, ring.parts, ring.bounds.top, ring.bounds.bottom]).toEqual([line.inhuman, line.parts, line.bounds.top, line.bounds.bottom]);
        // Every ball inside the bounds, across and in depth.
        for (const b of ring.balls) {
          expect(b.x).toBeGreaterThanOrEqual(ring.bounds.left);
          expect(b.x).toBeLessThanOrEqual(ring.bounds.right);
          expect(b.z).toBeGreaterThanOrEqual(ring.bounds.near);
          expect(b.z).toBeLessThanOrEqual(ring.bounds.far);
        }
      }
    }
  });

  test('a held ball rides its hand’s span from the catch point to the throw point', () => {
    const seg = single(buildSchedule(FOUR));
    const hands = handPlaces(4, layout, 'ring');
    let held = 0;
    for (let t = 0; t < 4; t += 0.07) {
      for (const b of jugglerFrame([seg], t, layout, undefined, 'ring').balls) {
        if (b.held === null) continue;
        held++;
        const h = hands[b.held]!;
        // On the segment: collinear, between the ends.
        const cross = (h.throwX - h.catchX) * (b.z - h.catchZ) - (h.throwZ - h.catchZ) * (b.x - h.catchX);
        expect(cross).toBeCloseTo(0, 9);
        const dot = (b.x - h.catchX) * (h.throwX - h.catchX) + (b.z - h.catchZ) * (h.throwZ - h.catchZ);
        expect(dot).toBeGreaterThanOrEqual(-1e-9);
        expect(dot).toBeLessThanOrEqual(Math.hypot(h.throwX - h.catchX, h.throwZ - h.catchZ) ** 2 + 1e-9);
      }
    }
    expect(held).toBeGreaterThan(0);
  });

  test('fault arcs run from the thrower’s throw point to the catcher’s catch point, on the ground too', () => {
    const f = lineFixtures().find((x) => x.lookup)!;
    const frame = jugglerFrame(f.segments, f.times[0]!, layout, f.lookup, 'ring');
    const hands = handPlaces(2, layout, 'ring');
    expect(frame.faults.length).toBeGreaterThan(0);
    for (const a of frame.faults) {
      expect(hands.some((h) => h.throwX === a.x0 && h.throwZ === a.z0)).toBe(true);
      expect(hands.some((h) => h.catchX === a.x1 && h.catchZ === a.z1)).toBe(true);
    }
  });

  test('the hands are the ring’s hands', () => {
    const frame = jugglerFrame([single(buildSchedule(FOUR))], 1, layout, undefined, 'ring');
    expect(frame.hands).toEqual(handPlaces(4, layout, 'ring'));
    expect(jugglerFrame([], 0, layout, undefined, 'ring').hands).toEqual(handPlaces(2, layout, 'ring'));
  });
});

describe('near and far', () => {
  const bounds = (segments: readonly Segment[], t: number) => jugglerFrame(segments, t, layout, undefined, 'ring').bounds;

  test('the line: a ball radius either side of z = 0', () => {
    expect(jugglerFrame([single(buildSchedule(FOUR))], 1, layout).bounds).toMatchObject({ near: -R, far: R });
    expect(jugglerFrame([], 0, layout).bounds).toMatchObject({ near: -R, far: R });
  });

  test('the ring: every hand point, a radius included, across and in depth', () => {
    const one = bounds([single(scheduleOf('3'))], 1);
    expect(one.near).toBeCloseTo(-R, 12);
    expect(one.far).toBeCloseTo(R, 12);
    expect(one.left).toBeCloseTo(-0.45 - R, 12);
    expect(one.right).toBeCloseTo(0.45 + R, 12);
    // Two figures face to face: the hand lines run in depth, ±0.45 m.
    const two = bounds([single(buildSchedule(FOUR))], 1);
    expect(two.near).toBeCloseTo(-0.45 - R, 12);
    expect(two.far).toBeCloseTo(0.45 + R, 12);
    expect(two.left).toBeCloseTo(-S / 2 - R, 12);
    expect(two.right).toBeCloseTo(S / 2 + R, 12);
    // Three figures (five parts): the back figure's centre and the front pair's hands.
    const five = jugglerFrame([single(buildSchedule(lineParts(['1x2', '1x3', '1x4', '1x5', '1x1'], { a: 1, b: 1 })))], 1, layout, undefined, 'ring');
    expect(five.parts).toBe(5);
    const zs = handPlaces(5, layout, 'ring').flatMap((h) => [h.catchZ, h.throwZ]);
    expect(five.bounds.near).toBeCloseTo(Math.min(...zs) - R, 12);
    expect(five.bounds.far).toBeCloseTo(Math.max(...zs) + R, 12);
  });

  test('eased over a part-count switch, as the bounds across are', () => {
    const two = scheduleOf('3');
    const four = buildSchedule(FOUR);
    const B = two.cycle * 4;
    const segments: Segment[] = [
      { schedule: two, startTime: 0, pulseLen: LEN, endTime: B * LEN, carry: new Map() },
      { schedule: four, startTime: B * LEN, pulseLen: LEN, endTime: null, carry: new Map() },
    ];
    expect(bounds(segments, 0).near).toBeCloseTo(-R, 12);
    expect(bounds(segments, B * LEN + 1).near).toBeCloseTo(-0.45 - R, 12);
    expect(bounds(segments, B * LEN + 1).far).toBeCloseTo(0.45 + R, 12);
    let prev = bounds(segments, 0);
    for (let t = 0; t < B * LEN + 3; t += 0.01) {
      const b = bounds(segments, t);
      expect(Math.abs(b.near - prev.near), `at ${t}`).toBeLessThan(0.05);
      expect(Math.abs(b.far - prev.far), `at ${t}`).toBeLessThan(0.05);
      prev = b;
    }
  });
});

describe('a carried flight across a part-count switch on the ring (ruling 13, fix round 1)', () => {
  const three = () => buildSchedule(lineParts(['1x2', '1x3', '1x1'], { a: 1, b: 1 }));
  /**
   * The segments as the player shows them at `t`: the next segment exists only from
   * LOOKAHEAD_SECONDS before its boundary (`player.queue` lands a change at the first cycle
   * boundary at or after the scheduled window); before that, the old one plays on, open-ended.
   */
  const queued = (a: Schedule, b: Schedule) => {
    const B = a.cycle * b.cycle * 2;
    const tB = B * LEN;
    const carry = carryOver(a, b, B);
    expect(carry.size).toBeGreaterThan(0);
    const both: Segment[] = [
      { schedule: a, startTime: 0, pulseLen: LEN, endTime: tB, carry: new Map() },
      { schedule: b, startTime: tB, pulseLen: LEN, endTime: null, carry },
    ];
    const alone: Segment[] = [{ ...both[0]!, endTime: null }];
    return { tB, at: (t: number) => (t < tB - LOOKAHEAD_SECONDS ? alone : both) };
  };
  /** The largest step any ball (by colour) takes between frames 2 ms apart, 3 s either side of the switch, but for the step onto the boundary. */
  const worstStep = ({ tB, at }: ReturnType<typeof queued>, placement: 'line' | 'ring') => {
    let worst = 0;
    let prev = new Map<number, { x: number; y: number; z: number }>();
    let prevT = -Infinity;
    for (let k = 0; k <= 3000; k++) {
      const t = tB - 3 + k * 2e-3;
      const frame = jugglerFrame(at(t), t, layout, undefined, placement);
      const now = new Map(frame.balls.map((b) => [b.ball, b]));
      const cut = prevT < tB && t >= tB;
      for (const [ball, b] of now) {
        const p = prev.get(ball);
        if (p && !cut) worst = Math.max(worst, Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z));
      }
      prev = now;
      prevT = t;
    }
    return worst;
  };
  // A ball at its fastest (a 5 m/s throw) moves 0.01 m in 2 ms; the bound is five times that,
  // far under the 0.78 m a retarget mid-air or a catch in the old picture moved a ball.
  const BOUND = 0.05;

  test.each([
    ['2 → 3 parts', () => queued(scheduleOf('3'), three())],
    ['4 → 2 parts', () => queued(buildSchedule(FOUR), scheduleOf('3'))],
    ['2 → 4 parts', () => queued(scheduleOf('3'), buildSchedule(FOUR))],
    ['3 → 2 parts', () => queued(three(), scheduleOf('3'))],
  ])('%s, queued as late as the player queues it: no ball jumps but at the boundary', (_, make) => {
    const sw = make();
    expect(worstStep(sw, 'line')).toBeLessThan(BOUND);
    expect(worstStep(sw, 'ring')).toBeLessThan(BOUND);
  });

  test('before the boundary a crossing flight aims at the thrower’s picture; from it, at the new one’s', () => {
    const { tB, at } = queued(scheduleOf('3'), three());
    const before = jugglerFrame(at(tB - 1e-3), tB - 1e-3, layout, undefined, 'ring');
    const early = jugglerFrame(at(tB - 0.5), tB - 0.5, layout, undefined, 'ring');
    const after = jugglerFrame(at(tB), tB, layout, undefined, 'ring');
    const two = handPlaces(2, layout, 'ring');
    const threes = handPlaces(3, layout, 'ring');
    // Before: every ball on the old picture's hands' lines (z = 0 for one figure facing the camera).
    for (const f of [early, before]) expect(f.balls.every((b) => Math.abs(b.z) < 1e-9)).toBe(true);
    expect(two.every((h) => h.catchZ === 0)).toBe(true);
    // From the boundary: some ball has left the old picture's line, toward a hand of the new one.
    expect(after.balls.some((b) => Math.abs(b.z) > 1e-6)).toBe(true);
    expect(threes.some((h) => Math.abs(h.catchZ) > 0.1)).toBe(true);
  });

  test('every ball inside the ring’s bounds through the switch', () => {
    for (const sw of [queued(scheduleOf('3'), three()), queued(buildSchedule(FOUR), scheduleOf('3')), queued(scheduleOf('3'), buildSchedule(FOUR))]) {
      for (let t = sw.tB - 4; t < sw.tB + 4; t += 0.01) {
        const { balls, bounds } = jugglerFrame(sw.at(t), t, layout, undefined, 'ring');
        for (const b of balls) {
          expect(b.x).toBeGreaterThanOrEqual(bounds.left - 1e-9);
          expect(b.x).toBeLessThanOrEqual(bounds.right + 1e-9);
          expect(b.z).toBeGreaterThanOrEqual(bounds.near - 1e-9);
          expect(b.z).toBeLessThanOrEqual(bounds.far + 1e-9);
        }
      }
    }
  });
});

describe('the figures in the frame (R1 review, ruling 14)', () => {
  test('the ring: ringFigures, with each figure’s index and first part', () => {
    expect(figurePlaces(5, layout, 'ring')).toEqual(ringFigures(3, layout).map((f, figure) => ({ ...f, figure, part: figure * 2 })));
    expect(figurePlaces(1, layout, 'ring')).toEqual([{ ...ringFigures(1, layout)[0]!, figure: 0, part: 0 }]);
  });

  test('the line: centred on each figure’s hands at today’s x, facing the camera', () => {
    const line = figurePlaces(5, layout);
    expect(line.map((f) => f.centre.x)).toEqual(figureSpans(5, layout).map((s) => (s.left + s.right) / 2));
    expect(line.every((f) => f.centre.z === 0 && f.facing.x === 0 && f.facing.z === -1)).toBe(true);
    expect(line.map((f) => [f.figure, f.part])).toEqual([[0, 0], [1, 2], [2, 4]]);
    expect(figurePlaces(2, layout, 'line')).toEqual(line.slice(0, 1));
  });

  test('the playing picture’s figures, cut over at the boundary', () => {
    const two = scheduleOf('3');
    const four = buildSchedule(FOUR);
    const B = two.cycle * 4;
    const segments: Segment[] = [
      { schedule: two, startTime: 0, pulseLen: LEN, endTime: B * LEN, carry: new Map() },
      { schedule: four, startTime: B * LEN, pulseLen: LEN, endTime: null, carry: new Map() },
    ];
    for (const placement of ['line', 'ring'] as const) {
      expect(jugglerFrame(segments, B * LEN - 1e-6, layout, undefined, placement).figures).toEqual(figurePlaces(2, layout, placement));
      expect(jugglerFrame(segments, B * LEN, layout, undefined, placement).figures).toEqual(figurePlaces(4, layout, placement));
      expect(jugglerFrame([], 0, layout, undefined, placement).figures).toEqual(figurePlaces(2, layout, placement));
    }
    // Ended and nothing after it: the last picture's.
    const ended: Segment[] = [{ schedule: four, startTime: 0, pulseLen: LEN, endTime: 1, carry: new Map() }];
    expect(jugglerFrame(ended, 2, layout, undefined, 'ring').figures).toHaveLength(2);
  });
});
