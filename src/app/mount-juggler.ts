// The juggler region (SPEC §4.1), above the ladder: one canvas, drawn every frame from the
// player view, and the "not a human throw" label (SPEC §4.1 v2) over it while such a flight is
// in the air. A faulted group's flights come from the model (`flightsOf` of the parts each
// derived schedule was built from), since the Schedule keeps only stand-in flights for them.
import { figureSpans } from '../view/juggler';
import { flightsOf } from '../core';
import type { Flight, Schedule } from '../core';
import { JUGGLER } from '../tunables';
import { copy } from '../ui/copy';
import { jugglerFrame } from '../view/juggler';
import { drawJuggler } from './juggler-canvas';
import type { Mount } from './mount';
import './juggler.css';

export const mountJuggler: Mount = (root, { store }) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'juggler';
  canvas.setAttribute('role', 'img');
  const note = document.createElement('p');
  note.className = 'juggler-note';
  note.textContent = copy.notHumanThrow(JUGGLER.humanAirtimeSeconds);
  note.hidden = true;
  root.append(canvas, note);

  // Every schedule the store has derived, with the flights of its parts.
  const flights = new WeakMap<Schedule, readonly Flight[]>();
  const remember = () => {
    const { schedule } = store.derived();
    const { parts } = store.get();
    if (!flights.has(schedule)) flights.set(schedule, flightsOf(parts));
    const label = parts.length > 2 ? copy.jugglersLabel(parts.length) : copy.jugglerLabel;
    if (canvas.getAttribute('aria-label') !== label) canvas.setAttribute('aria-label', label);
  };
  remember();
  store.subscribe(remember);

  return {
    draw(view) {
      // Before the first valid edit there is nothing to show; the canvas keeps what it had.
      if (view.segments.length === 0) return;
      const frame = jugglerFrame(view.segments, view.now, JUGGLER, (s) => flights.get(s));
      // Test hook (SPEC §7.1): how many balls are drawn, so the browser tests can compare views.
      const balls = String(frame.balls.length);
      if (canvas.dataset.balls !== balls) canvas.dataset.balls = balls;
      // Test hook: how many figures carry a caption (0 below three parts).
      const figures = String(frame.parts > 2 ? figureSpans(frame.parts, JUGGLER).length : 0);
      if (canvas.dataset.figures !== figures) canvas.dataset.figures = figures;
      if (note.hidden === frame.inhuman) note.hidden = !frame.inhuman;
      drawJuggler(canvas, frame);
    },
  };
};
