import { describe, expect, test } from 'vitest';
import { buildSchedule, parsePattern, validate } from '../core/legacy';
import type { PatternInput, Schedule, ValidationError } from '../core/legacy';
import { axisPulse, brokenFrame, ladderFrame } from './ladder';
import type { LadderView } from './ladder';
import type { Segment } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}
const vanilla = (text: string): PatternInput => ({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });
const view = { windowPulses: 12, playheadFraction: 0.25 };

/** One segment from time 0 at one second per pulse, so `now` is the playhead in pulses. */
const single = (schedule: Schedule): Segment => ({ schedule, startTime: 0, pulseLen: 1, endTime: null, carry: new Map() });
const frameAt = (schedule: Schedule, position: number, v: LadderView) => ladderFrame([single(schedule)], position, v);

test('the window is placed around the playhead', () => {
  const f = frameAt(buildSchedule(vanilla('3')), 10, view);
  expect(f.start).toBe(7);
  expect(f.playhead).toBe(3);
  expect(f.windowPulses).toBe(12);
});

test('bars: one per flight crossing the window, in window coordinates, with hand and ball', () => {
  // 3 is period 1, cycle 2, period 6: a 3-pulse flight from every pulse, alternating hands.
  const f = frameAt(buildSchedule(vanilla('3')), 0, view);
  // Window is [-3, 9). Flights launched at -5 .. 8 overlap it; those before 0 never happened.
  const launches = f.bars.map((b) => b.x0 + f.start).sort((a, b) => a - b);
  expect(launches).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
  const first = f.bars.find((b) => b.x0 + f.start === 0);
  expect(first).toMatchObject({ x0: 3, x1: 6, from: 0, to: 1, cross: true, height: 3 });
  const ids = new Set(f.bars.map((b) => b.ball));
  expect(ids.size).toBe(3);
});

test('ball ids follow the period: the same throw two periods on has the same ball', () => {
  const s = buildSchedule(vanilla('441'));
  const a = frameAt(s, 0, { windowPulses: 6, playheadFraction: 0 });
  const b = frameAt(s, 36, { windowPulses: 6, playheadFraction: 0 });
  // Only flights launched inside the window: at position 0 nothing overhangs from before.
  const key = (f: typeof a) => f.bars.filter((x) => x.x0 >= 0).map((x) => [x.x0, x.ball]).sort();
  expect(key(b)).toEqual(key(a));
});

test('ticks mark both grids and the coincident pulses weigh more', () => {
  const s = buildSchedule({ ratio: { a: 3, b: 2 }, hands: [pat('2'), pat('2')] });
  const f = frameAt(s, 0, { windowPulses: 7, playheadFraction: 0 });
  const at = (hand: 0 | 1) => f.ticks.filter((t) => t.hand === hand).map((t) => [t.x, t.coincident]);
  expect(at(0)).toEqual([
    [0, true],
    [2, false],
    [4, false],
    [6, true],
  ]);
  expect(at(1)).toEqual([
    [0, true],
    [3, false],
    [6, true],
  ]);
});

test('vanilla ticks alternate hands and nothing is coincident', () => {
  const f = frameAt(buildSchedule(vanilla('3')), 0, { windowPulses: 4, playheadFraction: 0 });
  expect(f.ticks.map((t) => [t.hand, t.x, t.coincident])).toEqual([
    [0, 0, false],
    [1, 1, false],
    [0, 2, false],
    [1, 3, false],
  ]);
});

test('a line at each cycle start inside the window, none before playback started', () => {
  const s = buildSchedule(vanilla('441')); // cycle 6
  expect(frameAt(s, 0, view).cycleLines).toEqual([3, 9]); // pulses 0 and 6 at x = 3 and 9
  expect(frameAt(s, 13, { windowPulses: 12, playheadFraction: 0.5 }).cycleLines).toEqual([5, 11]);
});

test('a window entirely before the start is empty of bars', () => {
  const f = frameAt(buildSchedule(vanilla('3')), -20, view);
  expect(f.bars).toEqual([]);
  expect(f.cycleLines).toEqual([]);
});

test('a flight that lands exactly at the window start is not drawn; one landing inside is', () => {
  // 3 at 1:1, window starting at pulse 7: the throw at 4 lands at 7 (out), the one at 5 lands at 8 (in).
  const f = frameAt(buildSchedule(vanilla('3')), 10, view);
  const overhang = f.bars.filter((b) => b.x0 < 0).map((b) => b.x0 + f.start).sort((a, b) => a - b);
  expect(overhang).toEqual([5, 6]);
});

