// SPEC §3 "Mapping": the rules that turn an Event into a sound. Pure.
import { isCoincident } from '../core/grid';
import type { Event, Grid, Hand } from '../core/types';
import { BASE_VELOCITY, MAX_HEIGHT, MAX_VELOCITY } from '../tunables';

/** A sample name in the kit, e.g. `kick`, or null for silence. */
export type Sample = string | null;

export interface Mapping {
  readonly kit: 'TR-808';
  /** Which sample each throw height 1-9 plays. */
  readonly perHeight: Readonly<Record<number, Sample>>;
  readonly hands: readonly [HandVoice, HandVoice];
  readonly catches: { readonly on: boolean; readonly sample: Sample };
  /** Velocity added to a cross throw, and the sound of a cross caught on the downbeat. */
  readonly crossAccent: { readonly velocity: number; readonly downbeat: Sample };
}

export interface HandVoice {
  readonly pan: number;
  readonly gain: number;
}

export interface Hit {
  readonly sample: string;
  readonly hand: Hand;
  readonly velocity: number;
  readonly pan: number;
  readonly gain: number;
  readonly durationPulses: number;
}

export function hitFor(event: Event, mapping: Mapping, grids: readonly [Grid, Grid]): Hit | null {
  const sample = sampleFor(event, mapping, grids);
  if (sample === null) return null;
  const accent = event.cross ? mapping.crossAccent.velocity : 0;
  const voice = mapping.hands[event.hand];
  return {
    sample,
    hand: event.hand,
    velocity: Math.min(MAX_VELOCITY, BASE_VELOCITY + accent),
    pan: voice.pan,
    gain: voice.gain,
    durationPulses: event.flight,
  };
}

function sampleFor(event: Event, mapping: Mapping, grids: readonly [Grid, Grid]): Sample {
  if (event.kind === 'throw') {
    return event.height === 0 ? null : (mapping.perHeight[Math.min(event.height, MAX_HEIGHT)] ?? null);
  }
  if (event.cross && isCoincident(grids, event.pulse) && mapping.crossAccent.downbeat !== null) {
    return mapping.crossAccent.downbeat;
  }
  return mapping.catches.on ? mapping.catches.sample : null;
}
