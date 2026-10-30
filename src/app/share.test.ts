import { describe, expect, test, vi } from 'vitest';
import { applyPreset } from '../sound/mapping';
import { lineParts, vanillaParts } from '../test/schedules';
import { DEFAULT_MAPPING } from '../tunables';
import { encodeHash } from './hash';
import { changedFields, createShare, quietly, shareLink, shareUrl } from './share';
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
  parts: lineParts(['441', '2'], { a: 3, b: 2 }),
  ratio: { a: 3, b: 2 },
  bpm: 90,
  mapping: { ...DEFAULT_MAPPING, crossAccent: { velocity: 33, downbeat: null }, pad: { ...DEFAULT_MAPPING.pad, on: true } },
};

describe('restoring on load', () => {
  test('a link restores pattern, ratio, tempo and the whole Mapping, and sets nothing else', () => {
    const t = setup(encodeHash(linked));
    t.share.start();
    const s = t.store.get();
    expect(s.parts).toEqual(linked.parts);
    expect(s.ratio).toEqual(linked.ratio);
    expect(s.bpm).toBe(90);
    expect(s.mapping).toEqual(linked.mapping);
    expect(s.volume).toBe(defaultState().volume);
    expect(s.sheetTab).toBeNull();
  });

  test('the last state hash is set from the start, so About’s back link works at once', () => {
    const t = setup();
    t.share.start();
    expect(t.store.get().lastStateHash).toBe(encodeHash(defaultState()));
    const u = setup(encodeHash(linked));
    u.share.start();
    expect(u.store.get().lastStateHash).toBe(encodeHash(linked));
  });

  test('a shared change is one store.set: listeners hear it once, with the new lastStateHash', () => {
    const t = setup();
    t.share.start();
    const heard: (string | null)[] = [];
    t.store.subscribe((s) => heard.push(s.lastStateHash));
    t.store.set({ bpm: 111 });
    expect(heard).toEqual([encodeHash({ ...defaultState(), bpm: 111 })]);
    t.store.set({ volume: 0.3 });
    expect(heard).toHaveLength(2);
    expect(t.store.get().lastStateHash).toBe(encodeHash({ ...defaultState(), bpm: 111 }));
  });

  test('a pasted link is also one change', () => {
    const t = setup();
    t.share.start();
    const heard: unknown[] = [];
    t.store.subscribe((s) => heard.push(s.lastStateHash));
    t.setHash(encodeHash(linked));
    t.share.onHashChange();
    expect(heard).toEqual([encodeHash(linked)]);
  });

  test('no hash, `#` and `#about` change nothing and write nothing', () => {
    for (const h of ['', '#', '#about']) {
      const t = setup(h, linked);
      t.share.start();
      expect(t.store.get().parts).toEqual(linked.parts);
      expect(t.waiting()).toBe(false);
      expect(t.replaced).toEqual([]);
    }
  });

  test('a junk hash loads the defaults and never throws', () => {
    for (const h of ['#garbage', '#v1.', '#v1.!!!', '#v1.bnVsbA', '#v1.' + 'A'.repeat(500), '#%E0%A4%A']) {
      const t = setup(h);
      expect(() => t.share.start()).not.toThrow();
      const s = t.store.get();
      expect(s.parts).toEqual(defaultState().parts);
      expect(s.mapping).toBe(DEFAULT_MAPPING);
      expect(t.replaced).toEqual([]);
    }
  });

  test('a link with an unreadable pattern restores the rest and keeps the default pattern', () => {
    const v1 = btoa(JSON.stringify({ p: ['9<9', '2'], r: [3, 2], t: 90 })).replace(/=+$/, '');
    const t = setup('#v1.' + v1);
    t.share.start();
    expect(t.store.get().parts).toEqual(lineParts(['3', '2'], { a: 3, b: 2 }));
    expect(t.store.get().bpm).toBe(90);
  });

  test('a link whose pattern does not validate restores into the store: the knobs show the fix state', () => {
    const t = setup(encodeHash({ ...defaultState(), parts: vanillaParts('432') }));
    t.share.start();
    expect(t.store.get().parts).toEqual(vanillaParts('432'));
    expect(t.store.get().drafts).toEqual([null, null]);
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
    expect(t.replaced).toEqual([encodeHash({ ...defaultState(), bpm: 102 })]);
  });

  test('each new change restarts the wait', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.store.dispatch({ type: 'editDraft', part: 0, text: '441' });
    expect(t.cancel).toHaveBeenCalledTimes(1);
  });

  test('volume, the sound panel and the last hash are not state to share', () => {
    const t = setup();
    t.share.start();
    t.store.set({ volume: 0.2 });
    t.store.set({ sheetTab: 'sound' });
    expect(t.waiting()).toBe(false);
  });

  test('the last state hash follows at once, before the write', () => {
    const t = setup();
    t.share.start();
    t.store.set({ mapping: applyPreset('height-pitch') });
    expect(t.store.get().lastStateHash).toBe(encodeHash({ ...defaultState(), mapping: applyPreset('height-pitch') }));
    expect(t.replaced).toEqual([]);
  });

  test('nothing is written when the hash is already right', () => {
    const t = setup();
    t.share.start();
    t.store.set({ bpm: 100 });
    t.setHash(encodeHash({ ...defaultState(), bpm: 100 }));
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
    expect(t.store.get().lastStateHash).toBe(encodeHash({ ...defaultState(), bpm: 100 }));
  });

  test('flush writes a waiting change now, and does nothing otherwise', () => {
    const t = setup();
    t.share.start();
    t.share.flush();
    expect(t.replaced).toEqual([]);
    t.store.set({ bpm: 77 });
    t.share.flush();
    expect(t.replaced).toEqual([encodeHash({ ...defaultState(), bpm: 77 })]);
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
    t.setHash(encodeHash({ ...defaultState(), bpm: 150, parts: vanillaParts('531') }));
    t.share.onHashChange();
    expect(t.store.get().bpm).toBe(150);
    expect(t.store.get().parts).toEqual(vanillaParts('531'));
    expect(t.store.get().ratio).toBe(before.ratio);
    expect(t.store.get().mapping).toBe(before.mapping);
    const changes = seen.flat();
    expect(changes).toEqual(expect.arrayContaining(['bpm', 'parts']));
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
    expect(t.store.get().parts).toBe(settled.parts);
  });

  test('a junk hash resets the four shared fields to the defaults and leaves volume and the panel', () => {
    const t = setup('', linked);
    t.share.start();
    t.store.set({ volume: 0.4, sheetTab: 'sound' });
    t.setHash('#v1.%%%');
    t.share.onHashChange();
    const s = t.store.get();
    expect(s.parts).toEqual(defaultState().parts);
    expect(s.ratio).toEqual({ a: 1, b: 1 });
    expect(s.bpm).toBe(defaultState().bpm);
    expect(s.mapping).toEqual(DEFAULT_MAPPING);
    expect(s.volume).toBe(0.4);
    expect(s.sheetTab).toBe('sound');
  });

  test('an emptied hash or #about does not reset anything', () => {
    const t = setup('', linked);
    t.share.start();
    for (const h of ['', '#', '#about']) {
      t.setHash(h);
      t.share.onHashChange();
      expect(t.store.get().parts).toEqual(linked.parts);
    }
  });
});

