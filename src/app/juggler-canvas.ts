// Draws a juggler frame on a canvas. Reads nothing but the frame and the tunables.
import { BALL_COLOURS, JUGGLER } from '../tunables';
import type { JugglerFrame } from '../view/juggler';

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

  // One scale for both axes, so a parabola keeps its shape: the scene fits whichever way is
  // tighter, centred across, standing on the bottom edge so the hands never move vertically.
  // A margin of the smallest drawn radius keeps a ball drawn larger than the scene's whole.
  const { left, right, bottom, top } = frame.bounds;
  const pad = JUGGLER.minRadiusPx;
  // Room under the scene for the hands.
  const floor = height - pad - JUGGLER.handGapPx - JUGGLER.handBarPx;
  const scale = Math.min((width - 2 * pad) / (right - left), (floor - pad) / (top - bottom));
  const x0 = (width - (right - left) * scale) / 2;
  const px = (x: number) => x0 + (x - left) * scale;
  const py = (y: number) => floor - (y - bottom) * scale;
  const r = Math.max(JUGGLER.radius * scale, JUGGLER.minRadiusPx);

  // The hands: a bar under each hand's span, from its catch point to its throw point, just
  // under a held ball, never past the canvas.
  const handY = Math.min(py(0) + r + JUGGLER.handGapPx, height - JUGGLER.handBarPx);
  ctx.fillStyle = JUGGLER.hand;
  for (const h of [0, 1] as const) {
    const mid = px((JUGGLER.catchX[h] + JUGGLER.throwX[h]) / 2);
    const w = Math.min(Math.abs(px(JUGGLER.catchX[h]) - px(JUGGLER.throwX[h])) + 2 * r, JUGGLER.handMaxPx);
    const bar = JUGGLER.handBarPx;
    ctx.beginPath();
    ctx.roundRect(mid - w / 2, handY, w, bar, bar / 2);
    ctx.fill();
  }

  for (const b of frame.balls) {
    const x = px(b.x);
    const y = py(b.y);
    if (b.flash > 0) {
      ctx.globalAlpha = b.flash;
      ctx.strokeStyle = JUGGLER.flashRing;
      ctx.lineWidth = JUGGLER.flashRingPx;
      ctx.beginPath();
      ctx.arc(x, y, r * JUGGLER.flashRingRadii, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = BALL_COLOURS[b.ball % BALL_COLOURS.length] as string;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
}
