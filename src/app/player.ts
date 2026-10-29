// The look-ahead loop: the only place with a timer. Every `SCHEDULER_INTERVAL_MS` it reads the
// audio clock and hands the sampler every event up to `LOOKAHEAD_SECONDS` ahead.
import type { Schedule } from '../core/types';
import type { DrumSound } from '../sound/drum-sound';
import { hitFor, type Mapping } from '../sound/mapping';
import { eventsBetween, pulseSeconds } from '../sound/transport';
import { LOOKAHEAD_SECONDS, SCHEDULER_INTERVAL_MS, START_DELAY_SECONDS } from '../tunables';
import type { PlayerView, Segment } from '../view/types';

export type { PlayerView, Segment } from '../view/types';

export interface PlayerOptions {
  /**
   * Called with the running total each time an event is handed to the sampler. Audio output is
   * not observable (samples come from a CDN and stay silent until loaded), so the page
   * publishes this count for the browser smoke test (SPEC §7.8).
   */
  readonly onScheduled?: (total: number) => void;
}

const NO_CARRY: ReadonlyMap<number, number> = new Map();

export function createPlayer(sound: DrumSound, options: PlayerOptions = {}) {
  let timer: ReturnType<typeof setInterval> | undefined;
  let playingSegment: Segment | null = null;
  let edit: { schedule: Schedule; bpm: number } | null = null;
  let scheduled = 0;

  function stop() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    playingSegment = null;
  }

  function play(schedule: Schedule, mapping: Mapping, bpm: number) {
    stop();
    // A gesture: resume the context, and retry any kit that failed to load at page open.
    sound.resume();
    sound.preload(mapping);
    const pulseLen = pulseSeconds(bpm, schedule.grids);
    const start = sound.now() + START_DELAY_SECONDS;
    playingSegment = { schedule, startTime: start, pulseLen, endTime: null, carry: NO_CARRY };
    let scheduledTo = 0;
    const tick = () => {
      // From wherever the last window ended, or from now if the clock has run past it (a
      // backgrounded tab throttles timers while the audio clock keeps going): missed events
      // are skipped, never piled onto one instant.
      const from = Math.max(scheduledTo, sound.now());
      const until = sound.now() + LOOKAHEAD_SECONDS;
      for (const t of eventsBetween(schedule, start, pulseLen, from, until)) {
        const hit = hitFor(t.event, mapping, schedule.grids);
        if (!hit) continue;
        sound.play(hit, t.time, pulseLen);
        options.onScheduled?.(++scheduled);
      }
      scheduledTo = until;
    };
    tick();
    timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
  }

  const playing = () => timer !== undefined;

  return {
    play,
    stop,
    playing,
    /** The latest valid edit, shown while stopped. Does not change what is playing. */
    setEdit(schedule: Schedule, bpm: number) {
      edit = { schedule, bpm };
    },
    /**
     * What the picture shows this frame. Playing: the schedule that sounds, so the picture
     * follows the sound, not the latest edit. Stopped: the latest valid edit with `now` at its
     * pulse 0, or no segment before the first edit.
     */
    view(): PlayerView {
      const now = sound.now();
      if (playingSegment) return { now, state: 'playing', segments: [playingSegment], pending: false };
      const segments: Segment[] = edit
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
      return { now, state: 'stopped', segments, pending: false };
    },
  };
}

export type Player = ReturnType<typeof createPlayer>;
