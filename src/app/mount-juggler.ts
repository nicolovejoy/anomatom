// The juggler region (SPEC §4.1), above the ladder: one canvas, drawn every frame from the
// player view. Balls only in v1; hands and clubs come later from `held` and `progress`.
import { JUGGLER } from '../tunables';
import { copy } from '../ui/copy';
import { jugglerFrame } from '../view/juggler';
import { drawJuggler } from './juggler-canvas';
import type { Mount } from './mount';
import './juggler.css';

export const mountJuggler: Mount = (root) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'juggler';
  canvas.style.height = `${JUGGLER.heightPx}px`;
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', copy.jugglerLabel);
  root.append(canvas);
  return {
    draw(view) {
      // Before the first valid edit there is nothing to show; the canvas keeps what it had.
      if (view.segments.length === 0) return;
      drawJuggler(canvas, jugglerFrame(view.segments, view.now, JUGGLER));
    },
  };
};
