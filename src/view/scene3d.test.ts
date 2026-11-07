// The 3D scene's description (v6.8 T1): what sits where, the default camera, the projection and the captions.
import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, test } from 'vitest';
import { buildSchedule } from '../core';
import { lineFixtures } from '../test/juggler-fixtures';
import { lineParts, scheduleOf } from '../test/schedules';
import { BALL_COLOURS, JUGGLER, VIEW3D } from '../tunables';
import { copy } from '../ui/copy';
import { partColour } from './colours';
import { figurePlaces, handPlaces, jugglerFrame } from './juggler';
import type { JugglerFrame } from './juggler';
import { ballRadius, cameraFor, captions, defaultCamera, describeScene, easeFraming, floorOf, overlaps, project, sceneBox, signature, targetFraming, toRender } from './scene3d';
import type { Camera3D, Vec3 } from './scene3d';
import type { Segment } from './types';

const LEN = 0.25;
const single = (schedule: ReturnType<typeof scheduleOf>): Segment => ({ schedule, startTime: 0, pulseLen: LEN, endTime: null, carry: new Map() });
/** `parts` hands, each passing to the next round the ring: `parts / 2` figures on the ring. */
const ringOf = (parts: number) => buildSchedule(lineParts(Array.from({ length: parts }, (_, i) => `1x${((i + 1) % parts) + 1}`), { a: 1, b: 1 }));
const frameOf = (parts: number, t = 1): JugglerFrame =>
  jugglerFrame([single(parts <= 2 ? scheduleOf('531') : ringOf(parts))], t, JUGGLER, undefined, 'ring');

describe('render space', () => {
  test('x and y as the frame’s, z toward the camera', () => {
    expect(toRender(1, 2, 3)).toEqual([1, 2, -3]);
  });
});

describe('the box the camera frames', () => {
  test('the frame’s bounds, widened by a body’s reach and to hold the floor, from the floor to the shoulders or the apex', () => {
    for (const parts of [2, 4, 6, 8]) {
      const frame = frameOf(parts);
      const box = sceneBox(frame);
      const reach = VIEW3D.bodyBackMetres + VIEW3D.bodyRadius;
      const floor = floorOf(frame);
      const [fx, , fz] = floor.centre;
      expect(box.left).toBeCloseTo(Math.min(frame.bounds.left - reach, fx - floor.radius), 12);
      expect(box.right).toBeCloseTo(Math.max(frame.bounds.right + reach, fx + floor.radius), 12);
      expect(box.near).toBeCloseTo(Math.min(frame.bounds.near - reach, -fz - floor.radius), 12);
      expect(box.far).toBeCloseTo(Math.max(frame.bounds.far + reach, -fz + floor.radius), 12);
      expect(box.left).toBeLessThanOrEqual(frame.bounds.left - reach);
      expect(box.far).toBeGreaterThanOrEqual(frame.bounds.far + reach);
      expect(box.bottom).toBe(-VIEW3D.floorMetres);
      expect(box.top).toBe(Math.max(frame.bounds.top, VIEW3D.shoulderMetres));
    }
    // A low pattern: the shoulders are the top.
    const low = jugglerFrame([single(scheduleOf('1'))], 1, JUGGLER, undefined, 'ring');
    expect(sceneBox(low).top).toBe(VIEW3D.shoulderMetres);
  });

  // Two-count (two figures face to face) and Square (four on a ring): the whole floor circle on the canvas, inside the margin.
  test.each([4, 8].flatMap((parts) => [[390, 300], [390, 200], [1280, 520], [320, 360]].map(([w, h]) => [parts, w!, h!] as const)))(
    '%i parts at %i × %i: the floor circle inside the view, the margin to spare',
    (parts, w, h) => {
      const scene = describeScene(frameOf(parts), w / h);
      const { centre, radius } = scene.floor;
      for (let k = 0; k < 64; k++) {
        const a = (k / 64) * 2 * Math.PI;
        const { x, y } = project(scene.camera, [centre[0] + radius * Math.cos(a), centre[1], centre[2] + radius * Math.sin(a)], w, h);
        expect(Math.abs(x / w - 0.5) * 2).toBeLessThanOrEqual(1 - VIEW3D.fitMargin + 1e-9);
        expect(Math.abs(y / h - 0.5) * 2).toBeLessThanOrEqual(1 - VIEW3D.fitMargin + 1e-9);
      }
    },
  );
});

