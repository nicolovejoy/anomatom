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

test('view while playing: one segment of what sounds, from its start, at the audio clock', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  const s = schedule('441');
  player.play(s, DEFAULT_MAPPING, 120); // 0.25 s per pulse, starts 0.05 s after now
  tick(0.05 + 0.625);
  const v = player.view();
  expect(v.state).toBe('playing');
  expect(v.pending).toBe(false);
  expect(v.now).toBeCloseTo(0.675);
  expect(v.segments).toHaveLength(1);
  const seg = v.segments[0]!;
  expect(seg.schedule).toBe(s);
  expect(seg.startTime).toBeCloseTo(0.05);
  expect(seg.pulseLen).toBe(0.25);
  expect(seg.endTime).toBeNull();
  expect(seg.carry.size).toBe(0);
  // The playhead, in pulses: 2.5 pulses in.
  expect((v.now - seg.startTime) / seg.pulseLen).toBeCloseTo(2.5);
  player.stop();
  vi.useRealTimers();
});

test('an edit while playing does not change what the picture shows until stopped', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  const playing = schedule('3');
  const edited = schedule('441');
  player.play(playing, DEFAULT_MAPPING, 120);
  player.setEdit(edited, 60);
  expect(player.view().segments[0]?.schedule).toBe(playing);
  player.stop();
  tick(2);
  const v = player.view();
  expect(v.state).toBe('stopped');
  expect(v.segments[0]?.schedule).toBe(edited);
  vi.useRealTimers();
});

test('view while stopped: no segment before any edit, then the latest edit with now at pulse 0', () => {
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  expect(player.view()).toEqual({ now: 0, state: 'stopped', segments: [], pending: false });
  tick(3);
  player.setEdit(schedule('3'), 120);
  const s = schedule('531');
  player.setEdit(s, 60); // 0.5 s per pulse
  const v = player.view();
  expect(v.now).toBe(3);
  expect(v.segments).toHaveLength(1);
  expect(v.segments[0]).toMatchObject({ schedule: s, startTime: 3, pulseLen: 0.5, endTime: null });
  expect(v.segments[0]?.carry.size).toBe(0);
});

test('each event handed to the sampler is counted, and the count keeps rising across plays', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const counts: number[] = [];
  const player = createPlayer(sound, { onScheduled: (n) => counts.push(n) });
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  expect(counts.length).toBe(played.length);
  expect(counts.length).toBeGreaterThan(0);
  tick(1);
  vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
  player.play(schedule('441'), DEFAULT_MAPPING, 120);
  expect(counts).toEqual(counts.map((_, i) => i + 1));
  expect(counts.length).toBe(played.length);
  player.stop();
  vi.useRealTimers();
});

test('without a listener the count is kept silently', () => {
  vi.useFakeTimers();
  const { sound, played } = fakeSound();
  createPlayer(sound).play(schedule('3'), DEFAULT_MAPPING, 120);
  expect(played.length).toBeGreaterThan(0);
  vi.clearAllTimers();
  vi.useRealTimers();
});

test('events the mapping silences are neither played nor counted', () => {
  vi.useFakeTimers();
  const { sound, played } = fakeSound();
  const counts: number[] = [];
  const player = createPlayer(sound, { onScheduled: (n) => counts.push(n) });
  // Catches on with a null sample: catch events map to no hit. Throws still sound.
  player.play(schedule('3'), { ...DEFAULT_MAPPING, catches: { on: true, sample: null } }, 120);
  expect(counts.length).toBe(played.length);
  player.stop();
  vi.useRealTimers();
});
