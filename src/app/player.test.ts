import { expect, test, vi } from 'vitest';
import { buildSchedule, carryOver, parsePattern } from '../core';
import { DEFAULT_MAPPING, LOOKAHEAD_SECONDS, SCHEDULER_INTERVAL_MS } from '../tunables';
import type { DrumSound } from '../sound/drum-sound';
import { axisPulse } from '../view/ladder';
import { createPlayer, crossingCatches, type Segment } from './player';

function parse(text: string) {
  const r = parsePattern(text);
  if (!r.ok) throw new Error(text);
  return r.pattern;
}

function schedule(text: string) {
  return buildSchedule({ ratio: { a: 1, b: 1 }, hands: [parse(text)] });
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

test('an edit while playing is queued behind what plays; after stop the picture shows it', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  const playing = schedule('3');
  const edited = schedule('441');
  player.play(playing, DEFAULT_MAPPING, 120);
  player.setEdit(edited, 60);
  const queued = player.view();
  expect(queued.segments[0]?.schedule).toBe(playing);
  expect(queued.segments[1]?.schedule).toBe(edited);
  expect(queued.pending).toBe(true);
  player.stop();
  tick(2);
  const v = player.view();
  expect(v.state).toBe('stopped');
  expect(v.segments).toHaveLength(1);
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

// ---------------------------------------------------------------------------------------------
// Segments: queued changes, tempo changes, pause, resume, scrub (stream B).
// At 120 bpm a vanilla pulse is 0.25 s and play starts 0.05 s after the clock, so pulse k of
// the first segment sounds at 0.05 + 0.25·k. The look-ahead is 0.1 s.
// ---------------------------------------------------------------------------------------------

/** Advances the fake audio clock and the fake timers together, one scheduler interval at a time. */
function runner(tick: (s: number) => number) {
  return (seconds: number) => {
    for (let t = 0; t < seconds - 1e-9; t += SCHEDULER_INTERVAL_MS / 1000) {
      tick(SCHEDULER_INTERVAL_MS / 1000);
      vi.advanceTimersByTime(SCHEDULER_INTERVAL_MS);
    }
  };
}

/** Pulse numbers of the played hits, given where pulse 0 sounds and the pulse length; throws if a hit is off the grid. */
function pulsesOf(times: readonly number[], start: number, pulseLen: number): number[] {
  return times.map((t) => {
    const k = Math.round((t - start) / pulseLen);
    if (Math.abs(start + k * pulseLen - t) > 1e-9) throw new Error(`off the grid: ${t}`);
    return k;
  });
}
const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

test('a pattern change while playing lands at the next cycle boundary: no restart, every pulse once', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  const three = schedule('3');
  const next = schedule('441');
  player.play(three, DEFAULT_MAPPING, 120);
  run(1); // handed over: pulses 0-4 (0.05 … 1.05); the window ends at 1.1
  player.setEdit(next, 120);

  const v = player.view();
  expect(v.pending).toBe(true);
  expect(v.segments).toHaveLength(2);
  const [old, fresh] = v.segments as [Segment, Segment];
  // 3's cycle is 2 pulses: the first boundary not yet handed over is pulse 6, at 1.55.
  expect(old.endTime).toBeCloseTo(1.55);
  expect(fresh.startTime).toBe(old.endTime); // exactly, not just close
  expect(fresh.schedule).toBe(next);
  expect(fresh.carry).toEqual(carryOver(three, next, 6));
  expect(fresh.carry.size).toBe(3);

  run(2);
  expect(player.view().pending).toBe(false);
  const before = played.filter((p) => p.time < 1.55 - 1e-9);
  const after = played.filter((p) => p.time >= 1.55 - 1e-9);
  // Old throws below the boundary only; the new segment owns from its pulse 0.
  expect(before.every((p) => p.sample === 'snare')).toBe(true);
  expect(after.slice(0, 3).map((p) => p.sample)).toEqual(['tom-low', 'tom-low', 'hihat-close']);
  // Same tempo, so one throw on every pulse: none missed, none twice.
  const ks = pulsesOf(played.map((p) => p.time), 0.05, 0.25).sort((a, b) => a - b);
  expect(ks).toEqual(range(0, ks.length));
  player.stop();
  vi.useRealTimers();
});

test('a tempo change keeps now and the strip continuous across the switch', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  const three = schedule('3');
  player.play(three, DEFAULT_MAPPING, 120);
  run(1);
  player.setEdit(three, 60); // 0.5 s per pulse from the boundary
  const [old, fresh] = player.view().segments as [Segment, Segment];
  expect(fresh.pulseLen).toBe(0.5);
  const boundary = old.endTime as number;
  expect(boundary).toBeCloseTo(1.55); // pulse 6
  expect(fresh.startTime).toBe(boundary);
  // Every ball carries, each to itself.
  expect(new Map(fresh.carry)).toEqual(
    new Map([
      [0, 0],
      [1, 1],
      [2, 2],
    ]),
  );

  // now is the audio clock, and the strip's axis has no jump at the boundary: six pulses of
  // the old tempo before it, the new tempo after it.
  const segs = player.view().segments;
  expect(axisPulse(segs, boundary - 0.01)).toBeCloseTo(6 - 0.01 / 0.25);
  expect(axisPulse(segs, boundary)).toBeCloseTo(6);
  expect(axisPulse(segs, boundary + 0.01)).toBeCloseTo(6 + 0.01 / 0.5);
  let last = player.view();
  for (let i = 0; i < 80; i++) {
    run(SCHEDULER_INTERVAL_MS / 1000);
    const v = player.view();
    expect(v.now).toBeGreaterThan(last.now);
    const step = axisPulse(v.segments, v.now) - axisPulse(last.segments, last.now);
    expect(step).toBeGreaterThan(0);
    expect(step).toBeLessThanOrEqual(SCHEDULER_INTERVAL_MS / 1000 / 0.25 + 1e-9);
    last = v;
  }

  // Throws: old pulses 0 and 1 at the old tempo, then every pulse at the new one.
  const oldTimes = played.filter((p) => p.time < boundary - 1e-9).map((p) => p.time);
  const newTimes = played.filter((p) => p.time >= boundary - 1e-9).map((p) => p.time);
  expect(pulsesOf(oldTimes, 0.05, 0.25)).toEqual(range(0, 6));
  const ks = pulsesOf(newTimes, boundary, 0.5);
  expect(ks).toEqual(range(0, ks.length));
  player.stop();
  vi.useRealTimers();
});

