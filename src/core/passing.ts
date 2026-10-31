// Passing (docs/plans/v2-share-kits-passing.md, wave 2 rulings 1 and 2; MATH.md §10). A juggler
// is a pair of parts; a pass is a flight into another juggler's pair; passing siteswap (form 4)
// is one vanilla sequence per juggler, laid out as vanillaPair lays one out. Imports nothing from
// parts.ts at run time, so parts.ts can import from here (textOf).
import { MAX_JUGGLERS, MAX_PERIOD } from '../tunables';
import { digitText, digitValue } from './parse';
import type { ParseError } from './parse';
import type { PartsResult } from './parts';
import type { Part, PartIndex, Parts, Throw } from './types';

/** One throw of a passing sequence as written: height in pulses, target juggler (null: a self throw). */
export interface PassThrow {
  readonly height: number;
  readonly to: number | null;
}

export type PassingResult =
  | { readonly ok: true; readonly sequences: PassThrow[][] }
  | { readonly ok: false; readonly juggler: number; readonly error: ParseError };

/** The juggler a part belongs to: juggler j is parts 2j and 2j + 1 (ruling 1). */
export function jugglerOf(part: PartIndex): number {
  return Math.floor(part / 2);
}

/** True when a flight from `from` lands in another juggler's part. */
export function isPass(from: PartIndex, to: PartIndex): boolean {
  return jugglerOf(from) !== jugglerOf(to);
}

/**
 * Passing siteswap as written (form 4): `<3p 3|3p 3>`, one sequence per juggler between `|`. A
 * digit followed by `p` is a pass to the juggler named by the digit after it, 1-based, as Juggling
 * Lab reads it; a bare `p` (no digit after it) is allowed with two jugglers and means the other one. One leading
 * `<` and one trailing `>` are optional; spaces are ignored. Inside this form `p` is never a height
 * (25 cannot be written) and `x` has no place (a vanilla sequence crosses by parity), so either one
 * where it cannot mark a throw is an error. Error indices are into `text`.
 */
export function parsePassing(text: string): PassingResult {
  const skip = new Set<number>();
  const first = text.search(/\S/);
  if (text[first] === '<') skip.add(first);
  const last = text.length - 1 - [...text].reverse().join('').search(/\S/);
  if (text[last] === '>' && last !== first) skip.add(last);

  const segments: { start: number; end: number }[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '|') {
      segments.push({ start, end: i });
      start = i + 1;
    }
  }
  const of = segments.length;
  if (of > MAX_JUGGLERS) return { ok: false, juggler: 0, error: { kind: 'too-many-jugglers', max: MAX_JUGGLERS } };

  const sequences: PassThrow[][] = [];
  for (const [juggler, seg] of segments.entries()) {
    const fail = (error: ParseError): PassingResult => ({ ok: false, juggler, error });
    const out: PassThrow[] = [];
    for (let index = seg.start; index < seg.end; index++) {
      const c = text[index] as string;
      if (c === ' ' || c === '\t' || skip.has(index)) continue;
      const prev = out[out.length - 1];
      if ((c === 'p' || c === 'x') && prev !== undefined && prev.to === null) {
        let to: number | null = null;
        if (c === 'p') {
          const n = digitValue(text[index + 1] ?? '');
          if (n !== null && n <= 9) {
            if (n >= 1 && n <= of && n - 1 !== juggler) to = n - 1;
            if (to !== null) index++;
          } else if (of === 2) to = 1 - juggler;
        }
        // A zero is no throw, so it has no destination.
        if (to === null || prev.height === 0) return fail({ kind: 'bad-target', index });
        out[out.length - 1] = { height: prev.height, to };
        continue;
      }
      const value = digitValue(c);
      if (value === null || c === 'p' || c === 'x') return fail({ kind: 'bad-char', index });
      out.push({ height: value, to: null });
    }
    if (out.length === 0) return fail({ kind: 'empty' });
    if (out.length > MAX_PERIOD) return fail({ kind: 'too-long', max: MAX_PERIOD });
    sequences.push(out);
  }
  return { ok: true, sequences };
}

