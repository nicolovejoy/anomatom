// Draws a juggler frame on a canvas. Reads nothing but the frame and the tunables.
import { BALL_COLOURS, JUGGLER } from '../tunables';
import type { JugglerFrame } from '../view/juggler';

export function drawJuggler(canvas: HTMLCanvasElement, frame: JugglerFrame) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  const height = JUGGLER.heightPx;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = JUGGLER.background;
  ctx.fillRect(0, 0, width, height);

  // One scale for both axes, so a parabola keeps its shape: the scene fits whichever way is
  // tighter, centred across, standing on the bottom edge so the hands never move vertically.
  const { left, right, bottom, top } = frame.bounds;
  const scale = Math.min(width / (right - left), height / (top - bottom));
  const x0 = (width - (right - left) * scale) / 2;
  const px = (x: number) => x0 + (x - left) * scale;
  const py = (y: number) => height - (y - bottom) * scale;
  const r = JUGGLER.radius * scale;

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
