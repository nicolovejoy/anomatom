// The knob panel's logic (SPEC §4.1, §4.2), pure: no DOM, no timers. mount-knobs.ts turns these
// values into elements. `Analysis` is a thin view over `derived(state)` (derived.ts): what the
// inputs show, the indicators, the warning sites, the status lines and the fixes, in the robot's
// words.
import { gcd, isPassingSet, isSyncSet, isVanillaPair, mod, parseThrows, periodOf, swapSites, throwsOf, vanillaIndex } from '../core';
import type { Fault, ParseError, Part, PartIndex, Parts, Ratio, Schedule, ThrowId } from '../core';
import { hitFor, type Mapping } from '../sound/mapping';
import { BPM_RANGE, MAX_EDITOR_PARTS, MAX_RATIO } from '../tunables';
import { copy, type ThrowRef } from '../ui/copy';
import type { PlayerView, Segment } from '../view/types';
import { inputPerPart, parseDraft, type Action } from './actions';
import { derived, type Derived } from './derived';
import type { AppState } from './state';

// ---------------------------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------------------------

export interface Analysis {
  /** At 1:1 over at most two parts one draft holds the whole pattern (one input, or two for `a / b`); otherwise there is one input per part (`inputPerPart`). */
  readonly vanilla: boolean;
  /** At 1:1, `a / b` shown as two inputs, one per part (`splitInputs`). */
  readonly split: boolean;
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
  /** The last action's notice (design §5), the last of `lines`; null when there is none. Drawn apart: it is news, not a fault. */
  readonly notice: string | null;
  /** True when the mean is fractional (MATH.md §9.4): the whole pattern's fault, so every input is implicated. */
  readonly fractional: boolean;
  /** True when "make it juggleable" applies: every input reads and a group has faults. */
  readonly fixable: boolean;
}

/**
 * At 1:1, whether the pattern shows as two inputs, one per part (form 2, `a / b`): from the
 * moment the draft holds a `/`, and whenever the parts are two that are not one vanilla or sync
 * siteswap. A single string is vanilla only over two hands at 1:1 (ruling 2026-10-29), so the
 * one input stays for a vanilla pair, a sync set (form 5), a lone part, and a draft without a `/`.
 */
export function splitInputs(state: Pick<AppState, 'parts' | 'drafts' | 'ratio'>): boolean {
  if (inputPerPart(state)) return false;
  // A passing set is four parts that one input holds (form 4).
  if (isPassingSet(state.parts)) return state.drafts[0]?.includes('/') ?? false;
  const draft = state.drafts[0];
  if (draft != null) return draft.includes('/');
  return state.parts.length >= 2 && !isVanillaPair(state.parts) && !isSyncSet(state.parts);
}

/** The two inputs of `a / b`: the text either side of the first `/`, less the one space `joinInputs` puts beside it. */
export function splitText(text: string): [string, string] {
  const slash = text.indexOf('/');
  if (slash < 0) return [text, ''];
  const left = text.slice(0, slash);
  const right = text.slice(slash + 1);
  return [left.endsWith(' ') ? left.slice(0, -1) : left, right.startsWith(' ') ? right.slice(1) : right];
}

/** The one draft two inputs make at 1:1; `splitText` gives them back exactly. */
export const joinInputs = (a: string, b: string): string => `${a} / ${b}`;

/**
 * The edit typing `text` into input `input` makes: at 1:1 split, both inputs joined into the one
 * draft. There a `/` typed in hand 1 is dropped: the draft splits at its first `/`, so keeping it
 * would move hand 2's text. (One typed in hand 2 stays, and reads as a third pattern, refused.)
 */
export function draftAction(state: AppState, d: Derived, input: number, text: string): Action {
  if (!splitInputs(state)) return { type: 'editDraft', part: input, text };
  const own = input === 0 ? text.replaceAll('/', '') : text;
  const [a, b] = [0, 1].map((i) => (i === input ? own : inputText(state, d, i))) as [string, string];
  return { type: 'editDraft', part: 0, text: joinInputs(a, b) };
}

/**
 * Backspace in an empty hand 2 input at 1:1: join the pattern back into one input, hand 1's text
 * as one vanilla siteswap. Only when that cannot change a grid: the parts are a vanilla pair, or
 * the split was made by typing `/` (`typedSplit`) over a pattern the one input held. Otherwise
 * (two parts of their own, a phase among them) nothing: drafts edit flights, never grids.
 */
export function joinAction(state: AppState, d: Derived, typedSplit: boolean): Action | null {
  if (!splitInputs(state) || !(typedSplit || isVanillaPair(state.parts))) return null;
  return { type: 'editDraft', part: 0, text: inputText(state, d, 0) };
}

/** A side of `a / b` that does not read on its own, as its hand's own text. */
function sideError(text: string, part: number): ParseError | null {
  if (text.includes('/')) return { kind: 'too-many-parts', max: MAX_EDITOR_PARTS };
  const r = parseThrows(text, { part, of: 2 });
  return r.ok ? null : r.error;
}

