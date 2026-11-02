// SPEC §3 "Mapping": the rules that turn an Event into a sound. Pure.
//
// The Mapping is derived, never stored (docs/plans/v5-sound-model.md, ruling 2): `mappingOf` in
// drummers.ts builds it from what the sound follows, the Also play switches and the drum machines.
//
// A Mapping edit takes effect at once. Nothing here caches or remembers: `hitFor`, `padHitsAt`
// and `filterCutoff` are functions of their arguments, so the player reads the store's current
// mapping on every look-ahead tick and an edit is heard from the next window (about
// LOOKAHEAD_SECONDS), not at the next cycle boundary. Events already handed to the sampler
// keep the sound they were given.
import { isPass } from '../core/passing';
import type { Event, PartIndex, Schedule } from '../core/types';
import {
  BASE_VELOCITY,
  FILTER_FULL_CROSSINGS,
  FILTER_HZ_RANGE,
  FILTER_OPEN_HZ,
  MAX_HEIGHT,
  MAX_VELOCITY,
  PAD_CHORDS,
  PAD_HOLD_PULSES,
  PAD_VELOCITY,
} from '../tunables';

/** A sample name in the kit, e.g. `kick`, or null for silence. */
export type Sample = string | null;

export type PadInstrument = 'mellotron' | 'soundfont';
export type PadChord = 'Dm9' | 'Am7' | 'Cmaj7' | 'F69' | 'open5';

export interface Mapping {
  /** One voice per part, in part order; a part past the end borrows voice `part mod length`. */
  readonly parts: readonly PartVoice[];
  /** True when the preset reads flight length (the digit): then `perHeight` picks the sound; false: the part's own `sample`. */
  readonly byHeight: boolean;
  /** Which sample each throw height 1-9 plays. */
  readonly perHeight: Readonly<Record<number, Sample>>;
  /** When set, a throw plays entry `ball mod length` instead of its height's sample (ball to pitch). */
  readonly byBall: readonly string[] | null;
  readonly catches: { readonly on: boolean; readonly sample: Sample };
  /** Velocity added to a cross throw, and the sound of a cross caught on the downbeat. */
  readonly crossAccent: { readonly velocity: number; readonly downbeat: Sample };
  /**
   * A pass (a throw into another juggler's part): velocity added to it, and the sound it plays in place of
   * its own (null: its own). A pass whose own sound is silent (a null height or voice, or a 0) stays silent
   * even with a pass sample set.
   */
  readonly pass: { readonly velocity: number; readonly sample: Sample };
  /** Crossings to filter: a low-pass whose cutoff follows the pattern's crossing count, low to high Hz. */
  readonly filter: { readonly on: boolean; readonly low: number; readonly high: number };
  /** A chord on the downbeat of every cycle. */
  readonly pad: { readonly on: boolean; readonly instrument: PadInstrument; readonly chord: PadChord };
}

/** What a part sounds like: its kit, its own sound when the mapping does not read height, and where and how loud it sits. */
export interface PartVoice {
  readonly kit: string;
  readonly sample: Sample;
  readonly pan: number;
  readonly gain: number;
}

export interface Hit {
  readonly sample: string;
  readonly part: PartIndex;
  readonly velocity: number;
  readonly pan: number;
  readonly gain: number;
  readonly durationPulses: number;
}

/** One note of the downbeat pad, in the pad instrument's note names. */
export interface PadHit {
  readonly note: string;
  readonly velocity: number;
  readonly durationPulses: number;
}

/**
 * The pad notes to play when a cycle starts: the chord at pulse 0 of the cycle if the pad is on,
 * nothing at any other pulse. `cyclePulses`, when the caller knows it, is how long the chord rings;
 * it is held to at least one pulse, so a zero or negative length never makes a silent chord.
 */
export function padHitsAt(cyclePulse: number, mapping: Mapping, cyclePulses?: number): readonly PadHit[] {
  if (!mapping.pad.on || cyclePulse !== 0) return [];
  const durationPulses =
    cyclePulses === undefined || Number.isNaN(cyclePulses) ? PAD_HOLD_PULSES : Math.max(1, cyclePulses);
  return PAD_CHORDS[mapping.pad.chord].map((note) => ({ note, velocity: PAD_VELOCITY, durationPulses }));
}

/**
 * The low-pass cutoff in Hz for a pattern with `crossings` crossings (MATH §5). Filter off: wide
 * open. On: log-interpolated from `low` (no crossings) to `high` (FILTER_FULL_CROSSINGS or more),
 * so each extra crossing opens the filter by the same number of semitones. The range is clamped
 * into FILTER_HZ_RANGE and a reversed range is put the right way round.
 */
export function filterCutoff(crossings: number, mapping: Mapping): number {
  const { on, low, high } = mapping.filter;
  if (!on) return FILTER_OPEN_HZ;
  const clamp = (hz: number) => Math.min(FILTER_HZ_RANGE.max, Math.max(FILTER_HZ_RANGE.min, hz));
  const lo = clamp(Math.min(low, high));
  const hi = clamp(Math.max(low, high));
  const t = Number.isFinite(crossings) ? Math.min(1, Math.max(0, crossings / FILTER_FULL_CROSSINGS)) : 0;
  return lo * (hi / lo) ** t;
}

/** True when every part has a beat on this pulse: the only place a cross can land on a shared beat. */
function isCoincident(schedule: Schedule, pulse: number): boolean {
  return schedule.grids.every((g) => (((pulse - g.phase) % g.spacing) + g.spacing) % g.spacing === 0);
}

/** The voice of a part; a mapping with fewer voices than the schedule has parts repeats them. */
function voiceOf(mapping: Mapping, part: PartIndex): PartVoice {
  return mapping.parts[part % mapping.parts.length] as PartVoice;
}

export function hitFor(event: Event, mapping: Mapping, schedule: Schedule): Hit | null {
  const voice = voiceOf(mapping, event.part);
  const sample = sampleFor(event, mapping, schedule, voice);
  if (sample === null) return null;
  const accent = event.cross ? mapping.crossAccent.velocity : 0;
  const passes = event.kind === 'throw' && isPass(event.part, event.to);
  return {
    sample: passes && mapping.pass.sample !== null ? mapping.pass.sample : sample,
    part: event.part,
    velocity: Math.min(MAX_VELOCITY, BASE_VELOCITY + accent + (passes ? mapping.pass.velocity : 0)),
    pan: voice.pan,
    gain: voice.gain,
    durationPulses: event.flight,
  };
}

function sampleFor(event: Event, mapping: Mapping, schedule: Schedule, voice: PartVoice): Sample {
  if (event.kind === 'throw') {
    if (event.height === 0) return null;
    if (!mapping.byHeight) return voice.sample;
    // `ball` is null for a part in a faulted group: no ball-to-pitch there, so the height's sound.
    // Height is still event.height, which core sets to the gap to the part's next onset over its
    // unit for such a part (model-waves.md ruling), so the fallback of design §7 needs no path of its own.
    const byBall = mapping.byBall;
    if (byBall !== null && byBall.length > 0 && event.ball !== null) return byBall[event.ball % byBall.length] ?? null;
    return mapping.perHeight[Math.min(event.height, MAX_HEIGHT)] ?? null;
  }
  if (event.cross && isCoincident(schedule, event.pulse) && mapping.crossAccent.downbeat !== null) {
    return mapping.crossAccent.downbeat;
  }
  return mapping.catches.on ? mapping.catches.sample : null;
}
