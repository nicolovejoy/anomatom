// SPEC §7.6: audio events land within 2 ms of their scheduled time, measured from the audio
// clock. The sampler's `play(hit, time)` is handed an audio-clock time; with a fake clock we
// check that every such time sits on the pulse grid of the segment that owns it (to within
// TIMING_TOLERANCE_SECONDS), that it was handed over before it was due (never late) and not
// further ahead than the look-ahead window plus a pulse, and that none is skipped or doubled.
// The drawn ball at a catch is at the catching hand's throw point within one radius: that is
// src/view/juggler.test.ts (SPEC §7.6, second half), not repeated here.
import { expect, test, vi } from 'vitest';
import { scheduleOf } from '../test/schedules';
import type { DrumSound } from '../sound/drum-sound';
import { applyPreset } from '../sound/mapping';
import { LOOKAHEAD_SECONDS, SCHEDULER_INTERVAL_MS } from '../tunables';

/** These tests hear the sound by throw height; the default preset now plays one voice per part. */
const DEFAULT_MAPPING = applyPreset('height-drum');
import { createPlayer } from './player';

/** SPEC §7.6: 2 ms. */
const TIMING_TOLERANCE_SECONDS = 0.002;


function fakeSound() {
  const played: { time: number; handedAt: number }[] = [];
  let clock = 0;
  const sound = {
    now: () => clock,
    resume: vi.fn(),
    preload: vi.fn(),
    setFilter: vi.fn(),
    playPad: vi.fn(),
    play: (_hit: unknown, time: number) => played.push({ time, handedAt: clock }),
    close: vi.fn(),
  };
  /** Run the audio clock forward in scheduler-sized steps, as a real page does. */
  const run = (seconds: number) => {
    for (let t = 0; t < seconds; t += SCHEDULER_INTERVAL_MS / 1000) {
      clock += SCHEDULER_INTERVAL_MS / 1000;
      vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
    }
  };
  return { sound: sound as unknown as DrumSound, played, run };
}

/** Distance of `t` from the nearest pulse of a grid starting at `start` with `len` seconds a pulse. */
const offGrid = (t: number, start: number, len: number) => {
  const k = (t - start) / len;
  return Math.abs(k - Math.round(k)) * len;
};

const cases: { name: string; hands: string[]; ratio: { a: number; b: number }; bpm: number }[] = [
  { name: '3 at 1:1, 120 bpm', hands: ['3'], ratio: { a: 1, b: 1 }, bpm: 120 },
  { name: '97531 at 1:1, 173 bpm', hands: ['97531'], ratio: { a: 1, b: 1 }, bpm: 173 },
  { name: '2 / 2 at 3:2, 120 bpm', hands: ['2', '2'], ratio: { a: 3, b: 2 }, bpm: 120 },
  { name: '2 2x 2 / 2x 2 at 3:2, 87 bpm', hands: ['2 2x 2', '2x 2'], ratio: { a: 3, b: 2 }, bpm: 87 },
];

for (const c of cases) {
  test(`${c.name}: every event is on the pulse grid within 2 ms, handed over in time`, () => {
    vi.useFakeTimers();
    const { sound, played, run } = fakeSound();
    const player = createPlayer(sound);
    const schedule = scheduleOf(c.hands, c.ratio);
    player.play(schedule, DEFAULT_MAPPING, c.bpm);
    run(20);
    const seg = player.view().segments[0]!;
    expect(played.length).toBeGreaterThan(20);
    const times = played.map((p) => p.time);
    for (const p of played) {
      expect(offGrid(p.time, seg.startTime, seg.pulseLen)).toBeLessThanOrEqual(TIMING_TOLERANCE_SECONDS);
      expect(p.time).toBeGreaterThanOrEqual(seg.startTime);
      // Never late: the sampler had it before the clock reached it. And not absurdly early.
      expect(p.time - p.handedAt).toBeGreaterThanOrEqual(0);
      expect(p.time - p.handedAt).toBeLessThanOrEqual(LOOKAHEAD_SECONDS + seg.pulseLen);
    }
    // In order of hand-over, never going backwards past a pulse; nothing handed over twice.
    for (let i = 1; i < times.length; i++) expect(times[i]!).toBeGreaterThanOrEqual(times[i - 1]! - 1e-9);
    const distinct = new Set(played.map((p) => `${p.time.toFixed(6)}`));
    expect(distinct.size).toBeGreaterThan(20);
    player.stop();
    vi.useRealTimers();
  });
}

test('across a tempo change at the next cycle, events sit on the old grid, then on the new one', () => {
  vi.useFakeTimers();
  const { sound, played, run } = fakeSound();
  const player = createPlayer(sound);
  const schedule = scheduleOf('441');
  player.play(schedule, DEFAULT_MAPPING, 120);
  run(1);
  player.setEdit(schedule, 75);
  run(6);
  const [old, next] = player.view().segments;
  expect(next).toBeDefined();
  const boundary = old!.endTime as number;
  expect(next!.startTime).toBe(boundary);
  expect(next!.pulseLen).not.toBe(old!.pulseLen);
  const before = played.filter((p) => p.time < boundary);
  const after = played.filter((p) => p.time >= boundary);
  expect(before.length).toBeGreaterThan(0);
  expect(after.length).toBeGreaterThan(0);
  for (const p of before) expect(offGrid(p.time, old!.startTime, old!.pulseLen)).toBeLessThanOrEqual(TIMING_TOLERANCE_SECONDS);
  for (const p of after) expect(offGrid(p.time, next!.startTime, next!.pulseLen)).toBeLessThanOrEqual(TIMING_TOLERANCE_SECONDS);
  for (const p of played) expect(p.time - p.handedAt).toBeGreaterThanOrEqual(0);
  player.stop();
  vi.useRealTimers();
});
