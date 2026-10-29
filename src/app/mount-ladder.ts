// The ladder strip region (SPEC §4.1): one canvas, drawn every frame from the player view.
import { LADDER } from '../tunables';
import { ladderFrame } from '../view/ladder';
import { drawLadder } from './ladder-canvas';
import type { Mount } from './mount';
import './ladder.css';

export const mountLadder: Mount = (root) => {
  const canvas = document.createElement('canvas');
  canvas.className = 'ladder';
  canvas.height = LADDER.heightPx;
  root.append(canvas);
  return {
    draw(view) {
      // Before the first valid edit there is nothing to show; the canvas keeps what it had.
      if (view.segments.length === 0) return;
      drawLadder(canvas, ladderFrame(view.segments, view.now, LADDER));
    },
  };
};
