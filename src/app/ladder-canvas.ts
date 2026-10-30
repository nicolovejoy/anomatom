// Draws a ladder Frame on a canvas. Reads nothing but the frame, its options and the tunables.
import type { Accent } from '../view/accents';
import { partColour } from '../view/colours';
import { laneGeometry, rowY, type Bar, type Frame } from '../view/ladder';
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
  // One lane per part (`laneGeometry`); within a lane each ball has its own row so overlapping
  // flights stay visible. Two parts: hand 1's rows go down, hand 2's up, towards each other.
  const lanes = laneGeometry(frame.parts, height, LADDER, BALL_COLOURS.length);
  const tinted = frame.parts > 2;

  ctx.fillStyle = LADDER.background;
  ctx.fillRect(0, 0, width, height);

  lanes.y.forEach((y, part) => {
    // Three or more parts: each lane in its part's colour, the lanes UI's dot and the juggler's hand.
    ctx.strokeStyle = tinted ? partColour(part) : LADDER.lane;
    ctx.lineWidth = tinted ? LADDER.partLanePx : 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  });

  for (const t of frame.ticks) {
    const y = lanes.y[t.part] as number;
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
    const y0 = rowY(lanes, b.from, b.colour);
    const y1 = rowY(lanes, b.to, b.colour);
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
    const y = lanes.y[a.part] as number;
    const s = LADDER_E.accentPx;
    const dir = lanes.dir[a.part] as number;
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
