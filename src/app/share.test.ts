import { describe, expect, test, vi } from 'vitest';
import { applyPreset } from '../sound/mapping';
import { DEFAULT_MAPPING } from '../tunables';
import { encodeState } from './hash';
import { changedFields, createShare, quietly, shareUrl } from './share';
import { createStore, defaultState, type AppState } from './state';

const DEBOUNCE = 250;

function setup(initialHash = '', initial: AppState = defaultState()) {
  const store = createStore(initial);
  let hash = initialHash;
  const replaced: string[] = [];
  let due: { fn: () => void; ms: number } | null = null;
  const cancel = vi.fn(() => {
    due = null;
  });
  const share = createShare({
    store,
    hash: () => hash,
    replaceHash: (h) => {
      hash = h;
      replaced.push(h);
    },
    after: (fn, ms) => {
      due = { fn, ms };
      return 'timer';
    },
    cancel,
    debounceMs: DEBOUNCE,
  });
  return {
    store,
    share,
    replaced,
    cancel,
    setHash: (h: string) => (hash = h),
    hash: () => hash,
    fire: () => {
      const d = due;
      due = null;
      d?.fn();
    },
    waiting: () => due !== null,
    waitMs: () => due?.ms,
  };
}

const linked: AppState = {
  ...defaultState(),
  patterns: ['441', '2'],
  ratio: { a: 3, b: 2 },
  bpm: 90,
  mapping: { ...DEFAULT_MAPPING, crossAccent: { velocity: 33, downbeat: null }, pad: { ...DEFAULT_MAPPING.pad, on: true } },
};

describe('restoring on load', () => {
  test('a link restores pattern, ratio, tempo and the whole Mapping, and sets nothing else', () => {
    const t = setup(encodeState(linked));
    t.share.start();
    const s = t.store.get();
    expect(s.patterns).toEqual(linked.patterns);
    expect(s.ratio).toEqual(linked.ratio);
    expect(s.bpm).toBe(90);
    expect(s.mapping).toEqual(linked.mapping);
    expect(s.volume).toBe(defaultState().volume);
    expect(s.soundPanelOpen).toBe(false);
  });

  test('the last state hash is set from the start, so About’s back link works at once', () => {
    const t = setup();
    t.share.start();
    expect(t.store.get().lastStateHash).toBe(encodeState(defaultState()));
    const u = setup(encodeState(linked));
    u.share.start();
    expect(u.store.get().lastStateHash).toBe(encodeState(linked));
  });

  test('a shared change is one store.set: listeners hear it once, with the new lastStateHash', () => {
    const t = setup();
    t.share.start();
    const heard: (string | null)[] = [];
    t.store.subscribe((s) => heard.push(s.lastStateHash));
    t.store.set({ bpm: 111 });
    expect(heard).toEqual([encodeState({ ...defaultState(), bpm: 111 })]);
    t.store.set({ volume: 0.3 });
    expect(heard).toHaveLength(2);
    expect(t.store.get().lastStateHash).toBe(encodeState({ ...defaultState(), bpm: 111 }));
  });

  test('a pasted link is also one change', () => {
    const t = setup();
    t.share.start();
    const heard: unknown[] = [];
    t.store.subscribe((s) => heard.push(s.lastStateHash));
    t.setHash(encodeState(linked));
    t.share.onHashChange();
    expect(heard).toEqual([encodeState(linked)]);
  });

  test('no hash, `#` and `#about` change nothing and write nothing', () => {
    for (const h of ['', '#', '#about']) {
      const t = setup(h, linked);
      t.share.start();
      expect(t.store.get().patterns).toEqual(linked.patterns);
      expect(t.waiting()).toBe(false);
      expect(t.replaced).toEqual([]);
    }
  });

  test('a junk hash loads the defaults and never throws', () => {
    for (const h of ['#garbage', '#v1.', '#v1.!!!', '#v1.bnVsbA', '#v1.' + 'A'.repeat(500), '#%E0%A4%A']) {
      const t = setup(h);
      expect(() => t.share.start()).not.toThrow();
      const s = t.store.get();
      expect(s.patterns).toEqual(defaultState().patterns);
      expect(s.mapping).toBe(DEFAULT_MAPPING);
      expect(t.replaced).toEqual([]);
    }
  });

  test('a link with an unreadable pattern restores the rest and keeps the default pattern', () => {
    const payload = encodeState({ ...linked, patterns: ['9<9', '2'] });
    const t = setup(payload);
    t.share.start();
    expect(t.store.get().patterns).toEqual(['3', '2']);
    expect(t.store.get().bpm).toBe(90);
  });

  test('a link whose pattern does not validate restores into the store: the knobs show the fix state', () => {
    const t = setup(encodeState({ ...defaultState(), patterns: ['432', '2'] }));
    t.share.start();
    expect(t.store.get().patterns).toEqual(['432', '2']);
  });
});