describe('the eased framing (fix round 1)', () => {
  const a = targetFraming(frameOf(4));
  const b = targetFraming(frameOf(8));

  test('the frame’s own: its box, turned for two figures only', () => {
    expect(a).toEqual({ box: sceneBox(frameOf(4)), azimuthDeg: VIEW3D.twoAzimuthDeg });
    expect(b.azimuthDeg).toBe(0);
    expect(targetFraming(frameOf(2)).azimuthDeg).toBe(0);
    expect(cameraFor(a, 1.5)).toEqual(defaultCamera(frameOf(4), 1.5));
  });

  test('none before: the target; no step or a step back: unchanged', () => {
    expect(easeFraming(null, b, 0)).toBe(b);
    expect(easeFraming(a, b, 0)).toBe(a);
    expect(easeFraming(a, b, -1)).toBe(a);
  });

  test('a step of dt moves 1 − e^(−dt/τ) of the way, box and turn alike', () => {
    const dt = 0.1;
    const k = 1 - Math.exp(-dt / VIEW3D.framingEaseSeconds);
    const e = easeFraming(a, b, dt);
    for (const key of ['left', 'right', 'bottom', 'top', 'near', 'far'] as const) expect(e.box[key]).toBeCloseTo(a.box[key] + (b.box[key] - a.box[key]) * k, 12);
    expect(e.azimuthDeg).toBeCloseTo(VIEW3D.twoAzimuthDeg * (1 - k), 12);
  });

  test('frame by frame the camera never pops, and it settles exactly on the target', () => {
    let f = a;
    let cam = cameraFor(f, 1.5);
    for (let i = 0; i < 600; i++) {
      f = easeFraming(f, b, 1 / 60);
      const next = cameraFor(f, 1.5);
      expect(Math.hypot(...next.position.map((v, j) => v - cam.position[j]!))).toBeLessThan(0.1);
      expect(Math.abs(next.fovDeg - cam.fovDeg)).toBeLessThan(0.5);
      cam = next;
    }
    expect(f).toBe(b);
    // A long step (a hidden tab) lands at once.
    expect(easeFraming(a, b, 100)).toBe(b);
  });

  test('describeScene takes the framing for its camera', () => {
    const half = easeFraming(a, b, VIEW3D.framingEaseSeconds);
    expect(describeScene(frameOf(8), 1.5, VIEW3D, half).camera).toEqual(cameraFor(half, 1.5));
    expect(describeScene(frameOf(8), 1.5).camera).toEqual(defaultCamera(frameOf(8), 1.5));
  });
});

describe('a ball never drawn under minRadiusPx (fix round 1)', () => {
  test('far or on a small canvas: grown to exactly the minimum on screen; near on a large one: its own radius', () => {
    const scene = describeScene(frameOf(8), 390 / 200);
    const c = scene.camera;
    const at = scene.balls[0]!.at;
    const small = ballRadius(c, at, JUGGLER.radius, 200);
    expect(small).toBeGreaterThan(JUGGLER.radius);
    // Seen from the front, a step along x at the ball's depth is a step across the screen.
    const p0 = project(c, at, 390, 200);
    const p1 = project(c, [at[0] + small, at[1], at[2]], 390, 200);
    expect(Math.abs(p1.x - p0.x)).toBeCloseTo(JUGGLER.minRadiusPx, 1);
    const big = describeScene(frameOf(2), 1);
    expect(ballRadius(big.camera, big.balls[0]!.at, JUGGLER.radius, 4000)).toBe(JUGGLER.radius);
    expect(ballRadius(c, at, JUGGLER.radius, 200, 1)).toBe(JUGGLER.radius);
  });
});

