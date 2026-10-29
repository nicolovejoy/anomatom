import { expect, test, vi } from 'vitest';
import { buildSchedule, parsePattern } from '../core';
import { DEFAULT_MAPPING, LOOKAHEAD_SECONDS, SCHEDULER_INTERVAL_MS } from '../tunables';
import type { DrumSound } from '../sound/drum-sound';
import { createPlayer } from './player';

function schedule(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return buildSchedule({ ratio: { a: 1, b: 1 }, hands: [r.pattern] });
}

function fakeSound() {
  const played: { sample: string; time: number }[] = [];
  let clock = 0;
  const sound = {
    now: () => clock,
    resume: vi.fn(),
    preload: vi.fn(),
    play: (hit: { sample: string }, time: number) => played.push({ sample: hit.sample, time }),
    close: vi.fn(),
  };
  return { sound: sound as unknown as DrumSound, played, tick: (s: number) => (clock += s) };
}

test('play schedules the first window at once and keeps ahead of the clock', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120); // pulse 0.25 s
  expect(sound.resume).toHaveBeenCalled();
  // Start is a little after now; the first window covers the lookahead.
  expect(played.length).toBeGreaterThan(0);
  const first = played[0]?.time ?? 0;
  expect(first).toBeGreaterThan(0);
  expect(played.every((p) => p.time < first + LOOKAHEAD_SECONDS + 0.25)).toBe(true);
  const before = played.length;
  tick(1);
  vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
  expect(played.length).toBeGreaterThan(before);
  // Nothing is scheduled twice.
  const times = played.map((p) => p.time);
  expect(new Set(times).size).toBe(times.length);
  player.stop();
  vi.useRealTimers();
});

test('stop ends scheduling', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const player = createPlayer(sound);
  player.play(schedule('441'), DEFAULT_MAPPING, 120);
  player.stop();
  const n = played.length;
  tick(5);
  vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS * 4);
  expect(played.length).toBe(n);
  expect(player.playing()).toBe(false);
  vi.useRealTimers();
});

test('play while playing restarts cleanly', () => {
  vi.useFakeTimers();
  const { sound, played } = fakeSound();
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  player.play(schedule('441'), DEFAULT_MAPPING, 120);
  expect(player.playing()).toBe(true);
  expect(played.some((p) => p.sample === 'tom-low')).toBe(true);
  player.stop();
  vi.useRealTimers();
});

test('after the clock jumps (a backgrounded tab) missed events are skipped, not piled up', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  const before = played.length;
  tick(30);
  vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
  const fresh = played.slice(before);
  expect(fresh.length).toBeGreaterThan(0);
  expect(fresh.every((p) => p.time >= 30)).toBe(true);
  player.stop();
  vi.useRealTimers();
});

test('play preloads the kit again, so a load that failed at page open is retried', () => {
  vi.useFakeTimers();
  const { sound } = fakeSound();
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  expect(sound.preload).toHaveBeenCalledWith(DEFAULT_MAPPING);
  player.stop();
  vi.useRealTimers();
});

test('position is the playhead in pulses, fractional, and 0 when stopped', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  expect(player.position()).toBe(0);
  player.play(schedule('3'), DEFAULT_MAPPING, 120); // 0.25 s per pulse, starts 0.05 s after now
  tick(0.05 + 0.625);
  expect(player.position()).toBeCloseTo(2.5);
  player.stop();
  expect(player.position()).toBe(0);
  vi.useRealTimers();
});

test('the schedule being played is exposed while playing, null when stopped', () => {
  vi.useFakeTimers();
  const { sound } = fakeSound();
  const player = createPlayer(sound);
  expect(player.schedule()).toBeNull();
  const s = schedule('441');
  player.play(s, DEFAULT_MAPPING, 120);
  expect(player.schedule()).toBe(s);
  player.stop();
  expect(player.schedule()).toBeNull();
  vi.useRealTimers();
});
