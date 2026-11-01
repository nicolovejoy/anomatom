// AppState <-> the URL hash. Pure: no DOM, no timers. `route()` splits `#v2.<payload>`; this
// module encodes and decodes the payload.
//
// Scheme v2: `#v2.` + base64url (no padding) of the UTF-8 JSON of
//   { p: [part, …], r: [a, b], t: bpm, m: mapping }
// with each part in short keys:
//   s  spacing in pulses        f  phase in pulses        u  unit (pulses per written digit)
//   o  a default part's onsets, one '1' or '0' per beat   k  its ball knob
//   t  a manual part's throws, [height in pulses, destination part or null] per beat
// Only the parts, ratio, bpm and mapping travel; never volume, drafts, the notice or UI state.
// `r` is derived (`ratioOf(parts)`, docs/plans/lanes.md ruling 2): written so older readers have
// it, and on reading kept only when it agrees with the spacings (2:2 over 1:1 parts), else replaced.
// The mapping is `encodeMapping`'s (src/sound/mapping-hash.ts).
//
// Short links: grammar in route.ts (vanilla, passing `3p-3|3p-3`, hands, sync `(4,2x)(2x,4)`). `encodeHash` writes the shortest form that round-trips, `decodeState`
// reads a short payload with version 'short'.
//
// Scheme v1 (old links, still read): { p: [pattern1, pattern2], r, t, m }, pattern text as typed:
// at 1:1 hand 1's text is one vanilla siteswap (`partsFromVanilla`), otherwise each hand's is
// one-hand counting (`partsFromLines`), so an old link plays the Schedule it always did.
//
// Decoding trusts nothing: a payload that is not base64url JSON of an object gives null; any
// other junk is repaired per field (unknown fields ignored, missing or mistyped ones taken from
// the defaults, numbers clamped to their ranges). Parts that do not make a sound model (a wrong
// type, a height off its unit, a cross to no part, a cycle past MAX_LINK_CYCLE) give the default
// pattern.
import { cycleOf, isPassingSet, isSyncSet, isVanillaPair, mod, normalise, parseThrows, partsFromLines, partsFromPassing, partsFromSync, partsFromVanilla, passingText, ratioOf, syncText, textOf } from '../core';
import type { Part, PartFlights, Parts, Ratio, Throw } from '../core';
import { applyPreset, isPresetMapping, PRESET_NAMES, presetOf, withPartCount } from '../sound/mapping';
import { decodeMapping, encodeMapping } from '../sound/mapping-hash';
import {
  BPM_RANGE,
  DEFAULT_BPM,
  DEFAULT_MAPPING,
  DEFAULT_PATTERN,
  DEFAULT_PATTERN_HAND2,
  MAX_LINK_CYCLE,
  MAX_PARTS,
  MAX_PERIOD,
  MAX_RATIO,
} from '../tunables';
import { oneInput } from './actions';
import { defaultParts, defaultState, type AppState } from './state';

const PREFIX = '#v2.';
/** Longest pattern text accepted from a v1 link. */
const MAX_PATTERN_CHARS = 64;

/** A part in short keys. A default part's phase is stored within its period (spacing × beats), where it means the same. */
function encodePart(p: Part): Record<string, unknown> {
  if (p.flights.kind === 'default') {
    const { onsets, k } = p.flights;
    return { s: p.spacing, f: mod(p.phase, p.spacing * onsets.length), u: p.unit, o: onsets.map((on) => (on ? '1' : '0')).join(''), k };
  }
  return { s: p.spacing, f: p.phase, u: p.unit, t: p.flights.throws.map((t) => [t.height, t.to]) };
}

export function encodeState(state: Pick<AppState, 'parts' | 'bpm' | 'mapping'>): string {
  const ratio = ratioOf(state.parts);
  const json = JSON.stringify({
    p: state.parts.map(encodePart),
    r: [ratio.a, ratio.b],
    t: state.bpm,
    m: encodeMapping(state.mapping),
  });
  return PREFIX + toBase64Url(json);
}

/**
 * The state a payload (the part after `#v2.`, or `#v1.` with `version` 1) describes, or null if
 * it is not a payload at all. Always returns all four shared fields when it returns anything,
 * repaired from the defaults.
 */
