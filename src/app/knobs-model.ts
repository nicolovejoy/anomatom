// The knob panel's logic (SPEC §4.1, §4.2), pure: no DOM, no timers. mount-knobs.ts turns these
// values into elements. `Analysis` is a thin view over `derived(state)` (derived.ts): what the
// inputs show, the indicators, the warning sites, the status lines and the fixes, in the robot's
// words.
import { gcd, isVanillaPair, mod, periodOf, throwsOf, vanillaIndex } from '../core';
import type { Fault, ParseError, Part, PartIndex, Parts, Ratio, ThrowId } from '../core';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import { copy, type ThrowRef } from '../ui/copy';
import type { PlayerView, Segment } from '../view/types';
import { oneInput, parseDraft, type Action } from './actions';
import { derived, type Derived } from './derived';
import type { AppState } from './state';

// ---------------------------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------------------------

export interface Analysis {
  /** At 1:1 one input holds the whole pattern; otherwise there is one input per part. */
  readonly vanilla: boolean;
  /** The text each input shows: its draft as typed, else its part's text. */
  readonly inputs: readonly string[];
  /** Each input's parse error, or null when it reads (or shows its part's own text). */
  readonly errors: readonly (ParseError | null)[];
  /** Ball count when every input reads and every group is juggleable; null otherwise. */
  readonly balls: number | null;
  /** Per input, the sites (throw indices in its text) a fault names, for the warning colour. */
  readonly warn: readonly ReadonlySet<number>[];
  /** The status lines under the inputs, then the last action's notice. */
  readonly lines: readonly string[];
  /** True when the mean is fractional (MATH.md §9.4): the whole pattern's fault, so every input is implicated. */
  readonly fractional: boolean;
  /** True when "make it juggleable" applies: every input reads and a group has faults. */
  readonly fixable: boolean;
}

/** The text input `i` shows: its draft, else its part's text (at 1:1, every part's, with `/` between). */
export function inputText(state: AppState, d: Derived, i: number): string {
  const draft = state.drafts[i];
  if (draft != null) return draft;
  return oneInput(state.ratio) ? d.texts.join(' / ') : (d.texts[i] ?? '');
}

/** The beat of a part that pulse `pulse` (in [0, cycle)) is, counted from 1 within the cycle. */
const beatOf = (p: Part, pulse: number) => (pulse - mod(p.phase, p.spacing)) / p.spacing + 1;

/** How many throws `text` holds, as `pieces` numbers them. */
const siteCount = (text: string) => pieces(text, new Set(), new Set(), null).reduce((n, p) => Math.max(n, (p.site ?? -1) + 1), 0);

