import { expect, test } from 'vitest';
import type { Ratio, Schedule } from '../core';
import { scheduleOf } from '../test/schedules';
import { accents } from './accents';
import { ladderFrame } from './ladder';
import type { Segment } from './types';

const buildSchedule = ({ ratio, hands }: { ratio: Ratio; hands: string[] }) => scheduleOf(hands, ratio);
const input = (ratio: Ratio, ...hands: string[]) => ({ ratio, hands });
const single = (schedule: Schedule): Segment => ({ schedule, startTime: 0, pulseLen: 1, endTime: null, carry: new Map() });
const view = { windowPulses: 24, playheadFraction: 0.25 };

test('2 2x 2 / 2x 2 at 3:2: both crosses land on the shared downbeat, one mark per hand per landing', () => {
  const s = buildSchedule(input({ a: 3, b: 2 }, '2 2x 2', '2x 2'));
  const f = ladderFrame([single(s)], 6.5, view);
  const marks = accents(f);
  expect(marks.length).toBeGreaterThan(0);
  // Every mark is at a pulse where the 2-pulse and 3-pulse grids meet.
  for (const m of marks) expect(Math.round(m.x + f.start) % 6).toBe(0);
  expect(new Set(marks.map((m) => m.part))).toEqual(new Set([0, 1]));
  const keys = marks.map((m) => `${m.part}:${Math.round(m.x + f.start)}`);
  expect(new Set(keys).size).toBe(keys.length);
});

test('no cross, or 1:1, gives no mark', () => {
  const fountain = buildSchedule(input({ a: 3, b: 2 }, '2', '2'));
  expect(accents(ladderFrame([single(fountain)], 3, view))).toEqual([]);
  const cascade = buildSchedule(input({ a: 1, b: 1 }, '3'));
  expect(accents(ladderFrame([single(cascade)], 3, view))).toEqual([]);
});
