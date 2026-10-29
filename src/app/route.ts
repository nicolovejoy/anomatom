// Which view the URL hash asks for. Pure. `#about` is reserved; play-view state is
// `#v1.<payload>`, decoded by `hash.ts` (stream C). Anything else is the play view with no
// state, so a junk hash falls back to defaults and never throws.

export interface Route {
  readonly view: 'play' | 'about';
  /** The `<payload>` of `#v1.<payload>`, undecoded; null when the hash carries no state. */
  readonly state: string | null;
}

const STATE_PREFIX = 'v1.';

export function route(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h === 'about') return { view: 'about', state: null };
  if (h.startsWith(STATE_PREFIX) && h.length > STATE_PREFIX.length) {
    return { view: 'play', state: h.slice(STATE_PREFIX.length) };
  }
  return { view: 'play', state: null };
}