export function decodeState(payload: string, version: 1 | 2 | 'short' = 2): Pick<AppState, 'parts' | 'ratio' | 'bpm' | 'mapping'> | null {
  if (version === 'short') return decodeShort(payload);
  let raw: unknown;
  try {
    raw = JSON.parse(fromBase64Url(payload));
  } catch {
    return null;
  }
  if (!isRecord(raw)) return null;
  const defaults = defaultState();
  const written = ratioFrom(raw.r, defaults.ratio);
  const parts = version === 1 ? partsFromV1(raw.p, written) : (partsFrom(raw.p) ?? defaultParts());
  const r = ratioOf(parts);
  return {
    parts,
    ratio: written.a * r.b === written.b * r.a ? written : r,
    bpm: numberIn(raw.t, BPM_RANGE.min, BPM_RANGE.max, defaults.bpm, true),
    mapping: decodeMapping(raw.m, parts.length),
  };
}

type Shared = Pick<AppState, 'parts' | 'ratio' | 'bpm' | 'mapping'>;
/** Longest sync text accepted from a short link (a box of 8 pairs is 40 characters). */
const MAX_SYNC_CHARS = 256;
const SHORT_LINE = /^[0-9a-z-]+$/;

/** A short link's state (grammar in route.ts), or null when it does not parse. */
function decodeShort(payload: string): Shared | null {
  const at = payload.indexOf('@');
  const head = at === -1 ? payload : payload.slice(0, at);
  const bpm = at === -1 || at === payload.length - 1 ? DEFAULT_BPM : numberIn(Number(payload.slice(at + 1)), BPM_RANGE.min, BPM_RANGE.max, DEFAULT_BPM, true);
  const tilde = head.indexOf('~');
  const body = tilde === -1 ? head : head.slice(0, tilde);
  const name = tilde === -1 ? presetOf(DEFAULT_MAPPING) : PRESET_NAMES.find((n) => n === head.slice(tilde + 1));
  if (name === undefined || name === 'custom') return null;
  const finish = (parts: Parts, written: Ratio): Shared => {
    const r = ratioOf(parts);
    return {
      parts,
      ratio: written.a * r.b === written.b * r.a ? written : r,
      bpm,
      mapping: withPartCount(applyPreset(name), parts.length),
    };
  };
  if (body.startsWith('(')) {
    // Sync siteswap (form 5): written as the Pattern tab reads it, nothing else (no `*`, no spaces).
    const r = body.length <= MAX_SYNC_CHARS && /^[0-9a-z(),]+$/.test(body) ? partsFromSync(body) : null;
    return r?.ok ? finish(r.parts, { a: 1, b: 1 }) : null;
  }
  if (body.includes('|')) {
    // Passing siteswap (form 4): `-` for the space, no brackets.
    const r = body.length <= MAX_PATTERN_CHARS && /^\d[0-9a-z|-]*$/.test(body) ? partsFromPassing(body.replace(/-/g, ' ')) : null;
    return r?.ok ? finish(r.parts, { a: 1, b: 1 }) : null;
  }
  if (!body.includes('/')) {
    const r = body.length <= MAX_PATTERN_CHARS && /^\d[0-9a-z]*$/.test(body) ? partsFromVanilla(body) : null;
    return r?.ok ? finish(r.parts, { a: 1, b: 1 }) : null;
  }
  const m = /^(\d+):(\d+)\/([^/]*)\/([^/]*)$/.exec(body);
  if (m === null) return null;
  const ratio = { a: Number(m[1]), b: Number(m[2]) };
  const inRange = (n: number) => n >= 1 && n <= MAX_RATIO;
  const texts = [m[3] as string, m[4] as string];
  if (!inRange(ratio.a) || !inRange(ratio.b) || ratio.a === ratio.b) return null;
  if (!texts.every((t) => t.length <= MAX_PATTERN_CHARS && SHORT_LINE.test(t))) return null;
  const r = partsFromLines(texts.map((t) => t.replace(/-/g, ' ')), ratio);
  return r.ok ? finish(r.parts, ratio) : null;
}

