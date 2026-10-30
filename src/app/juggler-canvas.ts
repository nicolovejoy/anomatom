// Draws a juggler frame on a canvas. Reads nothing but the frame and the tunables.
import { BALL_COLOURS, JUGGLER } from '../tunables';
import { partColour } from '../view/colours';
import { sceneScale, type JugglerFrame } from '../view/juggler';

export function drawJuggler(canvas: HTMLCanvasElement, frame: JugglerFrame) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  // The region sets the height (it fills what the sheet leaves on a phone).
  const height = canvas.clientHeight || JUGGLER.heightPx;
  // Hidden (About showing) or not laid out yet: nothing to draw, and a negative scale would draw garbage.
  if (width <= 2 * JUGGLER.minRadiusPx || height <= 2 * JUGGLER.minRadiusPx) return;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = JUGGLER.background;
  ctx.fillRect(0, 0, width, height);

  // The axes (`sceneScale`, SPEC §4.1 v2): one scale while the tallest apex is at most
  // JUGGLER.uniformTopMetres, the hands at a fixed height; above it only the height squeezes.
  const { left, bottom } = frame.bounds;
  const { sx, sy, x0, floor } = sceneScale(frame.bounds, width, height, JUGGLER);
  const px = (x: number) => x0 + (x - left) * sx;
  const py = (y: number) => floor - (y - bottom) * sy;
  const r = Math.max(JUGGLER.radius * Math.min(sx, sy), JUGGLER.minRadiusPx);

  // The hands: a bar under each hand's span, from its catch point to its throw point, just
  // under a held ball, never past the canvas. Grey for one figure; with three or more parts
  // each in its part's colour, as its ladder lane, so a hand can be found in both.
  const handY = Math.min(py(0) + r + JUGGLER.handGapPx, height - JUGGLER.handBarPx);
  const tinted = frame.parts > 2;
  for (const h of frame.hands) {
    ctx.fillStyle = tinted ? partColour(h.part) : JUGGLER.hand;
    const mid = px((h.catchX + h.throwX) / 2);
    const w = Math.min(Math.abs(px(h.catchX) - px(h.throwX)) + 2 * r, JUGGLER.handMaxPx);
    const bar = JUGGLER.handBarPx;
    ctx.beginPath();
    ctx.roundRect(mid - w / 2, handY, w, bar, bar / 2);
    ctx.fill();
  }

  // A faulted group (design §6): no balls, its faulted flights as whole arcs in the warning
  // colour, meeting at a ring where they land. A parabola from (x0, 0) to (x1, 0) with apex h is
  // the quadratic curve with its control point at the middle, 2h up. Over a human throw: dashed.
  ctx.strokeStyle = JUGGLER.fault;
  ctx.lineWidth = JUGGLER.faultLinePx;
  const landings = new Set<number>();
  for (const arc of frame.faults) {
    ctx.setLineDash(arc.inhuman ? JUGGLER.inhumanDashPx : []);
    ctx.beginPath();
    ctx.moveTo(px(arc.x0), py(0));
    ctx.quadraticCurveTo(px((arc.x0 + arc.x1) / 2), py(2 * arc.apex), px(arc.x1), py(0));
    ctx.stroke();
    landings.add(arc.x1);
  }
  ctx.setLineDash([]);
  for (const x of landings) {
    ctx.beginPath();
    ctx.arc(px(x), py(0), JUGGLER.faultRingPx, 0, Math.PI * 2);
    ctx.stroke();
  }

  for (const b of frame.balls) {
    const x = px(b.x);
    const y = py(b.y);
    // Not a human throw (SPEC §4.1 v2): the ball dimmed while that flight lasts.
    ctx.globalAlpha = b.inhuman ? JUGGLER.inhumanAlpha : 1;
    if (b.flash > 0) {
      ctx.globalAlpha = b.flash * (b.inhuman ? JUGGLER.inhumanAlpha : 1);
      ctx.strokeStyle = JUGGLER.flashRing;
      ctx.lineWidth = JUGGLER.flashRingPx;
      ctx.beginPath();
      ctx.arc(x, y, r * JUGGLER.flashRingRadii, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = b.inhuman ? JUGGLER.inhumanAlpha : 1;
    }
    ctx.fillStyle = BALL_COLOURS[b.ball % BALL_COLOURS.length] as string;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