/** The text input `i` shows: its draft, else its part's text (at 1:1, every part's with `/` between, or one side of it when split). */
export function inputText(state: AppState, d: Derived, i: number): string {
  if (splitInputs(state)) return splitText(state.drafts[0] ?? d.texts.join(' / '))[i] ?? '';
  const draft = state.drafts[i];
  if (draft != null) return draft;
  return inputPerPart(state) ? (d.texts[i] ?? '') : d.texts.join(' / ');
}

/** Whether the digit pad shows its `p` key: while input `i` holds a `|` (passing siteswap, form 4), or the parts are a passing set. */
export function showsPassKey(state: AppState, d: Derived, i: number): boolean {
  return isPassingSet(state.parts) || inputText(state, d, i).includes('|');
}

/**
 * Whether the digit pad shows its `,` and `)` keys (v4.3 ruling 1): while input `i` holds a `(`
 * (sync siteswap, form 5), or the parts are a sync set. The `(` key shows always, so a sync
 * pattern can be started from the pad.
 */
export function showsSyncKeys(state: AppState, d: Derived, i: number): boolean {
  return isSyncSet(state.parts) || inputText(state, d, i).includes('(');
}

/** The beat of a part that pulse `pulse` (in [0, cycle)) is, counted from 1 within the cycle. */
const beatOf = (p: Part, pulse: number) => (pulse - mod(p.phase, p.spacing)) / p.spacing + 1;

/** How many throws each juggler's sequence holds in passing text (form 4), as `pieces` numbers them. */
function throwsPerJuggler(text: string): number[] {
  const sites: Set<number>[] = [new Set()];
  for (const q of pieces(text, new Set(), new Set(), null)) {
    if (q.text === '|') sites.push(new Set());
    else if (q.site !== null) (sites[sites.length - 1] as Set<number>).add(q.site);
  }
  return sites.map((set) => Math.max(1, set.size));
}

/** How many throws `text` holds, as `pieces` numbers them. */
const siteCount = (text: string) => pieces(text, new Set(), new Set(), null).reduce((n, p) => Math.max(n, (p.site ?? -1) + 1), 0);

