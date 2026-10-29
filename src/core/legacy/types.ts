// The two-hand model, kept for one wave so the app builds while stream B moves its callers to
// src/core (docs/plans/model-waves.md). Every function here delegates to the part model.
import type { Ratio } from '../types';

export type { Ratio };

/** Hand 1 is 0, hand 2 is 1. */
export type Hand = 0 | 1;

/** One throw as written: a digit, and whether it is marked `x` (crosses to the other hand). */
export interface Throw {
  readonly height: number;
  readonly cross: boolean;
}

export type HandPattern = readonly Throw[];


/**
 * The user's input. At 1:1 `hands` holds one vanilla siteswap (hands alternate, odd digits
 * cross). At any other ratio it holds one sequence per hand in one-hand counting.
 */
export interface PatternInput {
  readonly ratio: Ratio;
  readonly hands: readonly HandPattern[];
}

/** Where a hand's beats fall: every `pulsesPerBeat` pulses, starting at `offset`. */
export interface Grid {
  readonly pulsesPerBeat: number;
  readonly offset: number;
}

/** Identifies a throw by its hand and its position in that hand's sequence. */
export interface ThrowId {
  readonly hand: Hand;
  readonly index: number;
}

/** One throw unrolled onto the pulse grid for one cycle. */
export interface Flight {
  readonly id: ThrowId;
  readonly from: Hand;
  readonly to: Hand;
  /** Beat number on the throwing hand's grid (vanilla: the shared beat). */
  readonly beat: number;
  readonly height: number;
  readonly cross: boolean;
  readonly launch: number;
  /** Landing pulse, not wrapped; may be at or past the cycle length. */
  readonly land: number;
}

export type ValidationError =
  | { readonly kind: 'fractional-balls'; readonly balls: number }
  | {
      readonly kind: 'collision';
      readonly hand: Hand;
      readonly pulse: number;
      readonly throws: readonly ThrowId[];
    }
  | {
      readonly kind: 'cross-off-grid';
      readonly fromHand: Hand;
      readonly beat: number;
      readonly landingPulse: number;
      readonly nearestLegal: number;
    }
  | { readonly kind: 'no-ball'; readonly hand: Hand; readonly beat: number };

/**
 * One validation error with the digits it involves, for highlighting (SPEC §4.2). Structured
 * only; the words are copy.ts's.
 */
export interface ErrorDetail {
  readonly error: ValidationError;
  /**
   * Per hand (hand 1, hand 2), the indices into that hand's sequence the error involves,
   * ascending. Indices count throws, not characters: in `2x 2 2` index 1 is the second `2`. At
   * 1:1 the one vanilla sequence is hand 1's, so every index is in the first list. A fractional
   * ball count is the whole pattern's, not one digit's: both lists are empty.
   */
  readonly digits: readonly [readonly number[], readonly number[]];
}

export type Validation =
  | { readonly ok: true; readonly balls: number }
  | { readonly ok: false; readonly errors: readonly ValidationError[] };

export type EventKind = 'throw' | 'catch';

export interface Event {
  readonly kind: EventKind;
  /** Throws fall in [0, period). A catch may fall at or past the period. */
  readonly pulse: number;
  readonly hand: Hand;
  readonly ball: number;
  readonly height: number;
  /** Flight length in pulses. */
  readonly flight: number;
  readonly cross: boolean;
}

export interface Schedule {
  /** Pulses after which the pattern repeats: where cycle lines are drawn and knob changes land. */
  readonly cycle: number;
  /**
   * Pulses after which the pattern repeats with the same ball in each throw: a multiple of
   * `cycle`. In 441 one ball takes three cycles to return to its starting throw, so the
   * period is three cycles. Events cover one period.
   */
  readonly period: number;
  readonly grids: readonly [Grid, Grid];
  readonly balls: number;
  readonly events: readonly Event[];
}