test('with one segment a ball keeps its own id as its colour', () => {
  const f = frameAt(buildSchedule(vanilla('441')), 20, view);
  expect(f.bars.every((b) => b.colour === b.ball)).toBe(true);
});

test('with no segment the strip is empty and the axis sits at 0', () => {
  expect(axisPulse([], 5)).toBe(0);
  const f = ladderFrame([], 5, view);
  expect(f).toMatchObject({ start: -3, playhead: 3, bars: [], ticks: [], cycleLines: [] });
});

// Two-segment views, built by hand as stream B's player will build them. The switch is at old
// pulse B = 6, a cycle boundary of every pattern below; the next segment's pulse 0 is there.
const B = 6;
function switchAt(
  first: Schedule,
  firstPulseLen: number,
  second: Schedule,
  secondPulseLen: number,
  carry: ReadonlyMap<number, number>,
): [Segment, Segment] {
  const endTime = B * firstPulseLen;
  return [
    { schedule: first, startTime: 0, pulseLen: firstPulseLen, endTime, carry: new Map() },
    { schedule: second, startTime: endTime, pulseLen: secondPulseLen, endTime: null, carry },
  ];
}

/** Bars launched before the boundary (old) and at or after it (new), in strip pulses. */
function split(segments: readonly Segment[], now: number) {
  const f = ladderFrame(segments, now, { windowPulses: 16, playheadFraction: 0.5 });
  const abs = f.bars.map((b) => ({ ...b, launch: b.x0 + f.start, land: b.x1 + f.start }));
  return { f, old: abs.filter((b) => b.launch < B - 1e-9), fresh: abs.filter((b) => b.launch > B - 1e-9) };
}
const near = (a: number, b: number) => Math.abs(a - b) < 1e-9;

