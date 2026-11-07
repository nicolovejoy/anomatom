// SPEC §4.1 (v6.8): the juggler in 3D, described. Pure: no DOM, no three.js, no timers. From a
// `JugglerFrame` made with the ring placement it says what sits where (a sphere per ball, a flat
// disc per hand, a capsule per figure, a floor circle, fault arcs as polylines), the default
// camera (ruling 4), and where a world point lands on the canvas for that camera, for the
// captions (ruling 9). `src/app/juggler-3d.browser.ts` copies this into a three.js scene.
//
// Render space is three.js's: x to the right, y up, z toward the default front camera. The frame's
// z runs away from that camera, so a point (x, y, z) of the frame is (x, y, −z) here. y = 0 is the
// height of the hands, as in the frame; the floor is `floorMetres` under it.
import type { PartIndex } from '../core/types';
import { BALL_COLOURS, JUGGLER, VIEW3D } from '../tunables';
import { defaultOrbit, orbitPosition, type Orbit } from './camera3d';
import { partColour } from './colours';
import type { JugglerFrame } from './juggler';

export type Vec3 = readonly [number, number, number];

type Widen<T> = T extends number ? number : T extends string ? string : T;
/** The VIEW3D tunables, any values (tests vary them). */
export type View3DLayout = { readonly [K in keyof typeof VIEW3D]: Widen<(typeof VIEW3D)[K]> };

/** A frame point (z away from the camera) in render space (z toward it). */
export const toRender = (x: number, y: number, z: number): Vec3 => [x, y, -z];

export interface Ball3D {
  /** Colour index, as the frame's. */
  readonly ball: number;
  readonly colour: string;
  readonly at: Vec3;
  readonly radius: number;
  /** `JUGGLER.inhumanAlpha` on a flight longer than a human throw, else 1. */
  readonly opacity: number;
  /** The frame's flash, 0 to 1: the sphere glows white by this much. */
  readonly flash: number;
}

/** A hand: a flat disc centred on its catch-to-throw span, long axis turned `yaw` about y from +x. */
export interface Hand3D {
  readonly part: PartIndex;
  readonly colour: string;
  readonly centre: Vec3;
  /** Along the span: the span and a ball radius past each end. */
  readonly length: number;
  readonly width: number;
  readonly thickness: number;
  /** Radians about +y: three's `rotation.y`, which turns +x to (cos yaw, 0, −sin yaw). */
  readonly yaw: number;
}

/** A figure: a plain capsule standing on the floor at `base`, this tall and this thick. */
export interface Body3D {
  readonly figure: number;
  readonly part: PartIndex;
  readonly base: Vec3;
  readonly radius: number;
  readonly height: number;
}

export interface Floor3D {
  readonly centre: Vec3;
  readonly radius: number;
}

/** A fault arc: `faultSegments` + 1 points of its parabola. */
export interface Fault3D {
  readonly points: readonly Vec3[];
  readonly opacity: number;
}

/** A perspective camera, as three's PerspectiveCamera: at `position`, looking at `target`, y up, `fovDeg` vertical. */
export interface Camera3D {
  readonly position: Vec3;
  readonly target: Vec3;
  readonly fovDeg: number;
  readonly aspect: number;
  readonly near: number;
  readonly far: number;
}

export interface Scene3D {
  readonly balls: readonly Ball3D[];
  readonly hands: readonly Hand3D[];
  readonly bodies: readonly Body3D[];
  readonly floor: Floor3D;
  readonly faults: readonly Fault3D[];
  readonly camera: Camera3D;
}

/** The box the default camera fits, in frame coordinates (z away from the camera). */
export interface Box3D {
  readonly left: number;
  readonly right: number;
  readonly bottom: number;
  readonly top: number;
  readonly near: number;
  readonly far: number;
}

/**
 * The floor circle (ruling 8): centred among the figures' bodies, reaching `floorMarginMetres`
 * past the outermost one; in render space, at the floor's height.
 */
