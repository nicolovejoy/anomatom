// The reader's camera (v6.8 T2, ruling 10): the orbit, its inverse, keeping it over a change of
// pattern, OrbitControls' limits, and the test hook.
import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { describe, expect, test } from 'vitest';
import { buildSchedule } from '../core';
import { lineParts, scheduleOf } from '../test/schedules';
import { JUGGLER, VIEW3D } from '../tunables';
import { cameraHook, defaultOrbit, keepOrbit, orbitOf, orbitPosition, polarLimits, sameOrbit, type Orbit } from './camera3d';
import { jugglerFrame, type JugglerFrame } from './juggler';
import { cameraFor, defaultCamera, describeScene, framingCentre, targetFraming, type Vec3 } from './scene3d';
import type { Segment } from './types';

const single = (schedule: ReturnType<typeof scheduleOf>): Segment => ({ schedule, startTime: 0, pulseLen: 0.25, endTime: null, carry: new Map() });
const ringOf = (parts: number) => buildSchedule(lineParts(Array.from({ length: parts }, (_, i) => `1x${((i + 1) % parts) + 1}`), { a: 1, b: 1 }));
const frameOf = (parts: number): JugglerFrame => jugglerFrame([single(parts <= 2 ? scheduleOf('531') : ringOf(parts))], 1, JUGGLER, undefined, 'ring');
const near = (a: Vec3, b: readonly number[], digits = 9) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, digits));

describe('the limits', () => {
  test('the default distance and elevation lie between them', () => {
    expect(VIEW3D.minDistance).toBeLessThan(VIEW3D.cameraMetres);
    expect(VIEW3D.cameraMetres).toBeLessThan(VIEW3D.maxDistance);
    expect([VIEW3D.minElevationDeg, VIEW3D.maxElevationDeg]).toEqual([5, 80]);
    // A drag the canvas's height turns about 160°, not a full turn.
    expect(VIEW3D.rotateSpeed * 360).toBeCloseTo(162, 0);
    expect(VIEW3D.minElevationDeg).toBeLessThan(VIEW3D.elevationDeg);
    expect(VIEW3D.elevationDeg).toBeLessThan(VIEW3D.maxElevationDeg);
    // The far plane holds the whole scene from the farthest camera.
    expect(VIEW3D.maxDistance + 4).toBeLessThan(VIEW3D.far);
  });

  test('as OrbitControls’ polar angles: 10° to 85° from straight up', () => {
    const { min, max } = polarLimits();
    expect(min).toBeCloseTo((10 * Math.PI) / 180, 12);
    expect(max).toBeCloseTo((85 * Math.PI) / 180, 12);
  });

  test.each([
    [85, 80],
    [1, 5],
    [40, 40],
  ])('OrbitControls with them keeps an elevation of %i° at %i°', (asked, kept) => {
    const camera = new PerspectiveCamera();
    const controls = new OrbitControls(camera);
    const { min, max } = polarLimits();
    controls.minPolarAngle = min;
    controls.maxPolarAngle = max;
    const target: Vec3 = [0.3, -0.2, 0.1];
    controls.target.set(...target);
    camera.position.set(...orbitPosition(target, { azimuthDeg: 50, elevationDeg: asked, distance: 6 }));
    controls.update();
    const after = orbitOf([camera.position.x, camera.position.y, camera.position.z], target);
    expect(after.elevationDeg).toBeCloseTo(kept, 9);
    expect(after.azimuthDeg).toBeCloseTo(50, 9);
    expect(after.distance).toBeCloseTo(6, 9);
  });
});