describe('the default camera (ruling 4)', () => {
  const offset = (c: Camera3D) => [0, 1, 2].map((i) => (c.position[i] as number) - (c.target[i] as number));

  test.each([2, 6, 8])('%i parts: from the front, raised 20°, 8 m from the centre', (parts) => {
    const c = defaultCamera(frameOf(parts), 1.5);
    const [dx, dy, dz] = offset(c);
    expect(dx).toBeCloseTo(0, 12);
    expect(Math.hypot(dx!, dy!, dz!)).toBeCloseTo(8, 12);
    expect(Math.atan2(dy!, dz!) / (Math.PI / 180)).toBeCloseTo(20, 9);
    expect([c.near, c.far, c.aspect]).toEqual([VIEW3D.near, VIEW3D.far, 1.5]);
  });

  test('two figures: turned 30° toward juggler 1, on the left', () => {
    const frame = frameOf(4);
    expect(frame.figures).toHaveLength(2);
    const [dx, dy, dz] = offset(defaultCamera(frame, 1.5));
    expect(Math.atan2(-dx!, dz!) / (Math.PI / 180)).toBeCloseTo(30, 9);
    expect(Math.atan2(dy!, Math.hypot(dx!, dz!)) / (Math.PI / 180)).toBeCloseTo(20, 9);
    // Juggler 1 stands on the camera's side of the turn.
    expect(frame.figures[0]!.centre.x).toBeLessThan(0);
  });

  test('aimed at the box’s centre', () => {
    const frame = frameOf(6);
    const box = sceneBox(frame);
    expect(defaultCamera(frame, 1).target).toEqual(toRender((box.left + box.right) / 2, (box.bottom + box.top) / 2, (box.near + box.far) / 2));
  });

  const corners = (frame: JugglerFrame): Vec3[] => {
    const b = sceneBox(frame);
    return [b.left, b.right].flatMap((x) => [b.bottom, b.top].flatMap((y) => [b.near, b.far].map((z) => toRender(x, y, z))));
  };

  test.each([
    [2, 390, 300],
    [2, 1280, 400],
    [4, 320, 200],
    [6, 375, 360],
    [8, 1000, 260],
    [10, 390, 200],
  ])('%i parts at %i × %i: every corner of the box on the canvas, the margin to spare, and the fit tight', (parts, w, h) => {
    const frame = frameOf(parts);
    const camera = defaultCamera(frame, w / h);
    let widest = 0;
    for (const p of corners(frame)) {
      const { x, y, depth } = project(camera, p, w, h);
      expect(depth).toBeGreaterThan(camera.near);
      expect(depth).toBeLessThan(camera.far);
      const nx = Math.abs(x / w - 0.5) * 2;
      const ny = Math.abs(y / h - 0.5) * 2;
      expect(nx).toBeLessThanOrEqual(1 - VIEW3D.fitMargin + 1e-9);
      expect(ny).toBeLessThanOrEqual(1 - VIEW3D.fitMargin + 1e-9);
      widest = Math.max(widest, nx, ny);
    }
    expect(widest).toBeCloseTo(1 - VIEW3D.fitMargin, 9);
  });

  test('a margin of another size is kept too', () => {
    const frame = frameOf(4);
    const view = { ...VIEW3D, fitMargin: 0.3 };
    const camera = defaultCamera(frame, 2, view);
    const ys = corners(frame).map((p) => Math.abs(project(camera, p, 200, 100).y / 100 - 0.5) * 2);
    const xs = corners(frame).map((p) => Math.abs(project(camera, p, 200, 100).x / 200 - 0.5) * 2);
    expect(Math.max(...ys, ...xs)).toBeCloseTo(0.7, 9);
  });
});