/**
 * The part a throw of `height` from part `part` lands in, when aimed at juggler `target`: the
 * target's phase (phase of `part` + height) mod 2 hand (ruling 2; MATH.md §10), the parity rule
 * vanilla's crosses follow, across jugglers. Null when that is `part` itself.
 */
function landingPart(part: PartIndex, height: number, target: number): PartIndex | null {
  const to = 2 * target + ((part % 2) + height) % 2;
  return to === part ? null : to;
}

/**
 * Parts from passing siteswap (ruling 2): juggler j's sequence laid out as `vanillaPair` lays one
 * out, at parts 2j and 2j + 1 (spacing 2, phases 0 and 1, unit 1, an odd-length sequence read
 * twice), so every juggler throws their phase-0 hand together. A throw lands by `landingPart`, in
 * its own juggler when it is not a pass. A parse error names the juggler's first part.
 */
export function partsFromPassing(text: string): PartsResult {
  const r = parsePassing(text);
  if (!r.ok) return { ok: false, part: 2 * r.juggler, error: r.error };
  return {
    ok: true,
    parts: r.sequences.flatMap((seq, juggler) => {
      const n = seq.length;
      const beats = n % 2 === 0 ? n / 2 : n;
      return [0, 1].map((h): Part => {
        const part = 2 * juggler + h;
        const throws = Array.from({ length: beats }, (_, j): Throw => {
          const t = seq[(2 * j + h) % n] as PassThrow;
          return { height: t.height, to: t.height === 0 ? null : landingPart(part, t.height, t.to ?? juggler) };
        });
        return { spacing: 2, phase: h, unit: 1, flights: { kind: 'manual', throws } };
      });
    }),
  };
}

const throwsIn = (p: Part): readonly Throw[] => (p.flights as { readonly throws: readonly Throw[] }).throws;

/**
 * True for the shape `partsFromPassing` makes of two or more jugglers, so it can be written as one
 * passing siteswap: an even number (4 up to 2 × MAX_JUGGLERS) of manual parts, each pair in vanilla
 * layout with equal lengths, every throw landing in the set, where `landingPart` says for the juggler it aims at.
 */
export function isPassingSet(parts: Parts): boolean {
  if (parts.length < 4 || parts.length % 2 === 1 || parts.length > 2 * MAX_JUGGLERS) return false;
  return parts.every((p, part) => {
    if (p.flights.kind !== 'manual' || p.spacing !== 2 || p.phase !== part % 2 || p.unit !== 1) return false;
    if (p.flights.throws.length !== throwsIn(parts[part ^ 1] as Part).length) return false;
    return p.flights.throws.every((t) => {
      if (t.height === 0) return t.to === null;
      if (t.to !== null && t.to >= parts.length) return false;
      return t.to !== part && t.to === landingPart(part, t.height, jugglerOf(t.to ?? part));
    });
  });
}

/**
 * A passing set as written (form 4): `<3p 3|3p 3>`, throws separated by single spaces, `p` for a
 * pass between two jugglers and `p<n>` (1-based) among three. Each juggler's sequence is halved, as
 * `vanillaDigits` halves a vanilla pair, when its parts' period is odd and the halves are equal.
 */
export function passingText(parts: Parts): string {
  const jugglers = parts.length / 2;
  const lines: string[] = [];
  for (let juggler = 0; juggler < jugglers; juggler++) {
    const [a, b] = [throwsIn(parts[2 * juggler] as Part), throwsIn(parts[2 * juggler + 1] as Part)];
    const token = (t: Throw): string => {
      const target = t.to === null ? juggler : jugglerOf(t.to);
      const mark = target === juggler ? '' : jugglers === 2 ? 'p' : `p${target + 1}`;
      return digitText(t.height) + mark;
    };
    const seq = a.flatMap((t, j) => [token(t), token(b[j] as Throw)]);
    const m = a.length;
    const halves = m % 2 === 1 && seq.every((d, i) => d === seq[(i + m) % (2 * m)]);
    lines.push((halves ? seq.slice(0, m) : seq).join(' '));
  }
  return `<${lines.join('|')}>`;
}