export function floorOf(frame: JugglerFrame, view: View3DLayout = VIEW3D): Floor3D {
  const bases = frame.figures.map((f) => [f.centre.x - f.facing.x * view.bodyBackMetres, f.centre.z - f.facing.z * view.bodyBackMetres] as const);
  const n = Math.max(bases.length, 1);
  const cx = bases.reduce((s, b) => s + b[0], 0) / n;
  const cz = bases.reduce((s, b) => s + b[1], 0) / n;
  const reach = Math.max(0, ...bases.map((b) => Math.hypot(b[0] - cx, b[1] - cz)));
  return { centre: toRender(cx, -view.floorMetres, cz), radius: reach + view.bodyRadius + view.floorMarginMetres };
}

/**
 * What the camera frames: the frame's bounds (every hand and ball, eased over a switch), widened
 * across and in depth by a body's reach behind its hands and to hold the floor circle, from the
 * floor up to the shoulders or the highest apex. The floor cuts at a switch with the figures; the
 * camera's own easing (`easeFraming`) keeps the view from popping.
 */
export function sceneBox(frame: JugglerFrame, view: View3DLayout = VIEW3D): Box3D {
  const { left, right, near, far, top } = frame.bounds;
  const reach = view.bodyBackMetres + view.bodyRadius;
  const floor = floorOf(frame, view);
  const [fx, , fz] = floor.centre;
  // The floor's centre in frame depth (away from the camera) is −fz.
  return {
    left: Math.min(left - reach, fx - floor.radius),
    right: Math.max(right + reach, fx + floor.radius),
    near: Math.min(near - reach, -fz - floor.radius),
    far: Math.max(far + reach, -fz + floor.radius),
    bottom: -view.floorMetres,
    top: Math.max(top, view.shoulderMetres),
  };
}

/** What the default camera is aimed and fitted from: a box, and how far it is turned round toward juggler 1. */
export interface Framing {
  readonly box: Box3D;
  readonly azimuthDeg: number;
}

/** The framing a frame asks for: its box, and `twoAzimuthDeg` for two figures, else 0 (ruling 4). */
export function targetFraming(frame: JugglerFrame, view: View3DLayout = VIEW3D): Framing {
  return { box: sceneBox(frame, view), azimuthDeg: frame.figures.length === 2 ? view.twoAzimuthDeg : 0 };
}

/**
 * The camera's framing, eased (fix round 1, "the camera never pops"): `prev` moves toward
 * `target` by 1 − e^(−dt/framingEaseSeconds), dt the audio clock's step since `prev` was
 * eased. None before: the target. No step (paused) or a step back: `prev` unchanged. Within
 * `framingSnap` of the target everywhere: the target, so a still scene settles exactly.
 */
export function easeFraming(prev: Framing | null, target: Framing, dt: number, view: View3DLayout = VIEW3D): Framing {
  if (!prev) return target;
  if (!(dt > 0)) return prev;
  const k = 1 - Math.exp(-dt / view.framingEaseSeconds);
  const keys = ['left', 'right', 'bottom', 'top', 'near', 'far'] as const;
  const box = Object.fromEntries(keys.map((key) => [key, prev.box[key] + (target.box[key] - prev.box[key]) * k])) as unknown as Box3D;
  const eased = { box, azimuthDeg: prev.azimuthDeg + (target.azimuthDeg - prev.azimuthDeg) * k };
  const settled =
    keys.every((key) => Math.abs(eased.box[key] - target.box[key]) < view.framingSnap) && Math.abs(eased.azimuthDeg - target.azimuthDeg) < view.framingSnap;
  return settled ? target : eased;
}

const RAD = Math.PI / 180;
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: Vec3): Vec3 => {
  const n = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / n, a[1] / n, a[2] / n];
};

/** The camera's axes, as three's `lookAt` makes them with y up: right, up, and back (from the target to the eye). */
function axes(camera: Pick<Camera3D, 'position' | 'target'>): { right: Vec3; up: Vec3; back: Vec3 } {
  const back = unit(sub(camera.position, camera.target));
  const right = unit(cross([0, 1, 0], back));
  return { right, up: cross(back, right), back };
}

/**
 * The default camera (ruling 4): `cameraMetres` from the box's centre, raised `elevationDeg`;
 * from the front for one figure and for three or more; for two (face to face along x), turned
 * `twoAzimuthDeg` round toward juggler 1, on the left, so one is seen three-quarter front and the
 * other three-quarter back. The vertical field of view is the least that shows every corner of
 * the box at the canvas's aspect, with `fitMargin` to spare.
 */