export function analyse(state: AppState, d: Derived = derived(state)): Analysis {
  const vanilla = !inputPerPart(state);
  const split = splitInputs(state);
  const inputs = Array.from({ length: split ? 2 : vanilla ? 1 : state.parts.length }, (_, i) => inputText(state, d, i));
  const errors = inputs.map((text, i) => {
    if (split) return state.drafts[0] == null ? null : sideError(text, i);
    if (state.drafts[i] == null) return null;
    const r = parseDraft(state, i, text);
    return r.ok ? null : r.error;
  });
  const warn = inputs.map(() => new Set<number>());
  const notice = state.notice === null ? [] : [state.notice];
  const base = { vanilla, split, inputs, errors, warn, notice: state.notice, fractional: false, fixable: false };
  if (errors.some((e) => e !== null)) {
    const lines = errors.flatMap((e, i) =>
      e === null ? [] : [vanilla && !split ? copy.parseError(e) : copy.handParseError(i, copy.parseError(e))],
    );
    return { ...base, balls: null, lines: [...lines, ...notice] };
  }
  if (d.schedule.verdict.ok) return { ...base, balls: d.schedule.balls, lines: [copy.valid(d.schedule.balls), ...notice] };

  const { parts } = state;
  const passing = !split && isPassingSet(parts);
  // A sync set names its throws by hand and beat, as two hands of their own do; only its sites are the one input's.
  const sync = !split && isSyncSet(parts);
  const pair = isVanillaPair(parts) || passing;
  const { cycle } = d.schedule;
  const length = Math.max(1, siteCount(inputs[0] as string));
  // A passing set's text, juggler by juggler: where each juggler's throws start and how many it shows.
  const shown = passing ? throwsPerJuggler(inputs[0] as string) : [];
  const starts = shown.map((_, j) => shown.slice(0, j).reduce((a, b) => a + b, 0));
  /** A passing throw's place across the text: its position in the juggler's sequence (the two parts interleave, a halved odd sequence shows its first half), after the jugglers before. */
  const passingIndex = (t: ThrowId): number => {
    const j = Math.floor(t.part / 2);
    return (starts[j] ?? 0) + ((2 * t.index + (t.part % 2)) % (shown[j] ?? 1));
  };
  /** A throw as the reader counts it: a vanilla pair's by its siteswap position, a passing set's across the whole text, otherwise in its own hand. */
  const ref = (t: ThrowId): ThrowRef =>
    passing ? { hand: 0, index: passingIndex(t) } : pair ? { hand: 0, index: vanillaIndex(t.part, t.index, length) } : { hand: t.part, index: t.index };
  /**
   * Colours the throw's site in the input that shows it: its hand's own (at 1:1 a vanilla pair's
   * one input, or a part past hand 2, which a link can make, in hand 2's).
   */
  const mark = (t: ThrowId) => {
    // A sync set's one input shows its pairs in order, left then right: throw j of part k is site 2j + k.
    if (sync) return void (warn[0] as Set<number>).add((2 * t.index + t.part) % length);
    const r = ref(t);
    (warn[Math.min(r.hand, warn.length - 1)] as Set<number>).add(r.index);
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
  if (e?.kind === 'bad-sync') return e.open ? null : e.index;
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

/** The edits that apply a fix: its texts typed into the inputs (at 1:1 over two parts, the one input). */
export function fixActions(state: Pick<AppState, 'parts' | 'ratio'>, texts: readonly string[]): Action[] {
  if (!inputPerPart(state)) return [{ type: 'editDraft', part: 0, text: texts.join(' / ') }];
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
  // A `|` makes the text passing siteswap (form 4): there `p` is the pass mark, as `x` is the cross mark, and the digit after it
  // belongs to the throw when it names another juggler (as `parsePassing` reads it).
  const passing = text.includes('|');
  const jugglers = passing ? text.split('|').length : 0;
  let juggler = 0;
  let target = false;
  const piece = (c: string, at: number | null, i: number): Piece => ({
    text: c,
    site: at,
    // `bad` may point at a throw itself (a sync draft's odd height), not only at a character between throws.
    warn: i === bad || (at !== null && warn.has(at)),
    selected: at !== null && selected.has(at),
  });
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    const named = target;
    target = false;
    if (passing && named && c >= '1' && c <= '9' && Number(c) <= jugglers && Number(c) - 1 !== juggler) {
      out.push(piece(c, site, i));
      continue;
    }
    const throwChar = (c >= '0' && c <= '9') || (c >= 'a' && c <= 'z' && c !== 'x' && !(passing && c === 'p'));
    if (passing && c === 'p' && crossable) {
      crossable = false;
      target = true;
      out.push(piece(c, site, i));
    } else if (throwChar || (c === 'x' && crossable)) {
      if (throwChar) site++;
      crossable = throwChar;
      out.push(piece(c, site, i));
    } else {
      if (c === '|') juggler++;
      if (c === '/') crossable = false;
      if (c !== ' ' && c !== '\t' && c !== '/') crossable = false;
      out.push(piece(c, null, i));
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
  if (inputPerPart(state) || splitInputs(state)) return { type: 'swapSites', part: input, i, j };
  if (isVanillaPair(state.parts)) return { type: 'swapSites', part: 0, i, j };
  if (isPassingSet(state.parts)) return null;
  if (isSyncSet(state.parts)) return syncSwap(state, i, j);
  let offset = 0;
  for (const [part, p] of state.parts.entries()) {
    const n = periodOf(p);
    const inside = (k: number) => k >= offset && k < offset + n;
    if (inside(i) && inside(j)) return { type: 'swapSites', part, i: i - offset, j: j - offset };
    offset += n;
  }
  return null;
}

/**
 * A swap on a sync set (v4.3 ruling 2): its one input shows the pairs in order, left then right,
 * so site 2j + k is beat j of part k. Two throws of one hand swap on that part (MATH.md §3 at
 * step 2, the spacing, which the reducer takes from the part); throws of different hands do not.
 * Nor does a swap that would make a crossing 0 (a 0 is no throw and cannot cross, MATH.md §11),
 * nor one on the sites of a draft that does not read, since they are not the parts' throws.
 */
function syncSwap(state: AppState, i: number, j: number): Action | null {
  const draft = state.drafts[0];
  if (draft != null && !parseDraft(state, 0, draft).ok) return null;
  if (i % 2 !== j % 2 || crossesAtZero(state.parts, i, j)) return null;
  return { type: 'swapSites', part: i % 2, i: Math.floor(i / 2), j: Math.floor(j / 2) };
}

/** Whether swapping sync sites i and j of one hand would leave a 0 crossing to the other hand. */
function crossesAtZero(parts: Parts, i: number, j: number): boolean {
  const p = parts[i % 2] as Part;
  const swapped = swapSites(throwsOf(p), Math.floor(i / 2), Math.floor(j / 2), p.spacing);
  return swapped?.some((t) => t.height === 0 && t.to !== null) ?? false;
}

/**
 * Why Swap changed nothing. Over a sync set: two throws in different hands, or a throw that would
 * have to cross at 0. Otherwise the earlier throw would land before it is thrown.
 */
export function swapRefusal(state: Pick<AppState, 'parts'>, i: number, j: number): string {
  if (isSyncSet(state.parts) && i % 2 !== j % 2) return copy.swapOneHand;
  if (isSyncSet(state.parts) && crossesAtZero(state.parts, i, j)) return copy.swapZeroCross;
  return copy.swapImpossible;
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

/**
 * What one cycle sounds like, as text: each throw's pulse, part and sample, in order. A test
 * hook (the ball knob changes the picture and not the sound, design §7). Throws the mapping
 * leaves silent are left out.
 */
export function cycleSamples(schedule: Schedule, mapping: Mapping): string {
  return schedule.events
    .filter((e) => e.kind === 'throw' && e.pulse < schedule.cycle)
    .flatMap((e) => {
      const hit = hitFor(e, mapping, schedule);
      return hit === null ? [] : [`${e.pulse}:${e.part}:${hit.sample}`];
    })
    .join(' ');
}
