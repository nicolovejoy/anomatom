import { expect, test } from 'vitest';
import { buildSchedule, partsFromOnsets } from '../core';
import type { Parts } from '../core';
import { lineParts, scheduleOf } from '../test/schedules';
import { BALL_COLOURS, JUGGLER, LADDER, PART_COLOURS } from '../tunables';
import { accents } from './accents';
import { partColour } from './colours';
import { catchPart } from './grids';
import { handPlaces, jugglerFrame } from './juggler';
import { laneGeometry, ladderFrame, rowY } from './ladder';
import type { Segment } from './types';

const single = (schedule: Segment['schedule']): Segment => ({ schedule, startTime: 0, pulseLen: 0.25, endTime: null, carry: new Map() });

test('the catching part comes from the catch event, never from the throwing part', () => {
  // Three parts passing round a ring: part 3 throws to part 1, which `1 - part` would get wrong.
  const s = buildSchedule(lineParts(['1x2', '1x3', '1x1'], { a: 1, b: 1 }));
  const throws = s.events.filter((e) => e.kind === 'throw');
  expect([...new Set(throws.map((e) => `${e.part}>${catchPart(s, e)}`))].sort()).toEqual(['0>1', '1>2', '2>0']);
  // A catch is its own part; a faulted group's stand-in flight lands in its own part.
  const c = s.events.find((e) => e.kind === 'catch');
  expect(c && catchPart(s, c)).toBe(c?.part);
  const broken = scheduleOf('432');
  const t = broken.events.find((e) => e.kind === 'throw');
  expect(t && catchPart(broken, t)).toBe(t?.part);
});

/** A manual part on a vanilla-style grid: spacing 2, unit 1, throws as [height, to]. */
const manual = (phase: number, throws: [number, number][]) => ({
  spacing: 2,
  phase,
  unit: 1,
  flights: { kind: 'manual' as const, throws: throws.map(([height, to]) => ({ height, to })) },
});
/** Four hands, two cascades, every other left-hand throw passed to the other figure. */
const FOUR: Parts = [manual(0, [[3, 1], [3, 3]]), manual(1, [[3, 0], [3, 0]]), manual(0, [[3, 3], [3, 1]]), manual(1, [[3, 2], [3, 2]])];
/** Three layered hands at rates 3, 4 and 5, one ball each. */
const LAYERED: Parts = partsFromOnsets([[true], [true], [true]], [20, 15, 12]);
const RING = () => buildSchedule(lineParts(['1x2', '1x3', '1x1'], { a: 1, b: 1 }));
const x = (n: number) => +n.toFixed(9);

test('hands pair into figures: two parts are one figure as before, an odd last part a one-handed figure', () => {
  const S = JUGGLER.figureStride;
  const places = (n: number) => handPlaces(n, JUGGLER).map((h) => [h.part, x(h.catchX), x(h.throwX)]);
  expect(places(2)).toEqual([
    [0, JUGGLER.catchX[0], JUGGLER.throwX[0]],
    [1, JUGGLER.catchX[1], JUGGLER.throwX[1]],
  ]);
  // One part draws as the pair it always was.
  expect(places(1)).toEqual(places(2));
  // A one-handed figure: hand 1's span, centred where the pair would stand.
  const shift = (JUGGLER.catchX[1] - JUGGLER.throwX[0]) / 2;
  expect(places(3).slice(2)).toEqual([[2, x(S + shift), x(S + JUGGLER.throwX[0] + shift)]]);
  expect(places(4).slice(2)).toEqual([
    [2, x(S + JUGGLER.catchX[0]), x(S + JUGGLER.throwX[0])],
    [3, x(S + JUGGLER.catchX[1]), x(S + JUGGLER.throwX[1])],
  ]);
  // Figures never overlap.
  expect(S).toBeGreaterThan(JUGGLER.catchX[1]);
});

