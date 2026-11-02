// Which view the URL hash asks for. Pure. `#about` is reserved; play-view state is
// `#v3.<payload>` (or an old `#v1.` or `#v2.<payload>`), or a short form, all decoded by `hash.ts`.
// Anything else is the play view with no state, so a junk hash falls back to defaults and never throws.
//
// Short links (docs/plans/v2-share-kits-passing.md, ruling 4). Grammar:
//
//   short   := (vanilla | passing | hands | sync) [ '~' LISTEN ] [ '@' BPM ]
//   vanilla := SWAP                              one vanilla siteswap at 1:1:  #531  #531@140
//   passing := JUGGLER ( '|' JUGGLER )+          passing siteswap, one juggler's sequence each:  #3p-3|3p-3
//   JUGGLER := digits, a-z and '-'               a sequence as `partsFromPassing` reads it, no brackets;
//                                                '-' stands for the space; 'p' and 'p<n>' mark passes;
//                                                it is the '|' that makes the link passing (#3p3 is vanilla, a 25)
//   sync    := '(' then digits, a-z, 'x', '(', ')' and ','   sync siteswap as `partsFromSync` reads it:  #(4,2x)(2x,4)
//                                                '(', ')' and ',' are legal in a fragment (RFC 3986 sub-delims) and written unescaped;
//                                                a percent-encoded form is decoded first
//   hands   := A ':' B '/' LINE '/' LINE         two hands at a ratio:  #3:2/2-2x-2/2x-2
//   LISTEN  := what the sound follows: height, ball or pitch; absent means ball (the default):  #531~height@140
//              (docs/plans/v5-sound-model.md, ruling 6). Old links' preset names still read:
//              height-drum and voice-per-part as height (the second with a notice), height-pitch
//              as pitch, ball-pitch as ball.
//   SWAP    := a digit, then digits and a-z     (the Pattern tab's vanilla text, `partsFromVanilla`)
//   LINE    := digits, a-z, 'x' and '-'          one hand's text as `partsFromLines` reads it;
//                                                '-' stands for the space between throws
//   A, B    := positive integers, A not equal to B;  BPM := a whole number, clamped to BPM_RANGE
//
// A short form means: the sound following LISTEN, with the default Also play switches and drum
// machines (any other sound writes `#v3.`), the default phases (what the parser
// makes), and the default tempo when '@BPM' is absent. Decoding goes through the same parsers the
// Pattern tab uses, so a short link plays exactly what typing it would.
//
// What is written: the shortest form that round-trips. `encodeHash` builds the short candidate,
// decodes it, and keeps it only if `encodeState` of the decoded state equals `encodeState` of the
// state. Anything else (a sync set with a non-default phase, three or more parts that are not a passing set, a sound with other switches or drum machines, a non-default phase, manual
// flights, a default-rule part, a tempo that is not whole) writes `#v3.`. `#v1.`, `#v2.` and
// `#v3.` links keep opening; a short-looking hash that does not parse loads the defaults.

export interface Route {
  readonly view: 'play' | 'about';
  /** The `<payload>` of `#v<n>.<payload>`, or the whole short form; undecoded; null when the hash carries no state. */
  readonly state: string | null;
  /** The scheme the payload is in; null with no payload. */
  readonly version: 1 | 2 | 3 | 'short' | null;
}

const VERSIONS = [1, 2, 3] as const;
/** The shape of a short link; whether it parses is `hash.ts`'s business. */
const SHORT = /^(\d[0-9a-z]*|\([0-9a-z(),]*|\d[0-9a-z-]*(?:\|[0-9a-z-]+)+|\d+:\d+\/[0-9a-z-]*\/[0-9a-z-]*)(~[a-z-]+)?(@\d+)?$/;

export function route(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h === 'about') return { view: 'about', state: null, version: null };
  for (const version of VERSIONS) {
    const prefix = `v${version}.`;
    if (h.startsWith(prefix) && h.length > prefix.length) return { view: 'play', state: h.slice(prefix.length), version };
  }
  // An app or link sanitizer may have percent-encoded `~`, `:` or `@`.
  let decoded = h;
  try {
    decoded = decodeURIComponent(h);
  } catch {
    // not decodable: it cannot be a short link either way
  }
  if (SHORT.test(decoded)) return { view: 'play', state: decoded, version: 'short' };
  return { view: 'play', state: null, version: null };
}
