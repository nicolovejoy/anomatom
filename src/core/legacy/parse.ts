import { MAX_PERIOD } from '../../tunables';
import type { HandPattern, Throw } from './types';

export type ParseError =
  | { readonly kind: 'empty' }
  | { readonly kind: 'bad-char'; readonly index: number }
  | { readonly kind: 'too-long'; readonly max: number };

export type ParseResult =
  | { readonly ok: true; readonly pattern: HandPattern }
  | { readonly ok: false; readonly error: ParseError };

/** Digits 0-9, each optionally followed by `x`; whitespace is ignored. */
export function parsePattern(text: string): ParseResult {
  const throws: Throw[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i] as string;
    if (c === ' ' || c === '\t') continue;
    if (c >= '0' && c <= '9') {
      throws.push({ height: Number(c), cross: false });
      continue;
    }
    const last = throws[throws.length - 1];
    if (c === 'x' && last !== undefined && !last.cross) {
      throws[throws.length - 1] = { ...last, cross: true };
      continue;
    }
    return { ok: false, error: { kind: 'bad-char', index: i } };
  }
  if (throws.length === 0) return { ok: false, error: { kind: 'empty' } };
  if (throws.length > MAX_PERIOD) return { ok: false, error: { kind: 'too-long', max: MAX_PERIOD } };
  return { ok: true, pattern: throws };
}
