// AppState <-> the URL hash. Pure: no DOM, no timers. `route()` splits `#v1.<payload>`; this
// module encodes and decodes the payload.
//
// Scheme v1: `#v1.` + base64url (no padding) of the UTF-8 JSON of
//   { p: [pattern1, pattern2], r: [a, b], t: bpm, m: mapping }
// Only pattern text, ratio, bpm and mapping travel; never volume, lastStateHash or UI state.
// The mapping `m` is the preset's name (a string) when it equals one of the three presets,
// which is the common case and keeps the link short; otherwise it is an object of short keys:
//   h  nine samples for heights 1-9 (string or null)
//   b  the ball-to-pitch list, or null
//   v  [[pan, gain], [pan, gain]] for hand 1, hand 2
//   c  [catches on (0|1), catch sample]
//   d  [cross accent velocity, downbeat sample]
//   f  [filter on (0|1), low Hz, high Hz]
//   a  [pad on (0|1), instrument, chord]
// (The kit has one entry in v1 and is not encoded.)
//
// Decoding trusts nothing: a payload that is not base64url JSON of an object gives null; any
// other junk is repaired per field (unknown fields ignored, missing or mistyped ones taken from
// the defaults, numbers clamped to their ranges, sample names checked against the kit).
import { parsePattern } from '../core/legacy/parse';
import type { Ratio } from '../core/legacy/types';
import { applyPreset, PAD_CHORD_IDS, PAD_INSTRUMENT_IDS, presetOf, PRESET_NAMES, type Mapping, type Sample } from '../sound/mapping';
import {
  BPM_RANGE,
  CROSS_BOOST_RANGE,
  DEFAULT_MAPPING,
  FILTER_HZ_RANGE,
  GAIN_RANGE,
  KIT_SAMPLES,
  MAX_HEIGHT,
  MAX_RATIO,
  PAN_RANGE,
} from '../tunables';
import { defaultState, type AppState } from './state';

const PREFIX = '#v1.';
/** Longest pattern text accepted from a link. */
const MAX_PATTERN_CHARS = 64;

export function encodeState(state: AppState): string {
  const m = state.mapping;
  const mapping =
    presetOf(m) !== 'custom'
      ? presetOf(m)
      : {
          h: Array.from({ length: MAX_HEIGHT }, (_, i) => m.perHeight[i + 1] ?? null),
          b: m.byBall,
          v: m.hands.map((v) => [v.pan, v.gain]),
          c: [m.catches.on ? 1 : 0, m.catches.sample],
          d: [m.crossAccent.velocity, m.crossAccent.downbeat],
          f: [m.filter.on ? 1 : 0, m.filter.low, m.filter.high],
          a: [m.pad.on ? 1 : 0, m.pad.instrument, m.pad.chord],
        };
  const json = JSON.stringify({ p: state.patterns, r: [state.ratio.a, state.ratio.b], t: state.bpm, m: mapping });
  return PREFIX + toBase64Url(json);
}

/**
 * The state a payload (the part after `#v1.`) describes, or null if it is not a payload at all.
 * Always returns all four shared fields when it returns anything, repaired from the defaults.
 */
export function decodeState(payload: string): Partial<AppState> | null {
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(payload));
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const defaults = defaultState();
  return {
    patterns: patternsFrom(raw.p, defaults.patterns),
    ratio: ratioFrom(raw.r, defaults.ratio),
    bpm: numberIn(raw.t, BPM_RANGE.min, BPM_RANGE.max, defaults.bpm, true),
    mapping: mappingFrom(raw.m),
  };
}

/**
 * Pattern text goes through the parser before it is used: text the parser cannot read (a stray
 * character, junk) falls back to that hand's default. Text that parses but does not validate
 * (a collision, a fractional ball count) is kept as written: it restores into the fix state,
 * where the reader sees what is wrong and the nearest fixes, and the player never gets it
 * (the knobs hand the player only valid patterns). Whether it validates depends on the ratio
 * and on both hands, so that is the knobs' check, not this module's.
 */