test('a crossing flight’s catch sounds at the new tempo (Retiming), never at the old one', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  const three = schedule('3');
  player.play(three, { ...DEFAULT_MAPPING, catches: { on: true, sample: 'rimshot' } }, 120);
  run(1);
  player.setEdit(three, 60);
  run(3);
  // B = 6, at 1.55. Before it, catches at the old tempo (old pulses 3-5). The throws at old
  // pulses 3, 4 and 5 land at old 6, 7 and 8: new pulses 0, 1 and 2, at 1.55, 2.05 and 2.55,
  // never at the old tempo's 1.80 or 2.05 + 0.25. The new segment's own catches follow from
  // its pulse 3, so every new pulse has exactly one catch.
  const catches = played.filter((p) => p.sample === 'rimshot').map((p) => p.time);
  const before = catches.filter((t) => t < 1.55 - 1e-9);
  const after = catches.filter((t) => t >= 1.55 - 1e-9);
  expect(pulsesOf(before, 0.05, 0.25)).toEqual([3, 4, 5]);
  expect(after.slice(0, 3).map((t) => Number(t.toFixed(9)))).toEqual([1.55, 2.05, 2.55]);
  expect(pulsesOf(after, 1.55, 0.5)).toEqual(range(0, after.length));
  player.stop();
  vi.useRealTimers();
});

test('queued changes while stopped apply at once: the picture shows the edit, nothing pending', () => {
  const { sound, tick } = fakeSound();
  const player = createPlayer(sound);
  tick(1);
  const s = schedule('441');
  player.setEdit(s, 120);
  const v = player.view();
  expect(v).toMatchObject({ state: 'stopped', pending: false, now: 1 });
  expect(v.segments).toHaveLength(1);
  expect(v.segments[0]).toMatchObject({ schedule: s, startTime: 1 });
});

test('a second change before the first has sounded replaces it, with the carry recomputed', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  const first = schedule('441');
  player.play(first, DEFAULT_MAPPING, 120);
  run(0.3);
  player.setEdit(schedule('3'), 120);
  const boundary = player.view().segments[0]?.endTime;
  expect(boundary).toBeCloseTo(0.05 + 6 * 0.25); // 441's cycle is 6
  const last = schedule('531');
  player.setEdit(last, 120);
  const v = player.view();
  expect(v.segments).toHaveLength(2);
  expect(v.segments[0]?.endTime).toBe(boundary);
  expect(v.segments[1]).toMatchObject({ schedule: last, startTime: boundary });
  expect(v.segments[1]?.carry).toEqual(carryOver(first, last, 6));
  player.stop();
  vi.useRealTimers();
});

