// The look-ahead loop: the only place with a timer. Every `SCHEDULER_INTERVAL_MS` it reads the
// audio clock and hands the sampler every event up to `LOOKAHEAD_SECONDS` ahead.
import type { Schedule } from '../core/types';
import type { DrumSound } from '../sound/drum-sound';
import { hitFor, type Mapping } from '../sound/mapping';
import { eventsBetween, pulseSeconds } from '../sound/transport';
import { LOOKAHEAD_SECONDS, SCHEDULER_INTERVAL_MS, START_DELAY_SECONDS } from '../tunables';

export function createPlayer(sound: DrumSound) {
  let timer: ReturnType<typeof setInterval> | undefined;

  function stop() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
  }

  return {
    play(schedule: Schedule, mapping: Mapping, bpm: number) {
      stop();
      // A gesture: resume the context, and retry any kit that failed to load at page open.
      sound.resume();
      sound.preload(mapping);
      const pulseLen = pulseSeconds(bpm, schedule.grids);
      const start = sound.now() + START_DELAY_SECONDS;
      let scheduledTo = 0;
      const tick = () => {
        // From wherever the last window ended, or from now if the clock has run past it (a
        // backgrounded tab throttles timers while the audio clock keeps going): missed events
        // are skipped, never piled onto one instant.
        const from = Math.max(scheduledTo, sound.now());
        const until = sound.now() + LOOKAHEAD_SECONDS;
        for (const t of eventsBetween(schedule, start, pulseLen, from, until)) {
          const hit = hitFor(t.event, mapping, schedule.grids);
          if (hit) sound.play(hit, t.time, pulseLen);
        }
        scheduledTo = until;
      };
      tick();
      timer = setInterval(tick, SCHEDULER_INTERVAL_MS);
    },
    stop,
    playing: () => timer !== undefined,
  };
}

export type Player = ReturnType<typeof createPlayer>;