function patternsFrom(value: unknown, fallback: AppState['patterns']): AppState['patterns'] {
  const text = (v: unknown, d: string) =>
    typeof v === 'string' && v.length <= MAX_PATTERN_CHARS && parsePattern(v).ok ? v : d;
  const list = Array.isArray(value) ? value : [];
  return [text(list[0], fallback[0]), text(list[1], fallback[1])];
}

function ratioFrom(value: unknown, fallback: Ratio): Ratio {
  const part = (v: unknown, d: number) => numberIn(v, 1, MAX_RATIO, d, true);
  const list = Array.isArray(value) ? value : [];
  return { a: part(list[0], fallback.a), b: part(list[1], fallback.b) };
}

function mappingFrom(value: unknown): Mapping {
  if (typeof value === 'string') {
    const name = PRESET_NAMES.find((n) => n === value);
    return name ? applyPreset(name) : DEFAULT_MAPPING;
  }
  if (!isRecord(value)) return DEFAULT_MAPPING;
  const d = DEFAULT_MAPPING;
  const sample = (v: unknown, fallback: Sample): Sample =>
    v === null ? null : typeof v === 'string' && KIT_SAMPLES.includes(v) ? v : fallback;
  const bool = (v: unknown, fallback: boolean) => (v === 1 || v === 0 ? v === 1 : fallback);
  const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
  const pick = <T extends string>(v: unknown, ids: readonly T[], fallback: T): T =>
    ids.find((id) => id === v) ?? fallback;

  const h = arr(value.h);
  const perHeight = Object.fromEntries(
    Array.from({ length: MAX_HEIGHT }, (_, i) => [i + 1, sample(h[i], d.perHeight[i + 1] ?? null)]),
  );
  // byBall: an explicit null means none; a list of known sounds is used; anything else (missing,
  // wrong type, empty, one unknown sound) falls back to the default mapping's, silently.
  const b = value.b;
  const byBall =
    b === null
      ? null
      : Array.isArray(b) && b.length > 0 && b.every((s) => typeof s === 'string' && KIT_SAMPLES.includes(s))
        ? (b as string[])
        : d.byBall;
  const voice = (v: unknown, fallback: Mapping['hands'][0]) => {
    const [pan, gain] = arr(v);
    return {
      pan: numberIn(pan, PAN_RANGE.min, PAN_RANGE.max, fallback.pan),
      gain: numberIn(gain, GAIN_RANGE.min, GAIN_RANGE.max, fallback.gain),
    };
  };
  const hands = arr(value.v);
  const [catchOn, catchSample] = arr(value.c);
  const [velocity, downbeat] = arr(value.d);
  const [filterOn, low, high] = arr(value.f);
  const [padOn, instrument, chord] = arr(value.a);
  return {
    kit: 'TR-808',
    perHeight,
    byBall,
    hands: [voice(hands[0], d.hands[0]), voice(hands[1], d.hands[1])],
    catches: { on: bool(catchOn, d.catches.on), sample: sample(catchSample, d.catches.sample) },
    crossAccent: {
      velocity: numberIn(velocity, CROSS_BOOST_RANGE.min, CROSS_BOOST_RANGE.max, d.crossAccent.velocity),
      downbeat: sample(downbeat, d.crossAccent.downbeat),
    },
    filter: {
      on: bool(filterOn, d.filter.on),
      low: numberIn(low, FILTER_HZ_RANGE.min, FILTER_HZ_RANGE.max, d.filter.low),
      high: numberIn(high, FILTER_HZ_RANGE.min, FILTER_HZ_RANGE.max, d.filter.high),
    },
    pad: {
      on: bool(padOn, d.pad.on),
      instrument: pick(instrument, PAD_INSTRUMENT_IDS, d.pad.instrument),
      chord: pick(chord, PAD_CHORD_IDS, d.pad.chord),
    },
  };
}

/** `value` if it is a finite number, clamped to [min, max] (and rounded if asked); else the fallback. */
function numberIn(value: unknown, min: number, max: number, fallback: number, round = false): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const clamped = Math.min(max, Math.max(min, value));
  return round ? Math.round(clamped) : clamped;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Throws on anything that is not base64url of UTF-8; the caller turns that into null. */
function fromBase64Url(payload: string): string {
  const binary = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}