describe('the orbit', () => {
  test('the default: the framing’s turn, raised 20°, 8 m', () => {
    expect(defaultOrbit(targetFraming(frameOf(4)))).toEqual({ azimuthDeg: 30, elevationDeg: 20, distance: 8 });
    expect(defaultOrbit(targetFraming(frameOf(2)))).toEqual({ azimuthDeg: 0, elevationDeg: 20, distance: 8 });
    expect(defaultOrbit(targetFraming(frameOf(2)), { ...VIEW3D, elevationDeg: 33, cameraMetres: 5 })).toEqual({ azimuthDeg: 0, elevationDeg: 33, distance: 5 });
  });

  test('is where T1 puts the default camera', () => {
    for (const parts of [2, 4, 6, 8]) {
      const frame = frameOf(parts);
      const c = defaultCamera(frame, 1.4);
      near(orbitPosition(c.target, defaultOrbit(targetFraming(frame))), c.position, 12);
    }
  });

  test('from the front, from the left, from above', () => {
    near(orbitPosition([1, 2, 3], { azimuthDeg: 0, elevationDeg: 0, distance: 5 }), [1, 2, 8]);
    near(orbitPosition([0, 0, 0], { azimuthDeg: 90, elevationDeg: 0, distance: 2 }), [-2, 0, 0]);
    near(orbitPosition([0, 0, 0], { azimuthDeg: 0, elevationDeg: 90, distance: 3 }), [0, 3, 0]);
  });

  test.each([
    [30, 20, 8],
    [-170, 5, 3],
    [180, 80, 16],
    [95, 45, 7.5],
  ])('orbitOf undoes orbitPosition: %i°, %i°, %i m', (azimuthDeg, elevationDeg, distance) => {
    const target: Vec3 = [0.4, -0.1, -0.7];
    const back = orbitOf(orbitPosition(target, { azimuthDeg, elevationDeg, distance }), target);
    expect(sameOrbit(back, { azimuthDeg, elevationDeg, distance })).toBe(true);
    expect(back.azimuthDeg).toBeGreaterThan(-180);
    expect(back.azimuthDeg).toBeLessThanOrEqual(180);
  });

  test('the same orbit, to within a hair, a full turn apart or not', () => {
    const a: Orbit = { azimuthDeg: 10, elevationDeg: 20, distance: 8 };
    expect(sameOrbit(a, { ...a, azimuthDeg: 10 + 1e-9 })).toBe(true);
    expect(sameOrbit(a, { ...a, azimuthDeg: 370 })).toBe(true);
    expect(sameOrbit({ ...a, azimuthDeg: 179.9999999 }, { ...a, azimuthDeg: -179.9999999 })).toBe(true);
    expect(sameOrbit(a, { ...a, azimuthDeg: 11 })).toBe(false);
    expect(sameOrbit(a, { ...a, elevationDeg: 21 })).toBe(false);
    expect(sameOrbit(a, { ...a, distance: 8.1 })).toBe(false);
    expect(sameOrbit(a, { ...a, distance: 8.1 }, 0.5)).toBe(true);
  });
});

describe('the camera from the reader’s orbit', () => {
  const frame = frameOf(6);
  const framing = targetFraming(frame);

  test('the default orbit is T1’s camera exactly', () => {
    expect(cameraFor(framing, 1.5, VIEW3D, defaultOrbit(framing))).toEqual(cameraFor(framing, 1.5));
  });

  test('round the same centre, with the default fov, at the reader’s orbit', () => {
    const orbit: Orbit = { azimuthDeg: -120, elevationDeg: 60, distance: 4 };
    const base = cameraFor(framing, 1.5);
    const moved = cameraFor(framing, 1.5, VIEW3D, orbit);
    expect(moved.target).toEqual(base.target);
    expect(framingCentre(framing)).toEqual(base.target);
    expect(moved.fovDeg).toBe(base.fovDeg);
    near(moved.position, orbitPosition(base.target, orbit), 12);
    expect(sameOrbit(orbitOf(moved.position, moved.target), orbit)).toBe(true);
    expect(describeScene(frame, 1.5, VIEW3D, framing, orbit).camera).toEqual(moved);
  });

  test('three.js’s lookAt from there faces the centre', () => {
    const c = cameraFor(framing, 1, VIEW3D, { azimuthDeg: 75, elevationDeg: 50, distance: 10 });
    const camera = new PerspectiveCamera();
    camera.position.set(...c.position);
    camera.lookAt(...c.target);
    const dir = camera.getWorldDirection(new Vector3());
    const to = new Vector3(...c.target).sub(camera.position).normalize();
    expect(dir.dot(to)).toBeCloseTo(1, 9);
  });
});

describe('keeping the reader’s camera over a change (ruling 10)', () => {
  const moved: Orbit = { azimuthDeg: 100, elevationDeg: 40, distance: 5 };
  test('kept while the number of jugglers stays: a new card with as many, a tempo or pattern edit', () => {
    expect(keepOrbit(moved, 2, 2)).toBe(moved);
    expect(keepOrbit(moved, 1, 1)).toBe(moved);
  });
  test('the default when it changes', () => {
    expect(keepOrbit(moved, 2, 1)).toBeNull();
    expect(keepOrbit(moved, 3, 4)).toBeNull();
  });
  test('a reader who never moved it follows the default either way', () => {
    expect(keepOrbit(null, 2, 2)).toBeNull();
    expect(keepOrbit(null, 2, 3)).toBeNull();
  });
});

describe('the test hook data-camera', () => {
  test.each([
    [{ azimuthDeg: 30, elevationDeg: 20, distance: 8 }, '30,20,8.0'],
    [{ azimuthDeg: 0, elevationDeg: 20, distance: 8 }, '0,20,8.0'],
    [{ azimuthDeg: -0.3, elevationDeg: 4.6, distance: 3.04 }, '0,5,3.0'],
    [{ azimuthDeg: 179.6, elevationDeg: 80, distance: 15.96 }, '180,80,16.0'],
    [{ azimuthDeg: -180.4, elevationDeg: 33.4, distance: 7.25 }, '180,33,7.3'],
    [{ azimuthDeg: 400, elevationDeg: 10, distance: 4 }, '40,10,4.0'],
    [{ azimuthDeg: -400, elevationDeg: 10, distance: 4 }, '-40,10,4.0'],
  ])('%o reads %s', (orbit, hook) => {
    expect(cameraHook(orbit)).toBe(hook);
  });
});
