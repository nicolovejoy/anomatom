// The knob panel's logic (SPEC §4.1, §4.2), pure: no DOM, no timers. mount-knobs.ts and
// mount-ladder.ts turn these values into elements and pixels.
import { isVanilla, makeGrids, parsePattern, swapSites, validate, validateAll } from '../core/legacy';
import type { ErrorDetail, Hand, HandPattern, ParseResult, PatternInput, Ratio, Throw } from '../core/legacy';
import { BPM_RANGE, MAX_RATIO } from '../tunables';
import { copy } from '../ui/copy';
import type { PlayerView, Segment } from '../view/types';

// ---------------------------------------------------------------------------------------------
// Validity
// ---------------------------------------------------------------------------------------------

export interface Analysis {
  readonly vanilla: boolean;
  /** Each input's parse; hand 2's is null at 1:1, where only one input shows. */
  readonly parsed: readonly [ParseResult, ParseResult | null];
  /** The pattern, when every input in use parses; else null. */
  readonly input: PatternInput | null;
  /** Ball count when valid; null otherwise. */
  readonly balls: number | null;
  /** Every validation error with its digits (validateAll); empty when valid or unparsed. */
  readonly details: readonly ErrorDetail[];
}

export function analyse(patterns: readonly [string, string], ratio: Ratio): Analysis {
  const vanilla = isVanilla(ratio);
  const first = parsePattern(patterns[0]);
  const second = vanilla ? null : parsePattern(patterns[1]);
  const parsed = [first, second] as const;
  const hands: HandPattern[] = [];
  for (const p of parsed) if (p?.ok) hands.push(p.pattern);
  if (!first.ok || (second !== null && !second.ok)) return { vanilla, parsed, input: null, balls: null, details: [] };
  const input: PatternInput = { ratio, hands };
  const v = validate(input);
  if (v.ok) return { vanilla, parsed, input, balls: v.balls, details: [] };
  return { vanilla, parsed, input, balls: null, details: validateAll(input) };
}

export type HandState = 'hidden' | 'ok' | 'bad' | 'neutral';

/**
 * The indicator beside one input. Valid: ok. This input fails to parse, or an error names one
 * of its digits, or the ball count is fractional (the whole pattern's): bad. Otherwise neutral,
 * since the pattern as a whole still fails.
 */
export function handState(a: Analysis, hand: Hand): HandState {
  const parsed = a.parsed[hand];
  if (parsed === null) return 'hidden';
  if (!parsed.ok) return 'bad';
  if (a.balls !== null) return 'ok';
  const implicated = a.details.some(
    (d) => (d.digits[hand] as readonly number[]).length > 0 || d.error.kind === 'fractional-balls',
  );
  return implicated ? 'bad' : 'neutral';
}

/** Indices of one input's throws that any error names, for the warning colour. */
export function warnSites(a: Analysis, hand: Hand): ReadonlySet<number> {
  return new Set(a.details.flatMap((d) => d.digits[hand] as readonly number[]));
}

/** The character a parse error points at in one input, or null. */
export function badChar(a: Analysis, hand: Hand): number | null {
  const p = a.parsed[hand];
  return p && !p.ok && p.error.kind === 'bad-char' ? p.error.index : null;
}

/** The status lines under the inputs: the ball count, or every problem, in the robot's words. */
export function statusLines(a: Analysis): string[] {
  if (a.balls !== null) return [copy.valid(a.balls)];
  if (a.input === null) {
    return a.parsed.flatMap((p, hand) =>
      p && !p.ok ? [a.vanilla ? copy.parseError(p.error) : copy.handParseError(hand as Hand, copy.parseError(p.error))] : [],
    );
  }
  const grids = makeGrids(a.input.ratio);
  // Missing balls follow from the other errors; one line per hand names all of its beats.
  const noBall: [number[], number[]] = [[], []];
  const lines: (string | Hand)[] = [];
  for (const { error } of a.details) {
    if (error.kind === 'no-ball') {
      if (noBall[error.hand].length === 0) lines.push(error.hand);
      noBall[error.hand].push(error.beat + 1);
    } else if (error.kind === 'collision') {
      // At 1:1 a pulse is a shared beat; otherwise the landing is on the catching hand's own grid.
      const beat = a.vanilla ? error.pulse + 1 : error.pulse / grids[error.hand].pulsesPerBeat + 1;
      lines.push(copy.collision(error.throws, error.hand, beat, a.vanilla));
    } else {
      lines.push(copy.validationError(error, a.vanilla));
    }
  }
  return lines.map((l) => (typeof l === 'string' ? l : copy.noBall(l, noBall[l])));
}

