// The juggler region (SPEC §4.1), above the ladder, drawn every frame from the player view, and
// the "not a human throw" label (SPEC §4.1 v2) over it while such a flight is in the air. A
// faulted group's flights come from the model (`flightsOf` of the parts each derived schedule
// was built from), since the Schedule keeps only stand-in flights for them.
//
// Two views (v6.8 T1): the 2D canvas (today's front view, `juggler-canvas.ts`) draws the first
// paint; right after, three.js loads in its own chunk and, once a WebGL context is made, the 3D
// canvas takes the region. If the import fails, no context can be made, or the context is lost
// later, the 2D view shows and stays, unannounced. A small button on the stage switches between
// them; the choice is UI state only, never in the link and never stored. The region's
// `data-view` says which view shows, for the browser tests.
//
// The orbit (v6.8 T2, ruling 10): in 3D a drag turns the camera round the scene's centre, a pinch
// or the wheel moves it nearer or farther; Reset view, beside the switch in 3D, returns it to the
// default camera. A reader who never moved it follows the default (its framing eased as in T1);
// once moved it is theirs, kept over a change of card unless the number of jugglers changes. UI
// state only, never in the link.
import { figureSpans } from '../view/juggler';
import { flightsOf } from '../core';
import type { Flight, Schedule } from '../core';
import { FULL, JUGGLER, VIEW3D } from '../tunables';
import { copy } from '../ui/copy';
import { jugglerFrame } from '../view/juggler';
import { cameraHook, defaultOrbit, keepOrbit, type Orbit } from '../view/camera3d';
import { captions, describeScene, easeFraming, framingCentre, targetFraming, type Framing } from '../view/scene3d';
import type { PlayerView } from '../view/types';
import { createGesture, fullViewEntry, type EntryKind } from './full-view-model';
import { hintShows, hintStart, hintStep, type HintEvent } from './turn-hint-model';
import { drawJuggler } from './juggler-canvas';
import type { Juggler3D } from './juggler-3d.browser';
import type { Mount } from './mount';
import './juggler.css';

type View = '2d' | '3d';