export function analyse(state: AppState, d: Derived = derived(state)): Analysis {
  const vanilla = oneInput(state.ratio);
  const inputs = Array.from({ length: vanilla ? 1 : state.parts.length }, (_, i) => inputText(state, d, i));
  const errors = inputs.map((text, i) => {
    if (state.drafts[i] == null) return null;
    const r = parseDraft(state, i, text);
    return r.ok ? null : r.error;
  });
  const warn = inputs.map(() => new Set<number>());
  const notice = state.notice === null ? [] : [state.notice];
  const base = { vanilla, inputs, errors, warn, fractional: false, fixable: false };
  if (errors.some((e) => e !== null)) {
    const lines = errors.flatMap((e, i) =>
      e === null ? [] : [vanilla ? copy.parseError(e) : copy.handParseError(i, copy.parseError(e))],
    );
    return { ...base, balls: null, lines: [...lines, ...notice] };
  }
  if (d.schedule.verdict.ok) return { ...base, balls: d.schedule.balls, lines: [copy.valid(d.schedule.balls), ...notice] };

  const { parts } = state;
  const pair = isVanillaPair(parts);
  const { cycle } = d.schedule;
  const length = Math.max(1, siteCount(inputs[0] as string));
  /** A throw as the reader counts it: a vanilla pair's by its siteswap position, otherwise in its own hand. */
  const ref = (t: ThrowId): ThrowRef => (pair ? { hand: 0, index: vanillaIndex(t.part, t.index, length) } : { hand: t.part, index: t.index });
  /** Colours the throw's site in the input that shows it (at 1:1, `a / b` numbers its sites across the slash). */
  const mark = (t: ThrowId) => {
    const r = ref(t);
    if (pair || !vanilla) (warn[r.hand] as Set<number>).add(r.index);
    else (warn[0] as Set<number>).add(parts.slice(0, t.part).reduce((n, p) => n + periodOf(p), 0) + t.index);
  };
  const beat = (p: Part, pulse: number) => (pair ? pulse + 1 : beatOf(p, pulse));

  // A part's unfed onsets are one line, where its first one is met.
  const lines: (string | PartIndex)[] = d.fractional === null ? [] : [copy.fractional(d.fractional)];
  const unfed = new Map<PartIndex, number[]>();
  const seen = new Set<string>();
  for (const f of d.groups.flatMap((g) => g.faults)) {
    const own = parts[f.part] as Part;
    if (f.kind === 'collision') {
      f.throws.forEach(mark);
      const refs = f.throws.map(ref).sort((p, q) => p.hand - q.hand || p.index - q.index);
      // A vanilla pair's siteswap repeats in both parts: one group of digits is reported once.
      const key = refs.map((r) => `${r.hand}.${r.index}`).join(',');
      if (seen.has(key)) continue;
      seen.add(key);
      lines.push(copy.collision(refs, f.part, beat(own, f.pulse), pair));
    } else if (f.kind === 'no-onset') {
      mark(f.from);
      lines.push(noOnsetLine(parts, f, cycle, pair, ref(f.from)));
    } else {
      mark({ part: f.part, index: mod((f.pulse - own.phase) / own.spacing, periodOf(own)) });
      const beats = unfed.get(f.part) ?? [];
      if (beats.length === 0) lines.push(f.part);
      unfed.set(f.part, [...beats, beat(own, f.pulse)]);
    }
  }
  const text = lines.map((l) => (typeof l === 'string' ? l : copy.noBall(l, unfed.get(l) as number[])));
  return { ...base, balls: null, lines: [...text, ...notice], fractional: d.fractional !== null, fixable: true };
}

/**
 * A flight landing off the catching part's onsets. On one of its beats (a `0`), it lands where
 * that hand has nothing to throw. Between its beats it is a cross, named with the catching part's
 * next onset at or after the landing, as core reports it (MATH.md §9.3).
 */
function noOnsetLine(parts: Parts, f: Extract<Fault, { kind: 'no-onset' }>, cycle: number, pair: boolean, who: ThrowRef): string {
  const to = parts[f.part] as Part;
  const landing = mod(f.pulse, cycle);
  if (mod(f.pulse - to.phase, to.spacing) === 0) {
    return copy.noThrowThere(who, f.part, pair ? landing + 1 : beatOf(to, landing), pair);
  }
  const from = parts[f.from.part] as Part;
  const launch = f.pulse - (throwsOf(from)[f.from.index] as { height: number }).height;
  return copy.crossBetween(f.from.part, beatOf(from, mod(launch, cycle)), f.part, f.nearestOnset);
}

export type HandState = 'hidden' | 'ok' | 'bad' | 'neutral';

/**
 * The indicator beside one input. Juggleable: ok. This input fails to parse, or a fault names
 * one of its digits, or the mean is fractional (the whole pattern's): bad. Otherwise neutral,
 * since the pattern as a whole still fails.
 */
export function handState(a: Analysis, input: number): HandState {
  if (input >= a.inputs.length) return 'hidden';
  if (a.errors[input] != null) return 'bad';
  if (a.balls !== null) return 'ok';
  return (a.warn[input] as ReadonlySet<number>).size > 0 || a.fractional ? 'bad' : 'neutral';
}

/** Indices of one input's throws that any fault names, for the warning colour. */
export function warnSites(a: Analysis, input: number): ReadonlySet<number> {
  return a.warn[input] ?? new Set();
}

