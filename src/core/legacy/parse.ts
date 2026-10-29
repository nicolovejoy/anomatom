import { parseThrows } from '../parse';
import type { ParseError as PartParseError } from '../parse';
import type { HandPattern } from './types';

/** The two-hand parser's errors: no letters and no destinations, so no `bad-target`. */
export type ParseError = Exclude<PartParseError, { readonly kind: 'bad-target' }>;

export type ParseResult =
  | { readonly ok: true; readonly pattern: HandPattern }
  | { readonly ok: false; readonly error: ParseError };

/** Digits 0-9, each optionally followed by `x`; whitespace is ignored. One hand's box, as before. */
export function parsePattern(text: string): ParseResult {
  for (let i = 0; i < text.length; i++) {
    if (!/[0-9x \t]/.test(text[i] as string)) return { ok: false, error: { kind: 'bad-char', index: i } };
  }
  // One of two parts, so a bare `x` crosses and a digit after it is the next throw.
  const r = parseThrows(text, { part: 0, of: 2 });
  if (!r.ok) return { ok: false, error: r.error as ParseError };
  return { ok: true, pattern: (r.throws[0] ?? []).map((t) => ({ height: t.height, cross: t.to !== null })) };
}