export function defaultCamera(frame: JugglerFrame, aspect: number, view: View3DLayout = VIEW3D): Camera3D {
  return cameraFor(targetFraming(frame, view), aspect, view);
}

/** The centre of a framing's box, in render space: what every camera, the default or the reader's, looks at and turns round. */
export function framingCentre({ box }: Framing): Vec3 {
  return toRender((box.left + box.right) / 2, (box.bottom + box.top) / 2, (box.near + box.far) / 2);
}

/**
 * The camera for a framing: aimed at its box's centre, turned `azimuthDeg`, the fov fitted to the
 * box (see `defaultCamera`). With the reader's `orbit` (v6.8 T2) it is placed there instead, round
 * the same centre, with the default camera's fov, so a pinch moves it nearer or farther.
 */
export function cameraFor(framing: Framing, aspect: number, view: View3DLayout = VIEW3D, orbit?: Orbit): Camera3D {
  const { box } = framing;
  const target = framingCentre(framing);
  const fitted = orbitPosition(target, defaultOrbit(framing, view));
  const position = orbit ? orbitPosition(target, orbit) : fitted;
  const { right, up, back } = axes({ position: fitted, target });
  let tan = 0;
  for (const x of [box.left, box.right]) {
    for (const y of [box.bottom, box.top]) {
      for (const z of [box.near, box.far]) {
        const v = sub(toRender(x, y, z), fitted);
        const depth = -dot(v, back);
        tan = Math.max(tan, Math.abs(dot(v, up)) / depth, Math.abs(dot(v, right)) / (depth * aspect));
      }
    }
  }
  const fovDeg = (2 * Math.atan(tan / (1 - view.fitMargin))) / RAD;
  return { position, target, fovDeg, aspect, near: view.near, far: view.far };
}

/**
 * Where render-space point `p` lands on a `width` × `height` canvas, in pixels from the top left,
 * for `camera`: the perspective three's PerspectiveCamera makes (zoom 1, no view offset), and the
 * point's depth in front of the camera.
 */
export function project(camera: Camera3D, p: Vec3, width: number, height: number): { x: number; y: number; depth: number } {
  const { right, up, back } = axes(camera);
  const v = sub(p, camera.position);
  const depth = -dot(v, back);
  const tan = Math.tan((camera.fovDeg / 2) * RAD);
  const ndcX = dot(v, right) / (depth * tan * camera.aspect);
  const ndcY = dot(v, up) / (depth * tan);
  return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height, depth };
}

/** The scene of `frame` on a canvas of aspect `aspect` (width / height), seen with `framing` (the frame's own, unless eased), from the reader's `orbit` if they moved the camera. */
export function describeScene(
  frame: JugglerFrame,
  aspect: number,
  view: View3DLayout = VIEW3D,
  framing: Framing = targetFraming(frame, view),
  orbit?: Orbit,
): Scene3D {
  const r = JUGGLER.radius;
  const balls = frame.balls.map((b) => ({
    ball: b.ball,
    colour: BALL_COLOURS[b.ball % BALL_COLOURS.length] as string,
    at: toRender(b.x, b.y, b.z),
    radius: r,
    opacity: b.inhuman ? JUGGLER.inhumanAlpha : 1,
    flash: b.flash,
  }));
  const handY = -(r + view.discGapMetres + view.discThicknessMetres / 2);
  const hands = frame.hands.map((h) => {
    const dx = h.throwX - h.catchX;
    const dz = h.throwZ - h.catchZ;
    return {
      part: h.part,
      colour: frame.parts > 2 ? partColour(h.part) : JUGGLER.hand,
      centre: toRender((h.catchX + h.throwX) / 2, handY, (h.catchZ + h.throwZ) / 2),
      length: Math.hypot(dx, dz) + 2 * r,
      width: view.discWidthMetres,
      thickness: view.discThicknessMetres,
      // The span (dx, dz) is (dx, −dz) in render space, and rotation.y turns +x to (cos, 0, −sin).
      yaw: Math.atan2(dz, dx),
    };
  });
  const floorY = -view.floorMetres;
  const bodies = frame.figures.map((f) => ({
    figure: f.figure,
    part: f.part,
    base: toRender(f.centre.x - f.facing.x * view.bodyBackMetres, floorY, f.centre.z - f.facing.z * view.bodyBackMetres),
    radius: view.bodyRadius,
    height: view.floorMetres + view.shoulderMetres,
  }));
  const floor = floorOf(frame, view);
  const faults = frame.faults.map((a) => ({
    points: Array.from({ length: view.faultSegments + 1 }, (_, k) => {
      const s = k / view.faultSegments;
      return toRender(a.x0 + (a.x1 - a.x0) * s, 4 * a.apex * s * (1 - s), a.z0 + (a.z1 - a.z0) * s);
    }),
    opacity: a.inhuman ? JUGGLER.inhumanAlpha : 1,
  }));
  return { balls, hands, bodies, floor, faults, camera: cameraFor(framing, aspect, view, orbit) };
}