/** The character a parse error points at in one input, or null. */
export function badChar(a: Analysis, input: number): number | null {
  const e = a.errors[input];
  return e?.kind === 'bad-char' ? e.index : null;
}

/** The status lines under the inputs: the ball count, or every problem, in the robot's words; then any notice. */
export function statusLines(a: Analysis): readonly string[] {
  return a.lines;
}

/**
 * Whether the player must be handed the edit (`setEdit`): the first render, a new schedule, or a
 * tempo or ratio change, even when the schedule object is the same one (a link that differs only
 * in tempo). A draft that does not read changes none of these.
 */
export function editChanged(previous: AppState | null, state: AppState): boolean {
  return (
    previous === null ||
    derived(previous).schedule !== derived(state).schedule ||
    previous.bpm !== state.bpm ||
    previous.ratio !== state.ratio
  );
}

// ---------------------------------------------------------------------------------------------
// Fixes
// ---------------------------------------------------------------------------------------------

/** What a fix button reads: its texts (`derived(state).fixTexts`), as the inputs would show them. */
export function fixLabel(texts: readonly string[]): string {
  return copy.fixLabel(texts);
}

/** The edits that apply a fix: its texts typed into the inputs (at 1:1, the one input). */
export function fixActions(state: Pick<AppState, 'ratio'>, texts: readonly string[]): Action[] {
  if (oneInput(state.ratio)) return [{ type: 'editDraft', part: 0, text: texts.join(' / ') }];
  return texts.map((text, part) => ({ type: 'editDraft', part, text }));
}

// ---------------------------------------------------------------------------------------------
// Pattern text
// ---------------------------------------------------------------------------------------------

/** One character of an input's text as shown behind it, with the throw it belongs to. */
export interface Piece {
  readonly text: string;
  /** The throw's index in the input's text, counted across a `/`; null for whitespace, `/` or an unreadable character. */
  readonly site: number | null;
  readonly warn: boolean;
  readonly selected: boolean;
}

/**
 * Splits `text` as the parser reads it, so each throw can be coloured: warning for `warn` sites
 * and for the unreadable character at `bad`, outlined for `selected` sites. A throw is a digit or
 * a letter (10-35); an `x` marks the throw before it, once. Characters after an unreadable one
 * are still split as far as they read.
 */
export function pieces(
  text: string,
  warn: ReadonlySet<number>,
  selected: ReadonlySet<number>,
  bad: number | null,
): Piece[] {
  const out: Piece[] = [];
  let site = -1;
  // An `x` marks the last throw, whitespace between them or not, once.
  let crossable = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    const throwChar = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z' && c !== 'x');
    if (throwChar || (c === 'x' && crossable)) {
      if (throwChar) site++;
      crossable = throwChar;
      out.push({ text: c, site, warn: warn.has(site), selected: selected.has(site) });
    } else if (c === ' ' || c === '\t' || c === '/') {
      if (c === '/') crossable = false;
      out.push({ text: c, site: null, warn: i === bad, selected: false });
    } else {
      crossable = false;
      out.push({ text: c, site: null, warn: i === bad, selected: false });
    }
  }
  return out;
}

/**
 * The throw a keyboard selection covers, for choosing a swap site without a pointer: the site
 * when every character in [start, end) belongs to that one throw (its digit, its `x`, or both);
 * null for an empty selection or one that spans whitespace or two throws.
 */
export function siteCovering(text: string, start: number, end: number): number | null {
  const lo = Math.min(start, end);
  const hi = Math.max(start, end);
  if (lo === hi) return null;
  const covered = pieces(text, new Set(), new Set(), null).slice(lo, hi);
  const site = covered[0]?.site ?? null;
  return site !== null && covered.every((p) => p.site === site) ? site : null;
}

export interface Caret {
  readonly start: number;
  readonly end: number;
}