test('three parts: two figures, a pass lands at the other figure\'s catch point, the scene fits every hand', () => {
  const s = RING();
  expect(s.balls).toBe(3);
  const hands = handPlaces(3, JUGGLER);
  for (let now = 0; now < 4; now += 0.13) {
    const j = jugglerFrame([single(s)], now, JUGGLER);
    expect(j.balls.length).toBe(3);
    expect(j.hands).toEqual(hands);
    for (const b of j.balls) {
      expect([b.x, b.y, b.progress, b.flash].every(Number.isFinite)).toBe(true);
      expect(b.x - JUGGLER.radius).toBeGreaterThanOrEqual(j.bounds.left - 1e-9);
      expect(b.x + JUGGLER.radius).toBeLessThanOrEqual(j.bounds.right + 1e-9);
    }
    expect(j.bounds.right).toBeCloseTo((hands[2]?.throwX as number) + JUGGLER.radius, 9);
    const f = ladderFrame([single(s)], now, LADDER);
    expect(f.parts).toBe(3);
    for (const b of f.bars) expect([b.x0, b.x1].every(Number.isFinite)).toBe(true);
    for (const a of accents(f)) expect(Number.isFinite(a.x)).toBe(true);
  }
  // Part 2 (hand 2 of the first figure) passes to part 3 (the one-handed figure): when it lands,
  // its air over and its dwell (half a beat) begun, the ball is at part 3's catch point, across the gap.
  const pass = s.events.find((e) => e.kind === 'throw' && e.part === 1) as (typeof s.events)[number];
  expect(catchPart(s, pass)).toBe(2);
  const landing = single(s).startTime + (pass.pulse + pass.flight - JUGGLER.dwellBeats + s.period) * single(s).pulseLen + 1e-9;
  const ball = jugglerFrame([single(s)], landing, JUGGLER).balls.find((b) => b.held === 2);
  expect(ball?.x).toBeCloseTo(hands[2]?.catchX as number, 6);
  // The ladder: a lane per part, part 3's ticks on its own lane, the pass a cross into it.
  const f = ladderFrame([single(s)], 3, LADDER);
  expect(new Set(f.ticks.map((t) => t.part))).toEqual(new Set([0, 1, 2]));
  expect(f.bars.some((b) => b.from === 1 && b.to === 2 && b.cross)).toBe(true);
});

test('four parts: two two-handed figures with passes; layered parts: one ball per hand, no passes', () => {
  const four = buildSchedule(FOUR);
  expect(four.verdict.ok).toBe(true);
  const j = jugglerFrame([single(four)], 2.3, JUGGLER);
  expect(j.balls.length).toBe(6);
  expect(j.hands.map((h) => h.part)).toEqual([0, 1, 2, 3]);
  expect(j.bounds.right).toBeCloseTo(JUGGLER.figureStride + JUGGLER.catchX[1] + JUGGLER.radius, 9);
  expect(ladderFrame([single(four)], 5, LADDER).parts).toBe(4);
  const layered = buildSchedule(LAYERED);
  const l = jugglerFrame([single(layered)], 7.1, JUGGLER);
  expect(l.balls.length).toBe(3);
  // Every ball stays over its own hand's span: a throw to itself.
  for (const b of l.balls.filter((b) => b.held !== null)) {
    const h = handPlaces(3, JUGGLER)[b.held as number];
    expect(b.x).toBeGreaterThanOrEqual(Math.min(h?.catchX as number, h?.throwX as number) - 1e-9);
  }
});

test('a switch to more parts widens the scene smoothly, and both segments\' hands show while both are on screen', () => {
  const two = scheduleOf('3');
  const four = buildSchedule(FOUR);
  const B = two.cycle * 4;
  const segments: Segment[] = [
    { schedule: two, startTime: 0, pulseLen: 0.25, endTime: B * 0.25, carry: new Map() },
    { schedule: four, startTime: B * 0.25, pulseLen: 0.25, endTime: null, carry: new Map() },
  ];
  const right = (t: number) => jugglerFrame(segments, t, JUGGLER).bounds.right;
  expect(right(0)).toBeCloseTo(JUGGLER.catchX[1] + JUGGLER.radius, 9);
  expect(right(B * 0.25 + 1)).toBeCloseTo(JUGGLER.figureStride + JUGGLER.catchX[1] + JUGGLER.radius, 9);
  let prev = right(0);
  for (let t = 0; t < B * 0.25 + 3; t += 0.01) {
    expect(Math.abs(right(t) - prev), `at ${t}`).toBeLessThan(0.05);
    prev = right(t);
  }
  expect(jugglerFrame(segments, B * 0.25 + 0.1, JUGGLER).hands.map((h) => h.part)).toEqual([0, 1, 2, 3]);
  // And back: four parts to two narrows the scene once the old flights have landed.
  const [first, second] = segments as [Segment, Segment];
  const back: Segment[] = [
    { ...second, startTime: 0, endTime: B * 0.25 },
    { ...first, startTime: B * 0.25, endTime: null },
  ];
  expect(jugglerFrame(back, B * 0.25 + 10, JUGGLER).bounds.right).toBeCloseTo(JUGGLER.catchX[1] + JUGGLER.radius, 9);
  // No segment: two parts' hands, untinted.
  expect(jugglerFrame([], 0, JUGGLER)).toMatchObject({ parts: 2, hands: handPlaces(2, JUGGLER) });
  // A frame past every segment's end still has its scene and hands: the last segment's.
  const ended: Segment[] = [{ ...first, endTime: 1 }];
  expect(jugglerFrame(ended, 5, JUGGLER).hands).toHaveLength(2);
});

