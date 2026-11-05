// The player: the look-ahead loop (the only place with timers) and the segments the picture
// reads. Every `SCHEDULER_INTERVAL_MS` it reads the audio clock and hands the sampler every event
// up to `LOOKAHEAD_SECONDS` ahead, each from the segment that owns its time.
//
// Segments (docs/plans/v1-parallel.md, "Player view"). Play starts one. A change while playing
// or paused (a pattern, ratio, tempo or restored state: `setEdit`) becomes a new segment at the
// next cycle boundary of the last one, never restarting anything: that segment's `endTime` is
// set to the boundary, a whole pulse B of its own, and the new one starts at exactly that time
// (`endTime === next.startTime`) with its own pulse length and `carry = carryOver(old, new, B)`.
// The boundary is the first cycle boundary at or after the last pulse already handed to the
// sampler, so nothing that has sounded is ever taken back. A change made before the last
// segment has sounded at all replaces it instead (same start). Segments are never dropped.
//
// Scheduling across a switch: the old segment plays its pulses below B, never B or later; the
// new one plays from its pulse 0. A flight launched before B and landing after it is caught at
// the new segment's pulse p (old pulse B + p), so its catch sounds then, at
// `startTime + p × pulseLen` of the new segment (Retiming). Catches of flights longer than the
// next segment are not followed across a second switch (ruling, v1).
//
// The Mapping (SPEC §4.3) is read on every tick, so an edit is heard from the next look-ahead
// window, not the next cycle (`setMapping`; events already handed over keep their sound). Each
// tick also sets the filter cutoff from the crossings of the segment sounding now, and plays
// the pad chord at every cycle start (pulse 0 of each cycle of each segment) in the window.
//
// Pause, resume and scrub, against the one clock (`sound.now()`):
// - `pause()` stops the loop. Events are handed to the sampler up to `LOOKAHEAD_SECONDS` ahead
//   and DrumSound cannot take a hit back, so instead of muting them the pause point is the end
//   of what has been handed over: the picture keeps moving with the clock until it reaches that
//   point (at most `LOOKAHEAD_SECONDS`, under half a pulse at 120 bpm) and freezes there. The
//   last hit heard is the last hit shown; no hit past the frozen time was ever scheduled.
// - `scrub(pulse)` while paused moves the frozen time within the cycle that was playing at the
//   pause point, `pulse` counted from that cycle's start (clamped to 0 … cycle).
// - `resume()` shifts every segment by the same offset so the frozen time lands
//   `START_DELAY_SECONDS` ahead of the clock, and schedules from there. The picture holds at the
//   frozen time until the clock catches up, so it does not jump back by the start delay.
//   Scheduling picks up at the first whole pulse at or after the frozen time, so a scrub to a
//   whole pulse plays that pulse's hit. A resume before the glide ends needs no shift and
//   continues seamlessly, the picture still following the clock.
//
// The context stopping (#81): when DrumSound says the context has left `running` (an iOS
// interruption), the player pauses as a press of Pause would; Play resumes. And
// `AUDIO_STALL_CHECK_MS` after each gesture it asks DrumSound to `renew` a context whose clock
// has not moved (or to report one a call still holds). A new context is a new clock: every
// time the player keeps moves by the jump (`sound.now()` after less before), and what the dead
// context never sounded is handed over again, from where this run's unheard audio began. One
// more check follows a new context; it never rebuilds.
//
// Letting go of the audio session (v6.5, #123): paused or stopped, the player asks DrumSound to
// `park` (the context suspended, iOS's media controls gone). With the page in view that is
// AUDIO_RELEASE_MS after Pause or Stop, so the glide and the drums' tails finish; a Play or
// resume before then cancels it. With the page hidden (`setHidden`) it is at once, as a hidden
// page's timers may never fire: hidden while paused or stopped, or paused while hidden (an iOS
// interruption in the background). Hidden while playing, it keeps playing (AUDIO_PLAYS_HIDDEN;
// false makes that a press of Pause). Shown again does nothing: only a gesture resumes. A park
// needs no re-anchoring: the clock stands still and keeps its value, and play and resume derive
// everything from `sound.now()` at the gesture.
import { carryOver } from '../core/carry';
import type { Schedule } from '../core/types';
import type { DrumSound } from '../sound/drum-sound';
import { filterCutoff, hitFor, padHitsAt, type Hit, type Mapping } from '../sound/mapping';
import { crossingsOfSchedule } from '../sound/schedule-crossings';
import { eventsBetween, pulseSeconds, type TimedEvent } from '../sound/transport';
import { mappingOf } from '../sound/drummers';
import {
  AUDIO_PLAYS_HIDDEN,
  AUDIO_RELEASE_MS,
  AUDIO_STALL_CHECK_MS,
  DEFAULT_ALSO,
  DEFAULT_KIT_SHIFT,
  DEFAULT_LISTEN,
  LOOKAHEAD_SECONDS,
  SCHEDULER_INTERVAL_MS,
  START_DELAY_SECONDS,
} from '../tunables';
import type { PlayerView, Segment } from '../view/types';