// ---------------------------------------------------------------------------------------------
// Pattern text
// ---------------------------------------------------------------------------------------------

/** One hand's throws as text: digits run together at 1:1, separated by spaces otherwise. */
export function patternText(hand: HandPattern, vanilla: boolean): string {
  return hand.map((t: Throw) => `${t.height}${t.cross ? 'x' : ''}`).join(vanilla ? '' : ' ');
}

/** A fix's text per input; at 1:1 hand 2's text, unused, is kept as it was. */
export function fixTexts(fix: PatternInput, current: readonly [string, string]): [string, string] {
  const vanilla = isVanilla(fix.ratio);
  const h0 = patternText(fix.hands[0] as HandPattern, vanilla);
  return vanilla ? [h0, current[1]] : [h0, patternText(fix.hands[1] as HandPattern, false)];
}

/** What a fix button reads: the texts of the inputs in use. */
export function fixLabel(fix: PatternInput): string {
  const texts = fixTexts(fix, ['', '']);
  return copy.fixLabel(isVanilla(fix.ratio) ? [texts[0]] : texts);
}

/** One character of an input's text as shown behind it, with the throw it belongs to. */
export interface Piece {
  readonly text: string;
  /** The throw's index in its hand's sequence; null for whitespace or an unreadable character. */
  readonly site: number | null;
  readonly warn: boolean;
  readonly selected: boolean;
}

/**
 * Splits `text` as parsePattern reads it, so each throw can be coloured: warning for `warn`
 * sites and for the unreadable character at `bad`, outlined for `selected` sites. Characters
 * after an unreadable one are still split as far as they read.
 */
export function pieces(
  text: string,
  warn: ReadonlySet<number>,
  selected: ReadonlySet<number>,
  bad: number | null,
): Piece[] {
  const out: Piece[] = [];
  let site = -1;
  // As in parsePattern: an `x` marks the last throw, whitespace between them or not, once.
  let crossable = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c >= '0' && c <= '9') {
      site++;
      crossable = true;
      out.push({ text: c, site, warn: warn.has(site), selected: selected.has(site) });
    } else if (c === 'x' && crossable) {
      crossable = false;
      out.push({ text: c, site, warn: warn.has(site), selected: selected.has(site) });
    } else if (c === ' ' || c === '\t') {
      out.push({ text: c, site: null, warn: false, selected: false });
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
  readonly hand: Hand;
  /** One or two throw indices, in the order tapped. */
  readonly sites: readonly number[];
}

/**
 * A tap on a throw. Tapping a chosen one unchooses it; a tap in the other hand starts over; a
 * third tap keeps the last two.
 */
export function toggleSite(sel: SiteSelection | null, hand: Hand, site: number): SiteSelection | null {
  if (sel === null || sel.hand !== hand) return { hand, sites: [site] };
  if (sel.sites.includes(site)) {
    const sites = sel.sites.filter((s) => s !== site);
    return sites.length === 0 ? null : { hand, sites };
  }
  return { hand, sites: [...sel.sites, site].slice(-2) };
}

/** MATH.md §3 on one input's text: the swapped pattern's text, or null when it cannot be swapped. */
export function swapText(text: string, i: number, j: number, vanilla: boolean): string | null {
  const parsed = parsePattern(text);
  if (!parsed.ok) return null;
  const swapped = swapSites(parsed.pattern, i, j);
  return swapped === null ? null : patternText(swapped, vanilla);
}

// ---------------------------------------------------------------------------------------------
// Ratio, tempo, time
// ---------------------------------------------------------------------------------------------

/** A stepper: one side up or down by one, within 1 … MAX_RATIO. Left unreduced, so a stepper moves one step at a time. */
export function stepRatio(r: Ratio, hand: Hand, delta: number): Ratio {
  const clamp = (n: number) => Math.min(MAX_RATIO, Math.max(1, n + delta));
  return hand === 0 ? { a: clamp(r.a), b: r.b } : { a: r.a, b: clamp(r.b) };
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
