// What the pictures read of a Schedule's grids. Pure.
import { mod } from '../core/math';
import type { Schedule } from '../core/types';

/** A hand on screen: the picture draws two parts, hand 1 (part 0) on the left and hand 2 on the right. */
export type Hand = 0 | 1;

/** True when `part`'s grid has a beat on this pulse. */
export function onBeat(grids: Schedule['grids'], part: number, pulse: number): boolean {
  const g = grids[part];
  return g !== undefined && mod(pulse - g.phase, g.spacing) === 0;
}

/** True when every part has a beat on this pulse: the only place a cross lands on a shared beat. */
export function isCoincident(grids: Schedule['grids'], pulse: number): boolean {
  return grids.every((_, part) => onBeat(grids, part, pulse));
}
