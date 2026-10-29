// What the picture reads from the player (docs/plans/v1-parallel.md, "Player view"). Frozen in
// wave 0: changing a field is a governor ruling. Lives in src/view so the pure view modules
// need no import from src/app; src/app/player.ts re-exports it.
import type { Schedule } from '../core/legacy/types';

export interface Segment {
  readonly schedule: Schedule;
  /** Audio-clock seconds at this segment's pulse 0. */
  readonly startTime: number;
  readonly pulseLen: number;
  /** Seconds at which the next segment takes over; null for the last. Flights launched before it are drawn to their landing, retimed to the next segment's pulse length (see Retiming). */
  readonly endTime: number | null;
  /**
   * Ball identity across the switch into this segment: new ball id → the previous segment's ball
   * id it continues. Empty for the first segment. Computed by `carryOver` (stream B).
   */
  readonly carry: ReadonlyMap<number, number>;
}

export interface PlayerView {
  /** The time the picture shows: the audio clock while playing, frozen while paused, set by the scrub slider. */
  readonly now: number;
  readonly state: 'stopped' | 'playing' | 'paused';
  /** Segments are never dropped in v1: colours are derived from the whole list from the first segment. */
  readonly segments: readonly Segment[];
  /** True while a queued change waits for the next cycle boundary. */
  readonly pending: boolean;
}