/**
 * A ball's drawn radius (fix round 1): its own `radius`, but never under `minPx` on a canvas
 * `height` pixels tall, as the 2D view's `JUGGLER.minRadiusPx`: at depth D a metre spans
 * height / (2·D·tan(fov/2)) pixels.
 */
export function ballRadius(camera: Camera3D, at: Vec3, radius: number, height: number, minPx: number = JUGGLER.minRadiusPx): number {
  const { depth } = project(camera, at, 1, height);
  const pxPerMetre = height / (2 * depth * Math.tan((camera.fovDeg / 2) * RAD));
  return Math.max(radius, minPx / pxPerMetre);
}

/** A caption's box on the canvas, in pixels, with its figure, its first part and that part's colour. */
export interface Caption3D {
  readonly figure: number;
  readonly part: PartIndex;
  readonly colour: string;
  readonly text: string;
  /** The x its text is centred on (the box's middle): the foot's, unless pulled inside the canvas. */
  readonly centre: number;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The captions (ruling 9), for more than two parts as in 2D: each figure's `label`, centred
 * (the mount centres the text on `centre`) under its projected foot, `captionOffsetPx` down, as tall as the 2D caption's font
 * (`JUGGLER.captionFontPx`) and `captionCharPx` a character wide (an estimate for the UI font at
 * 12 px, whose widest caption, "Juggler 5", measures about 52 px against 63 here). Kept inside
 * the canvas. None for two parts or fewer.
 */
export function captions(
  scene: Scene3D,
  parts: number,
  width: number,
  height: number,
  label: (figure: number) => string,
  view: View3DLayout = VIEW3D,
): Caption3D[] {
  if (parts <= 2) return [];
  const h = JUGGLER.captionFontPx;
  return scene.bodies.map((b) => {
    const foot = project(scene.camera, b.base, width, height);
    const text = label(b.figure);
    const w = text.length * view.captionCharPx;
    const left = Math.min(Math.max(foot.x - w / 2, 0), width - w);
    const top = Math.min(Math.max(foot.y + view.captionOffsetPx, 0), height - h);
    return { figure: b.figure, part: b.part, colour: partColour(b.part), text, centre: left + w / 2, left, top, width: w, height: h };
  });
}

/** Whether two caption boxes overlap. */
export const overlaps = (a: Caption3D, b: Caption3D): boolean =>
  a.left < b.left + b.width && b.left < a.left + a.width && a.top < b.top + b.height && b.top < a.top + a.height;

/**
 * A cheap signature of what the scene draws on a `width` × `height` canvas: equal signatures draw
 * the same picture, so the renderer can skip a frame that would not change (one clock, rule 4).
 */
export function signature(scene: Scene3D, width: number, height: number): string {
  const n = (v: number) => v.toFixed(5);
  const v3 = (p: Vec3) => `${n(p[0])},${n(p[1])},${n(p[2])}`;
  return [
    `${width}x${height}`,
    v3(scene.camera.position),
    `${n(scene.camera.fovDeg)}:${n(scene.camera.aspect)}`,
    scene.balls.map((b) => `${b.ball}@${v3(b.at)}:${n(b.flash)}:${b.opacity}`).join(';'),
    scene.hands.map((h) => `${h.part}@${v3(h.centre)}:${h.colour}`).join(';'),
    scene.bodies.map((b) => v3(b.base)).join(';'),
    scene.faults.map((f) => `${v3(f.points[0] as Vec3)}>${v3(f.points[f.points.length >> 1] as Vec3)}>${v3(f.points[f.points.length - 1] as Vec3)}:${f.opacity}`).join(';'),
  ].join('|');
}