describe('writing the hash', () => {
  test('a change is written once, after the debounce, with the live state', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.store.set({ bpm: 101 });
    t.store.set({ bpm: 102 });
    expect(t.replaced).toEqual([]);
    expect(t.waitMs()).toBe(DEBOUNCE);
    t.fire();
    expect(t.replaced).toEqual([encodeState({ ...defaultState(), bpm: 102 })]);
  });

  test('each new change restarts the wait', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.store.set({ patterns: ['441', '2'] });
    expect(t.cancel).toHaveBeenCalledTimes(1);
  });

  test('volume, the sound panel and the last hash are not state to share', () => {
    const t = setup();
    t.share.start();
    t.store.set({ volume: 0.2 });
    t.store.set({ soundPanelOpen: true });
    expect(t.waiting()).toBe(false);
  });

  test('the last state hash follows at once, before the write', () => {
    const t = setup();
    t.share.start();
    t.store.set({ mapping: applyPreset('height-pitch') });
    expect(t.store.get().lastStateHash).toBe(encodeState({ ...defaultState(), mapping: applyPreset('height-pitch') }));
    expect(t.replaced).toEqual([]);
  });

  test('nothing is written when the hash is already right', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.setHash(encodeState({ ...defaultState(), bpm: 100 }));
    t.fire();
    expect(t.replaced).toEqual([]);
  });

  test('while About shows, the hash is left alone; the state hash is still current for the back link', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.setHash('#about');
    t.fire();
    expect(t.hash()).toBe('#about');
    expect(t.replaced).toEqual([]);
    expect(t.store.get().lastStateHash).toBe(encodeState({ ...defaultState(), bpm: 100 }));
  });

  test('flush writes a waiting change now, and does nothing otherwise', () => {
    const t = setup();
    t.share.start();
    t.share.flush();
    expect(t.replaced).toEqual([]);
    t.store.set({ bpm: 77 });
    t.share.flush();
    expect(t.replaced).toEqual([encodeState({ ...defaultState(), bpm: 77 })]);
    expect(t.waiting()).toBe(false);
    t.share.flush();
    expect(t.replaced).toHaveLength(1);
  });
});

