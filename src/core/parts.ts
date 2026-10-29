import { MAX_PHASE_REFINEMENT } from '../tunables';
import { gcd, lcm, mod } from './math';
import { parseThrows } from './parse';
import type { ParseError } from './parse';
import type { Part, PartIndex, Parts, Ratio, Throw } from './types';

export type PartsResult =
  | { readonly ok: true; readonly parts: Parts }
  | { readonly ok: false; readonly part: PartIndex; readonly error: ParseError };

/** Beats in one period of the part's onset pattern. */
export function periodOf(part: Part): number {
  return part.flights.kind === 'default' ? part.flights.onsets.length : part.flights.throws.length;
}

/** Which beats of one period are onsets: a default part's own, a manual part's nonzero digits. */
export function onsetsOf(part: Part): boolean[] {
  return part.flights.kind === 'default' ? [...part.flights.onsets] : part.flights.throws.map((t) => t.height > 0);
}

/**
 * The part's throws for one period, heights in pulses. A manual part's are as written. A default
 * part's come from the default rule (design §5): onset i flies to onset i + k of the same part,
 * indices cyclic over the period, so the k flights' lengths sum to k periods.
 */
export function throwsOf(part: Part): Throw[] {
  if (part.flights.kind === 'manual') return [...part.flights.throws];
  const { onsets, k } = part.flights;
  const n = onsets.length;
  const at = onsets.flatMap((on, beat) => (on ? [beat] : []));
  const m = at.length;
  const out: Throw[] = onsets.map(() => ({ height: 0, to: null }));
  at.forEach((beat, i) => {
    const j = i + k;
    const land = (at[j % m] as number) + Math.floor(j / m) * n;
    out[beat] = { height: (land - beat) * part.spacing, to: null };
  });
  return out;
}

/** Pulses after which every part repeats: the lcm of spacing × period. */
export function cycleOf(parts: Parts): number {
  return parts.reduce((acc, p) => lcm(acc, p.spacing * periodOf(p)), 1);
}

/** Every pulse length in the parts multiplied by `factor`: spacing, phase, unit and heights. */
function scale(parts: Parts, factor: number, div = false): Parts {
  const f = (x: number) => (div ? x / factor : x * factor);
  return parts.map((p) => ({
    spacing: f(p.spacing),
    phase: f(p.phase),
    unit: f(p.unit),
    flights:
      p.flights.kind === 'default'
        ? p.flights
        : { kind: 'manual', throws: p.flights.throws.map((t) => ({ height: f(t.height), to: t.to })) },
  }));
}

/**
 * The coarsest lattice the parts fit: spacings and phases divided by their gcd. Units and manual
 * heights join the gcd so they stay whole; for parts whose flights land on beats they always divide.
 */
export function normalise(parts: Parts): Parts {
  let g = 0;
  for (const p of parts) {
    g = gcd(gcd(gcd(g, p.spacing), p.phase), p.unit);
    if (p.flights.kind === 'manual') for (const t of p.flights.throws) g = gcd(g, t.height);
  }
  return g <= 1 ? parts : scale(parts, g, true);
}

/**
 * Part `i` shifted to `phase` pulses of the current lattice (design §4). A phase between pulses
 * (half a pulse, a third) refines the lattice by the smallest factor that puts it on a pulse, up
 * to MAX_PHASE_REFINEMENT; the result is normalised. The phase wraps into [0, the part's period
 * in pulses). A phase finer than the limit leaves the parts unchanged.
 */
export function withPhase(parts: Parts, i: PartIndex, phase: number): Parts {
  let factor = 0;
  for (let q = 1; q <= MAX_PHASE_REFINEMENT && factor === 0; q++) {
    if (Math.abs(phase * q - Math.round(phase * q)) < 1e-9) factor = q;
  }
  const target = parts[i];
  if (factor === 0 || target === undefined) return parts;
  const fine = scale(parts, factor);
  const p = fine[i] as Part;
  const shifted = { ...p, phase: mod(Math.round(phase * factor), p.spacing * periodOf(p)) };
  return normalise(fine.map((q, j) => (j === i ? shifted : q)));
}

/**
 * Vanilla siteswap (design §8 form 1) as two parts: spacing 2 at phases 0 and 1, unit 1, so a
 * digit is a flight in pulses and odd digits cross. Siteswap beat i is beat floor(i/2) of part
 * i mod 2; an odd-length siteswap is read twice so both parts get every digit.
 */
export function vanillaPair(digits: readonly number[]): Parts {
  const n = digits.length;
  const beats = n % 2 === 0 ? n / 2 : n;
  return [0, 1].map((part) => ({
    spacing: 2,
    phase: part,
    unit: 1,
    flights: {
      kind: 'manual' as const,
      throws: Array.from({ length: beats }, (_, j) => {
        const height = digits[(2 * j + part) % n] as number;
        return { height, to: height % 2 === 1 ? 1 - part : null };
      }),
    },
  }));
}

/** The siteswap position of a vanilla pair's throw: beat `index` of `part`. */
export function vanillaIndex(part: PartIndex, index: number, length: number): number {
  return (2 * index + part) % length;
}

