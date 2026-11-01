import { expect, test, vi } from 'vitest';
import { partsFromVanilla } from '../core';
import { DEFAULT_BPM, DEFAULT_MAPPING, DEFAULT_PATTERN, DEFAULT_VOLUME } from '../tunables';
import { derived } from './derived';
import { createStore, defaultState } from './state';

test('the defaults come from the tunables', () => {
  const vanilla = partsFromVanilla(DEFAULT_PATTERN);
  expect(defaultState()).toEqual({
    parts: vanilla.ok && vanilla.parts,
    drafts: [null, null],
    ratio: { a: 1, b: 1 },
    bpm: DEFAULT_BPM,
    volume: DEFAULT_VOLUME,
    mapping: DEFAULT_MAPPING,
    lastStateHash: null,
    sheetTab: null,
    muted: false,
    notice: null,
  });
});

test('dispatch runs an action through reduce; derived() is the selector on the current state', () => {
  const store = createStore();
  const heard = vi.fn();
  store.subscribe(heard);
  store.dispatch({ type: 'editDraft', part: 0, text: '441' });
  expect(heard).toHaveBeenCalledTimes(1);
  expect(store.get().drafts[0]).toBe('441');
  expect(store.derived()).toBe(derived(store.get()));
  expect(store.derived().schedule.balls).toBe(3);
  // An action that changes nothing is silent.
  store.dispatch({ type: 'setBpm', bpm: store.get().bpm });
  expect(heard).toHaveBeenCalledTimes(1);
});

test('a new store starts at the defaults, or at the state it is given', () => {
  expect(createStore().get()).toEqual(defaultState());
  const initial = { ...defaultState(), bpm: 90 };
  expect(createStore(initial).get()).toBe(initial);
});

test('set merges a patch and tells every listener the new and previous state', () => {
  const store = createStore();
  const before = store.get();
  const a = vi.fn();
  const b = vi.fn();
  store.subscribe(a);
  store.subscribe(b);
  store.set({ bpm: 100, sheetTab: 'rhythm' });
  const after = store.get();
  expect(after).toEqual({ ...before, bpm: 100, sheetTab: 'rhythm' });
  expect(before.bpm).toBe(DEFAULT_BPM); // the old state is not mutated
  expect(a).toHaveBeenCalledWith(after, before);
  expect(b).toHaveBeenCalledWith(after, before);
});

test('a patch that changes nothing is silent', () => {
  const store = createStore();
  const fn = vi.fn();
  store.subscribe(fn);
  const s = store.get();
  store.set({});
  store.set({ bpm: s.bpm, ratio: s.ratio });
  expect(fn).not.toHaveBeenCalled();
  expect(store.get()).toBe(s);
});

test('unsubscribe stops a listener, including one removed during a notification', () => {
  const store = createStore();
  const fn = vi.fn();
  const off = store.subscribe(fn);
  store.set({ volume: 0.5 });
  off();
  store.set({ volume: 0.25 });
  expect(fn).toHaveBeenCalledTimes(1);

  // A listener that unsubscribes another mid-notification: the others of that round still run.
  const late = vi.fn();
  let offLate = () => {};
  store.subscribe(() => offLate());
  offLate = store.subscribe(late);
  store.set({ volume: 0.75 });
  expect(late).toHaveBeenCalledTimes(1);
  store.set({ volume: 1 });
  expect(late).toHaveBeenCalledTimes(1);
});

test('a deriver adds to the patch before one notification, and can be removed', () => {
  const store = createStore();
  const heard = vi.fn();
  store.subscribe(heard);
  const stop = store.derive((next, previous) => (next.bpm !== previous.bpm ? { lastStateHash: `#${next.bpm}` } : {}));
  store.set({ bpm: 77 });
  expect(heard).toHaveBeenCalledTimes(1);
  expect(store.get().lastStateHash).toBe('#77');
  store.set({ volume: 0.2 });
  expect(store.get().lastStateHash).toBe('#77');
  stop();
  store.set({ bpm: 78 });
  expect(store.get().lastStateHash).toBe('#77');
});

test('a patch that changes nothing, even after deriving, notifies no one', () => {
  const store = createStore();
  const heard = vi.fn();
  store.subscribe(heard);
  store.derive(() => ({}));
  store.set({ bpm: store.get().bpm });
  expect(heard).not.toHaveBeenCalled();
});