test('tempo change, 3 to 3: crossing flights land retimed and every ball keeps its colour', () => {
  const s = buildSchedule(vanilla('3'));
  // 3's flights launched at 3, 4, 5 land at 6, 7, 8 = B + 0, 1, 2; the balls thrown there are
  // the same ids, so the carry is the identity.
  const carry = new Map([
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  const segments = switchAt(s, 0.25, s, 0.2, carry);
  const [, next] = segments;
  const now = next.startTime + 2 * next.pulseLen; // 2 pulses into the new tempo
  expect(axisPulse(segments, now)).toBeCloseTo(B + 2);
  expect(axisPulse(segments, 0.5)).toBeCloseTo(2); // still in the old segment

  const { old, fresh } = split(segments, now);
  // Window [0, 16): old launches 0-5 only; the old segment never plays pulse 6 or later.
  expect(old.map((b) => Math.round(b.launch)).sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  expect(fresh.map((b) => Math.round(b.launch)).sort((a, b) => a - b)).toEqual([6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);

  const crossing = old.filter((b) => b.land > B - 1e-9);
  expect(crossing.map((b) => Math.round(b.launch)).sort()).toEqual([3, 4, 5]);
  for (const b of crossing) {
    const p = Math.round(b.launch) + 3 - B;
    // The landing is drawn where the next segment's pulse p falls in time: the retimed
    // landing, next.startTime + p × next.pulseLen, not the old tempo's.
    expect(b.land).toBeCloseTo(axisPulse(segments, next.startTime + p * next.pulseLen));
    expect(b.land).toBeCloseTo(B + p);
    // The ball thrown from that landing keeps the crossing ball's colour.
    const thrown = fresh.find((x) => near(x.launch, b.land) && x.from === b.to);
    expect(thrown?.colour).toBe(b.colour);
  }
});

test('pattern change, 3 to 441: carried balls keep their colours through a non-identity carry', () => {
  const three = buildSchedule(vanilla('3'));
  const fourFourOne = buildSchedule(vanilla('441'));
  // 3's balls 0, 2, 1 land at B + 0 (hand 1), B + 1 (hand 2), B + 2 (hand 1). In 441 the
  // throws at 0, 1, 2 are the first throws of balls 0, 1, 2, from the same hands.
  const carry = new Map([
    [0, 0],
    [1, 2],
    [2, 1],
  ]);
  const segments = switchAt(three, 0.25, fourFourOne, 0.25, carry);
  const { old, fresh } = split(segments, B * 0.25 + 1); // 4 pulses past the switch

  // Old colours are old ball ids; each new ball shows its carried colour, not its own id.
  expect(old.every((b) => b.colour === b.ball)).toBe(true);
  for (const b of fresh) expect(b.colour).toBe(carry.get(b.ball));
  expect(fresh.some((b) => b.colour !== b.ball)).toBe(true);

  const crossing = old.filter((b) => b.land > B - 1e-9);
  expect(crossing.map((b) => Math.round(b.launch)).sort()).toEqual([3, 4, 5]);
  for (const b of crossing) {
    const p = Math.round(b.land) - B;
    expect(b.land).toBeCloseTo(axisPulse(segments, segments[1].startTime + p * segments[1].pulseLen));
    const thrown = fresh.find((x) => near(x.launch, b.land) && x.from === b.to);
    expect(thrown?.colour).toBe(b.colour);
  }
  // Three colours on the strip after the switch, as before it.
  expect(new Set(fresh.map((b) => b.colour))).toEqual(new Set([0, 1, 2]));
});

test('ticks and cycle lines follow each segment’s own grid and cycle', () => {
  const three = buildSchedule(vanilla('3')); // cycle 2
  const fourFourOne = buildSchedule(vanilla('441')); // cycle 6
  const segments = switchAt(three, 0.25, fourFourOne, 0.25, new Map());
  const f = ladderFrame(segments, B * 0.25, { windowPulses: 16, playheadFraction: 0.5 }); // [-2, 14)
  expect(f.cycleLines.map((x) => x + f.start)).toEqual([0, 2, 4, 6, 12]);
  // A tick on every pulse, one hand each, in both segments.
  expect(f.ticks.map((t) => t.x + f.start)).toEqual([-2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
});

test('tempo change: the time a crossing flight’s x1 reaches the playhead is next.startTime + p × next.pulseLen', () => {
  const sched = buildSchedule(vanilla('3'));
  const carry = new Map([
    [0, 0],
    [1, 1],
    [2, 2],
  ]);
  const segments = switchAt(sched, 0.25, sched, 0.2, carry);
  const [, next] = segments;
  const { old } = split(segments, next.startTime + 2 * next.pulseLen);
  const crossing = old.filter((b) => b.land > B - 1e-9);
  expect(crossing).toHaveLength(3);
  for (const b of crossing) {
    const p = Math.round(b.launch) + 3 - B;
    // The time at which the playhead reaches x1, solved in the next segment's pulses.
    const t = next.startTime + (b.land - B) * next.pulseLen;
    expect(t).toBeCloseTo(next.startTime + p * next.pulseLen);
    expect(axisPulse(segments, t)).toBeCloseTo(b.land);
  }
});

describe('brokenFrame: an invalid pattern on the strip, collisions flagged (SPEC §4.2)', () => {
  const errorsOf = (input: PatternInput): readonly ValidationError[] => {
    const v = validate(input);
    if (v.ok) throw new Error('valid');
    return v.errors;
  };
  const twoHands = (h1: string, h2: string, a: number, b: number): PatternInput => ({
    ratio: { a, b },
    hands: [pat(h1), pat(h2)],
  });
  /** Bars with their launch and landing on the broken pattern's own pulse count, anchor at 0. */
  const flights = (f: ReturnType<typeof brokenFrame>, anchor = 0) =>
    f.bars.map((b) => ({ ...b, launch: b.x0 + f.start - anchor, land: b.x1 + f.start - anchor }));

  test('432, stopped with nothing to show: pulse 0 at the playhead, the colliding bars flagged and meeting at pulse 4', () => {
    const input = vanilla('432');
    const f = brokenFrame(input, errorsOf(input), [], 5, view);
    expect(f.start).toBe(-3);
    expect(f.playhead).toBe(3);
    const bars = flights(f);
    // Launched at 0, 1, 2 (digits 4, 3, 2), all landing in hand 1 at pulse 4.
    const first = bars.filter((b) => b.launch >= 0 && b.launch < 3);
    expect(first.map((b) => b.x0)).toEqual([3, 4, 5]);
    expect(first.every((b) => b.broken === true && b.land === 4 && b.to === 0)).toBe(true);
    expect(new Set(first.map((b) => b.x1)).size).toBe(1);
    // The pattern is a loop: the cycle before pulse 0 shows too, flagged the same.
    expect(bars.some((b) => b.launch < 0 && b.broken)).toBe(true);
    // Every flight of 432 is in its collision group.
    expect(bars.every((b) => b.broken)).toBe(true);
    // Balls number the digits; with no segment the colours are those numbers.
    expect(first.map((b) => [b.ball, b.colour])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
    ]);
    // Its own grid and cycle: 432's cycle is 6, its pulses alternate hands.
    expect(f.cycleLines.map((x) => x + f.start)).toEqual([0, 6]);
    expect(f.ticks).toHaveLength(12);
  });

  test('432 over the stopped view of the last valid edit: same placement, colours clear of its balls', () => {
    const input = vanilla('432');
    const stopped: Segment = { schedule: buildSchedule(vanilla('441')), startTime: 5, pulseLen: 0.25, endTime: null, carry: new Map() };
    const f = brokenFrame(input, errorsOf(input), [stopped], 5, view);
    const base = ladderFrame([stopped], 5, view);
    expect(f.start).toBe(base.start);
    const bars = flights(f);
    expect(bars.find((b) => b.launch === 0)?.x0).toBe(f.playhead);
    // 441's balls are colours 0-2, so 432's three digits take 3, 4 and 5.
    expect(new Set(bars.map((b) => b.colour))).toEqual(new Set([3, 4, 5]));
  });

  test('while playing, pulse 0 sits at the playing segment’s start, in phase with it', () => {
    const input = vanilla('432');
    const playing = single(buildSchedule(vanilla('3')));
    const f = brokenFrame(input, errorsOf(input), [playing], 10, view); // window [7, 19)
    expect(f.start).toBe(7);
    expect(f.cycleLines.map((x) => x + f.start)).toEqual([12, 18]);
    const launches = flights(f).map((b) => Math.round(b.launch)).sort((a, b) => a - b);
    // 432's flights launched at 3, 4 and 5 all land at 7, the window's start, so are out.
    expect(launches[0]).toBe(6);
    expect(launches.at(-1)).toBe(18);
  });

  test('a later segment moves the anchor to its own start on the strip', () => {
    const input = vanilla('432');
    const s3 = buildSchedule(vanilla('3'));
    const segments: Segment[] = [
      { schedule: s3, startTime: 0, pulseLen: 1, endTime: 4, carry: new Map() },
      { schedule: s3, startTime: 4, pulseLen: 0.5, endTime: null, carry: new Map() },
    ];
    const f = brokenFrame(input, errorsOf(input), segments, 5, view); // axis 6, window [3, 15)
    expect(f.cycleLines.map((x) => x + f.start)).toEqual([4, 10]);
  });

  test('2 2x 2 / 2 2 at 3:2: only the two flights landing together in hand 2 are flagged', () => {
    const input = twoHands('2 2x 2', '2 2', 3, 2);
    const f = brokenFrame(input, errorsOf(input), [], 0, { windowPulses: 6, playheadFraction: 0 });
    const bars = flights(f);
    const broken = bars.filter((b) => b.broken).map((b) => [b.from, b.launch, b.land]);
    expect(broken).toEqual(
      expect.arrayContaining([
        [0, 2, 6],
        [1, 0, 6],
      ]),
    );
    expect(broken).toHaveLength(2);
    expect(bars.filter((b) => !b.broken).length).toBeGreaterThan(0);
    // Hand 2's digits are numbered after hand 1's three.
    expect(bars.find((b) => b.from === 1 && b.launch === 3)?.ball).toBe(4);
  });

  test('2x 2 2 / 2 2x at 3:2: each off-grid cross is flagged, landing between the other hand’s beats', () => {
    const input = twoHands('2x 2 2', '2 2x', 3, 2);
    const f = brokenFrame(input, errorsOf(input), [], 0, { windowPulses: 6, playheadFraction: 0 });
    // This cycle's flights only (the previous cycle's hand-2 cross also reaches into the window).
    const broken = flights(f)
      .filter((b) => b.broken && b.launch >= 0)
      .map((b) => [b.from, b.launch, b.land]);
    expect(broken).toEqual(
      expect.arrayContaining([
        [0, 0, 4],
        [1, 3, 9],
      ]),
    );
    expect(broken).toHaveLength(2);
  });

  test('510: the flagged 0 is drawn as a bar of no length; a fractional count flags nothing and draws no 0', () => {
    const f = brokenFrame(vanilla('510'), errorsOf(vanilla('510')), [], 0, { windowPulses: 6, playheadFraction: 0 });
    const zeros = flights(f).filter((b) => b.height === 0);
    expect(zeros.length).toBeGreaterThan(0);
    expect(zeros.every((b) => b.broken && b.x0 === b.x1)).toBe(true);

    const g = brokenFrame(vanilla('5011'), errorsOf(vanilla('5011')), [], 0, { windowPulses: 8, playheadFraction: 0 });
    expect(g.bars.some((b) => b.height === 0)).toBe(false);
    expect(g.bars.every((b) => b.broken === false)).toBe(true);
  });

  test('ladderFrame never sets the flag', () => {
    expect(frameAt(buildSchedule(vanilla('3')), 5, view).bars.every((b) => b.broken === undefined)).toBe(true);
  });
});
