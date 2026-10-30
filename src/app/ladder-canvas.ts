// Draws a ladder Frame on a canvas. Reads nothing but the frame, its options and the tunables.
import type { Accent } from '../view/accents';
import type { Bar, Frame } from '../view/ladder';
import { BALL_COLOURS, LADDER, LADDER_E } from '../tunables';

export interface DrawOptions {
  /** Marks at coincident cross landings (SPEC §7.3). */
  readonly accents?: readonly Accent[];
}

export function drawLadder(canvas: HTMLCanvasElement, frame: Frame, options: DrawOptions = {}) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const width = canvas.clientWidth;
  // The page sets the height: LADDER.heightPx on a wide screen, less on a phone (SHEET.ladderPx).
  const height = canvas.clientHeight || LADDER.heightPx;
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const px = (pulses: number) => (pulses / frame.windowPulses) * width;
  const laneY = [LADDER.lanePaddingPx, height - LADDER.lanePaddingPx];
  // Within a lane each ball has its own row so overlapping flights stay visible: hand 1's rows
  // go down from its line, hand 2's go up, so the two hands grow towards each other.
  const rowY = (hand: 0 | 1, ball: number | null) => {
    const step = LADDER.barPx + LADDER.rowGapPx;
    const row = ((ball ?? 0) % BALL_COLOURS.length) * step + LADDER.barPx / 2 + LADDER.rowGapPx;
    return hand === 0 ? (laneY[0] as number) + row : (laneY[1] as number) - row;
  };

  ctx.fillStyle = LADDER.background;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = LADDER.lane;
  ctx.lineWidth = 1;
  for (const y of laneY) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }

  for (const t of frame.ticks) {
    const y = laneY[t.hand] as number;
    const kind = t.coincident ? 'coincident' : 'beat';
    const len = LADDER.tickPx[kind];
    ctx.strokeStyle = t.coincident ? LADDER.tickCoincident : LADDER.tick;
    ctx.lineWidth = LADDER.tickWidthPx[kind];
    ctx.beginPath();
    ctx.moveTo(px(t.x), y - len);
    ctx.lineTo(px(t.x), y + len);
    ctx.stroke();
  }

  ctx.strokeStyle = LADDER.cycleLine;
  ctx.lineWidth = 1;
  for (const x of frame.cycleLines) {
    ctx.beginPath();
    ctx.moveTo(px(x), 0);
    ctx.lineTo(px(x), height);
    ctx.stroke();
  }

  // A faulted group's flights (no ball) in grey, under the balls' colours.
  const bars: Bar[] = [...frame.bars.filter((b) => b.broken), ...frame.bars.filter((b) => !b.broken)];
  for (const b of bars) {
    const colour = b.colour === null ? LADDER_E.greyBar : (BALL_COLOURS[b.colour % BALL_COLOURS.length] as string);
    const x0 = px(b.x0);
    const x1 = Math.max(px(b.x1), x0 + LADDER.minBarPx);
    const y0 = rowY(b.from, b.colour);
    const y1 = rowY(b.to, b.colour);
    // Not a human throw (SPEC §4.1 v2): dimmed, as the juggler dims its ball.
    ctx.globalAlpha = b.inhuman ? LADDER_E.inhumanAlpha : 1;
    if (b.cross) {
      ctx.strokeStyle = colour;
      ctx.lineWidth = LADDER.crossLinePx;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    } else {
      ctx.fillStyle = colour;
      ctx.fillRect(x0, y0 - LADDER.barPx / 2, x1 - x0, LADDER.barPx);
    }
  }

  ctx.globalAlpha = 1;

  // A triangle on the catching hand's lane, pointing into the strip.
  ctx.fillStyle = LADDER_E.accent;
  for (const a of options.accents ?? []) {
    const x = px(a.x);
    const y = laneY[a.hand] as number;
    const s = LADDER_E.accentPx;
    const dir = a.hand === 0 ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(x - s, y - dir * s);
    ctx.lineTo(x + s, y - dir * s);
    ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = LADDER.playhead;
  ctx.lineWidth = LADDER.playheadWidthPx;
  ctx.beginPath();
  ctx.moveTo(px(frame.playhead), 0);
  ctx.lineTo(px(frame.playhead), height);
  ctx.stroke();
}
