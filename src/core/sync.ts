// Sync notation (form 5; v3 ruling 5; MATH.md §11). `(4,2x)(2x,4)`: each pair is the left and
// right hand throwing on the same beat, every height even, `x` crossing to the other hand; a
// trailing `*` repeats the sequence with the hands exchanged. Laid out as two parts at spacing 2,
// both at phase 0, unit 1. Imports nothing from parts.ts at run time, so parts.ts can import from
// here (textOf).
import { MAX_PERIOD } from '../tunables';
import { digitText, digitValue } from './parse';
import type { ParseError } from './parse';
import type { PartsResult } from './parts';
import type { Part, Parts, Throw } from './types';

/** One throw of a sync pair as written: height in pulses, and whether it crosses. */
export interface SyncThrow {
  readonly height: number;
  readonly cross: boolean;
}

/** A sync pair: the left hand's throw (part 0), then the right hand's (part 1). */
export type SyncPair = readonly [SyncThrow, SyncThrow];

export type SyncResult = { readonly ok: true; readonly pairs: SyncPair[] } | { readonly ok: false; readonly error: ParseError };

const space = (c: string | undefined) => c === ' ' || c === '\t';

/**
 * Sync siteswap as written (form 5): pairs `(a,b)`, `a` the left hand's throw and `b` the right's,
 * each a digit with an optional `x`, then an optional `*` for the hands-exchanged repeat. Spaces
 * are ignored. An odd height is a `bad-sync` at its digit, a pair left open is a `bad-sync`
 * (`open`) at the end of the text, `0x` is a `bad-target`, and anything else out of place a
 * `bad-char`. Error indices are into `text`.
 */
export function parseSync(text: string): SyncResult {
  const pairs: SyncPair[] = [];
  let i = 0;
  const skip = () => {
    while (space(text[i])) i++;
  };
  const open = (): ParseError => ({ kind: 'bad-sync', index: i, open: true });
  /** One throw, then the character that must close it. */
  const one = (close: string): SyncThrow | ParseError => {
    skip();
    if (i >= text.length) return open();
    const c = text[i] as string;
    const height = digitValue(c);
    if (height === null || c === 'x') return { kind: 'bad-char', index: i };
    if (height % 2 === 1) return { kind: 'bad-sync', index: i, open: false };
    i++;
    skip();
    let cross = false;
    if (text[i] === 'x') {
      if (height === 0) return { kind: 'bad-target', index: i };
      cross = true;
      i++;
      skip();
    }
    if (i >= text.length) return open();
    if (text[i] !== close) return { kind: 'bad-char', index: i };
    i++;
    return { height, cross };
  };
  const fail = (error: ParseError): SyncResult => ({ ok: false, error });
  let mirror = false;
  for (skip(); i < text.length; skip()) {
    const c = text[i];
    if (c === '*' && pairs.length > 0 && !mirror) {
      mirror = true;
      i++;
      continue;
    }
    if (c !== '(' || mirror) return fail({ kind: 'bad-char', index: i });
    i++;
    const left = one(',');
    if (!('height' in left)) return fail(left);
    const right = one(')');
    if (!('height' in right)) return fail(right);
    pairs.push([left, right]);
  }
  if (pairs.length === 0) return fail({ kind: 'empty' });
  const all = mirror ? [...pairs, ...pairs.map(([l, r]): SyncPair => [r, l])] : pairs;
  if (all.length > MAX_PERIOD) return fail({ kind: 'too-long', max: MAX_PERIOD });
  return { ok: true, pairs: all };
}

/**
 * Parts from sync siteswap (ruling 5): the left hand is part 0 and the right part 1, both at
 * spacing 2, phase 0, unit 1, so both throw together every two pulses; pair j is beat j of each.
 * A throw of height h lands h pulses later in its own part, or in the other one when crossed.
 */
export function partsFromSync(text: string): PartsResult {
  const r = parseSync(text);
  if (!r.ok) return { ok: false, part: 0, error: r.error };
  return {
    ok: true,
    parts: [0, 1].map(
      (hand): Part => ({
        spacing: 2,
        phase: 0,
        unit: 1,
        flights: {
          kind: 'manual',
          throws: r.pairs.map((pair): Throw => {
            const t = pair[hand] as SyncThrow;
            return { height: t.height, to: t.cross ? 1 - hand : null };
          }),
        },
      }),
    ),
  };
}

const throwsIn = (p: Part): readonly Throw[] => (p.flights as { readonly throws: readonly Throw[] }).throws;

/**
 * True for the shape `partsFromSync` makes, so it can be written as one sync siteswap: two manual
 * parts of equal length at spacing 2, phase 0, unit 1, every height even, every throw landing in
 * its own part or crossing to the other one (a 0 never crossing).
 */
export function isSyncSet(parts: Parts): boolean {
  if (parts.length !== 2) return false;
  return parts.every((p, hand) => {
    if (p.flights.kind !== 'manual' || p.spacing !== 2 || p.phase !== 0 || p.unit !== 1) return false;
    if (p.flights.throws.length !== throwsIn(parts[1 - hand] as Part).length) return false;
    return p.flights.throws.every((t) => t.height % 2 === 0 && (t.to === null || (t.to === 1 - hand && t.height > 0)));
  });
}

/** A sync set as written (form 5): `(4,2x)(2x,4)`, one pair per beat, never the `*` form. */
export function syncText(parts: Parts): string {
  const [a, b] = [throwsIn(parts[0] as Part), throwsIn(parts[1] as Part)];
  const token = (t: Throw) => digitText(t.height) + (t.to === null ? '' : 'x');
  return a.map((t, j) => `(${token(t)},${token(b[j] as Throw)})`).join('');
}
