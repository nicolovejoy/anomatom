import { expect, test } from 'vitest';
import { buildSchedule, parsePattern } from '../core';
import { eventsBetween, pulseSeconds } from './transport';

function schedule(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return buildSchedule({ ratio: { a: 1, b: 1 }, hands: [r.pattern] });
}

test('a pulse is a hand beat over its pulses per beat', () => {
  // Vanilla: a hand beats every 2 pulses; at 120 bpm a beat is 0.5 s, a pulse 0.25 s.
  expect(pulseSeconds(120, [{ pulsesPerBeat: 2, offset: 0 }, { pulsesPerBeat: 2, offset: 1 }])).toBe(0.25);
  // 3:2: hand 1 on 2-pulse beats at 90 bpm: a beat is 2/3 s, a pulse 1/3 s.
  expect(pulseSeconds(90, [{ pulsesPerBeat: 2, offset: 0 }, { pulsesPerBeat: 3, offset: 0 }])).toBeCloseTo(1 / 3);
});

test('events in a window, with the period repeating', () => {
  const s = schedule('3'); // cycle 2, period 6: throws at every pulse
  const start = 10;
  const len = 0.25;
  const timed = eventsBetween(s, start, len, 10, 10.5);
  expect(timed.map((t) => [t.event.kind, t.pulse, t.time])).toEqual([
    ['throw', 0, 10],
    ['throw', 1, 10.25],
  ]);
  // Two periods later the same throws, with the period's ball ids.
  const later = eventsBetween(s, start, len, 10 + 12 * len, 10 + 13 * len);
  expect(later.map((t) => [t.event.kind, t.pulse, t.event.ball])).toEqual([
    ['catch', 12, 0],
    ['throw', 12, 0],
  ]);
});

test('the window is half-open and never looks before the start', () => {
  const s = schedule('3');
  expect(eventsBetween(s, 10, 0.25, 9, 10)).toEqual([]);
  expect(eventsBetween(s, 10, 0.25, 10.25, 10.25)).toEqual([]);
  expect(eventsBetween(s, 10, 0.25, 10.1, 10.26).map((t) => t.pulse)).toEqual([1]);
});

test('a catch past the period lands in the next repetition at its unwrapped pulse', () => {
  const s = schedule('3'); // every throw of height 3 is caught 3 pulses later
  const timed = eventsBetween(s, 0, 1, 6, 7);
  const catches = timed.filter((t) => t.event.kind === 'catch');
  // Caught at absolute pulse 6: the throw at pulse 3 of the first period.
  expect(catches.map((t) => [t.pulse, t.event.pulse])).toEqual([[6, 6]]);
  const throwAt3 = s.events.find((e) => e.kind === 'throw' && e.pulse === 3);
  expect(catches[0]?.event.ball).toBe(throwAt3?.ball);
});