/** The short form of `state` (with its `#`), or null when it has none; not yet checked to round-trip. */
function shortCandidate(state: Shared): string | null {
  const { parts, ratio } = state;
  if (parts.length !== 2 && !(oneInput(ratio) && isPassingSet(parts))) return null;
  const name = presetOf(state.mapping);
  // A preset on another kit is not the preset's mapping: it has no short form.
  if (name === 'custom' || !isPresetMapping(state.mapping, name)) return null;
  const tempo = (name === presetOf(DEFAULT_MAPPING) ? '' : `~${name}`) + (state.bpm === DEFAULT_BPM ? '' : `@${state.bpm}`);
  if (isSyncSet(parts)) return `#${syncText(parts)}${tempo}`;
  if (isPassingSet(parts)) return `#${passingText(parts).slice(1, -1).replace(/ /g, '-')}${tempo}`;
  if (oneInput(ratio)) return isVanillaPair(parts) ? `#${textOf(parts[0] as Part, parts)}${tempo}` : null;
  const lines = parts.map((p) => textOf(p, parts).replace(/ /g, '-'));
  return `#${ratio.a}:${ratio.b}/${lines.join('/')}${tempo}`;
}

/**
 * The hash for `state`: the shortest form that round-trips. A short candidate is decoded and kept
 * only if `encodeState` of what it decodes to equals `encodeState` of the state; else `#v2.`.
 */
export function encodeHash(state: Shared): string {
  const full = encodeState(state);
  const short = shortCandidate(state);
  if (short === null || short.length >= full.length) return full;
  const back = decodeShort(short.slice(1));
  return back !== null && encodeState(back) === full ? short : full;
}

/**
 * A v1 link's pattern text. Text the parser cannot read (a stray character, junk) falls back to
 * that hand's default. Text that reads but is not juggleable (a collision, a fractional count) is
 * kept: it restores as written and the knobs show what is wrong. At 1:1 an `x` meant nothing in v1
 * (odd digits cross), so it is dropped.
 */
function partsFromV1(value: unknown, ratio: Ratio): Parts {
  const list = Array.isArray(value) ? value : [];
  const str = (v: unknown) => (typeof v === 'string' && v.length <= MAX_PATTERN_CHARS ? v : null);
  if (oneInput(ratio)) {
    const r = partsFromVanilla((str(list[0]) ?? '').replace(/x/g, ''));
    return r.ok ? r.parts : defaultParts();
  }
  const text = (v: unknown, part: number, fallback: string) => {
    const s = str(v);
    return s !== null && !s.includes('/') && parseThrows(s, { part, of: 2 }).ok ? s : fallback;
  };
  const r = partsFromLines([text(list[0], 0, DEFAULT_PATTERN), text(list[1], 1, DEFAULT_PATTERN_HAND2)], ratio);
  return (r as { parts: Parts }).parts;
}

const isInt = (v: unknown, min: number, max: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;

/** A v2 link's parts, or null when they are not a sound model. */
function partsFrom(value: unknown): Parts | null {
  if (!Array.isArray(value) || value.length < 1 || value.length > MAX_PARTS) return null;
  const n = value.length;
  const parts: Part[] = [];
  for (const [i, raw] of value.entries()) {
    if (!isRecord(raw) || !isInt(raw.s, 1, MAX_LINK_CYCLE) || !isInt(raw.f, 0, MAX_LINK_CYCLE) || !isInt(raw.u, 1, MAX_LINK_CYCLE)) return null;
    const unit = raw.u;
    let flights: PartFlights;
    if (typeof raw.o === 'string') {
      if (!/^[01]+$/.test(raw.o) || raw.o.length > MAX_PERIOD || !isInt(raw.k, 1, MAX_PERIOD)) return null;
      flights = { kind: 'default', onsets: [...raw.o].map((c) => c === '1'), k: raw.k };
    } else {
      if (!Array.isArray(raw.t) || raw.t.length < 1 || raw.t.length > MAX_PERIOD) return null;
      const throws: Throw[] = [];
      for (const t of raw.t as unknown[]) {
        if (!Array.isArray(t)) return null;
        const [height, to] = t as unknown[];
        if (!isInt(height, 0, MAX_LINK_CYCLE) || height % unit !== 0) return null;
        if (!(to === null || (isInt(to, 0, n - 1) && to !== i && height > 0))) return null;
        throws.push({ height, to });
      }
      flights = { kind: 'manual', throws };
    }
    parts.push({ spacing: raw.s, phase: raw.f, unit, flights });
  }
  return cycleOf(parts) <= MAX_LINK_CYCLE ? normalise(parts) : null;
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