export type { PlayerView, Segment } from '../view/types';
export type PlayState = PlayerView['state'];

export interface PlayerOptions {
  /**
   * Called with the running total each time an event is handed to the sampler. Audio output is
   * not observable (samples come from a CDN and stay silent until loaded), so the page
   * publishes this count for the browser smoke test (SPEC §7.8).
   */
  readonly onScheduled?: (total: number) => void;
}

const NO_CARRY: ReadonlyMap<number, number> = new Map();

/** The segment that owns time `t`: the first whose end is after `t`, else the last (as the ladder reads it). */
function segmentAt(segments: readonly Segment[], t: number): Segment {
  return segments.find((s) => s.endTime !== null && t < s.endTime) ?? (segments[segments.length - 1] as Segment);
}

/**
 * The previous segment's crossing catches that sound in [a, b) of a segment starting at
 * `startTime` with `pulseLen`, the boundary being the previous segment's pulse `pb`: a catch at
 * old pulse P of a flight launched before pb, with pb ≤ P, sounds at this segment's pulse
 * p = P − pb, at `startTime + p × pulseLen`. Worked in this segment's frame, in whole pulses, as
 * its own events are: reading the old schedule on a shifted clock (`startTime − pb × pulseLen`)
 * let floating point round pb up to pb + 1 and lose the catch on pulse 0. `pulse` in the result
 * is p.
 */
export function crossingCatches(
  prev: Schedule,
  pb: number,
  startTime: number,
  pulseLen: number,
  a: number,
  b: number,
): TimedEvent[] {
  const pFrom = Math.max(0, Math.ceil((a - startTime) / pulseLen));
  const pTo = Math.ceil((b - startTime) / pulseLen);
  // Integer pulses on a unit clock from 0 are exact: the old schedule's pulses pb + pFrom … pb + pTo − 1.
  return eventsBetween(prev, 0, 1, pb + pFrom, pb + pTo)
    .filter((t) => t.event.kind === 'catch' && t.pulse - t.event.flight < pb)
    .map((t) => ({ event: t.event, pulse: t.pulse - pb, time: startTime + (t.pulse - pb) * pulseLen }));
}

