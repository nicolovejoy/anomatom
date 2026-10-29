// The share link (SPEC §4.3, docs/plans/v1-parallel.md "Routes and hash"). Pure: the location
// and the timer arrive as `ShareDeps`, so this is tested with fakes. `mount-share.ts` supplies
// the real ones.
//
// - On load, and on a `hashchange` (a pasted link), the hash is restored into the store like
//   any knob change: only the fields that differ are set, so the knobs queue them for the next
//   cycle and nothing restarts or plays. A hash that carries no state is ignored when empty or
//   `#about`, and is junk otherwise: junk loads the defaults (never throws).
// - Every change to pattern, ratio, tempo or Mapping rewrites the hash (`replaceState`, so
//   no history entry) after `SHARE.hashDebounceMs` of quiet, except while About is showing.
// - `lastStateHash` in the store is kept current at once (About's back link), not debounced.
import { decodeState, encodeState } from './hash';
import { route } from './route';
import { defaultState, type AppState, type Store } from './state';

export interface ShareDeps {
  readonly store: Store;
  /** The current `location.hash`, `#` included (or empty). */
  hash(): string;
  /** `history.replaceState` with this hash. */
  replaceHash(hash: string): void;
  after(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  readonly debounceMs: number;
}

/** The fields the link carries. */
type Shared = Pick<AppState, 'patterns' | 'ratio' | 'bpm' | 'mapping'>;

const sameMapping = (a: AppState['mapping'], b: AppState['mapping']) =>
  a === b || encodeState({ ...defaultState(), mapping: a }) === encodeState({ ...defaultState(), mapping: b });

/** What of `target` differs from `current`; the unchanged fields are left out, so no listener hears of them. */
export function changedFields(current: AppState, target: Shared): Partial<AppState> {
  const patch: { -readonly [K in keyof AppState]?: AppState[K] } = {};
  if (target.patterns.some((t, i) => t !== current.patterns[i])) patch.patterns = target.patterns;
  if (target.ratio.a !== current.ratio.a || target.ratio.b !== current.ratio.b) patch.ratio = target.ratio;
  if (target.bpm !== current.bpm) patch.bpm = target.bpm;
  if (!sameMapping(target.mapping, current.mapping)) patch.mapping = target.mapping;
  return patch;
}

const sharedChanged = (a: AppState, b: AppState) =>
  a.patterns !== b.patterns || a.ratio !== b.ratio || a.bpm !== b.bpm || a.mapping !== b.mapping;

/** The link to the current state: this page's address with the live hash, never a stale one. */
export function shareUrl(href: string, state: AppState): string {
  const at = href.indexOf('#');
  return (at === -1 ? href : href.slice(0, at)) + encodeState(state);
}

export function createShare(deps: ShareDeps) {
  const { store } = deps;
  let timer: unknown;
  let pending = false;

  function write() {
    if (pending) deps.cancel(timer);
    pending = false;
    // About owns the hash while it shows; the back link holds the state.
    if (route(deps.hash()).view === 'about') return;
    const hash = encodeState(store.get());
    if (deps.hash() !== hash) deps.replaceHash(hash);
  }

  function restore() {
    const hash = deps.hash();
    const { view, state } = route(hash);
    if (view === 'about' || hash === '' || hash === '#') return;
    const decoded = state === null ? null : decodeState(state);
    const d = defaultState();
    const target: Shared = {
      patterns: decoded?.patterns ?? d.patterns,
      ratio: decoded?.ratio ?? d.ratio,
      bpm: decoded?.bpm ?? d.bpm,
      mapping: decoded?.mapping ?? d.mapping,
    };
    const patch = changedFields(store.get(), target);
    if (Object.keys(patch).length > 0) store.set(patch);
  }

  return {
    /** Restores from the hash, then follows the store. Call once. */
    start() {
      store.subscribe((state, previous) => {
        if (!sharedChanged(state, previous)) return;
        const hash = encodeState(state);
        if (hash !== state.lastStateHash) store.set({ lastStateHash: hash });
        if (pending) deps.cancel(timer);
        pending = true;
        timer = deps.after(write, deps.debounceMs);
      });
      restore();
      const hash = encodeState(store.get());
      if (hash !== store.get().lastStateHash) store.set({ lastStateHash: hash });
    },
    /** A pasted link, or any hash change on an open page. */
    onHashChange: restore,
    /** Writes the hash now, if a write is waiting (the page is going away). */
    flush() {
      if (pending) write();
    },
  };
}
