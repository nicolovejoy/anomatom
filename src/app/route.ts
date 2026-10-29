// Which view the URL hash asks for. Pure. `#about` is reserved; play-view state is
// `#v2.<payload>` (or an old `#v1.<payload>`), decoded by `hash.ts`. Anything else is the play
// view with no state, so a junk hash falls back to defaults and never throws.

export interface Route {
  readonly view: 'play' | 'about';
  /** The `<payload>` of `#v<n>.<payload>`, undecoded; null when the hash carries no state. */
  readonly state: string | null;
  /** The scheme the payload is in; null with no payload. */
  readonly version: 1 | 2 | null;
}

const VERSIONS = [1, 2] as const;

export function route(hash: string): Route {
  const h = hash.startsWith('#') ? hash.slice(1) : hash;
  if (h === 'about') return { view: 'about', state: null, version: null };
  for (const version of VERSIONS) {
    const prefix = `v${version}.`;
    if (h.startsWith(prefix) && h.length > prefix.length) return { view: 'play', state: h.slice(prefix.length), version };
  }
  return { view: 'play', state: null, version: null };
}