export function createPlayer(sound: DrumSound, options: PlayerOptions = {}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let stallCheck: ReturnType<typeof setTimeout> | undefined;
  /** The park due AUDIO_RELEASE_MS after a Pause or Stop in view; and whether the page is hidden. */
  let release: ReturnType<typeof setTimeout> | undefined;
  let hidden = false;
  let state: PlayState = 'stopped';
  /** Replaced, never mutated, so a view handed out stays as it was. */
  let segments: readonly Segment[] = [];
  /** `boundaries[i]`: segment i's `endTime` in its own pulses; one per segment but the last. */
  let boundaries: readonly number[] = [];
  /** Until `play` or `setMapping` hands it one: a fresh page's sound on two hands. */
  let mapping: Mapping = mappingOf(DEFAULT_LISTEN, DEFAULT_ALSO, DEFAULT_KIT_SHIFT, 2);
  /** The cutoff last handed to the sampler; NaN until one has been. */
  let cutoff = Number.NaN;
  let edit: { schedule: Schedule; bpm: number } | null = null;
  let scheduled = 0;
  /** Audio time up to which events have been handed to the sampler. */
  let scheduledTo = 0;
  /** Where this run's unheard audio begins: handed over again if the context is replaced. */
  let runFrom = 0;
  /** While paused: the time the picture freezes at, and whether it is still gliding up to it. */
  let frozen = 0;
  let gliding = false;
  /** While paused: the audio time of the start of the cycle the scrub moves within. */
  let cycleStart = 0;
  /** After a resume: the picture holds here until the clock reaches it. */
  let hold = -Infinity;

  /** Every segment `d` seconds later. */
  function shift(d: number) {
    segments = segments.map((s) => ({
      ...s,
      startTime: s.startTime + d,
      endTime: s.endTime === null ? null : s.endTime + d,
    }));
  }

  /** After a gesture's resume: a context whose clock has not moved is replaced, and the player moves to the new clock. */
  function checkClock() {
    clearStallCheck();
    stallCheck = setTimeout(() => {
      stallCheck = undefined;
      const before = sound.now();
      if (!sound.renew()) return;
      const d = sound.now() - before;
      shift(d);
      frozen += d;
      cycleStart += d;
      hold += d;
      // Nothing since `runFrom` sounded: hand it over again (paused: resume sets it).
      scheduledTo = runFrom + d;
      // Check-only: the new context is reported if it cannot start.
      checkClock();
    }, AUDIO_STALL_CHECK_MS);
  }

  function clearStallCheck() {
    if (stallCheck !== undefined) clearTimeout(stallCheck);
    stallCheck = undefined;
  }

  function clearRelease() {
    if (release !== undefined) clearTimeout(release);
    release = undefined;
  }

  /** Lets go of the audio session now; no stall check survives it (a parked clock does not move). */
  function park() {
    clearRelease();
    clearStallCheck();
    sound.park();
  }

  /** After Pause or Stop: park at once if the page is hidden, else AUDIO_RELEASE_MS later. */
  function letGo() {
    if (hidden) return park();
    clearRelease();
    release = setTimeout(park, AUDIO_RELEASE_MS);
  }

  function stopTimer() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  /** Stop, keeping the audio session: `play` starts again at once. */
  function halt() {
    stopTimer();
    clearStallCheck();
    state = 'stopped';
    cutoff = Number.NaN;
    segments = [];
    boundaries = [];
    hold = -Infinity;
  }

  function stop() {
    const was = state;
    halt();
    if (was !== 'stopped') letGo();
  }

  function play(schedule: Schedule, newMapping: Mapping, bpm: number) {
    clearRelease();
    halt();
    // A gesture: resume the context, and retry any kit that failed to load at page open.
    sound.resume();
    checkClock();
    sound.preload(newMapping);
    mapping = newMapping;
    const startTime = sound.now() + START_DELAY_SECONDS;
    segments = [{ schedule, startTime, pulseLen: pulseSeconds(bpm, schedule.grids), endTime: null, carry: NO_CARRY }];
    scheduledTo = 0;
    run(sound.now());
  }

  /** `from`: where this run's unheard audio begins (see `runFrom`). */
  function run(from: number) {
    state = 'playing';
    runFrom = from;
    tick();
    timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  }

  function tick() {
    // From wherever the last window ended, or from now if the clock has run past it (a
    // backgrounded tab throttles timers while the audio clock keeps going): missed events
    // are skipped, never piled onto one instant.
    const now = sound.now();
    const from = Math.max(scheduledTo, now);
    const until = now + LOOKAHEAD_SECONDS;
    // The filter follows the crossings of the segment sounding now; only a change is sent.
    const wanted = filterCutoff(crossingsOfSchedule(segmentAt(segments, now).schedule), mapping);
    if (wanted !== cutoff) {
      cutoff = wanted;
      sound.setFilter(wanted);
    }
    const hits: { hit: Hit; time: number; pulseLen: number }[] = [];
    const pads: { time: number; pulseLen: number; cycle: number }[] = [];
    const add = (t: TimedEvent, shape: Schedule, pulseLen: number) => {
      const hit = hitFor(t.event, mapping, shape);
      if (hit) hits.push({ hit, time: t.time, pulseLen });
    };
    segments.forEach((seg, i) => {
      const a = Math.max(from, seg.startTime);
      const b = Math.min(until, seg.endTime ?? Infinity);
      if (a >= b) return;
      // Its own events below its boundary, in whole pulses: the next segment owns B onward.
      const B = boundaries[i] ?? Infinity;
      // The pad: a chord at each cycle start, by the same whole-pulse rounding as the events.
      const { cycle } = seg.schedule;
      const pFrom = Math.max(0, Math.ceil((a - seg.startTime) / seg.pulseLen));
      const pTo = Math.min(B, Math.ceil((b - seg.startTime) / seg.pulseLen));
      for (let p = Math.ceil(pFrom / cycle) * cycle; mapping.pad.on && p < pTo; p += cycle) {
        pads.push({ time: seg.startTime + p * seg.pulseLen, pulseLen: seg.pulseLen, cycle });
      }
      for (const t of eventsBetween(seg.schedule, seg.startTime, seg.pulseLen, a, b)) {
        if (t.pulse < B) add(t, seg.schedule, seg.pulseLen);
      }
      // The previous segment's crossing flights, caught here at this segment's pulse p.
      const prev = segments[i - 1];
      if (prev === undefined) return;
      const pb = boundaries[i - 1] as number;
      // Below this segment's boundary too: a window ending at endTime can round up to p = B,
      // the next segment's start, and a flight is not followed across a second switch.
      for (const t of crossingCatches(prev.schedule, pb, seg.startTime, seg.pulseLen, a, b)) {
        if (t.pulse < B) add(t, prev.schedule, seg.pulseLen);
      }
    });
    hits.sort((p, q) => p.time - q.time);
    for (const { hit, time, pulseLen } of hits) {
      sound.play(hit, time, pulseLen);
      options.onScheduled?.(++scheduled);
    }
    for (const { time, pulseLen, cycle } of pads) {
      const chord = padHitsAt(0, mapping, cycle);
      if (chord.length > 0) sound.playPad(mapping.pad.instrument, chord, time, pulseLen);
    }
    // Never back: after a resume to a point ahead of the clock, the first windows end before it.
    scheduledTo = Math.max(scheduledTo, until);
  }

  /** A change while playing or paused: lands at the next cycle boundary as a new segment. */
  function queue(schedule: Schedule, bpm: number) {
    const pulseLen = pulseSeconds(bpm, schedule.grids);
    // Nothing at or after the horizon has been handed to the sampler (paused: nothing will be
    // until resume schedules from the frozen time).
    const horizon = state === 'paused' ? frozen : scheduledTo;
    const i = segments.length - 1;
    const tail = segments[i] as Segment;
    if (tail.startTime >= horizon) {
      // The last segment has not sounded: the change replaces it, from the same start.
      const prev = segments[i - 1];
      const carry = prev ? carryOver(prev.schedule, schedule, boundaries[i - 1] as number) : NO_CARRY;
      segments = [...segments.slice(0, i), { schedule, startTime: tail.startTime, pulseLen, endTime: null, carry }];
      return;
    }
    // The pulses handed over are those below `handed` (eventsBetween's own rounding), so the
    // boundary is the first cycle boundary at or after it.
    const handed = Math.ceil((horizon - tail.startTime) / tail.pulseLen);
    const { cycle } = tail.schedule;
    const B = Math.ceil(handed / cycle) * cycle;
    const endTime = tail.startTime + B * tail.pulseLen;
    segments = [
      ...segments.slice(0, i),
      { ...tail, endTime },
      { schedule, startTime: endTime, pulseLen, endTime: null, carry: carryOver(tail.schedule, schedule, B) },
    ];
    boundaries = [...boundaries, B];
  }

  function pause() {
    if (state !== 'playing') return;
    stopTimer();
    state = 'paused';
    frozen = scheduledTo;
    gliding = true;
    const seg = segmentAt(segments, frozen);
    const { cycle } = seg.schedule;
    const cycles = Math.max(0, Math.floor((frozen - seg.startTime) / seg.pulseLen / cycle));
    cycleStart = seg.startTime + cycles * cycle * seg.pulseLen;
    letGo();
  }

  function resume() {
    if (state !== 'paused') return;
    clearRelease();
    sound.resume();
    checkClock();
    const now = sound.now();
    // Still gliding: the hits handed over are still sounding, so the picture keeps following
    // the clock and nothing shifts.
    const glide = gliding && now < frozen;
    const d = glide ? 0 : Math.max(0, now + START_DELAY_SECONDS - frozen);
    // Schedule from the first whole pulse at or after the frozen point, in the segment that
    // owns it, half a pulse early so rounding cannot skip it. A glide's frozen point is where
    // the handing-over stopped, so it rounds as eventsBetween did; a scrub's is meant to sit
    // on the pulse it names, so a hair above it still counts as that pulse.
    const seg = segmentAt(segments, frozen);
    const at = (frozen - seg.startTime) / seg.pulseLen;
    const k = Math.ceil(gliding ? at : at - 1e-9);
    scheduledTo = seg.startTime + d + Math.max(0, k - 0.5) * seg.pulseLen;
    shift(d);
    // A glide resume keeps the hold it had: in the past as a rule, but after a scrub ahead of
    // the clock, a resume and a pause in the wait, it is the scrubbed point the audio resumes at.
    hold = glide ? hold : frozen + d;
    // A glide: what was handed over before the pause, from now on, has not sounded yet. Otherwise
    // the run starts at the resume point.
    run(glide ? now : scheduledTo);
  }

  /** The time the picture shows, while playing or paused. */
  function shownTime(): number {
    const clock = Math.max(sound.now(), hold);
    // Gliding: never short of a hold still ahead (a scrub ahead of the clock, resumed and
    // paused again: its frozen time is half a pulse before the scrubbed point).
    if (state === 'paused') return gliding ? Math.min(clock, Math.max(frozen, hold)) : frozen;
    return clock;
  }

  // An interruption is a press of Pause: the screen never shows playing over a stopped clock.
  // The way to stop listening is not kept: one player per page, for the page's life.
  sound.onInterrupt(pause);

  return {
    play,
    /**
     * A new Mapping (`derived(state).mapping`, after a sound choice or a restored link): loads what it needs and is read by
     * the next look-ahead tick, so it is heard within about LOOKAHEAD_SECONDS.
     */
    setMapping(next: Mapping) {
      if (next === mapping) return;
      mapping = next;
      sound.preload(next);
    },
    stop,
    pause,
    resume,
    /**
     * The page hidden (another app, the lock screen) or shown again. Hidden while paused or
     * stopped lets go of the audio session at once; while playing, nothing (AUDIO_PLAYS_HIDDEN),
     * or else a press of Pause. Shown does nothing: only a gesture brings the sound back.
     */
    setHidden(next: boolean) {
      hidden = next;
      if (!hidden) return;
      if (state !== 'playing') return park();
      if (!AUDIO_PLAYS_HIDDEN) pause();
    },
    /** True only while playing; false when stopped or paused. */
    playing: () => state === 'playing',
    /**
     * While paused, moves the picture to `pulse` pulses into the cycle that was playing at the
     * pause point (fractions allowed, clamped to 0 … cycle); resume plays from there. Ignored
     * otherwise.
     */
    scrub(pulse: number) {
      if (state !== 'paused') return;
      const seg = segmentAt(segments, cycleStart);
      frozen = cycleStart + Math.min(Math.max(pulse, 0), seg.schedule.cycle) * seg.pulseLen;
      gliding = false;
    },
    /** While paused, where the picture is within the scrubbed cycle, for the slider; null otherwise. */
    scrubPosition(): { pulse: number; cycle: number } | null {
      if (state !== 'paused') return null;
      const seg = segmentAt(segments, cycleStart);
      return { pulse: (shownTime() - cycleStart) / seg.pulseLen, cycle: seg.schedule.cycle };
    },
    /**
     * The latest edit (pattern, ratio and tempo in one schedule and bpm; juggleable or not). Stopped: it is
     * what the picture shows and nothing else changes. Playing or paused: it is also queued, to
     * land at the next cycle boundary (`view().pending` until then).
     */
    setEdit(schedule: Schedule, bpm: number) {
      edit = { schedule, bpm };
      if (state !== 'stopped') queue(schedule, bpm);
    },
    /**
     * What the picture shows this frame. Playing or paused: the segments that sound, so the
     * picture follows the sound, a queued change included as the last segment from its start.
     * Stopped: the latest edit with `now` at its pulse 0, or no segment before the first
     * edit.
     */
    view(): PlayerView {
      if (state !== 'stopped') {
        const now = shownTime();
        // A queued change is a later segment that has not started; the first segment's own
        // start delay is not a change.
        const last = segments[segments.length - 1] as Segment;
        return { now, state, segments, pending: segments.length > 1 && last.startTime > now };
      }
      const now = sound.now();
      const shown: Segment[] = edit
        ? [
            {
              schedule: edit.schedule,
              startTime: now,
              pulseLen: pulseSeconds(edit.bpm, edit.schedule.grids),
              endTime: null,
              carry: NO_CARRY,
            },
          ]
        : [];
      return { now, state, segments: shown, pending: false };
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;