test('lanes: two parts keep the two facing lanes; three or more stack one band each, rows growing down', () => {
  const two = laneGeometry(2, 220, LADDER, BALL_COLOURS.length);
  expect(two).toMatchObject({ y: [LADDER.lanePaddingPx, 220 - LADDER.lanePaddingPx], dir: [1, -1], rows: BALL_COLOURS.length });
  // One part draws the two lanes the strip always had.
  expect(laneGeometry(1, 220, LADDER, BALL_COLOURS.length)).toEqual(two);
  const step = LADDER.barPx + LADDER.rowGapPx;
  expect(rowY(two, 0, 2)).toBe(LADDER.lanePaddingPx + 2 * step + LADDER.barPx / 2 + LADDER.rowGapPx);
  expect(rowY(two, 1, null)).toBe(220 - LADDER.lanePaddingPx - LADDER.barPx / 2 - LADDER.rowGapPx);
  const four = laneGeometry(4, 220, LADDER, BALL_COLOURS.length);
  const band = (220 - 2 * LADDER.lanePaddingPx) / 4;
  expect(four.y).toEqual([0, 1, 2, 3].map((i) => LADDER.lanePaddingPx + i * band));
  expect(four.dir).toEqual([1, 1, 1, 1]);
  // Every row of a lane stays inside its band, and rows repeat past what fits.
  expect(rowY(four, 3, four.rows - 1) + LADDER.barPx / 2 + LADDER.rowGapPx).toBeLessThanOrEqual(220 - LADDER.lanePaddingPx);
  expect(rowY(four, 0, four.rows - 1) + LADDER.barPx / 2 + LADDER.rowGapPx).toBeLessThanOrEqual(four.y[1] as number);
  expect(rowY(four, 1, four.rows)).toBe(rowY(four, 1, 0));
  // A phone strip too short for a second row still has one.
  expect(laneGeometry(4, 60, LADDER, BALL_COLOURS.length).rows).toBe(1);
});

test('partColour: one per part, the palette repeating past its end', () => {
  expect(partColour(0)).toBe(PART_COLOURS[0]);
  expect(partColour(1)).not.toBe(partColour(0));
  expect(partColour(PART_COLOURS.length + 2)).toBe(partColour(2));
  expect(new Set(PART_COLOURS).size).toBe(PART_COLOURS.length);
});

test('a switch from one part to two never tints the hands: one part is the pair, as the ladder\'s two lanes', () => {
  const one = buildSchedule(partsFromOnsets([[true, true, true]], [1], [3]));
  expect(one.grids).toHaveLength(1);
  const two = scheduleOf('3');
  const segments: Segment[] = [
    { schedule: one, startTime: 0, pulseLen: 0.25, endTime: 3, carry: new Map() },
    { schedule: two, startTime: 3, pulseLen: 0.25, endTime: null, carry: new Map() },
  ];
  for (const t of [0, 2.8, 3.1, 6]) {
    const f = jugglerFrame(segments, t, JUGGLER);
    expect(f.parts).toBeLessThanOrEqual(2);
    expect(f.hands).toEqual(handPlaces(2, JUGGLER));
    expect(f.bounds.right).toBeCloseTo(JUGGLER.catchX[1] + JUGGLER.radius, 9);
  }
  expect(jugglerFrame(segments, 0, JUGGLER).parts).toBe(1);
  expect(jugglerFrame(segments, 3.1, JUGGLER).parts).toBe(2);
  expect(ladderFrame(segments, 3.1, LADDER).parts).toBe(2);
  // Its balls ride hand 1, as they always have.
  for (const b of jugglerFrame(segments, 1.3, JUGGLER).balls) if (b.held !== null) expect(b.held).toBe(0);
});
