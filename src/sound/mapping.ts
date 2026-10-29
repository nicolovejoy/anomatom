// SPEC §3 "Mapping": the rules that turn an Event into a sound. Pure.
//
// A Mapping edit takes effect at once. Nothing here caches or remembers: `hitFor`, `padHitsAt`
// and `filterCutoff` are functions of their arguments, so the player reads the store's current
// mapping on every look-ahead tick and an edit is heard from the next window (about
// LOOKAHEAD_SECONDS), not at the next cycle boundary. Events already handed to the sampler
// keep the sound they were given.
import { isCoincident } from '../core/grid';
import type { Event, Grid, Hand } from '../core/types';
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
  PRESET_MAPPINGS,
} from '../tunables';

/** A sample name in the kit, e.g. `kick`, or null for silence. */
export type Sample = string | null;

export type PadInstrument = 'mellotron' | 'soundfont';
export type PadChord = 'Dm9' | 'Am7' | 'Cmaj7' | 'F69' | 'open5';
export const PAD_INSTRUMENT_IDS: readonly PadInstrument[] = ['mellotron', 'soundfont'];
export const PAD_CHORD_IDS: readonly PadChord[] = ['Dm9', 'Am7', 'Cmaj7', 'F69', 'open5'];

export interface Mapping {
  readonly kit: 'TR-808';
  /** Which sample each throw height 1-9 plays. */
  readonly perHeight: Readonly<Record<number, Sample>>;
  /** When set, a throw plays entry `ball mod length` instead of its height's sample (ball to pitch). */
  readonly byBall: readonly string[] | null;
  readonly hands: readonly [HandVoice, HandVoice];
  readonly catches: { readonly on: boolean; readonly sample: Sample };
  /** Velocity added to a cross throw, and the sound of a cross caught on the downbeat. */
  readonly crossAccent: { readonly velocity: number; readonly downbeat: Sample };
  /** Crossings to filter: a low-pass whose cutoff follows the pattern's crossing count, low to high Hz. */
  readonly filter: { readonly on: boolean; readonly low: number; readonly high: number };
  /** A chord on the downbeat of every cycle. */
  readonly pad: { readonly on: boolean; readonly instrument: PadInstrument; readonly chord: PadChord };
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

export type PresetName = keyof typeof PRESET_MAPPINGS;
export const PRESET_NAMES = Object.keys(PRESET_MAPPINGS) as readonly PresetName[];

/** The preset a mapping equals field for field, or 'custom'. Derived, never stored, so it cannot go stale. */
export function presetOf(mapping: Mapping): PresetName | 'custom' {
  return PRESET_NAMES.find((name) => deepEqual(PRESET_MAPPINGS[name], mapping)) ?? 'custom';
}

/** The preset's mapping; choosing a preset rewrites every field (SPEC §4.3). */
export function applyPreset(name: PresetName): Mapping {
  return PRESET_MAPPINGS[name];
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return (
    ka.length === kb.length &&
    ka.every((k) => k in b && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/** One note of the downbeat pad, in the pad instrument's note names. */
export interface PadHit {
  readonly note: string;
  readonly velocity: number;
  readonly durationPulses: number;
}

/**
 * The pad notes to play when a cycle starts: the chord at pulse 0 of the cycle if the pad is on,
 * nothing at any other pulse. `cyclePulses`, when the caller knows it, is how long the chord rings.
 */
export function padHitsAt(cyclePulse: number, mapping: Mapping, cyclePulses?: number): readonly PadHit[] {
  if (!mapping.pad.on || cyclePulse !== 0) return [];
  const durationPulses = cyclePulses ?? PAD_HOLD_PULSES;
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
    if (event.height === 0) return null;
    const byBall = mapping.byBall;
    if (byBall !== null && byBall.length > 0) return byBall[event.ball % byBall.length] ?? null;
    return mapping.perHeight[Math.min(event.height, MAX_HEIGHT)] ?? null;
  }
  if (event.cross && isCoincident(grids, event.pulse) && mapping.crossAccent.downbeat !== null) {
    return mapping.crossAccent.downbeat;
  }
  return mapping.catches.on ? mapping.catches.sample : null;
}