/** A key of the digit pad, applied at the caret: a digit or `x` replaces the selection; backspace deletes it or the character before. */
export function editText(text: string, caret: Caret, key: string): { text: string; caret: number } {
  const start = Math.max(0, Math.min(caret.start, caret.end, text.length));
  const end = Math.min(text.length, Math.max(caret.start, caret.end));
  if (key !== 'backspace') return { text: text.slice(0, start) + key + text.slice(end), caret: start + key.length };
  if (start !== end) return { text: text.slice(0, start) + text.slice(end), caret: start };
  if (start === 0) return { text, caret: 0 };
  return { text: text.slice(0, start - 1) + text.slice(start), caret: start - 1 };
}

// ---------------------------------------------------------------------------------------------
// Swap two sites
// ---------------------------------------------------------------------------------------------

export interface SiteSelection {
  /** The input the sites are in. */
  readonly hand: number;
  /** One or two throw indices, in the order tapped. */
  readonly sites: readonly number[];
}

/**
 * A tap on a throw. Tapping a chosen one unchooses it; a tap in the other hand starts over; a
 * third tap keeps the last two.
 */
export function toggleSite(sel: SiteSelection | null, hand: number, site: number): SiteSelection | null {
  if (sel === null || sel.hand !== hand) return { hand, sites: [site] };
  if (sel.sites.includes(site)) {
    const sites = sel.sites.filter((s) => s !== site);
    return sites.length === 0 ? null : { hand, sites };
  }
  return { hand, sites: [...sel.sites, site].slice(-2) };
}

/**
 * The swap action for two sites chosen in one input (MATH.md §3), or null when they are not two
 * throws of one part. At 1:1 a vanilla pair's sites are its siteswap's positions; `a / b`
 * numbers its sites across the slash, so both must fall in one part.
 */
export function swapAction(state: AppState, input: number, i: number, j: number): Action | null {
  if (!oneInput(state.ratio)) return { type: 'swapSites', part: input, i, j };
  if (isVanillaPair(state.parts)) return { type: 'swapSites', part: 0, i, j };
  let offset = 0;
  for (const [part, p] of state.parts.entries()) {
    const n = periodOf(p);
    const inside = (k: number) => k >= offset && k < offset + n;
    if (inside(i) && inside(j)) return { type: 'swapSites', part, i: i - offset, j: j - offset };
    offset += n;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// Ratio, tempo, time
// ---------------------------------------------------------------------------------------------

/** A stepper: one side up or down by one, within 1 … MAX_RATIO. Left unreduced, so a stepper moves one step at a time. */
export function stepRatio(r: Ratio, hand: number, delta: number): Ratio {
  const clamp = (n: number) => Math.min(MAX_RATIO, Math.max(1, n + delta));
  return hand === 0 ? { a: clamp(r.a), b: r.b } : { a: r.a, b: clamp(r.b) };
}

/** A ratio in lowest terms: a chip's 2:2 is 1:1. */
export function reduceRatio(r: Ratio): Ratio {
  const g = gcd(r.a, r.b);
  return { a: r.a / g, b: r.b / g };
}

/** Hand 2's tempo: it makes b beats while hand 1 makes a, to one decimal. */
export function hand2Bpm(bpm: number, ratio: Ratio): number {
  return Math.round(((bpm * ratio.b) / ratio.a) * 10) / 10;
}

/** A typed tempo as a whole bpm within range; null when it is not a number. */
export function clampBpm(value: number): number | null {
  if (!Number.isFinite(value)) return null;
  return Math.min(BPM_RANGE.max, Math.max(BPM_RANGE.min, Math.round(value)));
}

/** Where the picture is within its cycle, for the time slider; null with nothing to show. */
export function cyclePosition(view: PlayerView): { pulse: number; cycle: number } | null {
  const { segments, now } = view;
  if (segments.length === 0) return null;
  const seg = segments.find((s) => s.endTime !== null && now < s.endTime) ?? (segments[segments.length - 1] as Segment);
  const { cycle } = seg.schedule;
  const pulse = Math.max(0, (now - seg.startTime) / seg.pulseLen);
  return { pulse: pulse % cycle, cycle };
}
