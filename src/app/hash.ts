// AppState <-> the URL hash. Pure: no DOM, no timers. `route()` splits `#v1.<payload>`; this
// module encodes and decodes the payload.
//
// Scheme v1: `#v1.` + base64url (no padding) of the UTF-8 JSON of
//   { p: [pattern1, pattern2], r: [a, b], t: bpm, m: mapping }
// Only pattern text, ratio, bpm and mapping travel; never volume, lastStateHash or UI state.
// The mapping `m` is encoded by src/sound/mapping-hash.ts (a preset name, or an object of short keys).
//
// Decoding trusts nothing: a payload that is not base64url JSON of an object gives null; any
// other junk is repaired per field (unknown fields ignored, missing or mistyped ones taken from
// the defaults, numbers clamped to their ranges, sample names checked against the kit).
import { parsePattern } from '../core/legacy/parse';
import type { Ratio } from '../core/legacy/types';
import { decodeMapping, encodeMapping } from '../sound/mapping-hash';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import { defaultState, type AppState } from './state';

const PREFIX = '#v1.';
/** Longest pattern text accepted from a link. */
const MAX_PATTERN_CHARS = 64;

export function encodeState(state: AppState): string {
  const json = JSON.stringify({ p: state.patterns, r: [state.ratio.a, state.ratio.b], t: state.bpm, m: encodeMapping(state.mapping) });
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
    mapping: decodeMapping(raw.m),
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
