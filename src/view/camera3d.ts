// SPEC §4.1 (v6.8 T2): the reader's camera in 3D, as an orbit round the scene's centre. Pure: no
// DOM, no three.js, no timers. An orbit is an azimuth (degrees round toward juggler 1, on the
// left, as `twoAzimuthDeg`), an elevation (degrees above the centre) and a distance (metres from
// the centre). The default camera is the orbit T1's `cameraFor` places; the reader's, once they
// drag or pinch, is theirs until Reset view or a change in the number of jugglers (ruling 10).
import { VIEW3D } from '../tunables';
import type { Framing, Vec3, View3DLayout } from './scene3d';

export interface Orbit {
  readonly azimuthDeg: number;
  readonly elevationDeg: number;
  readonly distance: number;
}

const RAD = Math.PI / 180;

/** The default camera's orbit for a framing (ruling 4): its turn, `elevationDeg`, `cameraMetres`. */
export function defaultOrbit(framing: Framing, view: View3DLayout = VIEW3D): Orbit {
  return { azimuthDeg: framing.azimuthDeg, elevationDeg: view.elevationDeg, distance: view.cameraMetres };
}

/** Where an orbit puts the camera round `target`, in render space: toward the front (+z), turned toward −x by the azimuth, raised by the elevation. */
export function orbitPosition(target: Vec3, orbit: Orbit): Vec3 {
  const az = orbit.azimuthDeg * RAD;
  const el = orbit.elevationDeg * RAD;
  const d = orbit.distance;
  return [target[0] - d * Math.sin(az) * Math.cos(el), target[1] + d * Math.sin(el), target[2] + d * Math.cos(az) * Math.cos(el)];
}

/** The orbit of a camera at `position` round `target` (the inverse of `orbitPosition`); azimuth in (−180, 180]. */
export function orbitOf(position: Vec3, target: Vec3): Orbit {
  const dx = position[0] - target[0];
  const dy = position[1] - target[1];
  const dz = position[2] - target[2];
  const distance = Math.hypot(dx, dy, dz);
  return { azimuthDeg: Math.atan2(-dx, dz) / RAD, elevationDeg: Math.asin(dy / distance) / RAD, distance };
}

/** Whether two orbits are the same camera, to within `eps` (degrees and metres). */
export function sameOrbit(a: Orbit, b: Orbit, eps = 1e-6): boolean {
  const turn = ((((a.azimuthDeg - b.azimuthDeg) % 360) + 540) % 360) - 180;
  return Math.abs(turn) < eps && Math.abs(a.elevationDeg - b.elevationDeg) < eps && Math.abs(a.distance - b.distance) < eps;
}

/**
 * The reader's camera after a change of pattern (ruling 10): kept while the number of jugglers
 * stays the same (a new card with as many, a tempo or pattern edit), else none, so the default
 * camera for the new figures shows. None in, none out: a reader who never moved it follows the
 * default.
 */
export function keepOrbit(reader: Orbit | null, figuresBefore: number, figuresAfter: number): Orbit | null {
  return figuresBefore === figuresAfter ? reader : null;
}

/** OrbitControls' polar limits, in radians from straight up, for the elevation limits. */
export function polarLimits(view: View3DLayout = VIEW3D): { min: number; max: number } {
  return { min: (90 - view.maxElevationDeg) * RAD, max: (90 - view.minElevationDeg) * RAD };
}

/** The test hook `data-camera`: "azimuth,elevation,distance", whole degrees (azimuth in (−180, 180]) and tenths of a metre. */
export function cameraHook(orbit: Orbit): string {
  let az = Math.round(orbit.azimuthDeg) % 360;
  if (az > 180) az -= 360;
  if (az <= -180) az += 360;
  // `+ 0` folds −0 into 0.
  return `${az + 0},${Math.round(orbit.elevationDeg) + 0},${orbit.distance.toFixed(1)}`;
}
