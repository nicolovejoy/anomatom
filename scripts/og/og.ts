// Composes the link-preview card (1200x630) from the app's real drawing code. Not part of the
// shipped build: `npm run og` serves this page, screenshots it and writes public/og.png.
import { buildSchedule, parsePattern } from '../../src/core';
import type { HandPattern, PatternInput } from '../../src/core';
import { drawLadder } from '../../src/app/ladder-canvas';
import { BALL_COLOURS, JUGGLER, LADDER } from '../../src/tunables';
import { pulseSeconds } from '../../src/sound/transport';
import { accents } from '../../src/view/accents';
import { jugglerFrame } from '../../src/view/juggler';
import { ladderFrame } from '../../src/view/ladder';
import type { Segment } from '../../src/view/types';

const hand = (s: string): HandPattern => {
  const r = parsePattern(s);
  if (!r.ok) throw new Error(`bad pattern ${s}`);
  return r.pattern;
};
const input: PatternInput = { ratio: { a: 3, b: 2 }, hands: [hand('2 2x 2'), hand('2x 2')] };
const schedule = buildSchedule(input);
const pulseLen = pulseSeconds(Number(new URLSearchParams(location.search).get('bpm') ?? 240), schedule.grids);
const segment: Segment = { schedule, startTime: 0, pulseLen, endTime: null, carry: new Map() };

// The moment: `lead` pulses before the second downbeat, chosen by eye (?lead= to explore).
const params = new URLSearchParams(location.search);
const lead = Number(params.get('lead') ?? 1.5);
const downbeat = 2 * schedule.cycle;
const now = (downbeat - lead) * pulseLen;

// Two cycles across the strip, the playhead just short of the downbeat near its right.
const windowPulses = Number(params.get('window') ?? 2 * schedule.cycle + 2);
const layout = { ...LADDER, windowPulses, playheadFraction: (downbeat - lead) / windowPulses };

await document.fonts.ready;
const jug = document.getElementById('juggler') as HTMLCanvasElement;
const lad = document.getElementById('ladder') as HTMLCanvasElement;
lad.style.height = `${LADDER.heightPx}px`;

// The juggler is the app's motion (jugglerFrame sampled at many instants) drawn larger, with
// each ball's current flight traced as a faint trail, and without the panel behind it.
{
  const dpr = 2;
  const W = jug.clientWidth;
  const H = jug.clientHeight;
  jug.width = W * dpr;
  jug.height = H * dpr;
  const ctx = jug.getContext('2d') as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const at = (t: number) => jugglerFrame([segment], t, JUGGLER).balls;
  const step = pulseLen / 40;
  // Per colour, the air path around `now`: walk out each way until the ball is held.
  const trails = new Map<number, { x: number; y: number }[]>();
  for (const b of at(now)) {
    if (b.held !== null) continue;
    const pts: { x: number; y: number }[] = [];
    const walk = (dir: 1 | -1) => {
      for (let k = dir === 1 ? 0 : 1; k < 400; k++) {
        const q = at(now + dir * k * step).find((c) => c.ball === b.ball);
        if (!q || q.held !== null) break;
        if (dir === 1) pts.push(q);
        else pts.unshift(q);
      }
    };
    walk(-1);
    walk(1);
    trails.set(b.ball, pts);
  }
  const all = [...trails.values()].flat();
  const hands = [...JUGGLER.throwX, ...JUGGLER.catchX];
  const xs = [...all.map((p) => p.x), ...hands];
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.max(...all.map((p) => p.y));
  const R = 25;
  const pad = R + 6;
  const scale = Math.min((W - 2 * pad) / (right - left), (H - 2 * pad - 14) / top);
  const x0 = (W - (right - left) * scale) / 2;
  const px = (x: number) => x0 + (x - left) * scale;
  const py = (y: number) => H - pad - 14 - y * scale;
  const colour = (c: number) => BALL_COLOURS[c % BALL_COLOURS.length] as string;

  ctx.lineCap = 'round';
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.4;
  for (const [c, pts] of trails) {
    ctx.strokeStyle = colour(c);
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(px(p.x), py(p.y)) : ctx.lineTo(px(p.x), py(p.y))));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // Hand marks at each hand's throw point.
  ctx.strokeStyle = '#3a404b';
  ctx.lineWidth = 6;
  for (const x of JUGGLER.throwX) {
    ctx.beginPath();
    ctx.moveTo(px(x) - 22, py(0) + R + 8);
    ctx.lineTo(px(x) + 22, py(0) + R + 8);
    ctx.stroke();
  }
  for (const b of at(now)) {
    ctx.fillStyle = colour(b.ball);
    ctx.beginPath();
    ctx.arc(px(b.x), py(b.y), R, 0, Math.PI * 2);
    ctx.fill();
  }
}

// The card has no playhead: the app's painter reads this colour, so make it clear.
(LADDER as { playhead: string }).playhead = 'rgba(0,0,0,0)';
const frame = ladderFrame([segment], now, layout);
drawLadder(lad, frame, { accents: accents(frame) });
document.body.dataset.ready = '1';
