// Pulses to seconds, and which events fall in a window of time. Pure; the player owns the loop.
import type { Event, Schedule } from '../core/types';

/** Seconds per pulse: part 0's beat length over its spacing in pulses (MATH.md §7). */
export function pulseSeconds(bpm: number, grids: Schedule['grids']): number {
  return 60 / (bpm * (grids[0] as Schedule['grids'][number]).spacing);
}

export interface TimedEvent {
  readonly event: Event;
  /** Pulses since the start of playback. */
  readonly pulse: number;
  /** Audio-clock time. */
  readonly time: number;
}

/**
 * Every event whose time falls in [fromTime, toTime), playback having started at `startTime`
 * with `pulseLen` seconds per pulse. The Schedule repeats every period; an event at pulse q
 * of the Schedule plays at absolute pulses q, q + period, q + 2·period, …
 */
export function eventsBetween(
  schedule: Schedule,
  startTime: number,
  pulseLen: number,
  fromTime: number,
  toTime: number,
): TimedEvent[] {
  const fromPulse = Math.max(0, Math.ceil((fromTime - startTime) / pulseLen));
  const toPulse = Math.ceil((toTime - startTime) / pulseLen);
  const out: TimedEvent[] = [];
  for (const event of schedule.events) {
    const q = event.pulse;
    let k = Math.max(0, Math.ceil((fromPulse - q) / schedule.period));
    for (let pulse = q + k * schedule.period; pulse < toPulse; k++, pulse += schedule.period) {
      out.push({ event, pulse, time: startTime + pulse * pulseLen });
    }
  }
  // Same order as the Schedule: a catch before a throw on the same pulse.
  return out.sort((p, q) => p.pulse - q.pulse || kindOrder(p.event) - kindOrder(q.event));
}

const kindOrder = (e: Event): number => (e.kind === 'catch' ? 0 : 1);