describe('a pasted link on an open page', () => {
  test('restores like a knob change: only what differs is set, nothing else is touched', () => {
    const t = setup();
    t.share.start();
    const before = t.store.get();
    const seen: string[][] = [];
    t.store.subscribe((s, p) => seen.push(Object.keys(s).filter((k) => s[k as keyof AppState] !== p[k as keyof AppState])));
    t.setHash(encodeState({ ...defaultState(), bpm: 150, patterns: ['531', '2'] }));
    t.share.onHashChange();
    expect(t.store.get().bpm).toBe(150);
    expect(t.store.get().patterns).toEqual(['531', '2']);
    expect(t.store.get().ratio).toBe(before.ratio);
    expect(t.store.get().mapping).toBe(before.mapping);
    const changes = seen.flat();
    expect(changes).toEqual(expect.arrayContaining(['bpm', 'patterns']));
    expect(changes).not.toContain('mapping');
    expect(changes).not.toContain('ratio');
  });

  test('coming back from About to the state it left is a no-op', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100, mapping: applyPreset('ball-pitch') });
    const settled = t.store.get();
    const heard = vi.fn();
    t.store.subscribe(heard);
    t.setHash('#about');
    t.share.onHashChange();
    t.setHash(settled.lastStateHash as string);
    t.share.onHashChange();
    expect(heard).not.toHaveBeenCalled();
    expect(t.store.get().patterns).toBe(settled.patterns);
  });

  test('a junk hash resets the four shared fields to the defaults and leaves volume and the panel', () => {
    const t = setup('', linked);
    t.share.start();
    t.store.set({ volume: 0.4, soundPanelOpen: true });
    t.setHash('#v1.%%%');
    t.share.onHashChange();
    const s = t.store.get();
    expect(s.patterns).toEqual(defaultState().patterns);
    expect(s.ratio).toEqual({ a: 1, b: 1 });
    expect(s.bpm).toBe(defaultState().bpm);
    expect(s.mapping).toEqual(DEFAULT_MAPPING);
    expect(s.volume).toBe(0.4);
    expect(s.soundPanelOpen).toBe(true);
  });

  test('an emptied hash or #about does not reset anything', () => {
    const t = setup('', linked);
    t.share.start();
    for (const h of ['', '#', '#about']) {
      t.setHash(h);
      t.share.onHashChange();
      expect(t.store.get().patterns).toEqual(linked.patterns);
    }
  });
});

describe('changedFields', () => {
  const d = defaultState();
  test('equal values by content are not changes', () => {
    expect(
      changedFields(d, { patterns: [...d.patterns], ratio: { ...d.ratio }, bpm: d.bpm, mapping: applyPreset('height-drum') }),
    ).toEqual({});
  });

  test('each differing field is reported alone', () => {
    const same = { patterns: d.patterns, ratio: d.ratio, bpm: d.bpm, mapping: d.mapping };
    expect(Object.keys(changedFields(d, { ...same, patterns: ['3', '5'] }))).toEqual(['patterns']);
    expect(Object.keys(changedFields(d, { ...same, patterns: ['4', '2'] }))).toEqual(['patterns']);
    expect(Object.keys(changedFields(d, { ...same, ratio: { a: 3, b: 2 } }))).toEqual(['ratio']);
    expect(Object.keys(changedFields(d, { ...same, ratio: { a: 1, b: 2 } }))).toEqual(['ratio']);
    expect(Object.keys(changedFields(d, { ...same, bpm: 99 }))).toEqual(['bpm']);
    expect(Object.keys(changedFields(d, { ...same, mapping: applyPreset('ball-pitch') }))).toEqual(['mapping']);
  });
});

describe('shareUrl', () => {
  test('replaces any hash on the address with the live state', () => {
    const hash = encodeState(linked);
    expect(shareUrl('https://anomatom.com/', linked)).toBe('https://anomatom.com/' + hash);
    expect(shareUrl('https://anomatom.com/?x=1#v1.old', linked)).toBe('https://anomatom.com/?x=1' + hash);
    expect(shareUrl('https://anomatom.com/#about', linked)).toBe('https://anomatom.com/' + hash);
  });
});

describe('quietly', () => {
  test('passes the hash on, and a throwing replaceState (Safari’s rate limit) does not escape', () => {
    const calls: string[] = [];
    quietly((h) => calls.push(h))('#a');
    expect(calls).toEqual(['#a']);
    const boom = quietly(() => {
      throw new DOMException('rate limited', 'SecurityError');
    });
    expect(() => boom('#b')).not.toThrow();
  });
});
