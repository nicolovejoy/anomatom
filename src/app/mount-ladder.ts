// The ladder strip region (SPEC §4.1): one canvas, drawn every frame from the player view.
// Fix state (SPEC §4.2): while the pattern is invalid, its broken loop is drawn with the
// colliding flights in the warning colour: in place of the strip when stopped, and greyed on a
// second strip above the one that plays otherwise, so the two can be compared.
import type { PatternInput, ValidationError } from '../core';
import { LADDER } from '../tunables';
import { accents } from '../view/accents';
import { brokenFrame, ladderFrame } from '../view/ladder';
import { analyse } from './knobs-model';
import { drawLadder } from './ladder-canvas';
import type { Mount } from './mount';
import type { AppState } from './state';
import './ladder.css';

export const mountLadder: Mount = (root, { store }) => {
  const make = (className: string) => {
    const canvas = document.createElement('canvas');
    canvas.className = className;
    canvas.height = LADDER.heightPx;
    return canvas;
  };
  const above = make('ladder ladder-broken');
  above.hidden = true;
  const canvas = make('ladder');
  root.append(above, canvas);

  let broken: { input: PatternInput; errors: ValidationError[] } | null = null;
  const check = (state: AppState) => {
    const a = analyse(state.patterns, state.ratio);
    broken = a.input !== null && a.balls === null ? { input: a.input, errors: a.details.map((d) => d.error) } : null;
  };
  store.subscribe((state, previous) => {
    if (state.patterns !== previous.patterns || state.ratio !== previous.ratio) check(state);
  });
  check(store.get());

  return {
    draw(view) {
      if (broken && view.state === 'stopped') {
        // Nothing plays: the broken pattern takes the strip.
        above.hidden = true;
        drawLadder(canvas, brokenFrame(broken.input, broken.errors, view.segments, view.now, LADDER));
        return;
      }
      above.hidden = broken === null;
      if (broken) drawLadder(above, brokenFrame(broken.input, broken.errors, view.segments, view.now, LADDER), { greyed: true });
      // Before the first valid edit there is nothing to show; the canvas keeps what it had.
      if (view.segments.length === 0) return;
      const frame = ladderFrame(view.segments, view.now, LADDER);
      drawLadder(canvas, frame, { accents: accents(frame) });
    },
  };
};
