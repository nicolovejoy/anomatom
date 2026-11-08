// The juggler in 3D (v6.8 T1): three.js glue. It keeps one three.js scene and copies
// `describeScene`'s description into it on each `draw`, called from the mount's `draw(view)` in
// the one requestAnimationFrame loop of src/main.ts: never `setAnimationLoop`, no rAF or timer of
// its own. It renders only when the picture or the canvas size changed (`signature`), so a paused
// juggler costs nothing. Loaded by a dynamic import after the first paint, three.js in its own chunk.
//
// The orbit (v6.8 T2, ruling 10): three's OrbitControls on the canvas, in the same chunk. Its
// pointer and wheel handlers only gather the reader's turn and zoom (their own `update()` calls do
// nothing here); `orbit` applies what was gathered, once a frame, from the mount's `draw`, so the
// camera moves on the one loop and the next `draw` renders it. No damping, no keys, no pan.
import {
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  BufferGeometry,
  Mesh,
  MeshLambertMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  TubeGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { JUGGLER, VIEW3D } from '../tunables';
import { orbitOf, orbitPosition, polarLimits, sameOrbit, type Orbit } from '../view/camera3d';
import { ballRadius, signature, type Scene3D, type Vec3 } from '../view/scene3d';

export interface Juggler3D {
  readonly canvas: HTMLCanvasElement;
  /** Draws `scene` on a `width` × `height` (CSS px) canvas, if it differs from the last drawn. */
  draw(scene: Scene3D, width: number, height: number): void;
  /** Forgets the last picture, so the next `draw` renders (the canvas shown again). */
  invalidate(): void;
  /**
   * Applies the reader's drag, pinch or wheel since the last call to the camera at `current`
   * round `target`, within the limits: the new orbit, or null when they did nothing.
   */
  orbit(target: Vec3, current: Orbit): Orbit | null;
  /** Drops whatever the reader's input has gathered and not yet applied (Reset view). */
  discard(): void;
}

/**
 * OrbitControls whose `update()` only notes that input is waiting: its event handlers call it on
 * every pointer move and wheel tick, and the turn they gather is applied by `step()`, from `draw`.
 */
class FrameOrbit extends OrbitControls {
  waiting = false;
  override update(): boolean {
    this.waiting = true;
    return false;
  }
  step(): void {
    this.waiting = false;
    super.update();
  }
}

/**
 * A 3D juggler on a canvas of its own (class `juggler-3d`), or null when no WebGL context can be
 * made. `onLost` is called once if the context is lost later; the caller then shows 2D for good.
 */
export function createJuggler3D(onLost: () => void): Juggler3D | null {
  const canvas = document.createElement('canvas');
  canvas.className = 'juggler-3d';
  canvas.setAttribute('role', 'img');
  let renderer: WebGLRenderer;
  try {
    // three.js needs WebGL 2. Asked first, so a browser without it costs no three.js error.
    // Transparent, so the captions under it show where nothing is drawn (ruling 9).
    const context = canvas.getContext('webgl2', { antialias: true, alpha: true });
    if (!context) return null;
    try {
      renderer = new WebGLRenderer({ canvas, context, antialias: true, alpha: true });
    } catch {
      // The context was made but three could not use it: let it go rather than leave it alive.
      context.getExtension('WEBGL_lose_context')?.loseContext();
      return null;
    }
  } catch {
    return null;
  }
  renderer.setClearColor(new Color(JUGGLER.background), 0);
  canvas.addEventListener(
    'webglcontextlost',
    () => {
      // The controls' listeners (on the canvas and the document) go with the view.
      controls.dispose();
      try {
        renderer.dispose();
      } catch {
        // A lost context may refuse its own clean-up; the canvas goes anyway.
      }
      onLost();
    },
    { once: true },
  );

  const scene = new Scene();
  scene.add(new HemisphereLight(VIEW3D.skyLight, VIEW3D.groundLight, VIEW3D.hemisphereIntensity));
  const sun = new DirectionalLight(0xffffff, VIEW3D.sunIntensity);
  sun.position.set(...VIEW3D.sunFrom);
  scene.add(sun);
  const camera = new PerspectiveCamera();
  const controls = new FrameOrbit(camera, canvas);
  controls.enablePan = false;
  // grab over the canvas, grabbing mid-drag (v6.9): the controls set it inline, which beats the stylesheet.
  controls.cursorStyle = 'grab';
  controls.enableDamping = false;
  controls.rotateSpeed = VIEW3D.rotateSpeed;
  controls.minDistance = VIEW3D.minDistance;
  controls.maxDistance = VIEW3D.maxDistance;
  const polar = polarLimits();
  controls.minPolarAngle = polar.min;
  controls.maxPolarAngle = polar.max;
  // A drag that starts here never scrolls the page (the stylesheet says so too).
  canvas.style.touchAction = 'none';

  const sphere = new SphereGeometry(1, VIEW3D.sphereWidthSegments, VIEW3D.sphereHeightSegments);
  // A unit cylinder, scaled to an elliptical disc: x the length, z the width, y the thickness.
  const disc = new CylinderGeometry(0.5, 0.5, 1, VIEW3D.discSegments);
  const bodyHeight = VIEW3D.floorMetres + VIEW3D.shoulderMetres;
  const body = new CapsuleGeometry(VIEW3D.bodyRadius, bodyHeight - 2 * VIEW3D.bodyRadius, VIEW3D.bodyCapSegments, VIEW3D.bodySegments);
  const bodyMaterial = new MeshLambertMaterial({ color: VIEW3D.bodyColour, transparent: true, opacity: VIEW3D.bodyOpacity, depthWrite: false });
  const faultMaterial = new MeshLambertMaterial({ color: JUGGLER.fault, emissive: JUGGLER.fault, emissiveIntensity: VIEW3D.faultGlow });
  const faultDim = new MeshLambertMaterial({
    color: JUGGLER.fault,
    emissive: JUGGLER.fault,
    emissiveIntensity: VIEW3D.faultGlow,
    transparent: true,
    opacity: JUGGLER.inhumanAlpha,
  });

  const circle = new BufferGeometry().setFromPoints(
    Array.from({ length: VIEW3D.floorSegments }, (_, k) => {
      const a = (k / VIEW3D.floorSegments) * Math.PI * 2;
      return new Vector3(Math.cos(a), 0, Math.sin(a));
    }),
  );
  const floor = new LineLoop(circle, new LineBasicMaterial({ color: VIEW3D.floorColour }));
  scene.add(floor);

  // Pools: a mesh per ball, hand and body, grown as needed and hidden when unused.
  const pool = (make: () => Mesh) => {
    const meshes: Mesh[] = [];
    return (n: number): Mesh[] => {
      while (meshes.length < n) {
        const m = make();
        meshes.push(m);
        scene.add(m);
      }
      meshes.forEach((m, i) => (m.visible = i < n));
      return meshes.slice(0, n);
    };
  };
  // Every ball's material is transparent from the start, at opacity 1 unless dimmed: three
  // compiles an opaque material with alpha forced to 1, and a later flag flip alone would not
  // recompile it (fix round 1), so a ball on an inhuman flight would never dim.
  const balls = pool(() => new Mesh(sphere, new MeshLambertMaterial({ transparent: true })));
  const hands = pool(() => new Mesh(disc, new MeshLambertMaterial()));
  const bodies = pool(() => new Mesh(body, bodyMaterial));
  const white = new Color(0xffffff);

  let faults: Mesh[] = [];
  let faultKey = '';
  let last = '';

  return {
    canvas,
    invalidate() {
      last = '';
    },
    orbit(target, current) {
      if (!controls.waiting) return null;
      controls.target.set(...target);
      camera.position.set(...orbitPosition(target, current));
      controls.step();
      const next = orbitOf([camera.position.x, camera.position.y, camera.position.z], target);
      return sameOrbit(next, current) ? null : next;
    },
    discard() {
      if (controls.waiting) controls.step();
    },
    draw(s, width, height) {
      const ratio = Math.min(window.devicePixelRatio || 1, VIEW3D.maxPixelRatio);
      const sign = `${ratio}|${signature(s, width, height)}`;
      if (sign === last) return;
      last = sign;
      if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
      const size = renderer.getSize(new Vector2());
      if (size.x !== width || size.y !== height) renderer.setSize(width, height, false);

      const c = s.camera;
      camera.fov = c.fovDeg;
      camera.aspect = c.aspect;
      camera.near = c.near;
      camera.far = c.far;
      camera.position.set(...c.position);
      camera.lookAt(...c.target);
      camera.updateProjectionMatrix();

      balls(s.balls.length).forEach((m, i) => {
        const b = s.balls[i] as Scene3D['balls'][number];
        const mat = m.material as MeshLambertMaterial;
        mat.color.set(b.colour);
        mat.emissive.copy(white).multiplyScalar(b.flash * VIEW3D.flashGlow);
        mat.opacity = b.opacity;
        m.position.set(...b.at);
        // Never under JUGGLER.minRadiusPx on screen, as in 2D.
        m.scale.setScalar(ballRadius(c, b.at, b.radius, height));
      });
      // Test hook: how many ball meshes draw see-through now, read off their materials.
      const dimmed = String(
        balls(s.balls.length).filter((m) => {
          const mat = m.material as MeshLambertMaterial;
          return mat.transparent && mat.opacity < 1;
        }).length,
      );
      if (canvas.dataset.dimmed !== dimmed) canvas.dataset.dimmed = dimmed;
      hands(s.hands.length).forEach((m, i) => {
        const h = s.hands[i] as Scene3D['hands'][number];
        (m.material as MeshLambertMaterial).color.set(h.colour);
        m.position.set(...h.centre);
        m.scale.set(h.length, h.thickness, h.width);
        m.rotation.y = h.yaw;
      });
      bodies(s.bodies.length).forEach((m, i) => {
        const b = s.bodies[i] as Scene3D['bodies'][number];
        m.position.set(b.base[0], b.base[1] + b.height / 2, b.base[2]);
      });
      floor.position.set(...s.floor.centre);
      floor.scale.setScalar(s.floor.radius);

      // Faults change only with the pattern: their tubes are rebuilt then.
      const key = JSON.stringify(s.faults);
      if (key !== faultKey) {
        faultKey = key;
        for (const m of faults) {
          scene.remove(m);
          m.geometry.dispose();
        }
        faults = s.faults.map((f) => {
          const curve = new CatmullRomCurve3(f.points.map((p) => new Vector3(...p)));
          const m = new Mesh(new TubeGeometry(curve, VIEW3D.faultTubeSegments, VIEW3D.faultTubeMetres, VIEW3D.faultTubeSides), f.opacity < 1 ? faultDim : faultMaterial);
          scene.add(m);
          return m;
        });
      }

      renderer.render(scene, camera);
    },
  };
}
