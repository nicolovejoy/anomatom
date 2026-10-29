// Composes the link-preview card (1200x630) from the app's real drawing code. Not part of the
// shipped build: `npm run og` serves this page, screenshots it and writes public/og.png.
import { buildSchedule, parsePattern } from '../../src/core';
import type { HandPattern, PatternInput } from '../../src/core';
import { drawJuggler } from '../../src/app/juggler-canvas';
import { drawLadder } from '../../src/app/ladder-canvas';
import { JUGGLER, LADDER } from '../../src/tunables';
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
const pulseLen = pulseSeconds(Number(new URLSearchParams(location.search).get('bpm') ?? 120), schedule.grids);
const segment: Segment = { schedule, startTime: 0, pulseLen, endTime: null, carry: new Map() };

// The moment: `lead` pulses before the second downbeat, chosen by eye (?lead= to explore).
const params = new URLSearchParams(location.search);
const lead = Number(params.get('lead') ?? 0.4);
const downbeat = 2 * schedule.cycle;
const now = (downbeat - lead) * pulseLen;

// Two cycles across the strip, the playhead just short of the downbeat near its right.
const windowPulses = Number(params.get('window') ?? 2 * schedule.cycle + 2);
const layout = { ...LADDER, windowPulses, playheadFraction: (downbeat - lead) / windowPulses };

await document.fonts.ready;
const jug = document.getElementById('juggler') as HTMLCanvasElement;
const lad = document.getElementById('ladder') as HTMLCanvasElement;
jug.style.height = `${JUGGLER.heightPx}px`;
lad.style.height = `${LADDER.heightPx}px`;
drawJuggler(jug, jugglerFrame([segment], now, JUGGLER));
const frame = ladderFrame([segment], now, layout);
drawLadder(lad, frame, { accents: accents(frame) });
document.body.dataset.ready = '1';
