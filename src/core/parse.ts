import { MAX_PERIOD } from '../tunables';
import type { PartIndex, Throw } from './types';

export type ParseError =
  | { readonly kind: 'empty' }
  | { readonly kind: 'bad-char'; readonly index: number }
  | { readonly kind: 'too-long'; readonly max: number }
  /** An `x` or a `p` with no part to go to: one part, a bare `x` among three or more, or a wrong number. */
  | { readonly kind: 'bad-target'; readonly index: number }
  /** More parts than the editor shows (the app's rule, never the parser's: stream B ruling). */
  | { readonly kind: 'too-many-parts'; readonly max: number }
  /** More jugglers than a passing siteswap may write (MAX_JUGGLERS, wave 2 ruling 2). */
  | { readonly kind: 'too-many-jugglers'; readonly max: number };

export type ThrowsResult =
  | { readonly ok: true; readonly throws: Throw[][]; readonly parts: number }
  | { readonly ok: false; readonly error: ParseError };

/** Where a text written for one part sits among the others: its index and how many there are. */
export interface PartContext {
  readonly part: PartIndex;
  readonly of: number;
}

/** A digit 0-9 or a letter a-z (10-35), or null. */
export function digitValue(c: string): number | null {
  if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
  if (c >= 'a' && c <= 'z') return c.charCodeAt(0) - 87;
  return null;
}

/** A digit as written: 0-9, then a-z for 10-35; anything larger in braces, which no parser reads. */
export function digitText(n: number): string {
  if (n < 10) return String(n);
  if (n < 36) return String.fromCharCode(87 + n);
  return `{${n}}`;
}

/**
 * Throws as written, one list per part (model-waves.md "Core API"). Heights are the digits as
 * written (one unit each; the constructors in parts.ts scale them to pulses). `/` separates parts.
 * A digit may be followed by `x`, a cross: with exactly two parts a bare `x` goes to the other one
 * (and a digit after it is the next throw, so `2x22` is `2x 2 2`); with three or more parts the `x`
 * must name the destination part by number, `x3`, 1-based as written. `context` places a text
 * written for one part among the others, so one hand's box can say `2x 2 2`.
 * `x` itself is never a throw (siteswap's `x` = 33 is not typeable), and `0x` is a `bad-target`: a
 * zero has no destination.
 */
export function parseThrows(text: string, context?: PartContext): ThrowsResult {
  const segments: { start: number; text: string }[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i++) {
    if (i === text.length || text[i] === '/') {
      segments.push({ start, text: text.slice(start, i) });
      start = i + 1;
    }
  }
  const of = context?.of ?? segments.length;
  const throws: Throw[][] = [];
  for (const [s, seg] of segments.entries()) {
    const self = context?.part ?? s;
    const out: Throw[] = [];
    for (let j = 0; j < seg.text.length; j++) {
      const c = seg.text[j] as string;
      const index = seg.start + j;
      if (c === ' ' || c === '\t') continue;
      const value = digitValue(c);
      const last = out[out.length - 1];
      if (c === 'x' && last !== undefined && last.to === null) {
        let to: number | null = null;
        if (of === 2) to = 1 - self;
        else if (of > 2) {
          const n = digitValue(seg.text[j + 1] ?? '');
          if (n !== null && n <= 9) {
            j++;
            if (n >= 1 && n <= of && n - 1 !== self) to = n - 1;
          }
        }
        // A zero is no throw, so it has no destination.
        if (to === null || last.height === 0) return { ok: false, error: { kind: 'bad-target', index } };
        out[out.length - 1] = { height: last.height, to };
        continue;
      }
      if (value === null || c === 'x') return { ok: false, error: { kind: 'bad-char', index } };
      out.push({ height: value, to: null });
    }
    if (out.length === 0) return { ok: false, error: { kind: 'empty' } };
    if (out.length > MAX_PERIOD) return { ok: false, error: { kind: 'too-long', max: MAX_PERIOD } };
    throws.push(out);
  }
  return { ok: true, throws, parts: throws.length };
}