test('a change after the queued segment has begun to sound becomes a third segment; none is dropped', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  const middle = schedule('441');
  player.setEdit(middle, 120); // lands at pulse 2, 0.55
  run(0.5); // the window now reaches past 0.55: 441's pulse 0 has been handed over
  const last = schedule('51');
  player.setEdit(last, 120);
  const v = player.view();
  expect(v.segments).toHaveLength(3);
  const [, mid, end] = v.segments as [Segment, Segment, Segment];
  expect(mid.startTime).toBeCloseTo(0.55);
  // 441's first boundary past what was handed over is its pulse 6.
  expect(mid.endTime).toBeCloseTo(0.55 + 6 * 0.25);
  expect(end.startTime).toBe(mid.endTime);
  expect(end.carry).toEqual(carryOver(middle, last, 6));
  expect(v.pending).toBe(true);

  run(4);
  const after = player.view();
  expect(after.segments).toHaveLength(3);
  expect(after.pending).toBe(false);
  // 51 from 2.05 on: a kick, then a hat.
  const tail = played.filter((p) => p.time >= (end.startTime as number) - 1e-9);
  expect(tail.slice(0, 2).map((p) => p.sample)).toEqual(['kick', 'hihat-close']);
  const ks = pulsesOf(played.map((p) => p.time), 0.05, 0.25).sort((a, b) => a - b);
  expect(ks).toEqual(range(0, ks.length));
  player.stop();
  vi.useRealTimers();
});

test('pause: the loop stops, the picture glides to the last hit handed over and freezes there', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1); // clock 1.0; handed over up to 1.1
  player.pause();
  expect(player.playing()).toBe(false);
  let v = player.view();
  expect(v.state).toBe('paused');
  expect(v.now).toBeCloseTo(1);
  const n = played.length;
  // Nothing was scheduled past the pause point.
  expect(played.every((p) => p.time < 1.1)).toBe(true);
  tick(0.05);
  expect(player.view().now).toBeCloseTo(1.05);
  run(2);
  v = player.view();
  expect(v.now).toBeCloseTo(1.1);
  expect(played.length).toBe(n);
  // Pausing again, or resuming twice, changes nothing.
  player.pause();
  expect(player.view().now).toBeCloseTo(1.1);
  player.stop();
  vi.useRealTimers();
});

test('resume continues from the frozen point with a fresh offset; the picture does not jump', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1);
  player.pause();
  run(4); // clock 5
  const frozen = player.view();
  const at = axisPulse(frozen.segments, frozen.now);
  expect(at).toBeCloseTo((1.1 - 0.05) / 0.25);
  const n = played.length;

  player.resume();
  player.resume(); // a second resume is ignored
  let v = player.view();
  expect(v.state).toBe('playing');
  // Shifted by 3.95 s, so pulse 0 is now at 4.0 and the frozen point at 5.05, the start delay
  // ahead of the clock; the picture holds there until the clock arrives.
  expect(v.segments[0]?.startTime).toBeCloseTo(4);
  expect(v.now).toBeCloseTo(5.05);
  expect(axisPulse(v.segments, v.now)).toBeCloseTo(at);
  run(0.025);
  expect(player.view().now).toBeCloseTo(5.05);
  run(1);
  v = player.view();
  expect(v.now).toBeCloseTo(6.025);

  // Every pulse once: 0-4 before the pause, 5 on after it at the new offset.
  const before = pulsesOf(played.slice(0, n).map((p) => p.time), 0.05, 0.25);
  const after = pulsesOf(played.slice(n).map((p) => p.time), 4, 0.25);
  expect([...before, ...after]).toEqual(range(0, played.length));
  expect(after[0]).toBe(5);
  player.stop();
  vi.useRealTimers();
});

test('resume before the glide ends needs no shift and continues seamlessly', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1);
  player.pause();
  player.resume();
  expect(player.view().segments[0]?.startTime).toBe(0.05);
  run(1);
  const ks = pulsesOf(played.map((p) => p.time), 0.05, 0.25);
  expect(ks).toEqual(range(0, ks.length));
  player.stop();
  vi.useRealTimers();
});

