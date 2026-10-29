// The ladder strip region (SPEC §4.1): one canvas, drawn every frame from the player view.
// The player always has a schedule (the sound is never gated, design §6), so the strip always
// draws what plays: a faulted group's flights in grey, with no ball.
import { LADDER } from '../tunables';
import { accents } from '../view/accents';
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
      // Before the knobs hand the player its first edit there is nothing to show.
      if (view.segments.length === 0) return;
      const frame = ladderFrame(view.segments, view.now, LADDER);
      // Test hook (SPEC §7.1): how many distinct balls the strip draws, to compare with the juggler.
      const balls = String(new Set(frame.bars.flatMap((b) => (b.colour === null ? [] : [b.colour]))).size);
      if (canvas.dataset.balls !== balls) canvas.dataset.balls = balls;
      drawLadder(canvas, frame, { accents: accents(frame) });
    },
  };
};
