// The app's state and the one store that holds it. Pure: no DOM, no timers. Stored state holds
// primitives only (docs/plans/model-rethink.md §12a): the parts, ratio, tempo, volume, Mapping
// and UI state. Everything derived comes from `derived(state)` (derived.ts); every transition
// with a rule is an action handled by `reduce` (actions.ts), sent with `store.dispatch`.
import { partsFromVanilla } from '../core/parts';
import type { Parts, Ratio } from '../core/types';
import type { Mapping } from '../sound/mapping';
import { DEFAULT_BPM, DEFAULT_MAPPING, DEFAULT_PATTERN, DEFAULT_VOLUME } from '../tunables';
import { reduce, type Action } from './actions';
import { derived, type Derived } from './derived';

export interface AppState {
  readonly parts: Parts;
  /**
   * Input drafts, one per part, as typed; UI state, not in the hash. Null = show the part's
   * text (`derived(state).texts`). At 1:1 the one input is draft 0, whatever the parts.
   */
  readonly drafts: readonly (string | null)[];
  /** Kept for the Rhythm tab chips; the parts' spacings follow it. */
  readonly ratio: Ratio;
  /** Tempo of hand 1's beats. */
  readonly bpm: number;
  /** Master volume, 0 to 1. Not part of the share link. */
  readonly volume: number;
  readonly mapping: Mapping;
  /** The last play-view state hash (`#v2.…`), for About's back link; null before there is one. */
  readonly lastStateHash: string | null;
  /** UI state: which tab of the phone sheet is open, or null when it is closed (docs/plans/phone-sheet.md). Never in the share hash. */
  readonly sheetTab: SheetTab | null;
  /** UI state: whether the card screen shows (v3 stream C2). Never in the share hash. */
  readonly cards: boolean;
  /** One-line notice from the last action (design §5), cleared by the next action. Never in the hash. */
  readonly notice: string | null;
}

export type SheetTab = 'pattern' | 'rhythm' | 'sound';

/** The default pattern's parts: vanilla `3`, which always parses. */
export function defaultParts(): Parts {
  return (partsFromVanilla(DEFAULT_PATTERN) as { parts: Parts }).parts;
}

/** One null draft per part: every input shows its part's text. */
export const noDrafts = (parts: Parts): (string | null)[] => parts.map(() => null);

export function defaultState(): AppState {
  const parts = defaultParts();
  return {
    parts,
    drafts: noDrafts(parts),
    ratio: { a: 1, b: 1 },
    bpm: DEFAULT_BPM,
    volume: DEFAULT_VOLUME,
    mapping: DEFAULT_MAPPING,
    lastStateHash: null,
    sheetTab: null,
    cards: false,
    notice: null,
  };
}

export type Listener = (state: AppState, previous: AppState) => void;

export interface Store {
  get(): AppState;
  /** The derived values of the current state (derived.ts), computed once per state. */
  derived(): Derived;
  /** Merges `patch` into the state; listeners hear only when a field actually changed (by identity). */
  set(patch: Partial<AppState>): void;
  /** Applies an action through `reduce` (actions.ts): the only way the parts change by a rule. */
  dispatch(action: Action): void;
  /** Calls `fn` after every change; returns the function that stops it. */
  subscribe(fn: Listener): () => void;
  /**
   * Registers a deriver: on every `set` the patch is merged, then each deriver's output is merged
   * too (each sees the state so far and the previous one), and listeners hear one change.
   */
  derive(fn: Deriver): () => void;
}

export type Deriver = (next: AppState, previous: AppState) => Partial<AppState>;

export function createStore(initial: AppState = defaultState()): Store {
  let state = initial;
  const listeners = new Set<Listener>();
  const derivers = new Set<Deriver>();

  const store: Store = {
    get: () => state,
    derived: () => derived(state),
    set(patch) {
      const previous = state;
      let next: AppState = { ...state, ...patch };
      for (const fn of derivers) next = { ...next, ...fn(next, previous) };
      if ((Object.keys(next) as (keyof AppState)[]).every((k) => next[k] === previous[k])) return;
      state = next;
      // The selector runs here, once per state, before anyone reads it (design §12a).
      derived(state);
      for (const fn of [...listeners]) fn(state, previous);
    },
    dispatch(action) {
      store.set(reduce(state, action));
    },
    derive(fn) {
      derivers.add(fn);
      return () => {
        derivers.delete(fn);
      };
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  return store;
}
