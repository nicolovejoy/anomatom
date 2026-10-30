// What the pictures read of a Schedule's grids and parts. Pure.
import { mod } from '../core/math';
import type { Event, PartIndex, Schedule } from '../core/types';

/** A hand on screen: the picture draws two, hand 1 (part 0) on the left and hand 2 on the right. */
export type Hand = 0 | 1;

/**
 * The hand a part is drawn as. This wave shows two hands; a part past them (which the editor
 * cannot make, but a link could) is drawn as hand 2, so every coordinate stays finite.
 */
export const handOf = (part: PartIndex): Hand => (part === 0 ? 0 : 1);

/** True when `part`'s grid has a beat on this pulse. */
export function onBeat(grids: Schedule['grids'], part: number, pulse: number): boolean {
  const g = grids[part];
  return g !== undefined && mod(pulse - g.phase, g.spacing) === 0;
}

/** True when every part has a beat on this pulse: the only place a cross lands on a shared beat. */
export function isCoincident(grids: Schedule['grids'], pulse: number): boolean {
  return grids.every((_, part) => onBeat(grids, part, pulse));
}

const catchers = new WeakMap<Schedule, Map<string, PartIndex>>();

/**
 * The part that catches throw `e`, read off its catch event (same ball, at its pulse plus its
 * flight), never worked out from the throwing part. A throw with no ball (a faulted group's
 * stand-in flight) lands in its own part.
 */
export function catchPart(schedule: Schedule, e: Event): PartIndex {
  if (e.kind === 'catch' || e.ball === null) return e.part;
  let index = catchers.get(schedule);
  if (!index) {
    index = new Map();
    for (const c of schedule.events) if (c.kind === 'catch' && c.ball !== null) index.set(`${c.ball}:${c.pulse}`, c.part);
    catchers.set(schedule, index);
  }
  return index.get(`${e.ball}:${e.pulse + e.flight}`) ?? e.part;
}