describe('the projection is three.js’s', () => {
  test.each([
    [2, 390, 260],
    [4, 1280, 520],
    [8, 320, 360],
  ])('%i parts at %i × %i: every ball, hand and foot lands where a PerspectiveCamera puts it', (parts, w, h) => {
    const scene = describeScene(frameOf(parts, 1.3), w / h);
    const c = scene.camera;
    const three = new PerspectiveCamera(c.fovDeg, c.aspect, c.near, c.far);
    three.position.set(...c.position);
    three.lookAt(new Vector3(...c.target));
    three.updateMatrixWorld();
    three.updateProjectionMatrix();
    const points = [...scene.balls.map((b) => b.at), ...scene.hands.map((x) => x.centre), ...scene.bodies.map((b) => b.base)];
    expect(points.length).toBeGreaterThan(4);
    for (const p of points) {
      const ndc = new Vector3(...p).project(three);
      const ours = project(c, p, w, h);
      expect(ours.x).toBeCloseTo(((ndc.x + 1) / 2) * w, 6);
      expect(ours.y).toBeCloseTo(((1 - ndc.y) / 2) * h, 6);
    }
  });
});

describe('what sits where (ruling 8)', () => {
  const frame: JugglerFrame = {
    balls: [
      { ball: 0, x: 0.1, y: 0.5, z: 0.2, held: null, progress: 0.5, flash: 0, inhuman: false },
      { ball: BALL_COLOURS.length + 2, x: -0.3, y: 0, z: 0, held: 0, progress: 0.9, flash: 0.6, inhuman: true },
    ],
    faults: [{ x0: -0.2, x1: 0.45, z0: 0.1, z1: -0.3, apex: 0.8, inhuman: true }],
    inhuman: true,
    bounds: { left: -1, right: 1, bottom: -0.1, top: 1, near: -0.5, far: 0.5 },
    hands: handPlaces(2, JUGGLER, 'ring'),
    parts: 2,
    figures: figurePlaces(2, JUGGLER, 'ring'),
  };

  test('a sphere per ball: its colour, the ball radius, dimmed when inhuman, the flash carried', () => {
    const { balls } = describeScene(frame, 1.5);
    expect(balls).toEqual([
      { ball: 0, colour: BALL_COLOURS[0], at: [0.1, 0.5, -0.2], radius: JUGGLER.radius, opacity: 1, flash: 0 },
      { ball: BALL_COLOURS.length + 2, colour: BALL_COLOURS[2], at: [-0.3, 0, -0], radius: JUGGLER.radius, opacity: JUGGLER.inhumanAlpha, flash: 0.6 },
    ]);
  });

  test('a disc per hand on its span, under a held ball, grey for one figure', () => {
    const { hands } = describeScene(frame, 1.5);
    expect(hands).toHaveLength(2);
    for (const [i, h] of hands.entries()) {
      const place = frame.hands[i]!;
      expect(h.colour).toBe(JUGGLER.hand);
      expect(h.centre[0]).toBeCloseTo((place.catchX + place.throwX) / 2, 12);
      expect(h.centre[1]).toBeCloseTo(-(JUGGLER.radius + VIEW3D.discGapMetres + VIEW3D.discThicknessMetres / 2), 12);
      expect(h.length).toBeCloseTo(Math.abs(place.throwX - place.catchX) + 2 * JUGGLER.radius, 12);
      expect([h.width, h.thickness]).toEqual([VIEW3D.discWidthMetres, VIEW3D.discThicknessMetres]);
    }
  });

  test('more than two parts: each hand in its part’s colour, its long axis along its span', () => {
    const f = frameOf(6);
    const { hands } = describeScene(f, 1.5);
    for (const [i, h] of hands.entries()) {
      const place = f.hands[i]!;
      expect(h.colour).toBe(partColour(h.part));
      // three's rotation.y turns +x to (cos, 0, −sin): that is the span, catch to throw, in render space.
      const span = [place.throwX - place.catchX, -(place.throwZ - place.catchZ)];
      const len = Math.hypot(span[0]!, span[1]!);
      expect(Math.cos(h.yaw)).toBeCloseTo(span[0]! / len, 12);
      expect(-Math.sin(h.yaw)).toBeCloseTo(span[1]! / len, 12);
    }
  });

  test('a capsule per figure, on the floor, just behind its hands, up to the shoulders', () => {
    const f = frameOf(8);
    const { bodies } = describeScene(f, 1.5);
    expect(bodies).toHaveLength(4);
    for (const [i, b] of bodies.entries()) {
      const fig = f.figures[i]!;
      expect([b.figure, b.part]).toEqual([fig.figure, fig.part]);
      expect(b.base[1]).toBe(-VIEW3D.floorMetres);
      expect(b.height).toBeCloseTo(VIEW3D.floorMetres + VIEW3D.shoulderMetres, 12);
      expect(b.radius).toBe(VIEW3D.bodyRadius);
      // Behind: against the facing, bodyBackMetres from the figure's centre.
      const back = { x: b.base[0] - fig.centre.x, z: -b.base[2] - fig.centre.z };
      expect(back.x * fig.facing.x + back.z * fig.facing.z).toBeCloseTo(-VIEW3D.bodyBackMetres, 12);
    }
  });

  test('one floor circle under every body', () => {
    for (const parts of [2, 4, 6, 10]) {
      const { floor, bodies } = describeScene(frameOf(parts), 1.5);
      expect(floor.centre[1]).toBe(-VIEW3D.floorMetres);
      for (const b of bodies) {
        expect(Math.hypot(b.base[0] - floor.centre[0], b.base[2] - floor.centre[2]) + b.radius).toBeLessThan(floor.radius);
      }
    }
    // One figure: the floor centred on its body.
    const one = describeScene(frameOf(2), 1);
    expect(one.floor.radius).toBeCloseTo(VIEW3D.bodyRadius + VIEW3D.floorMarginMetres, 12);
    // No figures at all (never from jugglerFrame): a floor still.
    expect(describeScene({ ...frame, figures: [] }, 1).floor.radius).toBeCloseTo(VIEW3D.bodyRadius + VIEW3D.floorMarginMetres, 12);
  });

  test('a fault arc: 16 segments of its parabola, throw point to catch point, apex in the middle', () => {
    const [arc] = describeScene(frame, 1.5).faults;
    expect(arc!.points).toHaveLength(17);
    expect(arc!.points[0]).toEqual(toRender(-0.2, 0, 0.1));
    expect(arc!.points[16]![0]).toBeCloseTo(0.45, 12);
    expect(arc!.points[16]![1]).toBeCloseTo(0, 12);
    expect(arc!.points[16]![2]).toBeCloseTo(0.3, 12);
    expect(arc!.points[8]![1]).toBeCloseTo(0.8, 12);
    expect(arc!.opacity).toBe(JUGGLER.inhumanAlpha);
    const human = describeScene({ ...frame, faults: [{ ...frame.faults[0]!, inhuman: false }] }, 1).faults[0]!;
    expect(human.opacity).toBe(1);
  });

  test('the fixtures’ faulted pattern draws its faults', () => {
    const f = lineFixtures().find((x) => x.lookup)!;
    const ring = jugglerFrame(f.segments, f.times[0]!, JUGGLER, f.lookup, 'ring');
    expect(describeScene(ring, 1).faults.length).toBe(ring.faults.length);
    expect(ring.faults.length).toBeGreaterThan(0);
  });
});

