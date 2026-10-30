// The Rhythm tab's lanes (docs/plans/lanes.md), pure: no DOM, no timers. One lane per part, top
// to bottom: its rate and steps, its onsets as a step row, and phase, balls and hits as the knob
// row (design §14 option b). mount-knobs.ts turns these values into elements.
import { mod, onsetsOf, periodOf, ratesOf } from '../core';
import type { PartIndex } from '../core';
import { KNOBS, MAX_LANES, MAX_PERIOD, MAX_RATE } from '../tunables';
import { groupOf, isManualGroup, type Action } from './actions';
import type { Derived } from './derived';
import type { AppState } from './state';

/** What one lane shows. */
export interface LaneRow {
  readonly part: PartIndex;
  /** Beats this lane plays while a lane of rate 1 plays one (`ratesOf`). */
  readonly rate: number;
  /** The part's period in beats. */
  readonly steps: number;
  /** One per beat of the period: true where the part throws. */
  readonly onsets: readonly boolean[];
  /** The phase, in current pulses, within [0, wrap). */
  readonly phase: number;
  /** The part's period in pulses (spacing × steps): its phase wraps here. */
  readonly wrap: number;
  /** The cycle length in pulses, for the readout: it changes when the lattice refines. */
  readonly cycle: number;
  /** How many beats of the period are onsets. */
  readonly hits: number;
  /** The ball knob of a default group; null on a manual one, which has no knob (design §5). */
  readonly k: number | null;
  /** A manual group: its parts and its derived ball count (null while it has faults). Null on a default group. */
  readonly group: { readonly parts: readonly PartIndex[]; readonly balls: number | null } | null;
  /** False on the only lane: there is always one. */
  readonly canRemove: boolean;
}

/** One lane per part on screen (up to MAX_LANES), from the store's parts and the derived groups. */
export function laneRows(state: Pick<AppState, 'parts'>, d: Derived): LaneRow[] {
  const rates = ratesOf(state.parts);
  return state.parts.slice(0, MAX_LANES).map((p, part) => {
    const parts = groupOf(state.parts, part);
    const manual = isManualGroup(state.parts, parts);
    const balls = d.groups.find((g) => g.parts.includes(part))?.balls ?? null;
    const onsets = onsetsOf(p);
    const wrap = p.spacing * periodOf(p);
    return {
      part,
      rate: rates[part] as number,
      steps: onsets.length,
      onsets,
      phase: mod(p.phase, wrap),
      wrap,
      cycle: d.schedule.cycle,
      hits: onsets.filter(Boolean).length,
      k: manual ? null : (p.flights as { k: number }).k,
      group: manual ? { parts, balls } : null,
      canRemove: state.parts.length > 1,
    };
  });
}

/** Whether "Add a hand" applies: fewer than MAX_LANES parts. */
export const canAddLane = (state: Pick<AppState, 'parts'>): boolean => state.parts.length < MAX_LANES;

/** The phase stepper: one pulse later or earlier, wrapping within the period. Whole pulses never refine the lattice. */
export function phaseAction(row: LaneRow, delta: number): Action | null {
  if (row.wrap <= 1) return null;
  return { type: 'setPhase', part: row.part, phase: mod(row.phase + delta, row.wrap) };
}

/** The ball stepper of a default group: k from 1 to KNOBS.maxBalls; null at a limit or on a manual group. */
export function ballsAction(row: LaneRow, delta: number): Action | null {
  if (row.k === null) return null;
  const k = row.k + delta;
  return k < 1 || k > KNOBS.maxBalls ? null : { type: 'setK', part: row.part, k };
}

/** The hits stepper: the Euclidean generator over the lane's period, from 1 hit to every beat; null at a limit. */
export function hitsAction(row: LaneRow, delta: number): Action | null {
  const hits = row.hits + delta;
  return hits < 1 || hits > row.steps ? null : { type: 'generate', part: row.part, hits };
}

/** The rate stepper: 1 to MAX_RATE; null at a limit. */
export function rateAction(row: LaneRow, delta: number): Action | null {
  const rate = row.rate + delta;
  return rate < 1 || rate > MAX_RATE ? null : { type: 'setRate', part: row.part, rate };
}

/** The steps stepper: 1 to MAX_PERIOD beats; null at a limit. */
export function stepsAction(row: LaneRow, delta: number): Action | null {
  const steps = row.steps + delta;
  return steps < 1 || steps > MAX_PERIOD ? null : { type: 'setSteps', part: row.part, steps };
}

/** A tap on a step cell: that beat's onset toggled (a manual group resets with the notice). */
export function cellAction(row: LaneRow, beat: number): Action | null {
  return beat >= 0 && beat < row.steps ? { type: 'toggleOnset', part: row.part, beat } : null;
}

/** The remove button; null on the only lane. */
export function removeAction(row: LaneRow): Action | null {
  return row.canRemove ? { type: 'removeLane', part: row.part } : null;
}