/** One vanilla siteswap as two parts; `x` and `/` have no place in it. */
export function partsFromVanilla(text: string): PartsResult {
  const slash = text.indexOf('/');
  if (slash >= 0) return { ok: false, part: 0, error: { kind: 'bad-char', index: slash } };
  const r = parseThrows(text);
  if (!r.ok) return { ok: false, part: 0, error: r.error };
  return { ok: true, parts: vanillaPair((r.throws[0] as Throw[]).map((t) => t.height)) };
}

/** True for the shape `vanillaPair` makes, so it can be written as one siteswap. */
export function isVanillaPair(parts: Parts): boolean {
  if (parts.length !== 2) return false;
  const [a, b] = parts as [Part, Part];
  if (a.flights.kind !== 'manual' || b.flights.kind !== 'manual') return false;
  if (a.flights.throws.length !== b.flights.throws.length) return false;
  return [a, b].every(
    (p, part) =>
      p.spacing === 2 &&
      p.phase === part &&
      p.unit === 1 &&
      (p.flights as { throws: readonly Throw[] }).throws.every((t) => t.to === (t.height % 2 === 1 ? 1 - part : null)),
  );
}

/** The siteswap digits of a vanilla pair, at their shortest period. */
export function vanillaDigits(parts: Parts): number[] {
  const [a, b] = parts.map((p) => (p.flights as { throws: readonly Throw[] }).throws) as [Throw[], Throw[]];
  const seq = a.flatMap((t, j) => [t.height, (b[j] as Throw).height]);
  for (let p = 1; ; p++) {
    if (seq.length % p === 0 && seq.every((d, i) => d === seq[i % p])) return seq.slice(0, p);
  }
}

/**
 * Parts from written lines (`throws`, heights as digits) on the given spacings: phases 0, unit =
 * spacing, heights = digit × unit, manual (design §8 form 2).
 */
export function linesParts(lines: readonly (readonly Throw[])[], spacings: readonly number[]): Parts {
  return normalise(
    lines.map((throws, i) => {
      const spacing = spacings[i] as number;
      return {
        spacing,
        phase: 0,
        unit: spacing,
        flights: { kind: 'manual', throws: throws.map((t) => ({ height: t.height * spacing, to: t.to })) },
      };
    }),
  );
}

/** Spacings for two parts at a ratio a:b: hand 1 every b/g pulses, hand 2 every a/g (today's makeGrids). */
export function ratioSpacings(ratio: Ratio): [number, number] {
  const g = gcd(ratio.a, ratio.b);
  return [ratio.b / g, ratio.a / g];
}

/**
 * One text per part in one-hand counting (design §8 form 2). Two parts take their spacings from
 * the ratio; more take `spacings`, or 1 each.
 */
export function partsFromLines(texts: readonly string[], ratio: Ratio, spacings?: readonly number[]): PartsResult {
  const lines: Throw[][] = [];
  for (const [part, text] of texts.entries()) {
    const slash = text.indexOf('/');
    if (slash >= 0) return { ok: false, part, error: { kind: 'bad-char', index: slash } };
    const r = parseThrows(text, { part, of: texts.length });
    if (!r.ok) return { ok: false, part, error: r.error };
    lines.push(r.throws[0] as Throw[]);
  }
  const s = spacings ?? (texts.length === 2 ? ratioSpacings(ratio) : texts.map(() => 1));
  return { ok: true, parts: linesParts(lines, s) };
}

/** Default parts (design §5): onsets on the given spacings, phase 0, unit = spacing, k balls each (1 if not given). */
export function partsFromOnsets(lines: readonly (readonly boolean[])[], spacings: readonly number[], k?: readonly number[]): Parts {
  return normalise(
    lines.map((onsets, i) => {
      const spacing = spacings[i] as number;
      return { spacing, phase: 0, unit: spacing, flights: { kind: 'default', onsets: [...onsets], k: k?.[i] ?? 1 } };
    }),
  );
}

/** A digit as written: 0-9, then a-z for 10-35; anything larger in braces, which no parser reads. */
function digitText(n: number): string {
  if (n < 10) return String(n);
  if (n < 36) return String.fromCharCode(87 + n);
  return `{${n}}`;
}

/**
 * A part as written (design §8): its digits (height / unit), letters above 9, `x` for a cross
 * between two parts or `x<n>` (1-based) among more, separated by spaces, as in `2 2x 2`. A default
 * part is written with the digits of its default rule. Either part of a vanilla pair is written as
 * the pair's one siteswap, digits run together, as in `531`.
 */
export function textOf(part: Part, parts: Parts): string {
  if (parts.includes(part) && isVanillaPair(parts)) return vanillaDigits(parts).map(digitText).join('');
  return throwsOf(part)
    .map((t) => {
      const mark = t.to === null ? '' : parts.length === 2 ? 'x' : `x${t.to + 1}`;
      return digitText(t.height / part.unit) + mark;
    })
    .join(' ');
}