describe('the captions (ruling 9)', () => {
  const label = copy.jugglerCaption;

  test('none for two parts or fewer', () => {
    expect(captions(describeScene(frameOf(2), 1.5), 2, 390, 300, label)).toEqual([]);
  });

  test('one per figure, its text, in its first part’s colour, at its projected foot', () => {
    const scene = describeScene(frameOf(6), 390 / 300);
    const cs = captions(scene, 6, 390, 300, label);
    expect(cs.map((c) => [c.figure, c.part, c.text, c.colour])).toEqual([0, 1, 2].map((f) => [f, f * 2, label(f), partColour(f * 2)]));
    for (const [i, c] of cs.entries()) {
      const foot = project(scene.camera, scene.bodies[i]!.base, 390, 300);
      expect(c.left + c.width / 2).toBeCloseTo(foot.x, 9);
      // The text is centred on the foot; the box, an over-estimate of it, is centred there too.
      expect(c.centre).toBeCloseTo(foot.x, 9);
      expect(c.top).toBeCloseTo(foot.y + VIEW3D.captionOffsetPx, 9);
      expect([c.width, c.height]).toEqual([label(i).length * VIEW3D.captionCharPx, JUGGLER.captionFontPx]);
    }
  });

  test('kept inside the canvas', () => {
    // A camera that puts the feet off the canvas: every caption is pulled back on.
    const scene = describeScene(frameOf(8), 1);
    const low = { ...scene, camera: { ...scene.camera, fovDeg: 4 } };
    const cs = captions(low, 8, 300, 200, label);
    for (const c of cs) {
      expect(c.left).toBeGreaterThanOrEqual(0);
      expect(c.left + c.width).toBeLessThanOrEqual(300);
      expect(c.top).toBeGreaterThanOrEqual(0);
      expect(c.top + c.height).toBeLessThanOrEqual(200);
    }
    expect(cs.some((c) => c.left === 0 || c.top === 200 - c.height || c.top === 0 || c.left === 300 - c.width)).toBe(true);
  });

  const sizes = [320, 375, 390].flatMap((w) => [200, 360].map((h) => [w, h] as const));
  test.each([2, 3, 4, 5].flatMap((figures) => sizes.map(([w, h]) => [figures, w, h] as const)))(
    '%i figures at %i × %i: no two captions cover each other',
    (figures, w, h) => {
      const parts = figures * 2;
      const scene = describeScene(frameOf(parts), w / h);
      const cs = captions(scene, parts, w, h, label);
      expect(cs).toHaveLength(figures);
      for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) expect(overlaps(cs[i]!, cs[j]!), `${i} and ${j}`).toBe(false);
    },
  );

  test('overlaps: boxes that share area, not boxes that only touch', () => {
    const box = { figure: 0, part: 0, colour: '', text: '', centre: 5, left: 0, top: 0, width: 10, height: 10 };
    expect(overlaps(box, { ...box, left: 5, top: 5 })).toBe(true);
    expect(overlaps(box, { ...box, left: 10 })).toBe(false);
    expect(overlaps(box, { ...box, top: 10 })).toBe(false);
    expect(overlaps(box, { ...box, left: -10 })).toBe(false);
  });
});

describe('the signature', () => {
  test('the same picture signs the same; a moved ball, another size or a change of camera does not', () => {
    const a = describeScene(frameOf(4, 1), 1.5);
    expect(signature(a, 300, 200)).toBe(signature(describeScene(frameOf(4, 1), 1.5), 300, 200));
    expect(signature(a, 300, 200)).not.toBe(signature(describeScene(frameOf(4, 1.01), 1.5), 300, 200));
    expect(signature(a, 300, 200)).not.toBe(signature(a, 301, 200));
    expect(signature(a, 300, 200)).not.toBe(signature(describeScene(frameOf(4, 1), 2), 300, 200));
    const f = lineFixtures().find((x) => x.lookup)!;
    const faulted = describeScene(jugglerFrame(f.segments, f.times[0]!, JUGGLER, f.lookup, 'ring'), 1);
    expect(signature(faulted, 1, 1)).toContain('>');
  });
});