export const mountJuggler: Mount = (root, { store }) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'juggler';
  canvas.setAttribute('role', 'img');
  // The 3D view's captions sit under its (transparent) canvas, so balls and bodies draw over them.
  const labels = document.createElement('div');
  labels.className = 'juggler-captions';
  labels.setAttribute('aria-hidden', 'true');
  labels.hidden = true;
  labels.style.background = JUGGLER.background;
  const note = document.createElement('p');
  note.className = 'juggler-note';
  note.textContent = copy.notHumanThrow(JUGGLER.humanAirtimeSeconds);
  note.hidden = true;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'juggler-switch';
  toggle.hidden = true;
  // Reset view (T2): a small square beside the switch, in 3D only; after it in the page.
  const reset = document.createElement('button');
  reset.type = 'button';
  reset.className = 'juggler-reset';
  reset.hidden = true;
  reset.textContent = copy.resetView.text;
  reset.setAttribute('aria-label', copy.resetView.label);
  reset.title = copy.resetView.label;
  // Full view (v6.9): the third square, after Reset view; shown in both views.
  const full = document.createElement('button');
  full.type = 'button';
  full.className = 'juggler-full';
  // The turn hint (v6.9): text, not a control, under the buttons; its life is `turn-hint-model.ts`.
  const hint = document.createElement('p');
  hint.className = 'juggler-hint';
  hint.setAttribute('aria-hidden', 'true');
  hint.hidden = true;
  hint.textContent = window.matchMedia('(pointer: coarse)').matches ? copy.turnHint.touch : copy.turnHint.mouse;
  let hinting = hintStart;
  const hintNote = (event: HintEvent) => {
    hinting = hintStep(hinting, event);
    hint.hidden = !hintShows(hinting);
  };
  root.append(labels, canvas, note);
  // The switch sits after the deck in the page (fix round 1, keeping v6.6 ruling 10: Tab from
  // About reaches the wheel first), placed over the juggler region's top-right corner by CSS: it
  // shares the stage's grid area, whose top is the juggler region's.
  const deck = root.closest('.play-view')?.querySelector(':scope > .region-deck');
  if (deck) deck.after(toggle, reset, full, hint);
  else root.append(toggle, reset, full, hint);
  // The captions' size is the 2D caption's.
  root.style.setProperty('--juggler-caption-px', `${JUGGLER.captionFontPx}px`);

  // The reader's choice (3D unless they switched) and the 3D view, once it exists.
  let wanted: View = '3d';
  let three: Juggler3D | null = null;
  // The 3D camera's framing, eased on the audio clock (fix round 1); none until 3D draws.
  let framing: Framing | null = null;
  let framedAt = 0;
  // The reader's camera, once they move it (T2); null follows the default. The figures it was moved round.
  let orbit: Orbit | null = null;
  let figures = -1;
  const shown = (): View => (three && wanted === '3d' ? '3d' : '2d');
  const show = () => {
    const view = shown();
    root.dataset.view = view;
    canvas.hidden = view === '3d';
    if (three) {
      three.canvas.hidden = view === '2d';
      three.invalidate();
    }
    // Shown again, the camera starts at the scene's own framing.
    framing = null;
    labels.hidden = view === '2d';
    toggle.hidden = three === null;
    reset.hidden = view === '2d';
    hintNote(view === '3d' ? 'shown3d' : 'hidden3d');
    const other: View = view === '3d' ? '2d' : '3d';
    toggle.textContent = copy.viewSwitch.text[other];
    toggle.setAttribute('aria-label', copy.viewSwitch.label[other]);
  };
  show();
  toggle.addEventListener('click', () => {
    wanted = shown() === '3d' ? '2d' : '3d';
    show();
  });
  // Full view (v6.9): ⤢ gives the jugglers the screen, ⤡ gives it back; the same button, in both views.
  // The same gesture is the reader's first turn, so the hint and full view agree on what a turn is:
  // a move past FULL.dragThresholdPx, a second finger or a wheel tick, never a tap's jitter.
  const enter = (kind: EntryKind) => {
    if (shown() === '3d') hintNote('turned');
    if (!store.get().full && fullViewEntry(kind, shown())) store.set({ full: true });
  };
  const dressFull = () => {
    const on = store.get().full;
    const text = on ? copy.fullView.leave : copy.fullView.enter;
    const label = on ? copy.fullView.leaveLabel : copy.fullView.enterLabel;
    if (full.textContent !== text) full.textContent = text;
    full.setAttribute('aria-label', label);
    full.title = label;
    full.setAttribute('aria-pressed', String(on));
  };
  dressFull();
  full.addEventListener('click', () => store.set({ full: !store.get().full }));
  store.subscribe((state, previous) => state.full !== previous.full && dressFull());
  // A drag, a second finger or a wheel tick on the 3D canvas enters full view and still turns or
  // zooms (OrbitControls hears the same events); a pointerdown or a tap alone changes nothing.
  const gesture = createGesture(FULL.dragThresholdPx);
  const watch = (c: HTMLCanvasElement) => {
    c.addEventListener('pointerdown', (e) => {
      // Only the button that turns the view (pan is off): a right or middle drag turns nothing.
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const g = gesture.down(e.pointerId, e.clientX, e.clientY);
      if (g) enter(g);
    });
    c.addEventListener('contextmenu', () => gesture.clear());
    c.addEventListener('wheel', () => enter('wheel'), { passive: true });
  };
  // Moves can be captured by the canvas or not; the document hears them either way.
  document.addEventListener('pointermove', (e) => {
    const g = gesture.move(e.pointerId, e.clientX, e.clientY);
    if (g) enter(g);
  });
  for (const type of ['pointerup', 'pointercancel'] as const) document.addEventListener(type, (e) => gesture.up(e.pointerId));
  // Back to the default camera for the figures on stage, at once: the next draw shows it.
  reset.addEventListener('click', () => {
    orbit = null;
    three?.discard();
  });

  // Every schedule the store has derived, with the flights of its parts.
  const flights = new WeakMap<Schedule, readonly Flight[]>();
  let label = '';
  const remember = () => {
    const { schedule } = store.derived();
    const { parts } = store.get();
    if (!flights.has(schedule)) flights.set(schedule, flightsOf(parts));
    label = parts.length > 2 ? copy.jugglersLabel(parts.length) : copy.jugglerLabel;
    for (const c of [canvas, three?.canvas]) if (c && c.getAttribute('aria-label') !== label) c.setAttribute('aria-label', label);
  };
  remember();
  store.subscribe(remember);

  // three.js, after the first paint: any failure leaves the 2D view, with no message.
  // Test hook: `data-three` is "loading" until the 3D view exists ("ready") or never will ("none").
  root.dataset.three = 'loading';
  let loading = false;
  const load = () => {
    import('./juggler-3d.browser')
      .then(({ createJuggler3D }) => {
        const made = createJuggler3D(() => {
          made?.canvas.remove();
          three = null;
          root.dataset.three = 'none';
          show();
        });
        if (!made) {
          root.dataset.three = 'none';
          return;
        }
        made.canvas.setAttribute('aria-label', label);
        made.canvas.hidden = true;
        watch(made.canvas);
        canvas.after(made.canvas);
        three = made;
        root.dataset.three = 'ready';
        show();
      })
      .catch(() => (root.dataset.three = 'none'));
  };

  const spans: HTMLSpanElement[] = [];
  const setHook = (c: HTMLCanvasElement, name: 'balls' | 'figures' | 'camera' | 'cameraMoved', value: string) => {
    if (c.dataset[name] !== value) c.dataset[name] = value;
  };

  return {
    draw(view) {
      paint(view);
      // The import is asynchronous: started after the first 2D draw, it lands after that paint.
      if (!loading) {
        loading = true;
        load();
      }
    },
  };

  function paint(view: PlayerView) {
    // Before the first valid edit there is nothing to show; the canvas keeps what it had.
    if (view.segments.length === 0) return;
    const lookup = (s: Schedule) => flights.get(s);
    const frame = jugglerFrame(view.segments, view.now, JUGGLER, lookup);
    // Test hook (SPEC §7.1): how many balls are drawn, so the browser tests can compare views.
    // Kept up while the 2D view is hidden behind the 3D one.
    setHook(canvas, 'balls', String(frame.balls.length));
    // Test hook: how many figures carry a caption (0 below three parts).
    setHook(canvas, 'figures', String(frame.parts > 2 ? figureSpans(frame.parts, JUGGLER).length : 0));
    if (note.hidden === frame.inhuman) note.hidden = !frame.inhuman;
    if (!three || shown() === '2d') {
      drawJuggler(canvas, frame);
      return;
    }

    const ring = jugglerFrame(view.segments, view.now, JUGGLER, lookup, 'ring');
    setHook(three.canvas, 'balls', String(ring.balls.length));
    setHook(three.canvas, 'figures', String(ring.parts > 2 ? ring.figures.length : 0));
    const width = root.clientWidth;
    const height = root.clientHeight;
    // Hidden (About showing) or not laid out yet: nothing to draw.
    if (width === 0 || height === 0) return;
    // Eased by the shown time's steps: playing, the audio clock's; paused, a scrub's, either way;
    // stopped, the picture itself cuts (a card picked), and the camera with it.
    const dt = view.state === 'stopped' ? Infinity : view.state === 'paused' ? Math.abs(view.now - framedAt) : view.now - framedAt;
    framing = easeFraming(framing, targetFraming(ring), dt);
    framedAt = view.now;
    // A change in the number of jugglers resets the reader's camera; anything else keeps it.
    if (ring.figures.length !== figures) {
      orbit = keepOrbit(orbit, figures, ring.figures.length);
      figures = ring.figures.length;
    }
    const aspect = width / height;
    const turned = three.orbit(framingCentre(framing), orbit ?? defaultOrbit(framing));
    if (turned) orbit = turned;
    const scene = describeScene(ring, aspect, VIEW3D, framing, orbit ?? undefined);
    three.draw(scene, width, height);
    // Test hooks (T2): the camera shown, and whether the reader moved it.
    setHook(three.canvas, 'camera', cameraHook(orbit ?? defaultOrbit(framing)));
    setHook(three.canvas, 'cameraMoved', String(orbit !== null));

    const boxes = captions(scene, ring.parts, width, height, copy.jugglerCaption);
    while (spans.length < boxes.length) labels.append((spans[spans.length] = document.createElement('span')));
    spans.forEach((span, i) => {
      const box = boxes[i];
      span.hidden = !box;
      if (!box) return;
      if (span.textContent !== box.text) span.textContent = box.text;
      // Centred on its foot by the stylesheet (translateX(−50%)).
      const style = `left:${box.centre.toFixed(1)}px;top:${box.top.toFixed(1)}px;color:${box.colour}`;
      if (span.getAttribute('style') !== style) span.setAttribute('style', style);
    });
  }
};
