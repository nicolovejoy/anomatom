import { expect, test } from 'vitest';
import { parsePattern } from './parse';
import { buildSchedule, toPartSchedule } from './schedule';
import type { Event, PatternInput, Schedule } from './types';

function pat(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

const vanilla = (text: string): PatternInput => ({ ratio: { a: 1, b: 1 }, hands: [pat(text)] });

function throwsOf(s: Schedule): Event[] {
  return s.events.filter((e) => e.kind === 'throw');
}

test('441: one orbit carries all three balls, so the period is three cycles', () => {
  const s = buildSchedule(vanilla('441'));
  expect(s.cycle).toBe(6);
  expect(s.period).toBe(18);
  expect(s.balls).toBe(3);
  expect(new Set(s.events.map((e) => e.ball)).size).toBe(3);
  const throws = throwsOf(s);
  expect(throws).toHaveLength(18);
  for (const t of throws) {
    const landingHand = t.cross ? (t.hand === 0 ? 1 : 0) : t.hand;
    expect(s.events).toContainEqual({ ...t, kind: 'catch', pulse: t.pulse + t.flight, hand: landingHand });
  }
});

test('441: a ball caught on a pulse is the ball thrown from that hand on that pulse', () => {
  const s = buildSchedule(vanilla('441'));
  for (const c of s.events.filter((e) => e.kind === 'catch')) {
    const next = throwsOf(s).find((t) => t.hand === c.hand && t.pulse === c.pulse % s.period);
    expect(next?.ball).toBe(c.ball);
  }
});

test('events are sorted by pulse, catches before throws on the same pulse', () => {
  const s = buildSchedule(vanilla('3'));
  const keys = s.events.map((e) => e.pulse * 2 + (e.kind === 'catch' ? 0 : 1));
  expect(keys).toEqual([...keys].sort((a, b) => a - b));
});

test('zero throws produce no events', () => {
  const s = buildSchedule(vanilla('501'));
  expect(s.balls).toBe(2);
  expect(s.period).toBe(6);
  expect(throwsOf(s)).toHaveLength(4);
});

test('each ball is thrown once per cycle in the cascade', () => {
  const s = buildSchedule(vanilla('3'));
  expect(s.cycle).toBe(2);
  expect(s.period).toBe(6);
  for (const ball of [0, 1, 2]) {
    expect(throwsOf(s).filter((t) => t.ball === ball)).toHaveLength(2);
  }
});

test('3:2 schedule carries both grids and the cross flag', () => {
  const s = buildSchedule({ ratio: { a: 3, b: 2 }, hands: [pat('2 2x 2'), pat('2x 2')] });
  expect(s.grids).toEqual([
    { pulsesPerBeat: 2, offset: 0 },
    { pulsesPerBeat: 3, offset: 0 },
  ]);
  expect(s.balls).toBe(4);
  expect(s.period).toBe(18);
  const crosses = throwsOf(s).filter((t) => t.cross && t.pulse < s.cycle);
  expect(crosses.map((t) => [t.hand, t.pulse, t.pulse + t.flight])).toEqual([
    [1, 0, 6],
    [0, 2, 6],
  ]);
});

test('an invalid pattern has no schedule', () => {
  expect(() => buildSchedule(vanilla('432'))).toThrow();
});

test('toPartSchedule reads hands as parts, grids as spacing and phase, and is memoized', () => {
  const legacy = buildSchedule(vanilla('531'));
  const parts = toPartSchedule(legacy);
  expect(parts.grids).toEqual([
    { spacing: 2, phase: 0 },
    { spacing: 2, phase: 1 },
  ]);
  expect(parts.cycle).toBe(legacy.cycle);
  expect(parts.period).toBe(legacy.period);
  expect(parts.balls).toBe(legacy.balls);
  expect(parts.verdict.ok).toBe(true);
  expect(parts.events.map((e) => [e.kind, e.pulse, e.part, e.ball, e.height, e.flight, e.cross])).toEqual(
    legacy.events.map((e) => [e.kind, e.pulse, e.hand, e.ball, e.height, e.flight, e.cross]),
  );
  expect(toPartSchedule(legacy)).toBe(parts);
});
