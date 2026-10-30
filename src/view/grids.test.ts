import { expect, test } from 'vitest';
import { buildSchedule } from '../core';
import { lineParts, scheduleOf } from '../test/schedules';
import { JUGGLER, LADDER } from '../tunables';
import { accents } from './accents';
import { catchPart, handOf } from './grids';
import { jugglerFrame } from './juggler';
import { ladderFrame } from './ladder';
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
  expect([0, 1, 2, 5].map(handOf)).toEqual([0, 1, 1, 1]);
});

test('a hand-made three-part state draws finite coordinates on two hands, though the editor cannot make one', () => {
  const s = buildSchedule(lineParts(['1x2', '1x3', '1x1'], { a: 1, b: 1 }));
  expect(s.balls).toBe(3);
  for (let now = 0; now < 4; now += 0.13) {
    const j = jugglerFrame([single(s)], now, JUGGLER);
    expect(j.balls.length).toBe(3);
    for (const b of j.balls) expect([b.x, b.y, b.progress, b.flash].every(Number.isFinite)).toBe(true);
    expect(Object.values(j.bounds).every(Number.isFinite)).toBe(true);
    const f = ladderFrame([single(s)], now, LADDER);
    for (const b of f.bars) {
      expect([b.x0, b.x1].every(Number.isFinite)).toBe(true);
      expect([0, 1]).toContain(b.from);
      expect([0, 1]).toContain(b.to);
    }
    for (const a of accents(f)) expect(Number.isFinite(a.x)).toBe(true);
  }
});