test('scrub while paused moves now within the paused cycle; resume plays from there', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('441'), DEFAULT_MAPPING, 120); // cycle 6, 1.5 s
  run(2);
  expect(player.scrubPosition()).toBeNull();
  player.scrub(3); // ignored while playing
  player.pause(); // frozen at 2.1, pulse 8.2: in the cycle from pulse 6 (1.55)
  expect(player.scrubPosition()?.cycle).toBe(6);
  expect(player.scrubPosition()?.pulse).toBeCloseTo(1.8); // still gliding: the clock is at 2.0
  player.scrub(3);
  expect(player.view().now).toBeCloseTo(1.55 + 0.75);
  expect(player.scrubPosition()).toEqual({ pulse: expect.closeTo(3), cycle: 6 });
  player.scrub(-1);
  expect(player.view().now).toBeCloseTo(1.55);
  player.scrub(99);
  expect(player.view().now).toBeCloseTo(1.55 + 1.5);
  player.scrub(2);
  expect(player.view().now).toBeCloseTo(2.05);

  run(8); // clock 10
  const n = played.length;
  player.resume();
  run(0.5);
  // Shifted so pulse 8 (cycle 1, pulse 2) sounds at the start delay after the clock.
  const start = player.view().segments[0]?.startTime as number;
  expect(start).toBeCloseTo(10.05 - 8 * 0.25);
  expect(pulsesOf(played.slice(n).map((p) => p.time), start, 0.25)[0]).toBe(8);
  player.stop();
  expect(player.scrubPosition()).toBeNull();
  vi.useRealTimers();
});

test('a change while paused lands at the next boundary after the frozen point', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1);
  player.pause(); // frozen at 1.1, pulse 4.2
  player.setEdit(schedule('441'), 120);
  let v = player.view();
  expect(v.pending).toBe(true);
  expect(v.segments[0]?.endTime).toBeCloseTo(0.05 + 6 * 0.25);
  // Scrubbed back to the cycle start, a further change replaces the one not yet sounded.
  player.scrub(0);
  const s531 = schedule('531');
  player.setEdit(s531, 120);
  v = player.view();
  expect(v.segments).toHaveLength(2);
  expect(v.segments[1]?.schedule).toBe(s531);
  player.resume();
  run(3);
  // From the boundary on, 531: kick, snare, hat.
  const boundary = player.view().segments[1]?.startTime as number;
  const tail = played.filter((p) => p.time >= boundary - 1e-9);
  expect(tail.slice(0, 3).map((p) => p.sample)).toEqual(['kick', 'snare', 'hihat-close']);
  player.stop();
  vi.useRealTimers();
});

test('paused at the first segment’s pulse 0, a change replaces that segment outright', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('441'), DEFAULT_MAPPING, 120);
  run(0.5);
  player.pause(); // in the first cycle
  player.scrub(0);
  const three = schedule('3');
  player.setEdit(three, 120);
  const v = player.view();
  expect(v.segments).toHaveLength(1);
  expect(v.segments[0]).toMatchObject({ schedule: three, startTime: 0.05 });
  expect(v.segments[0]?.carry.size).toBe(0);
  expect(v.pending).toBe(false);
  const n = played.length;
  player.resume();
  run(1);
  expect(played.slice(n).every((p) => p.sample === 'snare')).toBe(true);
  player.stop();
  vi.useRealTimers();
});

