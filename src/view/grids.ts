// What the pictures read of a Schedule's grids and parts. Pure.
import { mod } from '../core/math';
import type { Event, PartIndex, Schedule } from '../core/types';

/** True when `part`'s grid has a beat on this pulse. */
export function onBeat(grids: Schedule['grids'], part: number, pulse: number): boolean {
  const g = grids[part];
  return g !== undefined && mod(pulse - g.phase, g.spacing) === 0;
}

/** True when every part has a beat on this pulse: the only place a cross lands on a shared beat. */
export function isCoincident(grids: Schedule['grids'], pulse: number): boolean {
  return grids.every((_, part) => onBeat(grids, part, pulse));
}

/**
 * The part that catches throw `e`: its `to`, set by buildSchedule from the flight (wave 2 ruling
 * 3), never worked out from the throwing part. A catch is its own part, and so is the landing of a
 * faulted group's stand-in flight.
 */
export function catchPart(_schedule: Schedule, e: Event): PartIndex {
  return e.to;
}