describe('changedFields', () => {
  const d = defaultState();
  test('equal values by content are not changes', () => {
    expect(
      changedFields(d, { parts: vanillaParts('3'), ratio: { ...d.ratio }, bpm: d.bpm, mapping: applyPreset('voice-per-part') }),
    ).toEqual({});
  });

  test('each differing field is reported alone', () => {
    const same = { parts: d.parts, ratio: d.ratio, bpm: d.bpm, mapping: d.mapping };
    // New parts bring fresh drafts, so the inputs show them.
    expect(changedFields(d, { ...same, parts: vanillaParts('4') })).toEqual({ parts: vanillaParts('4'), drafts: [null, null] });
    expect(Object.keys(changedFields(d, { ...same, ratio: { a: 3, b: 2 } }))).toEqual(['ratio']);
    expect(Object.keys(changedFields(d, { ...same, ratio: { a: 1, b: 2 } }))).toEqual(['ratio']);
    expect(Object.keys(changedFields(d, { ...same, bpm: 99 }))).toEqual(['bpm']);
    expect(Object.keys(changedFields(d, { ...same, mapping: applyPreset('ball-pitch') }))).toEqual(['mapping']);
  });
});

describe('shareUrl', () => {
  test('replaces any hash on the address with the live state', () => {
    const hash = encodeHash(linked);
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

describe('a short-looking junk hash', () => {
  test('restores to the defaults without throwing', () => {
    for (const junk of ['5x1', '3:2/2!/2', '3:2/x2/2', '2:2/2/2', '531~custom', '531~nope', '9'.repeat(70)]) {
      const t = setup('#' + junk);
      expect(() => t.share.start()).not.toThrow();
      expect(t.store.get().parts).toEqual(defaultState().parts);
      expect(t.store.get().bpm).toBe(defaultState().bpm);
    }
  });
  test('a percent-encoded short link still reads', () => {
    const t = setup('#531%7Eheight-drum%40140');
    t.share.start();
    expect(t.store.get().bpm).toBe(140);
    expect(t.store.get().parts).toEqual(vanillaParts('531'));
  });
});

describe('shareLink', () => {
  test('uses the share sheet where there is one; a dismissed sheet is not an error', async () => {
    const share = vi.fn(async () => undefined);
    expect(await shareLink('https://x/#531', { share })).toBe('shared');
    expect(share).toHaveBeenCalledWith({ url: 'https://x/#531' });
    expect(await shareLink('u', { share: async () => Promise.reject(new DOMException('', 'AbortError')) })).toBe('cancelled');
    // Any other refusal falls back to the clipboard.
    const writeText = vi.fn(async () => undefined);
    const refused = async () => Promise.reject(new DOMException('', 'NotAllowedError'));
    expect(await shareLink('u', { share: refused, writeText })).toBe('copied');
    expect(await shareLink('u', { share: refused })).toBe('not-copied');
  });
  test('else copies, and says when it could not', async () => {
    const writeText = vi.fn(async () => undefined);
    expect(await shareLink('u', { writeText })).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('u');
    expect(await shareLink('u', { writeText: async () => Promise.reject(new Error('denied')) })).toBe('not-copied');
    expect(await shareLink('u', {})).toBe('not-copied');
  });
});

describe('the short link in the address', () => {
  test('a state that has a short form writes it, and a pasted short link restores it', () => {
    const t = setup('', { ...defaultState(), parts: vanillaParts('531') });
    t.share.start();
    t.store.set({ bpm: 140 });
    t.fire();
    expect(t.hash()).toBe('#531@140');
    const other = setup('#531@140');
    other.share.start();
    expect(other.store.get().bpm).toBe(140);
    expect(other.store.get().parts).toEqual(vanillaParts('531'));
  });
});
