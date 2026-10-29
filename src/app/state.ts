// The app's state and the one store that holds it. Pure: no DOM, no timers. The knobs write
// here; every mount reads and subscribes here.
import type { Ratio } from '../core/types';
import type { Mapping } from '../sound/mapping';
import {
  DEFAULT_BPM,
  DEFAULT_MAPPING,
  DEFAULT_PATTERN,
  DEFAULT_PATTERN_HAND2,
  DEFAULT_VOLUME,
} from '../tunables';

export interface AppState {
  /** Pattern text as typed, hand 1 then hand 2. At 1:1 only hand 1's is used. */
  readonly patterns: readonly [string, string];
  readonly ratio: Ratio;
  /** Tempo of hand 1's beats. */
  readonly bpm: number;
  /** Master volume, 0 to 1. Not part of the share link. */
  readonly volume: number;
  readonly mapping: Mapping;
  /** The last play-view state hash (`#v1.…`), for About's back link; null before there is one. */
  readonly lastStateHash: string | null;
  /** UI state: whether the sound panel is open. Stream E sets it, stream F reads it; the share hash never carries it. */
  readonly soundPanelOpen: boolean;
  /** UI state: which tab of the phone sheet is open, or null when it is closed (docs/plans/phone-sheet.md). Never in the share hash. */
  readonly sheetTab: SheetTab | null;
}

export type SheetTab = 'pattern' | 'rhythm' | 'sound';

export function defaultState(): AppState {
  return {
    patterns: [DEFAULT_PATTERN, DEFAULT_PATTERN_HAND2],
    ratio: { a: 1, b: 1 },
    bpm: DEFAULT_BPM,
    volume: DEFAULT_VOLUME,
    mapping: DEFAULT_MAPPING,
    lastStateHash: null,
    soundPanelOpen: false,
    sheetTab: null,
  };
}

export type Listener = (state: AppState, previous: AppState) => void;

export interface Store {
  get(): AppState;
  /** Merges `patch` into the state; listeners hear only when a field actually changed (by identity). */
  set(patch: Partial<AppState>): void;
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

  return {
    get: () => state,
    set(patch) {
      const previous = state;
      let next: AppState = { ...state, ...patch };
      for (const fn of derivers) next = { ...next, ...fn(next, previous) };
      if ((Object.keys(next) as (keyof AppState)[]).every((k) => next[k] === previous[k])) return;
      state = next;
      for (const fn of [...listeners]) fn(state, previous);
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
}