test('stop or play while paused leaves the pause behind', () => {
  vi.useFakeTimers();
  const { sound, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1);
  player.pause();
  player.play(schedule('441'), DEFAULT_MAPPING, 120);
  expect(player.view()).toMatchObject({ state: 'playing', pending: false });
  expect(player.view().segments).toHaveLength(1);
  player.pause();
  player.stop();
  expect(player.view().state).toBe('stopped');
  player.resume(); // ignored when stopped
  expect(player.view().state).toBe('stopped');
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------------------------
// PR 16 review follow-up.
// ---------------------------------------------------------------------------------------------

test('a crossing catch is read in the new segment’s frame: the one landing on its pulse 0 is kept', () => {
  // S − pb·L is 21.9 in floating point, and (S − 21.9) / L is 42.00000000000001: reading the old
  // schedule on a shifted clock rounded pb up to pb + 1 and lost new pulse 0.
  const caught = crossingCatches(schedule('3'), 42, 30.3, 0.2, 30.3, 30.4);
  expect(caught.map((t) => [t.pulse, t.time])).toEqual([[0, 30.3]]);
  expect(caught[0]?.event.kind).toBe('catch');
  // Only flights launched before pb and landing at or after it: none past the first window.
  expect(crossingCatches(schedule('3'), 42, 30.3, 0.2, 30.9, 31.5)).toEqual([]);
});

test('the 3:2 demo keeps its downbeat clap across a tempo change', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  const demo = buildSchedule({ ratio: { a: 3, b: 2 }, hands: [parse('2 2x 2'), parse('2x 2')] });
  player.play(demo, DEFAULT_MAPPING, 60);
  run(0.7);
  player.setEdit(demo, 150);
  const S = (player.view().segments[1] as Segment).startTime;
  expect(S).toBeCloseTo(3.05);
  run(4);
  expect(played.some((p) => p.sample === 'clap' && Math.abs(p.time - S) < 1e-9)).toBe(true);
  player.stop();
  vi.useRealTimers();
});

test.each([0, 1, 2, 3, 5, 6])('scrub to whole pulse %i then resume plays that pulse’s hit first', (k) => {
  // Over several tempos, pause points and waits, since whether the shift rounds past the
  // pulse depends on the floating-point values.
  for (const bpm of [120, 100, 77]) {
    for (const playFor of [1, 2, 2.3, 3.7]) {
      for (const wait of [0.3, 1, ...range(0, 20).map((i) => 1.3 + i * 0.7319)]) {
        vi.useFakeTimers();
        const { sound, played, tick } = fakeSound();
        const run = runner(tick);
        const player = createPlayer(sound);
        player.play(schedule('441'), DEFAULT_MAPPING, bpm); // a throw on every pulse
        run(playFor);
        player.pause();
        player.scrub(k);
        const v = player.view();
        const at = Math.round(axisPulse(v.segments, v.now)); // the cycle's start pulse + k
        tick(wait); // paused: no timer to advance
        const n = played.length;
        player.resume();
        run(5); // a scrub ahead of the clock waits for it
        const { startTime, pulseLen } = player.view().segments[0] as Segment;
        const first = pulsesOf(played.slice(n).map((p) => p.time), startTime, pulseLen)[0];
        expect(first, `${bpm} bpm, ${playFor} s, wait ${wait} s`).toBe(at);
        player.stop();
        vi.useRealTimers();
      }
    }
  }
});

test('pause then resume, during the glide or after: every pulse sounds once', () => {
  for (const bpm of [120, 100, 77]) {
    for (const playFor of [1, 2, 2.3, 3.7]) {
      for (const wait of [0, 0.025, 0.05, ...range(0, 12).map((i) => 0.3 + i * 0.7319)]) {
        vi.useFakeTimers();
        const { sound, played, tick } = fakeSound();
        const run = runner(tick);
        const player = createPlayer(sound);
        player.play(schedule('441'), DEFAULT_MAPPING, bpm); // a throw on every pulse
        const { startTime: s0, pulseLen } = player.view().segments[0] as Segment;
        run(playFor);
        player.pause();
        tick(wait);
        const n = played.length;
        player.resume();
        run(2);
        const s1 = (player.view().segments[0] as Segment).startTime;
        const ks = [
          ...pulsesOf(played.slice(0, n).map((p) => p.time), s0, pulseLen),
          ...pulsesOf(played.slice(n).map((p) => p.time), s1, pulseLen),
        ];
        expect(ks, `${bpm} bpm, ${playFor} s, wait ${wait} s`).toEqual(range(0, ks.length));
        player.stop();
        vi.useRealTimers();
      }
    }
  }
});

test('resume during the glide: the picture never runs ahead of the clock', () => {
  vi.useFakeTimers();
  const { sound, played, tick } = fakeSound();
  const run = runner(tick);
  const player = createPlayer(sound);
  player.play(schedule('3'), DEFAULT_MAPPING, 120);
  run(1);
  player.pause();
  player.resume();
  expect(player.view().now).toBeCloseTo(1);
  for (let i = 0; i < 20; i++) {
    expect(player.view().now).toBe(sound.now());
    run(SCHEDULER_INTERVAL_MS / 1000);
  }
  const ks = pulsesOf(played.map((p) => p.time), 0.05, 0.25);
  expect(ks).toEqual(range(0, ks.length));
  player.stop();
  vi.useRealTimers();
});
