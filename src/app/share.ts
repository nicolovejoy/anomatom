// The share link (SPEC §4.3, docs/plans/v1-parallel.md "Routes and hash"). Pure: the location
// and the timer arrive as `ShareDeps`, so this is tested with fakes. `mount-share.ts` supplies
// the real ones.
//
// - On load, and on a `hashchange` (a pasted link), the hash is restored into the store like
//   any knob change: only the fields that differ are set, so the knobs queue them for the next
//   cycle and nothing restarts or plays. A hash that carries no state is ignored when empty or
//   `#about`, and is junk otherwise: junk loads the defaults (never throws).
// - Every change to the parts, ratio, tempo or Mapping rewrites the hash after
//   `SHARE.hashDebounceMs` of quiet, except while About is showing. A write that follows a change
//   to the parts is a `pushState` (a new history entry, so Back returns to the old pattern);
//   every other write replaces the current entry. Two parts edits inside one quiet period push once.
// - A `popstate` (Back, Forward) restores like a pasted link, and drops any write still waiting:
//   the entry the person went to is the truth now. A restore never writes a new entry.
// - `lastStateHash` in the store is kept current at once (About's back link), not debounced. It
//   rides in the same `store.set` as the change it follows (a `store.derive` deriver),
//   so listeners run once per change, not twice.
import { decodeState, encodeHash, encodeState } from './hash';
import { route } from './route';
import { defaultState, type AppState, type Store } from './state';

export interface ShareDeps {
  readonly store: Store;
  /** The current `location.hash`, `#` included (or empty). */
  hash(): string;
  /** `history.replaceState` with this hash. */
  replaceHash(hash: string): void;
  /** `history.pushState` with this hash: a new entry. */
  pushHash(hash: string): void;
  after(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
  readonly debounceMs: number;
}

/** The fields the link carries. */
type Shared = Pick<AppState, 'parts' | 'ratio' | 'bpm' | 'mapping'>;

const sameMapping = (a: AppState['mapping'], b: AppState['mapping']) =>
  a === b || encodeState({ ...defaultState(), mapping: a }) === encodeState({ ...defaultState(), mapping: b });

const sameParts = (a: AppState['parts'], b: AppState['parts']) =>
  a === b || encodeState({ ...defaultState(), parts: a }) === encodeState({ ...defaultState(), parts: b });

/**
 * What of `target` differs from `current`; the unchanged fields are left out, so no listener
 * hears of them. New parts come with fresh drafts, so the inputs show what the link holds.
 */
export function changedFields(current: AppState, target: Shared): Partial<AppState> {
  const patch: { -readonly [K in keyof AppState]?: AppState[K] } = {};
  if (!sameParts(target.parts, current.parts)) {
    patch.parts = target.parts;
    patch.drafts = target.parts.map(() => null);
  }
  if (target.ratio.a !== current.ratio.a || target.ratio.b !== current.ratio.b) patch.ratio = target.ratio;
  if (target.bpm !== current.bpm) patch.bpm = target.bpm;
  if (!sameMapping(target.mapping, current.mapping)) patch.mapping = target.mapping;
  return patch;
}

const sharedChanged = (a: AppState, b: AppState) =>
  a.parts !== b.parts || a.ratio !== b.ratio || a.bpm !== b.bpm || a.mapping !== b.mapping;

/**
 * `replace` that never throws: Safari raises SecurityError past 100 `replaceState` calls in 30
 * seconds. The store is fine; the hash just misses this write, and the next quiet period tries again.
 */
export function quietly(replace: (hash: string) => void): (hash: string) => void {
  return (hash) => {
    try {
      replace(hash);
    } catch {
      // see above
    }
  };
}

/** The link to the current state: this page's address with the live hash, never a stale one. */
export function shareUrl(href: string, state: AppState): string {
  const at = href.indexOf('#');
  return (at === -1 ? href : href.slice(0, at)) + encodeHash(state);
}

export function createShare(deps: ShareDeps) {
  const { store } = deps;
  let timer: unknown;
  let pending = false;
  /** The waiting write follows a change to the parts, so it is a new history entry. */
  let push = false;
  /** Set while a restore sets the store: the change comes from the hash, not from the person. */
  let restoring = false;

  function write() {
    if (pending) deps.cancel(timer);
    pending = false;
    const asPush = push;
    push = false;
    // About owns the hash while it shows; the back link holds the state.
    if (route(deps.hash()).view === 'about') return;
    const hash = encodeHash(store.get());
    if (deps.hash() === hash) return;
    if (asPush) deps.pushHash(hash);
    else deps.replaceHash(hash);
  }

  function restore() {
    const hash = deps.hash();
    const { view, state, version } = route(hash);
    if (view === 'about' || hash === '' || hash === '#') return;
    const decoded = state === null ? null : decodeState(state, version ?? 2);
    const d = defaultState();
    const target: Shared = {
      parts: decoded?.parts ?? d.parts,
      ratio: decoded?.ratio ?? d.ratio,
      bpm: decoded?.bpm ?? d.bpm,
      mapping: decoded?.mapping ?? d.mapping,
    };
    const patch = changedFields(store.get(), target);
    if (Object.keys(patch).length === 0) return;
    restoring = true;
    try {
      store.set(patch);
    } finally {
      restoring = false;
    }
  }

  /** Back, Forward or a pasted link: what is waiting to be written is stale. */
  function arrive() {
    if (pending) deps.cancel(timer);
    pending = false;
    push = false;
    restore();
  }

  return {
    /** Restores from the hash, then follows the store. Call once. */
    start() {
      store.derive((next, previous) =>
        sharedChanged(next, previous) ? { lastStateHash: encodeHash(next) } : {},
      );
      store.subscribe((state, previous) => {
        if (!sharedChanged(state, previous)) return;
        if (!restoring && state.parts !== previous.parts) push = true;
        if (pending) deps.cancel(timer);
        pending = true;
        timer = deps.after(write, deps.debounceMs);
      });
      restore();
      // The deriver only runs on a change; the first hash is set here.
      const hash = encodeHash(store.get());
      if (hash !== store.get().lastStateHash) store.set({ lastStateHash: hash });
    },
    /** A pasted link, Back or Forward, or any hash change on an open page. */
    onHashChange: arrive,
    /** Writes the hash now, if a write is waiting (the page is going away). */
    flush() {
      if (pending) write();
    },
  };
}

export type ShareOutcome = 'shared' | 'copied' | 'not-copied' | 'cancelled';

export interface ShareButtonDeps {
  /** `navigator.share`, where the browser has one. */
  readonly share?: (data: { url: string }) => Promise<void>;
  /** `navigator.clipboard.writeText`, where there is one. */
  readonly writeText?: (text: string) => Promise<void>;
}

/**
 * What the share button does with `url`: the system share sheet where it exists (a dismissed
 * sheet is `cancelled`, not an error), else, or if it refuses for another reason, the clipboard. Never throws.
 */
export async function shareLink(url: string, deps: ShareButtonDeps): Promise<ShareOutcome> {
  if (deps.share) {
    try {
      await deps.share({ url });
      return 'shared';
    } catch (err) {
      // A dismissed share sheet is the user's answer; any other refusal falls through to the clipboard.
      if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    if (!deps.writeText) return 'not-copied';
    await deps.writeText(url);
    return 'copied';
  } catch {
    return 'not-copied';
  }
}
