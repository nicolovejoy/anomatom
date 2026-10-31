// The model of docs/plans/model-rethink.md: parts on one integer lattice, onsets, flights.
// Pulses are integers everywhere in this directory. The types below are frozen by
// docs/plans/model-waves.md ("Core types"); change them only by a governor ruling.

/** Hand ratio a:b, hand 1 making a beats while hand 2 makes b. */
export interface Ratio {
  readonly a: number;
  readonly b: number;
}

/** Index of a part (a hand). Hand 1 is part 0. */
export type PartIndex = number;

/** One beat of a part: flight length in lattice pulses (0 = no onset on this beat), a multiple of the part's `unit`, and the destination part (null = this part). Digits are notation: digit = height / unit. */
export interface Throw {
  readonly height: number;
  readonly to: PartIndex | null;
}

/** How a part's flights are decided: by the default rule from its onsets and ball knob, or by hand. */
export type PartFlights =
  | { readonly kind: 'default'; readonly onsets: readonly boolean[]; readonly k: number }
  | { readonly kind: 'manual'; readonly throws: readonly Throw[] };

/**
 * A part: one grid on the lattice (spacing in pulses, phase in pulses), its notation unit, and its
 * flights. Period in beats = onsets.length or throws.length. `unit` is the pulses one written digit
 * stands for: the spacing in one-hand counting and for default parts; 1 for a vanilla pair (spacing 2,
 * phases 0 and 1), where `3` is a 3-pulse flight. Lattice refinement scales spacing, phase, unit and heights together.
 */
export interface Part {
  readonly spacing: number;
  readonly phase: number;
  readonly unit: number;
  readonly flights: PartFlights;
}

/** The whole model: parts on one lattice, normalised so the gcd of every spacing, phase, unit and height is 1. */
export type Parts = readonly Part[];

export interface ThrowId {
  readonly part: PartIndex;
  /** Beat index within the part's period. */
  readonly index: number;
}

/** One throw unrolled onto the lattice for one cycle. */
export interface Flight {
  readonly id: ThrowId;
  readonly from: PartIndex;
  readonly to: PartIndex;
  readonly beat: number;
  readonly cross: boolean;
  readonly launch: number;
  /** Not wrapped; may be at or past the cycle. */
  readonly land: number;
}

export type Fault =
  | { readonly kind: 'collision'; readonly part: PartIndex; readonly pulse: number; readonly throws: readonly ThrowId[] }
  /** A flight lands on a pulse where the catching part has no onset (today's cross-off-grid, generalised). `nearestOnset` is the catching part's first onset at or after the landing, null when it has none. */
  | { readonly kind: 'no-onset'; readonly from: ThrowId; readonly part: PartIndex; readonly pulse: number; readonly nearestOnset: number | null }
  /** An onset that no flight lands on. */
  | { readonly kind: 'unfed'; readonly part: PartIndex; readonly pulse: number };

/** Parts joined by cross flights, judged together (design §5, §6). */
export interface CrossGroup {
  readonly parts: readonly PartIndex[];
  readonly faults: readonly Fault[];
  /** Derived ball count; null when faults is not empty. */
  readonly balls: number | null;
}

export interface Verdict {
  readonly groups: readonly CrossGroup[];
  /** Every group fault-free. */
  readonly ok: boolean;
}

export type EventKind = 'throw' | 'catch';

export interface Event {
  readonly kind: EventKind;
  readonly pulse: number;
  readonly part: PartIndex;
  /** The part that catches the flight (wave 2 ruling 3): `part` itself for a catch and for a faulted group's stand-in flight. */
  readonly to: PartIndex;
  /** Stable within the period; null for parts in a group with faults. */
  readonly ball: number | null;
  /** The digit: flight / the part's unit. What height-to-drum reads; MAX_HEIGHT clamps it. */
  readonly height: number;
  /** Flight length in pulses. */
  readonly flight: number;
  readonly cross: boolean;
}

export interface Schedule {
  readonly cycle: number;
  readonly period: number;
  /** One per part: spacing and phase. */
  readonly grids: readonly { readonly spacing: number; readonly phase: number }[];
  /** Sum over fault-free groups. */
  readonly balls: number;
  readonly events: readonly Event[];
  readonly verdict: Verdict;
}
